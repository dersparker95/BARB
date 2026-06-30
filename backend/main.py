from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
import uuid
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import bcrypt
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import create_engine, text

load_dotenv()

try:
    from redis import Redis
except ImportError:
    Redis = None

# =============================================================================
# CONFIGURACIÓN DE ENTORNO
# =============================================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://barb_admin:barb_password123@db:5432/barb_database",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/app/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# =============================================================================
# MOTORES Y CLIENTES
# =============================================================================

# SQLAlchemy se mantiene para endpoints legacy; psycopg2 pool para el resto.
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=15)

db_pool: ThreadedConnectionPool | None = None
redis_client: Redis | None = None
redis_ready = False

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

_http_limits = httpx.Limits(
    max_connections=10,
    max_keepalive_connections=5,
    keepalive_expiry=30,
)

# Timeout de 60s y pool HTTP acotado para evitar sobrecarga bajo concurrencia.
ia_client = AsyncOpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com",
    timeout=60.0,
    max_retries=2,
    http_client=httpx.AsyncClient(timeout=60.0, limits=_http_limits),
)

_BARB_SYSTEM_PROMPT = (
    "Eres BARB, asistente experto en mantenimiento industrial. "
    "Responde de forma clara, técnica y concisa. "
    "Si el usuario menciona una máquina específica, orienta tu respuesta a ese equipo."
)



def get_db_connection():
    """
    Obtiene una conexión activa desde el pool de hilos de PostgreSQL.
    Inicializa el pool si no existe.

    ## Returns:
    Objeto de conexión psycopg2.

    ## Raises:
    psycopg2.OperationalError: Si no puede establecer conexión con el servidor.
    """
    global db_pool
    if db_pool is None:
        db_pool = ThreadedConnectionPool(1, 10, dsn=DATABASE_URL)
    return db_pool.getconn()


def release_db_connection(conn) -> None:
    """
    Devuelve una conexión al pool o la cierra si el pool no está disponible.

    ## Args:
    conn: Conexión psycopg2 a liberar.
    """
    global db_pool
    if db_pool is not None:
        db_pool.putconn(conn)
    else:
        conn.close()


def _query_all(sql: str, params: Optional[dict] = None) -> list[dict]:
    """
    Ejecuta una consulta SQL y retorna todos los registros como lista de diccionarios.

    ## Args:
    sql: Sentencia SQL a ejecutar.
    params: Parámetros de interpolación.

    ## Returns:
    Lista de registros recuperados.

    ## Raises:
    psycopg2.DatabaseError: Error de ejecución en la consulta SQL.
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(sql, params or {})
            return cursor.fetchall()
    finally:
        release_db_connection(conn)


def _query_one(sql: str, params: Optional[dict] = None) -> dict | None:
    """
    Ejecuta una consulta SQL y retorna el primer registro coincidente.

    ## Args:
    sql: Sentencia SQL a ejecutar.
    params: Parámetros de interpolación.

    ## Returns:
    Diccionario con el registro o None si no hay resultados.
    """
    rows = _query_all(sql, params)
    return rows[0] if rows else None


def _execute_write(query: str, params: Optional[dict] = None) -> Any:
    """
    Ejecuta una sentencia SQL de escritura (INSERT, UPDATE, DELETE) con confirmación transaccional.

    ## Args:
    query: Sentencia SQL con parámetros nombrados (SQLAlchemy text).
    params: Valores de interpolación.

    ## Raises:
    HTTPException(500): Si la escritura falla en base de datos.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            conn.commit()
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error de escritura en DB")


# =============================================================================
# CACHÉ REDIS
# =============================================================================


def get_redis_client() -> Redis | None:
    """
    Inicializa y retorna la conexión al servidor Redis.

    ## Returns:
    Cliente Redis activo o None si el servicio no está disponible.
    """
    global redis_client, redis_ready
    if Redis is None:
        return None
    if redis_client is not None and redis_ready:
        return redis_client
    try:
        redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        redis_ready = True
        return redis_client
    except Exception:
        redis_client = None
        redis_ready = False
        return None


def cache_get(key: str) -> Any | None:
    """
    Recupera y deserializa un valor almacenado en Redis.

    ## Args:
    key: Identificador único del recurso en caché.

    ## Returns:
    Estructura de datos deserializada o None si la clave no existe.
    """
    client = get_redis_client()
    if not client:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> None:
    """
    Serializa y almacena un valor en Redis con tiempo de expiración.

    ## Args:
    key: Identificador único del recurso.
    value: Datos a almacenar (deben ser serializables a JSON).
    ttl_seconds: Tiempo de vida en segundos (por defecto 300).
    """
    client = get_redis_client()
    if not client:
        return
    try:
        client.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception:
        return


# =============================================================================
# SEGURIDAD Y NORMALIZACIÓN
# =============================================================================


def hash_password(raw_password: str) -> str:
    """
    Aplica bcrypt a una contraseña en texto plano.

    ## Args:
    raw_password: Contraseña proporcionada por el usuario.

    ## Returns:
    Hash criptográfico seguro.
    """
    return bcrypt.hashpw(raw_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw_password: str, stored_password: str) -> bool:
    """
    Verifica si una contraseña en texto plano corresponde al hash almacenado.
    Soporta hashes bcrypt y contraseñas en texto plano (legacy).

    ## Args:
    raw_password: Contraseña del intento de acceso.
    stored_password: Hash almacenado en base de datos.

    ## Returns:
    True si las credenciales coinciden.
    """
    stored = (stored_password or "").strip()
    if stored.startswith("$2"):
        try:
            return bcrypt.checkpw(raw_password.encode("utf-8"), stored.encode("utf-8"))
        except ValueError:
            return False
    return stored == raw_password


def ensure_passwords_hashed(cursor) -> int:
    """
    Detecta usuarios cuya password_hash NO está en formato bcrypt (es decir,
    quedó en texto plano por venir directo del seed SQL) y la hashea in-place.

    Es idempotente: si ya están todas hasheadas, no hace nada. Se puede llamar
    en cada arranque sin riesgo de doble-hasheo, porque sólo toca filas cuyo
    valor no empieza con '$2' (prefijo estándar de bcrypt).

    ## Args:
    cursor: Cursor psycopg2 activo (debe soportar RealDictCursor o tupla).

    ## Returns:
    Cantidad de usuarios actualizados.
    """
    cursor.execute("SELECT usuario_id, password_hash FROM usuario")
    usuarios = cursor.fetchall()
    actualizados = 0
    for u in usuarios:
        uid = u["usuario_id"] if isinstance(u, dict) else u[0]
        stored = (u["password_hash"] if isinstance(u, dict) else u[1]) or ""
        if not stored.strip().startswith("$2"):
            hashed = hash_password(stored)
            cursor.execute(
                "UPDATE usuario SET password_hash = %s WHERE usuario_id = %s",
                (hashed, uid),
            )
            actualizados += 1
    return actualizados


def serialize_user(user: dict) -> dict:
    """
    Filtra y estandariza un registro de usuario para su exposición vía API.
    Excluye campos sensibles como password_hash.

    ## Args:
    user: Registro crudo obtenido de base de datos.

    ## Returns:
    Diccionario de usuario sanitizado.
    """
    return {
        "usuario_id": int(user["usuario_id"]),
        "nombre": str(user["nombre"]),
        "email": str(user["email"]),
        "rol": str(user["rol"]).lower(),
        "activo": bool(user["activo"]),
        "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
    }


def normalize_db_status(value: str | None) -> str:
    """
    Normaliza variaciones semánticas de estados operativos al conjunto estándar de la base de datos.

    ## Args:
    value: Estado en formato libre.

    ## Returns:
    Clave de estado normalizado.
    """
    raw = (value or "").strip().lower()
    mapping = {
        "open": "pending",
        "pending": "pending",
        "assigned": "assigned",
        "in progress": "in_progress",
        "in_progress": "in_progress",
        "progress": "in_progress",
        "closed": "completed",
        "complete": "completed",
        "completed": "completed",
        "done": "completed",
        "cancelled": "cancelled",
        "canceled": "cancelled",
        "overdue": "overdue",
    }
    return mapping.get(raw, raw or "pending")


def humanize_status(value: str | None) -> str:
    """
    Traduce claves de estado de sistema a etiquetas legibles para interfaces de usuario.

    ## Args:
    value: Clave de estado normalizado.

    ## Returns:
    Etiqueta de estado capitalizada.
    """
    raw = (value or "").strip().lower()
    mapping = {
        "pending": "Open",
        "assigned": "Assigned",
        "in_progress": "In Progress",
        "completed": "Closed",
        "cancelled": "Cancelled",
        "overdue": "Overdue",
    }
    return mapping.get(raw, "Open")


def parse_optional_datetime(value: Any) -> datetime | None:
    """
    Convierte cadenas, timestamps o valores nulos en objetos datetime nativos.

    ## Args:
    value: Valor crudo representando una fecha/hora.

    ## Returns:
    Objeto datetime o None si el valor es inválido o vacío.
    """
    if value in (None, "", "null"):
        return None
    if isinstance(value, datetime):
        return value
    text_value = str(value).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text_value)
    except ValueError:
        return None


def safe_int(value: Any, field_name: str) -> int:
    """
    Convierte un valor a entero disparando errores HTTP descriptivos si falla.

    ## Args:
    value: Valor numérico crudo.
    field_name: Nombre del campo para mensajes de error.

    ## Returns:
    Valor numérico validado.

    ## Raises:
    HTTPException(400): Si el valor es nulo, vacío o no convertible a entero.
    """
    if value in (None, "", "null"):
        raise HTTPException(status_code=400, detail=f"El campo '{field_name}' es obligatorio.")
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"El campo '{field_name}' debe ser numérico.") from exc


def safe_text(value: Any, default: str = "") -> str:
    """
    Extrae texto de forma segura garantizando ausencia de excepciones por valores nulos.

    ## Args:
    value: Variable objetivo.
    default: Cadena de respaldo si el valor es nulo.

    ## Returns:
    Texto saneado sin espacios perimetrales.
    """
    if value is None:
        return default
    return str(value).strip()


def iso_z(val) -> str | None:
    """
    Estandariza fechas a formato ISO 8601 con sufijo UTC explícito (Z).

    ## Args:
    val: Objeto datetime o cadena de fecha.

    ## Returns:
    Cadena de fecha formateada o None si no se provee valor.
    """
    if not val:
        return None
    if isinstance(val, str):
        return val if val.endswith("Z") or "+" in val else val + "Z"
    s = val.isoformat()
    return s if s.endswith("Z") or "+" in s else s + "Z"


# =============================================================================
# MAPEADORES DE DOMINIO — ÓRDENES DE TRABAJO
# =============================================================================


def row_to_work_order(row: dict, photos: list[dict] | None = None) -> dict:
    """
    Convierte un registro relacional plano en la estructura JSON jerárquica de una Orden de Trabajo.

    ## Args:
    row: Registro unificado proveniente de JOINs.
    photos: Colección de evidencias fotográficas pre-procesadas.

    ## Returns:
    Representación de dominio de la OT lista para entrega vía API.
    """
    photo_list = photos or row.get("photos") or []
    return {
        "id": str(row["numero_ot"]),
        "numero_ot": str(row["numero_ot"]),
        "ot_id": int(row["ot_id"]),
        "title": str(row.get("descripcion_problema") or f"OT {row['numero_ot']}"),
        "description": row.get("descripcion_problema"),
        "resolution": row.get("resolution"),
        "machine": str(row.get("machine_name") or ""),
        "machine_name": str(row.get("machine_name") or ""),
        "machine_id": int(row["maquina_id"]),
        "plant": str(row.get("plant_name") or ""),
        "plant_name": str(row.get("plant_name") or ""),
        "plant_id": int(row.get("planta_id") or 1),
        "discipline": str(row.get("discipline_name") or ""),
        "discipline_name": str(row.get("discipline_name") or ""),
        "priority": str(row.get("priority") or "medium"),
        "status": humanize_status(str(row.get("estado") or "pending")),
        "estado": str(row.get("estado") or "pending"),
        "severity": row.get("severity"),
        "age_minutes": int(row.get("tiempo_reparacion_min") or 0),
        "created_at": iso_z(row.get("fecha_creacion")),
        "fecha_inicio": iso_z(row.get("fecha_inicio")),
        "fecha_cierre": iso_z(row.get("fecha_cierre")),
        "photo_count": len(photo_list),
        "photos": photo_list,
        "tecnico_nombre": str(row.get("tecnico_nombre") or ""),
        "tipo": str(row.get("tipo") or "corrective"),
        "costo_estimado": float(row.get("costo_estimado") or 0),
        "costo_real": float(row.get("costo_real") or 0),
        "downtime_minutes": int(row.get("downtime_minutes")) if row.get("downtime_minutes") is not None else None,
        "reporte_id": row.get("reporte_id"),
        "diagnostico_id": row.get("diagnostico_id"),
    }


def fetch_work_order_row(numero_ot: str) -> dict | None:
    """
    Recupera una Orden de Trabajo con sus relaciones consolidadas (máquina, planta, técnico).

    ## Args:
    numero_ot: Código único de identificación de la OT.

    ## Returns:
    Diccionario con datos relacionales cruzados o None si la OT no existe.
    """
    return _query_one(
        """
        SELECT
            ot.ot_id,
            ot.numero_ot,
            ot.maquina_id,
            ot.tecnico_id,
            ot.creado_por,
            ot.diagnostico_id,
            ot.reporte_id,
            ot.tipo,
            ot.descripcion_problema,
            ot.descripcion_reparacion,
            ot.resolution,
            ot.priority,
            ot.severity,
            ot.fecha_creacion,
            ot.fecha_inicio,
            ot.fecha_cierre,
            ot.fecha_vencimiento,
            ot.tiempo_reparacion_min,
            ot.downtime_minutes,
            ot.costo_estimado,
            ot.costo_real,
            ot.estado,
            m.nombre AS machine_name,
            m.planta_id,
            d.disciplina_id AS discipline_id,
            d.nombre AS discipline_name,
            p.nombre AS plant_name,
            u.nombre AS tecnico_nombre
        FROM orden_trabajo ot
        JOIN maquina m ON m.maquina_id = ot.maquina_id
        LEFT JOIN disciplina d ON d.disciplina_id = m.disciplina_id
        LEFT JOIN planta p ON p.planta_id = m.planta_id
        LEFT JOIN usuario u ON u.usuario_id = ot.tecnico_id
        WHERE ot.numero_ot = %(numero_ot)s
        LIMIT 1
        """,
        {"numero_ot": numero_ot},
    )


def fetch_work_order_photos(ot_id: int) -> list[dict]:
    """
    Recupera los metadatos y rutas de todas las fotografías asociadas a una OT.

    ## Args:
    ot_id: Identificador primario de la OT.

    ## Returns:
    Colección de registros de evidencia visual.
    """
    rows = _query_all(
        """
        SELECT ot_foto_id, ot_id, file_name, original_name, content_type, file_path, created_at
        FROM ot_foto
        WHERE ot_id = %(ot_id)s
        ORDER BY ot_foto_id ASC
        """,
        {"ot_id": ot_id},
    )
    return [
        {
            "id": int(row["ot_foto_id"]),
            "ot_id": int(row["ot_id"]),
            "file_name": row["file_name"],
            "original_name": row["original_name"],
            "content_type": row["content_type"],
            "file_path": row["file_path"],
            "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        }
        for row in rows
    ]


def parse_work_order_status(value: str | None) -> str:
    """
    Valida que el estado propuesto pertenezca al conjunto de transiciones permitidas.

    ## Args:
    value: Estado propuesto.

    ## Returns:
    Estado auditado y validado.

    ## Raises:
    HTTPException(400): Si el estado propuesto no está dentro del conjunto permitido.
    """
    db_status = normalize_db_status(value)
    allowed = {"pending", "assigned", "in_progress", "completed", "cancelled", "overdue"}
    if db_status not in allowed:
        raise HTTPException(status_code=400, detail="Estado de OT inválido.")
    return db_status


# =============================================================================
# GESTIÓN DE ARCHIVOS
# =============================================================================


def store_upload_file(file: UploadFile, destination_dir: Path, prefix: str) -> dict:
    """
    Persiste un archivo en el sistema de archivos generando un nombre único para evitar colisiones.

    ## Args:
    file: Archivo recibido desde la solicitud HTTP.
    destination_dir: Directorio de destino absoluto.
    prefix: Prefijo categórico para el nombre del archivo.

    ## Returns:
    Diccionario con file_id, stored_name, stored_path y original_name.

    ## Raises:
    IOError: Si los permisos del sistema de archivos deniegan la escritura.
    """
    original_name = Path(file.filename or "file").name
    suffix = Path(original_name).suffix.lower() or ".bin"
    file_id = uuid.uuid4().hex
    stored_name = f"{prefix}_{file_id}{suffix}"
    stored_path = destination_dir / stored_name
    with stored_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {
        "file_id": file_id,
        "stored_name": stored_name,
        "stored_path": stored_path,
        "original_name": original_name,
    }


async def save_ot_photos(numero_ot: str, ot_id: int, images: list[UploadFile]) -> list[dict]:
    """
    Procesa fotográficamente una OT de forma transaccional: valida tipos MIME,
    persiste archivos e inserta metadatos en BD. Ejecuta rollback físico si la transacción falla.

    ## Args:
    numero_ot: Identificador público de la OT (usado para estructura de carpetas).
    ot_id: Clave primaria de la OT.
    images: Archivos multimedia a procesar.

    ## Returns:
    Registros fotográficos creados exitosamente.

    ## Raises:
    HTTPException(415): Si un archivo no cumple con los tipos MIME permitidos (JPEG/PNG/WEBP).
    """
    saved_photos: list[dict] = []
    if not images:
        return saved_photos

    ot_dir = UPLOAD_DIR / "work-orders" / numero_ot
    ot_dir.mkdir(parents=True, exist_ok=True)

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            for image in images:
                content_type = (image.content_type or "").strip().lower()
                if content_type not in {"image/jpeg", "image/png", "image/webp"}:
                    raise HTTPException(status_code=415, detail="Solo se permiten imágenes JPEG, PNG o WEBP.")

                stored = store_upload_file(image, ot_dir, "ot")
                cursor.execute(
                    """
                    INSERT INTO ot_foto (ot_id, file_name, original_name, content_type, file_path)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING ot_foto_id, created_at
                    """,
                    (
                        ot_id,
                        stored["stored_name"],
                        stored["original_name"],
                        content_type,
                        str(stored["stored_path"]),
                    ),
                )
                row = cursor.fetchone()
                saved_photos.append(
                    {
                        "id": int(row["ot_foto_id"]),
                        "ot_id": ot_id,
                        "file_name": stored["stored_name"],
                        "original_name": stored["original_name"],
                        "content_type": content_type,
                        "file_path": str(stored["stored_path"]),
                        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                    }
                )
        conn.commit()
    except Exception:
        conn.rollback()
        for photo in saved_photos:
            try:
                Path(photo["file_path"]).unlink(missing_ok=True)
            except Exception:
                pass
        raise
    finally:
        release_db_connection(conn)

    return saved_photos


def delete_ot_files(ot_id: int) -> None:
    """
    Elimina físicamente todos los archivos asociados a una OT y limpia directorios vacíos.
    Suprime errores de sistema de archivos para no bloquear transacciones de BD.

    ## Args:
    ot_id: Clave primaria de la OT objetivo.
    """
    rows = _query_all(
        "SELECT file_path FROM ot_foto WHERE ot_id = %(ot_id)s",
        {"ot_id": ot_id},
    )
    for row in rows:
        path = row.get("file_path")
        if not path:
            continue
        try:
            Path(path).unlink(missing_ok=True)
        except Exception:
            continue

    ot_dir = UPLOAD_DIR / "work-orders"
    if ot_dir.exists():
        for child in ot_dir.iterdir():
            if child.is_dir() and not any(child.iterdir()):
                try:
                    child.rmdir()
                except Exception:
                    pass


# =============================================================================
# MODELOS PYDANTIC
# =============================================================================


class LoginRequest(BaseModel):
    email: str
    password: str


class MessageItem(BaseModel):
    role: str
    content: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in {"user", "assistant", "system"}:
            raise ValueError("role debe ser 'user', 'assistant' o 'system'.")
        return v


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    language: Optional[str] = "es"
    machine: Optional[str] = None
    # Limita el historial a las últimas 10 interacciones para evitar exceder el contexto del LLM.
    history: list[MessageItem] = Field(default_factory=list, max_length=10)

class ChatSessionRequest(BaseModel):
    title: str
    saved_by: Optional[str] = "operador"
    discipline: Optional[str] = None
    plant_id: Optional[str] = None
    plant_name: Optional[str] = None
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    active_manual: Optional[str] = None
    messages: list[dict] = Field(default_factory=list)
    metadata_info: dict = Field(default_factory=dict, alias="metadata")

class ChatFeedbackRequest(BaseModel):
    message_content: str
    rating: str
    context: Optional[str] = "General" # Añadimos el contexto

class UserCreateRequest(BaseModel):
    nombre: str
    email: str
    password: str
    rol: str
    activo: bool = True


class UserUpdateRequest(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None


class WorkOrderStatusRequest(BaseModel):
    status: str


# =============================================================================
# APLICACIÓN Y CORS
# =============================================================================

app = FastAPI(title="BARB Plant Memory API", version="1.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://barb-7jfguz636-tvasquezms-projects.vercel.app",
        "https://barb-rose.vercel.app",
    ],
    # Permite cualquier subdominio de barb en Vercel sin hardcodeo exhaustivo.
    allow_origin_regex=r"https://barb.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_checks():
    """Valida dependencias y auto-construye la base de datos leyendo un archivo SQL local."""
    if not DEEPSEEK_API_KEY:
        print("⚠️ ADVERTENCIA: DEEPSEEK_API_KEY no configurada. El endpoint /api/chat estará degradado.")
    
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # 1. VERIFICACIÓN DE SEGURIDAD: Comprobamos si la BD ya tiene tablas
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'usuario'
                );
            """)
            db_exists = cursor.fetchone()['exists']

            # 2. INYECCIÓN: Si la BD está vacía, leemos y ejecutamos tu archivo SQL
            if not db_exists:
                print("⚙️ Base de datos vacía detectada. Buscando archivo SQL...")
                
                # 👇 AQUI ESTA LA MAGIA DE LA RUTA: Entramos a la carpeta initScripts
                base_dir = os.path.dirname(__file__) 
                sql_file_path = os.path.join(base_dir, 'initScripts', '01_tablas.sql')
                
                if os.path.exists(sql_file_path):
                    with open(sql_file_path, 'r', encoding='utf-8') as file:
                        sql_script = file.read()
                    
                    cursor.execute(sql_script)
                    conn.commit()
                    print("✅ Tablas y datos inyectados exitosamente desde el archivo SQL.")
                    
                    # 3. VERIFICACIÓN DEL ADMIN: Nos aseguramos de que puedas entrar
                    cursor.execute("SELECT COUNT(*) as total FROM usuario")
                    row = cursor.fetchone()
                    if row and row['total'] == 0:
                        default_hash = hash_password('admin123')
                        cursor.execute(
                            "INSERT INTO usuario (empresa_id, nombre, email, password_hash, rol) VALUES (%s, %s, %s, %s, %s)",
                            (1, 'Admin BARB', 'admin@barb.com', default_hash, 'admin')
                        )
                        conn.commit()
                        print("✅ Usuario Administrador creado automáticamente.")
                else:
                    print(f"⚠️ ERROR: No se encontró el archivo {sql_file_path}")
            else:
                print("✅ La base de datos ya está estructurada. Omitiendo lectura del SQL.")

            # 4. REPARACIÓN DE CONTRASEÑAS: se ejecuta SIEMPRE (exista o no la tabla
            # previamente), porque el seed SQL puede traer passwords en texto plano
            # (ej. 'admin123') y eso rompe el login aunque la tabla ya existiera.
            actualizados = ensure_passwords_hashed(cursor)
            conn.commit()
            if actualizados:
                print(f"🔒 {actualizados} contraseña(s) en texto plano fueron hasheadas automáticamente.")

    except Exception as e:
        if conn: conn.rollback()
        print(f"⚠️ ADVERTENCIA: No se pudo estructurar PostgreSQL al iniciar: {e}")
    finally:
        if conn:
            release_db_connection(conn)

@app.on_event("shutdown")
async def shutdown_cleanup():
    """Cierra el cliente HTTP de DeepSeek para liberar conexiones keep-alive."""
    await ia_client.close()

@app.get("/api/debug-token-status")
def debug_token_status():
    """
    ENDPOINT TEMPORAL DE DIAGNÓSTICO — eliminar después de confirmar configuración.
    No expone el token real, solo confirma si la variable existe y su longitud.
    """
    token = os.getenv("ADMIN_RESET_TOKEN")
    return {
        "configurado": bool(token),
        "longitud": len(token) if token else 0,
        "primeros_4_caracteres": token[:4] if token else None,
    }


@app.post("/api/force-reset-db")
def force_reset_db(x_admin_token: str = Header(default="", alias="X-Admin-Token")):
    """
    Fuerza el borrado total de la BD (vía DROP SCHEMA dentro del propio SQL),
    reinyecta el archivo 01_tablas.sql (OTs, sesiones, máquinas de prueba) y
    encripta cualquier contraseña en texto plano para que el Login funcione.

    Protegido por token: requiere el header X-Admin-Token con el valor
    configurado en la variable de entorno ADMIN_RESET_TOKEN de Render.

    ## Raises:
    HTTPException(403): Token ausente o incorrecto.
    HTTPException(404): No se encontró el archivo 01_tablas.sql.
    HTTPException(500): Falla al ejecutar el script o al hashear contraseñas.
    """
    expected_token = (os.getenv("ADMIN_RESET_TOKEN") or "").strip()
    received_token = (x_admin_token or "").strip()
    if not expected_token or received_token != expected_token:
        # DIAGNÓSTICO TEMPORAL: no expone los tokens completos, solo longitud
        # y primeros/últimos caracteres para comparar sin filtrar el secreto.
        raise HTTPException(
            status_code=403,
            detail={
                "mensaje": "Token de administrador inválido o no configurado.",
                "token_esperado_longitud": len(expected_token),
                "token_esperado_inicio": expected_token[:4] if expected_token else None,
                "token_recibido_longitud": len(received_token),
                "token_recibido_inicio": received_token[:4] if received_token else None,
                "token_recibido_fin": received_token[-4:] if received_token else None,
                "token_recibido_vacio": received_token == "",
            },
        )

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            print("Iniciando reseteo forzado de la base de datos...")

            # 1. Ubicar el archivo SQL
            base_dir = os.path.dirname(__file__)
            sql_file_path = os.path.join(base_dir, 'initScripts', '01_tablas.sql')

            if not os.path.exists(sql_file_path):
                raise HTTPException(status_code=404, detail=f"No se encontró el archivo: {sql_file_path}")

            # 2. Leer y ejecutar TODO el archivo (DROP SCHEMA + recreación + datos de prueba)
            with open(sql_file_path, 'r', encoding='utf-8') as file:
                sql_script = file.read()
            cursor.execute(sql_script)

            # 3. Hashear cualquier contraseña en texto plano ('admin123', 'tecnico123', etc.)
            actualizados = ensure_passwords_hashed(cursor)

            conn.commit()

        return {
            "status": "success",
            "message": "Base de datos reseteada y poblada con éxito.",
            "passwords_hasheadas": actualizados,
        }
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al forzar reseteo: {str(e)}")
    finally:
        if conn: release_db_connection(conn)
        
# =============================================================================
# ENDPOINTS — SALUD Y DIAGNÓSTICO
# =============================================================================


@app.get("/")
async def root():
    return {"service": "BARB API", "status": "online"}


@app.get("/health")
@app.get("/api/health")
async def health():
    """
    Verifica conectividad con PostgreSQL mediante una sentencia trivial.

    ## Returns:
    Estado operativo del servicio.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "online"}
    except Exception as e:
        return {"status": "error_db", "detail": str(e)}


@app.get("/api/health/redis")
async def health_redis():
    """
    Comprueba disponibilidad del sistema de caché Redis.

    ## Returns:
    Estado en línea/fuera de línea del cliente Redis.
    """
    client = get_redis_client()
    if not client:
        return {"status": "offline"}
    try:
        return {"status": "online", "ping": client.ping()}
    except Exception as exc:
        return {"status": "offline", "detail": str(exc)}


@app.get("/api/health/llm")
async def health_llm():
    """
    Verifica disponibilidad combinada de la base de datos y la API key del motor de IA.

    ## Returns:
    Mapa topológico del estado del sistema RAG.
    """
    db_status = await health()
    has_key = bool(os.getenv("DEEPSEEK_API_KEY"))

    lm_status = {
        "status": "online" if has_key else "offline",
        "detail": (
            "API Key de DeepSeek configurada correctamente."
            if has_key
            else "Falta configurar DEEPSEEK_API_KEY en el entorno."
        ),
    }

    overall = "online" if db_status.get("status") == "online" and has_key else "degraded"
    return {"status": overall, "db": db_status, "llm": lm_status}


# =============================================================================
# ENDPOINTS — AUTENTICACIÓN Y USUARIOS
# =============================================================================


@app.post("/auth/login")
@app.post("/api/auth/login")
async def login(payload: LoginRequest):
    """
    Autentica un usuario verificando sus credenciales cifradas y su estado activo.

    ## Args:
    payload: Estructura con email y contraseña.

    ## Returns:
    Token de sesión e información pública del perfil del usuario.

    ## Raises:
    HTTPException(400): Credenciales incompletas.
    HTTPException(401): Credenciales incorrectas o perfil desactivado.
    """
    email = payload.email.strip().lower()
    password = payload.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email y contraseña requeridos.")

    user = _query_one(
        """
        SELECT usuario_id, nombre, email, password_hash, rol, activo
        FROM usuario
        WHERE lower(email) = lower(%(email)s)
        LIMIT 1
        """,
        {"email": email},
    )

    if not user or not user.get("activo", True):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrecta")

    if not verify_password(password, str(user.get("password_hash") or "")):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrecta")

    return {
        "token": secrets.token_hex(32),
        "user": {
            "id": int(user["usuario_id"]),
            "name": str(user["nombre"]),
            "role": str(user["rol"]).lower(),
        },
    }


@app.post("/auth/logout")
@app.post("/api/auth/logout")
async def logout():
    return {"status": "success"}


@app.get("/api/usuarios")
async def list_users():
    """
    Retorna el directorio completo del personal técnico de la plataforma.

    ## Returns:
    Colección de usuarios serializados.

    ## Raises:
    HTTPException(500): Error de conectividad con PostgreSQL.
    """
    try:
        rows = _query_all(
            """
            SELECT usuario_id, nombre, email, rol, activo, created_at
            FROM usuario
            ORDER BY usuario_id
            """
        )
        return [serialize_user(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar usuarios: {str(e)}")


@app.post("/api/usuarios", status_code=201)
async def create_user(payload: UserCreateRequest):
    """
    Registra un nuevo usuario con contraseña cifrada mediante bcrypt.

    ## Args:
    payload: Datos del nuevo usuario.

    ## Returns:
    Representación sanitizada del usuario creado.

    ## Raises:
    HTTPException(500): Error relacional o transaccional.
    """
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            INSERT INTO usuario (nombre, email, password_hash, rol, activo)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING usuario_id, nombre, email, rol, activo, created_at;
            """,
            (
                payload.nombre,
                payload.email,
                hash_password(payload.password),
                payload.rol,
                payload.activo,
            ),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        return serialize_user(row)
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        raise HTTPException(status_code=500, detail=f"Error al crear USUARIO: {str(e)}")


@app.put("/api/usuarios/{usuario_id}")
async def update_user(usuario_id: int, payload: UserUpdateRequest):
    """
    Aplica una actualización diferencial sobre los metadatos y credenciales del usuario.

    ## Args:
    usuario_id: Clave primaria del usuario.
    payload: Campos a modificar (todos opcionales).

    ## Returns:
    Registro actualizado bajo serialización autorizada.

    ## Raises:
    HTTPException(404): Usuario inexistente.
    HTTPException(500): Error transaccional en base de datos.
    """
    conn = None
    try:
        current = _query_one(
            """
            SELECT usuario_id, nombre, email, password_hash, rol, activo, created_at
            FROM usuario
            WHERE usuario_id = %(usuario_id)s
            LIMIT 1
            """,
            {"usuario_id": usuario_id},
        )
        if not current:
            raise HTTPException(status_code=404, detail="USUARIO no encontrado para actualizar.")

        next_nombre = payload.nombre if payload.nombre is not None else current["nombre"]
        next_email = payload.email if payload.email is not None else current["email"]
        next_password_hash = (
            hash_password(payload.password) if payload.password is not None else current["password_hash"]
        )
        next_rol = payload.rol if payload.rol is not None else current["rol"]
        next_activo = payload.activo if payload.activo is not None else current["activo"]

        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            UPDATE usuario
            SET nombre = %s, email = %s, password_hash = %s, rol = %s, activo = %s
            WHERE usuario_id = %s
            RETURNING usuario_id, nombre, email, rol, activo, created_at;
            """,
            (next_nombre, next_email, next_password_hash, next_rol, next_activo, usuario_id),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        return serialize_user(row)
    except HTTPException:
        if conn:
            conn.rollback()
            conn.close()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        raise HTTPException(status_code=500, detail=f"Error al actualizar USUARIO: {str(e)}")


@app.delete("/api/usuarios/{usuario_id}", status_code=204)
async def delete_user(usuario_id: int):
    """
    Elimina permanentemente un registro de usuario (hard delete).

    ## Args:
    usuario_id: Clave interna del usuario a eliminar.

    ## Raises:
    HTTPException(404): Usuario no encontrado.
    HTTPException(500): Violación de integridad referencial u error SQL.
    """
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("DELETE FROM usuario WHERE usuario_id = %s;", (usuario_id,))
        deleted = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()

        if deleted == 0:
            raise HTTPException(status_code=404, detail="USUARIO no encontrado para eliminar.")
        return None
    except HTTPException:
        if conn:
            conn.rollback()
            conn.close()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        raise HTTPException(status_code=500, detail=f"Error al eliminar USUARIO: {str(e)}")


# =============================================================================
# ENDPOINTS — ESTADÍSTICAS FINANCIERAS
# =============================================================================


@app.get("/api/stats/financial-impact")
@lru_cache(maxsize=1)
def get_financial_impact():
    """
    Calcula KPIs de desempeño (MTTR, costos acumulados, ahorro estimado) desde la tabla de OTs completadas.

    ## Returns:
    Indicadores financieros: mttr, costo_total_acumulado, ahorro_estimado.
    """
    query = text(
        """
        SELECT
            COALESCE(AVG(tiempo_reparacion_min), 0) AS mttr,
            COALESCE(SUM(costo_real), 0) AS costo_total_acumulado,
            COALESCE(SUM(downtime_minutes), 0) * 2000 AS ahorro_estimado
        FROM orden_trabajo
        WHERE estado = 'completed'
        """
    )
    try:
        with engine.connect() as conn:
            res = conn.execute(query).mappings().one()
            return {
                "mttr": float(res["mttr"]),
                "costo_total_acumulado": float(res["costo_total_acumulado"]),
                "ahorro_estimado": float(res["ahorro_estimado"]),
            }
    except Exception:
        return {"mttr": 0.0, "costo_total_acumulado": 0.0, "ahorro_estimado": 0.0}


# =============================================================================
# ENDPOINTS — ÓRDENES DE TRABAJO
# =============================================================================


@app.get("/api/work-orders")
@app.get("/api/work_orders")
def get_work_orders():
    """
    Retorna el listado completo de OTs enriquecido con relaciones de máquina, planta, disciplina y conteo fotográfico.

    ## Returns:
    Lista de Órdenes de Trabajo para paneles frontend.
    """
    query = text(
        """
        SELECT
            ot.ot_id, ot.numero_ot, ot.maquina_id, ot.tecnico_id, ot.creado_por,
            ot.diagnostico_id, ot.reporte_id, ot.tipo, ot.descripcion_problema,
            ot.descripcion_reparacion, ot.resolution, ot.priority, ot.severity,
            ot.fecha_creacion, ot.fecha_inicio, ot.fecha_cierre, ot.fecha_vencimiento,
            ot.tiempo_reparacion_min, ot.downtime_minutes, ot.costo_estimado,
            ot.costo_real, ot.estado,
            m.nombre AS machine_name,
            m.planta_id,
            d.disciplina_id AS discipline_id,
            d.nombre AS discipline_name,
            p.nombre AS plant_name,
            u.nombre AS tecnico_nombre,
            COALESCE(photos.photo_count, 0) AS photo_count
        FROM orden_trabajo ot
        JOIN maquina m ON m.maquina_id = ot.maquina_id
        LEFT JOIN disciplina d ON d.disciplina_id = m.disciplina_id
        LEFT JOIN planta p ON p.planta_id = m.planta_id
        LEFT JOIN usuario u ON u.usuario_id = ot.tecnico_id
        LEFT JOIN (
            SELECT ot_id, COUNT(*) AS photo_count
            FROM ot_foto
            GROUP BY ot_id
        ) photos ON photos.ot_id = ot.ot_id
        ORDER BY ot.fecha_creacion DESC, ot.ot_id DESC
        """
    )
    try:
        with engine.connect() as conn:
            rows = conn.execute(query).mappings().all()
            return [row_to_work_order(dict(row)) for row in rows]
    except Exception as e:
        print(f"Error BD: {e}")
        return []


@app.get("/api/work-orders/{numero_ot}")
@app.get("/api/work_orders/{numero_ot}")
def get_work_order(numero_ot: str):
    """
    Recupera una OT individual junto a su evidencia fotográfica asociada.

    ## Args:
    numero_ot: Folio único de dominio de la OT.

    ## Returns:
    Representación completa de la OT.

    ## Raises:
    HTTPException(404): OT no encontrada.
    """
    row = fetch_work_order_row(numero_ot)
    if not row:
        raise HTTPException(status_code=404, detail="OT no encontrada.")
    photos = fetch_work_order_photos(int(row["ot_id"]))
    return row_to_work_order(row, photos=photos)


@app.put("/api/work-orders/{numero_ot}/status")
@app.put("/api/work_orders/{numero_ot}/status")
async def update_work_order_status(numero_ot: str, payload: WorkOrderStatusRequest):
    """
    Ejecuta una transición de estado en el ciclo de vida de la OT,
    registrando automáticamente fechas de inicio y cierre según corresponda.

    ## Args:
    numero_ot: Folio de la OT a mutar.
    payload: Nuevo estado solicitado.

    ## Returns:
    OT actualizada con su estado definitivo.

    ## Raises:
    HTTPException(404): OT no encontrada.
    HTTPException(500): Error transaccional en PostgreSQL.
    """
    desired_status = parse_work_order_status(payload.status)
    current = fetch_work_order_row(numero_ot)
    if not current:
        raise HTTPException(status_code=404, detail="OT no encontrada.")

    next_fecha_inicio = current["fecha_inicio"]
    next_fecha_cierre = current["fecha_cierre"]

    if desired_status == "in_progress" and next_fecha_inicio is None:
        next_fecha_inicio = datetime.utcnow()
    if desired_status == "completed":
        next_fecha_cierre = datetime.utcnow()
        if next_fecha_inicio is None:
            next_fecha_inicio = datetime.utcnow()

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            UPDATE orden_trabajo
            SET estado = %s, fecha_inicio = %s, fecha_cierre = %s
            WHERE numero_ot = %s
            RETURNING numero_ot
            """,
            (desired_status, next_fecha_inicio, next_fecha_cierre, numero_ot),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="OT no encontrada.")
        updated = fetch_work_order_row(numero_ot)
        photos = fetch_work_order_photos(int(updated["ot_id"])) if updated else []
        return row_to_work_order(updated, photos=photos) if updated else {"status": "ok"}
    except HTTPException:
        if conn:
            conn.rollback()
            conn.close()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        raise HTTPException(status_code=500, detail=f"Error al actualizar estado de OT: {str(e)}")


@app.delete("/api/work-orders/{numero_ot}", status_code=204)
@app.delete("/api/work_orders/{numero_ot}", status_code=204)
async def delete_work_order(numero_ot: str):
    """
    Elimina una OT con su evidencia fotográfica asociada de forma cascada.

    ## Args:
    numero_ot: Folio de dominio de la OT a eliminar.

    ## Raises:
    HTTPException(404): OT no encontrada.
    HTTPException(500): Error transaccional en base de datos.
    """
    current = fetch_work_order_row(numero_ot)
    if not current:
        raise HTTPException(status_code=404, detail="OT no encontrada.")
    ot_id = int(current["ot_id"])
    delete_ot_files(ot_id)

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("DELETE FROM orden_trabajo WHERE ot_id = %s;", (ot_id,))
        deleted = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()

        if deleted == 0:
            raise HTTPException(status_code=404, detail="OT no encontrada para eliminar.")
        return None
    except HTTPException:
        if conn:
            conn.rollback()
            conn.close()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        raise HTTPException(status_code=500, detail=f"Error al eliminar OT: {str(e)}")


@app.post("/api/work-orders")
@app.post("/api/work_orders")
async def create_work_order(request: Request):
    """
    Crea una OT desde un payload multipart/form-data o application/json,
    con soporte opcional para carga de fotografías en la misma solicitud.

    El número de OT se genera con formato OT-{AÑO}-{id:04d} post-inserción
    para garantizar secuencialidad basada en la clave primaria.

    ## Args:
    request: Solicitud HTTP con cabecera Content-Type definiendo el modo de lectura.

    ## Returns:
    OT creada con conteo y arreglo de fotografías adjuntas.

    ## Raises:
    HTTPException(415): Content-Type no soportado.
    HTTPException(500): Error en el pipeline transaccional o en operaciones de archivos.
    """
    content_type = (request.headers.get("content-type") or "").lower()
    payload: dict[str, Any] = {}
    images: list[UploadFile] = []

    if "multipart/form-data" in content_type:
        form = await request.form()
        payload = {key: form.get(key) for key in form.keys()}
        for key in ("images", "photos", "attachments", "photo"):
            images.extend([value for value in form.getlist(key) if isinstance(value, UploadFile)])
    elif "application/json" in content_type:
        payload = await request.json()
    else:
        raise HTTPException(status_code=415, detail="Content-Type no soportado para crear OT.")

    maquina_id = safe_int(payload.get("maquina_id") or payload.get("machine_id"), "maquina_id")
    tecnico_id = safe_int(payload.get("tecnico_id") or payload.get("technician_id"), "tecnico_id")
    creado_por = safe_int(payload.get("creado_por") or payload.get("created_by") or tecnico_id, "creado_por")
    tipo = safe_text(payload.get("tipo"), "corrective") or "corrective"
    descripcion_problema = safe_text(
        payload.get("descripcion_problema")
        or payload.get("description")
        or payload.get("title")
        or payload.get("issue_description"),
        "",
    )
    descripcion_reparacion = safe_text(payload.get("descripcion_reparacion"), "")
    resolution = safe_text(payload.get("resolution"), "")
    priority = normalize_db_status(safe_text(payload.get("priority"), "medium")) or "medium"
    severity = safe_text(payload.get("severity"), "") or None
    estado = parse_work_order_status(safe_text(payload.get("estado") or payload.get("status"), "pending"))
    fecha_vencimiento = parse_optional_datetime(payload.get("fecha_vencimiento") or payload.get("due_date"))

    # Número temporal para satisfacer restricción NOT NULL; se reemplaza tras obtener el ot_id.
    temp_numero_ot = f"OT-TEMP-{uuid.uuid4().hex[:6]}"

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            INSERT INTO orden_trabajo (
                numero_ot, maquina_id, tecnico_id, creado_por, tipo,
                descripcion_problema, descripcion_reparacion, resolution,
                priority, severity, fecha_vencimiento, estado
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING ot_id
            """,
            (
                temp_numero_ot,
                maquina_id,
                tecnico_id,
                creado_por,
                tipo,
                descripcion_problema or None,
                descripcion_reparacion or None,
                resolution or None,
                priority,
                severity,
                fecha_vencimiento,
                estado,
            ),
        )
        row = cursor.fetchone()
        ot_id = int(row["ot_id"])

        clean_numero_ot = f"OT-{datetime.utcnow().year}-{ot_id:04d}"
        cursor.execute(
            "UPDATE orden_trabajo SET numero_ot = %s WHERE ot_id = %s",
            (clean_numero_ot, ot_id),
        )

        conn.commit()
        cursor.close()
        conn.close()
    except HTTPException:
        if conn:
            conn.rollback()
            conn.close()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        raise HTTPException(status_code=500, detail=f"Error al crear OT: {str(e)}")

    saved_photos: list[dict] = []
    try:
        if images:
            saved_photos = await save_ot_photos(clean_numero_ot, ot_id, images)
    except Exception as e:
        delete_ot_files(ot_id)
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("DELETE FROM orden_trabajo WHERE ot_id = %s;", (ot_id,))
            conn.commit()
        finally:
            release_db_connection(conn)
        raise HTTPException(status_code=500, detail=f"Error al guardar fotos de la OT: {str(e)}")

    created = fetch_work_order_row(clean_numero_ot)
    photos = fetch_work_order_photos(ot_id)
    response_data = row_to_work_order(created, photos=photos) if created else {"numero_ot": clean_numero_ot, "ot_id": ot_id}
    response_data["photos"] = photos
    response_data["photo_count"] = len(photos)
    return response_data


# =============================================================================
# ENDPOINTS — DOCUMENTOS
# =============================================================================


@app.post("/api/documents/upload")
@app.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Acepta y persiste archivos PDF para su posterior indexación en el motor RAG.

    ## Args:
    file: Archivo recibido desde el cliente HTTP.

    ## Returns:
    Metadatos de localización del archivo persistido.

    ## Raises:
    HTTPException(415): Si el archivo no es de tipo application/pdf.
    """
    content_type = (file.content_type or "").strip().lower()
    if content_type != "application/pdf":
        raise HTTPException(status_code=415, detail="Solo se permiten archivos PDF (application/pdf).")

    doc_dir = UPLOAD_DIR / "documents"
    doc_dir.mkdir(parents=True, exist_ok=True)

    stored = store_upload_file(file, doc_dir, "doc")
    return {
        "id": stored["file_id"],
        "filename": stored["stored_name"],
        "original_name": stored["original_name"],
        "content_type": "application/pdf",
        "path": str(stored["stored_path"]),
    }


# =============================================================================
# ENDPOINTS — CATÁLOGOS (MÁQUINAS, PLANTAS, DISCIPLINAS, TÉCNICOS)
# =============================================================================


@app.get("/api/machines")
def get_machines():
    """
    Retorna el catálogo completo de máquinas registradas en el sistema.

    ## Returns:
    Lista de máquinas con id, nombre, discipline_id y plant_id.
    """
    try:
        rows = _query_all(
            """
            SELECT maquina_id AS id, nombre, disciplina_id, planta_id
            FROM maquina
            ORDER BY nombre
            """
        )
        return [
            {
                "id": int(r["id"]),
                "name": r["nombre"],
                "discipline_id": r["disciplina_id"],
                "plant_id": r["planta_id"],
            }
            for r in rows
        ]
    except Exception:
        return [{"id": 1, "name": "Planta Principal", "discipline_id": 1, "plant_id": 1}]


@app.get("/api/disciplines")
@lru_cache(maxsize=1)
def get_disciplines():
    """
    Retorna las disciplinas de mantenimiento disponibles (mecánica, eléctrica, etc.).

    ## Returns:
    Lista de disciplinas con id y nombre.
    """
    try:
        rows = _query_all(
            """
            SELECT disciplina_id AS id, nombre
            FROM disciplina
            ORDER BY nombre
            """
        )
        return [{"id": int(r["id"]), "name": r["nombre"]} for r in rows]
    except Exception:
        return [{"id": 1, "name": "General"}]


@app.get("/api/plants")
@app.get("/api/plantas")
def get_plants():
    """
    Retorna el registro geográfico de clústeres operativos habilitados.

    ## Returns:
    Lista de plantas con id, nombre y ubicación.
    """
    try:
        rows = _query_all(
            """
            SELECT planta_id AS id, nombre, ubicacion
            FROM planta
            ORDER BY planta_id
            """
        )
        return [
            {"id": int(r["id"]), "name": r["nombre"], "ubicacion": r["ubicacion"]}
            for r in rows
        ]
    except Exception:
        return [{"id": 1, "name": "Planta Central San Bernardo", "ubicacion": "San Bernardo, Región Metropolitana, Chile"}]


@app.get("/api/technicians")
@lru_cache(maxsize=1)
def get_technicians():
    """
    Retorna los técnicos activos disponibles para asignación de órdenes de trabajo.

    ## Returns:
    Lista de técnicos con id, nombre, email y rol.
    """
    try:
        rows = _query_all(
            """
            SELECT usuario_id AS id, nombre, email, rol
            FROM usuario
            WHERE lower(rol) = 'tecnico' AND COALESCE(activo, true) = true
            ORDER BY nombre
            """
        )
        return [{"id": int(r["id"]), "name": r["nombre"], "email": r["email"], "role": r["rol"]} for r in rows]
    except Exception:
        return []


# =============================================================================
# ENDPOINTS — INTELIGENCIA ARTIFICIAL (DeepSeek)
# =============================================================================


@app.post("/api/chat")
@app.post("/chat")
async def chat(payload: ChatRequest):
    """
    Delega una consulta al motor DeepSeek con historial de conversación y caché por hash de mensaje.

    La clave de caché incluye idioma y mensaje para evitar colisiones entre usuarios con distintos idiomas.
    El historial se inyecta al contexto del LLM para mantener coherencia conversacional.

    ## Args:
    payload: Prompt del usuario con idioma, historial y contexto de máquina opcional.

    ## Returns:
    Respuesta del LLM con fuentes de referencia.

    ## Raises:
    HTTPException(500): API Key de IA no configurada.
    HTTPException(502): Error de comunicación con DeepSeek.
    """
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="API Key de IA no configurada en el servidor.")

    cache_key = hashlib.sha256(
        f"chat:{payload.language}:{payload.message.strip()}".encode("utf-8")
    ).hexdigest()

    cached = cache_get(cache_key)
    if cached:
        return cached

    system_content = _BARB_SYSTEM_PROMPT
    if payload.language and payload.language != "es":
        system_content += f" Idioma de respuesta: {payload.language}."
    if payload.machine:
        system_content += f" Máquina en contexto: {payload.machine}."

    messages: list[dict] = [{"role": "system", "content": system_content}]

    # Incluye el historial reciente para mantener coherencia conversacional.
    for item in payload.history:
        messages.append({"role": item.role, "content": item.content})

    messages.append({"role": "user", "content": payload.message})

    try:
        response = await ia_client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            temperature=0.3,
            max_tokens=1024,
        )

        reply = response.choices[0].message.content
        result = {
            "reply": reply,
            "sources": ["Base de Conocimiento BARB"],
            "language": payload.language,
        }

        # Solo cachea si no hay historial: respuestas contextuales no son reutilizables.
        if not payload.history:
            cache_set(cache_key, result, ttl_seconds=300)

        return result

    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error de comunicación con el motor de IA: {type(e).__name__}")
# =============================================================================
# ENDPOINTS — HISTORIAL DE CHAT Y FEEDBACK
# =============================================================================

@app.post("/api/chat-sessions")
@app.post("/chat-sessions")
async def save_chat_session(payload: ChatSessionRequest):
    """Guarda una sesión completa de chat (memoria RAG) en PostgreSQL."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO chat_session (
                    title, saved_by, discipline, plant_id, plant_name, 
                    machine_id, machine_name, active_manual, messages, metadata
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING session_id;
                """,
                (
                    payload.title, payload.saved_by, payload.discipline, 
                    payload.plant_id, payload.plant_name, payload.machine_id, 
                    payload.machine_name, payload.active_manual, 
                    json.dumps(payload.messages), json.dumps(payload.metadata_info)
                )
            )
            row = cursor.fetchone()
            conn.commit()
            return {"status": "success", "session_id": row["session_id"]}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar sesión: {str(e)}")
    finally:
        if conn: release_db_connection(conn)

@app.get("/api/chat-sessions")
async def get_chat_sessions():
    """Recupera el historial de todas las sesiones de chat guardadas."""
    try:
        rows = _query_all("SELECT * FROM chat_session ORDER BY created_at DESC LIMIT 50")
        for row in rows:
            if isinstance(row.get("created_at"), datetime):
                row["created_at"] = row["created_at"].isoformat()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener sesiones: {str(e)}")

@app.post("/api/chat-feedback")
async def save_chat_feedback(payload: ChatFeedbackRequest):
    """Guarda la calificación (👍 / 👎) de una respuesta de BARB con su contexto."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Si la tabla no tiene la columna context, no fallará, pero idealmente 
            # en un entorno de DB formal añadirías la columna ALTER TABLE.
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_feedback (
                    feedback_id SERIAL PRIMARY KEY,
                    message_content TEXT,
                    rating VARCHAR(10),
                    context VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cursor.execute(
                "INSERT INTO chat_feedback (message_content, rating, context) VALUES (%s, %s, %s)",
                (payload.message_content, payload.rating, payload.context)
            )
            conn.commit()
            return {"status": "success"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar feedback: {str(e)}")
    finally:
        if conn: release_db_connection(conn)
# =============================================================================
# ENDPOINTS — TOPOLOGÍA AUTOMÁTICA
# =============================================================================

@app.get("/api/topologia")
@app.get("/api/topology")
def get_topologia():
    """
    Genera un mapa topológico dinámico leyendo las tablas maquina, planta y disciplina.
    No requiere tablas de coordenadas manuales.
    """
    try:
        # Extraemos los datos básicos de la BD
        plantas = _query_all("SELECT planta_id, nombre FROM planta")
        disciplinas = _query_all("SELECT disciplina_id, nombre FROM disciplina")
        maquinas = _query_all("SELECT maquina_id, nombre, planta_id, disciplina_id FROM maquina")
        
        nodos = []
        conexiones = []
        
        # 1. Nivel Superior: Plantas (Y = 100)
        x_offset_planta = 500
        for p in plantas:
            nodos.append({
                "nodo_id": f"p_{p['planta_id']}",
                "nombre_visual": p["nombre"],
                "tipo": "Planta",
                "icono": "🏭",
                "pos_x": x_offset_planta,
                "pos_y": 100,
                "estado_actual": "operativo"
            })
            x_offset_planta += 300
            
        # 2. Nivel Medio: Disciplinas (Y = 300)
        x_offset_disc = 200
        for d in disciplinas:
            n_id = f"d_{d['disciplina_id']}"
            nodos.append({
                "nodo_id": n_id,
                "nombre_visual": d["nombre"],
                "tipo": "Disciplina",
                "icono": "⚙️",
                "pos_x": x_offset_disc,
                "pos_y": 300,
                "estado_actual": "operativo"
            })
            # Conectamos cada disciplina a la primera planta disponible (raíz)
            if plantas:
                conexiones.append({
                    "conexion_id": f"conn_p{plantas[0]['planta_id']}_{n_id}",
                    "origen_nodo_id": f"p_{plantas[0]['planta_id']}",
                    "destino_nodo_id": n_id,
                    "tipo_relacion": "jerarquia"
                })
            x_offset_disc += 250
            
        # 3. Nivel Inferior: Máquinas (Y = 500)
        x_offset_maq = 50
        for m in maquinas:
            n_id = f"m_{m['maquina_id']}"
            nodos.append({
                "nodo_id": n_id,
                "maquina_id": m["maquina_id"],
                "nombre_visual": m["nombre"],
                "tipo": "Máquina",
                "icono": "🤖",
                "pos_x": x_offset_maq,
                "pos_y": 500,
                "estado_actual": "operativo"
            })
            
            # Conectamos la máquina a su disciplina correspondiente
            if m.get("disciplina_id"):
                conexiones.append({
                    "conexion_id": f"conn_d{m['disciplina_id']}_{n_id}",
                    "origen_nodo_id": f"d_{m['disciplina_id']}",
                    "destino_nodo_id": n_id,
                    "tipo_relacion": "pertenece"
                })
            x_offset_maq += 180

        return {
            "nodos": nodos,
            "conexiones": conexiones
        }
        
    except Exception as e:
        print(f"Error generando topología automática: {e}")
        # Fallback de seguridad en caso de que fallen las tablas
        return {"nodos": [], "conexiones": []}
    
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 9000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)