from __future__ import annotations

# Chroma exige sqlite3 >= 3.35; la mayoría de las imágenes Linux (incluyendo
# lo que corre en Render) traen una versión de sqlite3 del sistema más
# vieja, lo que hace que chromadb.PersistentClient falle al arrancar con un
# RuntimeError de versión. pysqlite3-binary (ya está en requirements.txt)
# es el shim estándar para esto: hay que reemplazar el módulo sqlite3 ANTES
# de que cualquier otra cosa (en particular chromadb) lo importe. Se hace
# de forma defensiva: si pysqlite3-binary no está instalado, sqlite3 sigue
# siendo el del sistema — chromadb fallará más abajo igual, pero de forma
# controlada (ver _CHROMA_AVAILABLE) en vez de romper este import.
try:
    __import__("pysqlite3")
    import sys as _sys
    _sys.modules["sqlite3"] = _sys.modules.pop("pysqlite3")
except ImportError:
    pass

import asyncio
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
import psycopg2
from dotenv import load_dotenv

# chromadb y pypdf son dependencias del RAG de manuales técnicos (búsqueda de
# similitud contra la colección "barb_manuals"). Se importan de forma
# defensiva: si todavía no están en requirements.txt / instaladas en el
# entorno, el servidor debe seguir levantando igual, solo que sin RAG de
# manuales (get_manuals_collection() devuelve None y todo lo que dependa de
# eso se degrada a "sin resultados" en vez de tumbar el proceso).
try:
    import chromadb
    _CHROMA_AVAILABLE = True
except ImportError:
    chromadb = None
    _CHROMA_AVAILABLE = False

try:
    from pypdf import PdfReader
    _PYPDF_AVAILABLE = True
except ImportError:
    PdfReader = None
    _PYPDF_AVAILABLE = False

try:
    import docx2txt
    _DOCX2TXT_AVAILABLE = True
except ImportError:
    docx2txt = None
    _DOCX2TXT_AVAILABLE = False
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
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
#
# Carga variables de entorno y define rutas y parámetros base utilizados
# por el resto de la aplicación.
#

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://barb_admin:barb_password123@db:5432/barb_database",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/app/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Ruta de persistencia de Chroma (base vectorial de manuales técnicos) y
# nombre de la colección. "barb_manuals" es el nombre real ya usado en el
# chroma.sqlite3 existente del proyecto — se mantiene por defecto para que
# esto apunte al mismo store sin configuración adicional.
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "/app/chroma_db")
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "barb_manuals")

# =============================================================================
# MOTORES Y CLIENTES
# =============================================================================
#
# Inicializa los motores de base de datos y los clientes externos
# (HTTP, IA) reutilizados durante todo el ciclo de vida del servicio.
#

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

    Returns:
        Objeto de conexión psycopg2.

    Raises:
        psycopg2.OperationalError:
            Si no puede establecer conexión con el servidor.
    """
    global db_pool
    if db_pool is None:
        db_pool = ThreadedConnectionPool(1, 10, dsn=DATABASE_URL)
    return db_pool.getconn()


def release_db_connection(conn) -> None:
    """
    Devuelve una conexión al pool o la cierra si el pool no está disponible.

    Args:
        conn:
            Conexión psycopg2 a liberar.
    """
    global db_pool
    if db_pool is not None:
        db_pool.putconn(conn)
    else:
        conn.close()


def _query_all(sql: str, params: Optional[dict] = None) -> list[dict]:
    """
    Ejecuta una consulta SQL y retorna todos los registros como lista de diccionarios.

    Args:
        sql:
            Sentencia SQL a ejecutar.
        params:
            Parámetros de interpolación.

    Returns:
        Lista de registros recuperados.

    Raises:
        psycopg2.DatabaseError:
            Error de ejecución en la consulta SQL.
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

    Args:
        sql:
            Sentencia SQL a ejecutar.
        params:
            Parámetros de interpolación.

    Returns:
        Diccionario con el registro o None si no hay resultados.
    """
    rows = _query_all(sql, params)
    return rows[0] if rows else None


def _execute_write(query: str, params: Optional[dict] = None) -> Any:
    """
    Ejecuta una sentencia SQL de escritura (INSERT, UPDATE, DELETE) con confirmación transaccional.

    Args:
        query:
            Sentencia SQL con parámetros nombrados (SQLAlchemy text).
        params:
            Valores de interpolación.

    Raises:
        HTTPException(500):
            Si la escritura falla en base de datos.
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
#
# Centraliza la conexión y las operaciones de lectura/escritura sobre
# el sistema de caché Redis.
#


def get_redis_client() -> Redis | None:
    """
    Inicializa y retorna la conexión al servidor Redis.

    Returns:
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

    Args:
        key:
            Identificador único del recurso en caché.

    Returns:
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

    Args:
        key:
            Identificador único del recurso.
        value:
            Datos a almacenar (deben ser serializables a JSON).
        ttl_seconds:
            Tiempo de vida en segundos (por defecto 300).
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
#
# Agrupa utilidades de cifrado de contraseñas, normalización de valores
# de dominio y conversiones seguras de tipos.
#


def hash_password(raw_password: str) -> str:
    """
    Aplica bcrypt a una contraseña en texto plano.

    Args:
        raw_password:
            Contraseña proporcionada por el usuario.

    Returns:
        Hash criptográfico seguro.
    """
    return bcrypt.hashpw(raw_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw_password: str, stored_password: str) -> bool:
    """
    Verifica si una contraseña en texto plano corresponde al hash almacenado.
    Soporta hashes bcrypt y contraseñas en texto plano (legacy).

    Args:
        raw_password:
            Contraseña del intento de acceso.
        stored_password:
            Hash almacenado en base de datos.

    Returns:
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

    Args:
        cursor:
            Cursor psycopg2 activo (debe soportar RealDictCursor o tupla).

    Returns:
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

    Args:
        user:
            Registro crudo obtenido de base de datos.

    Returns:
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


def normalize_priority(value: str | None) -> str:
    """
    Normaliza el valor de prioridad de una OT al conjunto válido del enum prioridad_ot.

    Anteriormente esta normalización reutilizaba normalize_db_status() (pensada
    para el campo 'estado'), lo cual funcionaba solo por casualidad: como valores
    como 'low'/'medium'/'high'/'urgent' no están en el mapa de estados, la función
    los devolvía tal cual sin tocarlos. Cualquier cambio futuro en esa función
    (pensada para otro dominio) podía romper 'priority' sin relación aparente.

    Args:
        value:
            Prioridad en formato libre.

    Returns:
        Clave de prioridad normalizada (low/medium/high/urgent).
    """
    raw = (value or "").strip().lower()
    mapping = {
        "low": "low",
        "medium": "medium",
        "normal": "medium",
        "high": "high",
        "urgent": "urgent",
        "critical": "urgent",  # alias defensivo: 'critical' es de severity, pero se mapea por si llega mezclado
    }
    return mapping.get(raw, "medium")


def normalize_db_status(value: str | None) -> str:
    """
    Normaliza variaciones semánticas de estados operativos al conjunto estándar de la base de datos.

    Args:
        value:
            Estado en formato libre.

    Returns:
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

    Args:
        value:
            Clave de estado normalizado.

    Returns:
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

    Args:
        value:
            Valor crudo representando una fecha/hora.

    Returns:
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

    Args:
        value:
            Valor numérico crudo.
        field_name:
            Nombre del campo para mensajes de error.

    Returns:
        Valor numérico validado.

    Raises:
        HTTPException(400):
            Si el valor es nulo, vacío o no convertible a entero.
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

    Args:
        value:
            Variable objetivo.
        default:
            Cadena de respaldo si el valor es nulo.

    Returns:
        Texto saneado sin espacios perimetrales.
    """
    if value is None:
        return default
    return str(value).strip()


def iso_z(val) -> str | None:
    """
    Estandariza fechas a formato ISO 8601 con sufijo UTC explícito (Z).

    Args:
        val:
            Objeto datetime o cadena de fecha.

    Returns:
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
#
# Convierte registros relacionales de Órdenes de Trabajo en las
# estructuras de dominio consumidas por la API.
#


def row_to_work_order(row: dict, photos: list[dict] | None = None) -> dict:
    """
    Convierte un registro relacional plano en la estructura JSON jerárquica de una Orden de Trabajo.

    Args:
        row:
            Registro unificado proveniente de JOINs.
        photos:
            Colección de evidencias fotográficas pre-procesadas.

    Returns:
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

    Args:
        numero_ot:
            Código único de identificación de la OT.

    Returns:
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

    Args:
        ot_id:
            Identificador primario de la OT.

    Returns:
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

    Args:
        value:
            Estado propuesto.

    Returns:
        Estado auditado y validado.

    Raises:
        HTTPException(400):
            Si el estado propuesto no está dentro del conjunto permitido.
    """
    db_status = normalize_db_status(value)
    allowed = {"pending", "assigned", "in_progress", "completed", "cancelled", "overdue"}
    if db_status not in allowed:
        raise HTTPException(status_code=400, detail="Estado de OT inválido.")
    return db_status


# =============================================================================
# GESTIÓN DE ARCHIVOS
# =============================================================================
#
# Centraliza la persistencia, validación y limpieza de archivos
# subidos por los usuarios (fotografías y documentos).
#


def store_upload_file(file: UploadFile, destination_dir: Path, prefix: str) -> dict:
    """
    Persiste un archivo en el sistema de archivos generando un nombre único para evitar colisiones.

    Args:
        file:
            Archivo recibido desde la solicitud HTTP.
        destination_dir:
            Directorio de destino absoluto.
        prefix:
            Prefijo categórico para el nombre del archivo.

    Returns:
        Diccionario con file_id, stored_name, stored_path y original_name.

    Raises:
        IOError:
            Si los permisos del sistema de archivos deniegan la escritura.
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

    Args:
        numero_ot:
            Identificador público de la OT (usado para estructura de carpetas).
        ot_id:
            Clave primaria de la OT.
        images:
            Archivos multimedia a procesar.

    Returns:
        Registros fotográficos creados exitosamente.

    Raises:
        HTTPException(415):
            Si un archivo no cumple con los tipos MIME permitidos (JPEG/PNG/WEBP).
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

    Args:
        ot_id:
            Clave primaria de la OT objetivo.
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
#
# Define los esquemas de entrada utilizados para validar los payloads
# recibidos por los endpoints.
#


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
    # El frontend (api.chat.send) ya manda este campo desde antes; el modelo
    # simplemente no lo declaraba, así que Pydantic lo descartaba en
    # silencio. No filtra por manual todavía (index_document_in_chroma no
    # guarda esa metadata aún), pero al menos ya no se pierde el valor.
    active_manual: Optional[str] = None
    # Limita el historial a las últimas 10 interacciones para evitar exceder el contexto del LLM.
    history: list[MessageItem] = Field(default_factory=list, max_length=10)


class ChatDebugRequest(BaseModel):
    sessionId: Optional[str] = None
    machineId: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=4000)
    attachments: list[Any] = Field(default_factory=list)
    sensorData: Optional[dict] = None

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
    context: Optional[str] = "General"

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
# CONSTANTES DE NEGOCIO
# =============================================================================
#
# Parámetros de negocio compartidos entre backend y frontend para el
# cálculo de indicadores financieros y de SLA.
#
# Debe coincidir con BARB_BUSINESS en frontend/src/hooks/useFinancialStats.ts
# para que las cifras de ahorro y SLA mostradas en el dashboard sean consistentes
# entre lo que calcula el backend y lo que el frontend usa para su propia UI.
SLA_TARGET_MINUTES = 24 * 60  # 24 horas, expresado en minutos (frontend usa SLA_TARGET: 24)
# Se usa $2000/min (no BARB_BUSINESS.avgDowntimeCost=5000) porque el texto ya
# visible al usuario en i18n.ts indica explícitamente un costo de US$2,000/min de
# inactividad operativa (financial.roiSubtitle) y la fórmula original del backend
# ya usaba este mismo valor. Mantenerlo evita mostrar una cifra que contradiga
# el texto que el usuario ya lee en pantalla.
DOWNTIME_COST_PER_MINUTE = 2000


# =============================================================================
# APLICACIÓN Y CORS
# =============================================================================
#
# Instancia la aplicación FastAPI y configura la política de CORS y
# los módulos de autenticación y permisos.
#

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

from permisos import require_route, require_action, require_auth, get_sesion_actual  # noqa: E402


@app.on_event("startup")
async def startup_checks():
    """Valida dependencias y auto-construye la base de datos leyendo un archivo SQL local."""
    if not DEEPSEEK_API_KEY:
        print("⚠️ ADVERTENCIA: DEEPSEEK_API_KEY no configurada. El endpoint /api/chat estará degradado.")
    
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Verifica si la base de datos ya tiene tablas creadas.
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'usuario'
                );
            """)
            db_exists = cursor.fetchone()['exists']

            # Si la BD está vacía, lee y ejecuta el archivo SQL de inicialización.
            if not db_exists:
                print("⚙️ Base de datos vacía detectada. Buscando archivo SQL...")
                
                # Construye la ruta al script de inicialización dentro de initScripts.
                base_dir = os.path.dirname(__file__) 
                sql_file_path = os.path.join(base_dir, 'initScripts', '01_tablas.sql')
                
                if os.path.exists(sql_file_path):
                    with open(sql_file_path, 'r', encoding='utf-8') as file:
                        sql_script = file.read()
                    
                    cursor.execute(sql_script)
                    conn.commit()
                    print("✅ Tablas y datos inyectados exitosamente desde el archivo SQL.")
                    
                    # Garantiza la existencia de un usuario administrador inicial.
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

            # Repara contraseñas en texto plano. Se ejecuta siempre (exista o no la
            # tabla previamente), porque el seed SQL puede traer passwords sin
            # cifrar (ej. 'admin123'), lo que rompería el login aunque la tabla
            # ya existiera.
            actualizados = ensure_passwords_hashed(cursor)
            conn.commit()
            if actualizados:
                print(f"🔒 {actualizados} contraseña(s) en texto plano fueron hasheadas automáticamente.")

            # Crea la tabla de sesiones, que soporta la validación real de tokens en
            # permisos.py (antes /auth/login generaba un token que nunca se
            # guardaba ni se validaba).
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS sesion (
                    token       VARCHAR(64) PRIMARY KEY,
                    usuario_id  INTEGER NOT NULL REFERENCES usuario(usuario_id) ON DELETE CASCADE,
                    creado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
                    expira_en   TIMESTAMP NOT NULL
                );
                """
            )
            conn.commit()

            # Agrega la columna JSONB de preferencias utilizada por /user/preferences.
            cursor.execute(
                "ALTER TABLE usuario ADD COLUMN IF NOT EXISTS preferencias JSONB DEFAULT '{}'::jsonb;"
            )
            conn.commit()

            # Purga sesiones expiradas. La tabla `sesion` no tenía mecanismo de
            # limpieza y crecía indefinidamente con tokens vencidos que ya nunca
            # se podían usar (permisos.py los rechaza por expira_en < NOW() en
            # cada request). Se ejecuta en cada arranque del servidor, lo que en
            # Render free tier ocurre con frecuencia suficiente para mantener la
            # tabla acotada.
            cursor.execute("DELETE FROM sesion WHERE expira_en < NOW();")
            eliminadas = cursor.rowcount
            conn.commit()
            if eliminadas:
                print(f"🧹 {eliminadas} sesión(es) expirada(s) eliminadas de la tabla sesion.")

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

@app.post("/api/force-reset-db")
def force_reset_db(x_admin_token: str = Header(default="", alias="X-Admin-Token")):
    """
    Fuerza el borrado total de la BD (vía DROP SCHEMA dentro del propio SQL),
    reinyecta el archivo 01_tablas.sql (OTs, sesiones, máquinas de prueba) y
    encripta cualquier contraseña en texto plano para que el Login funcione.

    Protegido por token: requiere el header X-Admin-Token con el valor
    configurado en la variable de entorno ADMIN_RESET_TOKEN de Render.

    Raises:
        HTTPException(403):
            Token ausente o incorrecto.
        HTTPException(404):
            No se encontró el archivo 01_tablas.sql.
        HTTPException(500):
            Falla al ejecutar el script o al hashear contraseñas.
    """
    expected_token = (os.getenv("ADMIN_RESET_TOKEN") or "").strip()
    received_token = (x_admin_token or "").strip()
    if not expected_token or received_token != expected_token:
        raise HTTPException(status_code=403, detail="Token de administrador inválido o no configurado.")

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
#
# Expone rutas de verificación de estado para la base de datos, el
# caché y el motor de inteligencia artificial.
#


@app.get("/")
async def root():
    """Endpoint raíz para confirmar que el servicio está en línea."""
    return {"service": "BARB API", "status": "online"}


@app.get("/health")
@app.get("/api/health")
async def health():
    """
    Verifica conectividad con PostgreSQL mediante una sentencia trivial.

    Returns:
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

    Returns:
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

    Returns:
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
#
# Gestiona el ciclo de sesión y el mantenimiento del directorio de
# usuarios de la plataforma.
#


@app.post("/auth/login")
@app.post("/api/auth/login")
async def login(payload: LoginRequest):
    """
    Autentica un usuario verificando sus credenciales cifradas y su estado activo.

    Args:
        payload:
            Estructura con email y contraseña.

    Returns:
        Token de sesión e información pública del perfil del usuario.

    Raises:
        HTTPException(400):
            Credenciales incompletas.
        HTTPException(401):
            Credenciales incorrectas o perfil desactivado.
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

    token = secrets.token_hex(32)
    _execute_write(
        "INSERT INTO sesion (token, usuario_id, expira_en) VALUES (:token, :uid, NOW() + INTERVAL '24 hours')",
        {"token": token, "uid": int(user["usuario_id"])},
    )

    return {
        "token": token,
        "user": {
            "id": int(user["usuario_id"]),
            "name": str(user["nombre"]),
            "role": str(user["rol"]).lower(),
        },
    }


@app.post("/auth/logout")
@app.post("/api/auth/logout")
async def logout(authorization: str = Header(default="", alias="Authorization")):
    """
    Invalida la sesión asociada al token recibido en el encabezado Authorization.

    Args:
        authorization:
            Encabezado con el token en formato 'Bearer {token}'.

    Returns:
        Confirmación del cierre de sesión.
    """
    token = authorization.replace("Bearer ", "").strip()
    if token:
        _execute_write("DELETE FROM sesion WHERE token = :token", {"token": token})
    return {"status": "success"}


@app.get("/api/usuarios", dependencies=[Depends(require_action("ver_usuarios"))])
async def list_users():
    """
    Retorna el directorio completo del personal técnico de la plataforma.

    Returns:
        Colección de usuarios serializados.

    Raises:
        HTTPException(500):
            Error de conectividad con PostgreSQL.
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


@app.post("/api/usuarios", status_code=201, dependencies=[Depends(require_action("gestionar_usuarios"))])
async def create_user(payload: UserCreateRequest):
    """
    Registra un nuevo usuario con contraseña cifrada mediante bcrypt.

    Args:
        payload:
            Datos del nuevo usuario.

    Returns:
        Representación sanitizada del usuario creado.

    Raises:
        HTTPException(500):
            Error relacional o transaccional.
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


@app.put("/api/usuarios/{usuario_id}", dependencies=[Depends(require_action("gestionar_usuarios"))])
async def update_user(usuario_id: int, payload: UserUpdateRequest):
    """
    Aplica una actualización diferencial sobre los metadatos y credenciales del usuario.

    Args:
        usuario_id:
            Clave primaria del usuario.
        payload:
            Campos a modificar (todos opcionales).

    Returns:
        Registro actualizado bajo serialización autorizada.

    Raises:
        HTTPException(404):
            Usuario inexistente.
        HTTPException(500):
            Error transaccional en base de datos.
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


@app.delete("/api/usuarios/{usuario_id}", status_code=204, dependencies=[Depends(require_action("gestionar_usuarios"))])
async def delete_user(usuario_id: int):
    """
    Elimina permanentemente un registro de usuario (hard delete).

    Args:
        usuario_id:
            Clave interna del usuario a eliminar.

    Raises:
        HTTPException(404):
            Usuario no encontrado.
        HTTPException(500):
            Violación de integridad referencial u error SQL.
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
#
# Calcula los indicadores de desempeño y ahorro mostrados en el
# dashboard financiero.
#


@app.get("/api/stats/financial-impact", dependencies=[Depends(require_route("dashboard", solo_lectura=True))])
def get_financial_impact(days: int | None = Query(default=None, ge=1)):
    """
    Calcula KPIs de desempeño y tendencias para el dashboard financiero.

    Anteriormente esta función tenía @lru_cache(maxsize=1), lo que la dejaba
    congelada con el primer resultado calculado en la vida del proceso: nunca
    reflejaba OTs nuevas. Se quitó el cache para que siempre refleje datos reales.
    También ignoraba antes el filtro de rango de fechas que el frontend sí envía
    (?days=7/30/90); ahora se aplica al SQL.

    Args:
        days:
            Ventana de días hacia atrás a considerar (None = histórico completo).

    Returns:
        Objeto con la forma exacta que espera useFinancialStats.ts:
        financials (KPIs agregados), trend14Days (serie de 14 días) y
        machines (ranking de máquinas por volumen y ahorro).
    """
    date_filter = "AND ot.fecha_creacion >= NOW() - (:days || ' days')::interval" if days else ""
    params = {"days": days} if days else {}

    financials_query = text(
        f"""
        SELECT
            COALESCE(AVG(ot.tiempo_reparacion_min) FILTER (WHERE ot.estado = 'completed'), 0) AS mttr,
            COALESCE(SUM(ot.costo_real), 0) AS costo_total_acumulado,
            COALESCE(SUM(ot.downtime_minutes) FILTER (WHERE ot.estado = 'completed'), 0) AS downtime_evitado_min,
            COUNT(*) FILTER (WHERE ot.estado = 'completed') AS total_completadas,
            COUNT(*) FILTER (
                WHERE ot.estado = 'completed' AND ot.tiempo_reparacion_min <= {SLA_TARGET_MINUTES}
            ) AS completadas_en_sla,
            COUNT(*) AS total_ots
        FROM orden_trabajo ot
        WHERE 1=1 {date_filter}
        """
    )

    # Ventana de 14 días para el gráfico de tendencia (siempre 14 días fijos,
    # independiente del filtro de rango general, como espera el componente).
    trend_query = text(
        """
        SELECT
            d::date AS date,
            COUNT(*) FILTER (WHERE ot.fecha_creacion::date = d::date) AS abiertas,
            COUNT(*) FILTER (WHERE ot.fecha_cierre::date = d::date) AS cerradas
        FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') d
        LEFT JOIN orden_trabajo ot
            ON ot.fecha_creacion::date = d::date OR ot.fecha_cierre::date = d::date
        GROUP BY d
        ORDER BY d
        """
    )

    machines_query = text(
        f"""
        SELECT
            m.maquina_id AS id,
            m.nombre AS name,
            COUNT(ot.ot_id) AS total,
            COALESCE(SUM(ot.downtime_minutes) FILTER (WHERE ot.estado = 'completed'), 0) AS downtime_evitado_min,
            COALESCE(AVG(ot.tiempo_reparacion_min) FILTER (WHERE ot.estado = 'completed'), 0) AS mttr,
            COALESCE(
                100.0 * COUNT(*) FILTER (WHERE ot.estado = 'completed' AND ot.tiempo_reparacion_min <= {SLA_TARGET_MINUTES})
                / NULLIF(COUNT(*) FILTER (WHERE ot.estado = 'completed'), 0),
                0
            ) AS sla_compliance
        FROM maquina m
        LEFT JOIN orden_trabajo ot ON ot.maquina_id = m.maquina_id {date_filter}
        GROUP BY m.maquina_id, m.nombre
        ORDER BY total DESC
        LIMIT 5
        """
    )

    try:
        with engine.connect() as conn:
            f = conn.execute(financials_query, params).mappings().one()
            trend_rows = conn.execute(trend_query).mappings().all()
            machine_rows = conn.execute(machines_query, params).mappings().all()

        mttr = float(f["mttr"])
        costo_total = float(f["costo_total_acumulado"])
        downtime_evitado = float(f["downtime_evitado_min"])
        total_completadas = int(f["total_completadas"])
        completadas_en_sla = int(f["completadas_en_sla"])
        total_ots = int(f["total_ots"])

        # Ahorro estimado: minutos de downtime resueltos por BARB * costo por minuto de inactividad.
        ahorro_generado = downtime_evitado * DOWNTIME_COST_PER_MINUTE
        # 'efficiency' antes representaba el % de OTs completadas sobre el total
        # (tasa de cierre), lo cual no coincidía con el subtítulo de la UI
        # ("Optimización hacia SLA") ni con slaCompliance por máquina (que sí mide
        # SLA). Ahora usa la misma definición: % de OTs completadas dentro del SLA.
        efficiency = round(100.0 * completadas_en_sla / total_completadas, 1) if total_completadas > 0 else 0.0
        # MTBF simplificado: horas transcurridas en la ventana / fallas registradas (mínimo 2 para ser significativo).
        mtbf_hours = None
        if total_completadas >= 2:
            window_hours = (days * 24) if days else 24 * 365
            mtbf_hours = round(window_hours / total_completadas, 1)

        return {
            "financials": {
                "ahorro_generado": round(ahorro_generado, 2),
                "mttr": round(mttr, 1),
                "efficiency": efficiency,
                "costo_total_acumulado": round(costo_total, 2),
                "mtbfHours": mtbf_hours,
            },
            "trend14Days": [
                {
                    "date": row["date"].isoformat(),
                    "abiertas": int(row["abiertas"]),
                    "cerradas": int(row["cerradas"]),
                }
                for row in trend_rows
            ],
            "machines": [
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "total": int(row["total"]),
                    "ahorroGenerado": round(float(row["downtime_evitado_min"]) * DOWNTIME_COST_PER_MINUTE, 2),
                    "mttr": round(float(row["mttr"]), 1),
                    "slaCompliance": round(float(row["sla_compliance"]), 1),
                }
                for row in machine_rows
            ],
        }
    except Exception as e:
        print(f"Error calculando stats financieras: {e}")
        return {
            "financials": {
                "ahorro_generado": 0.0,
                "mttr": 0.0,
                "efficiency": 0.0,
                "costo_total_acumulado": 0.0,
                "mtbfHours": None,
            },
            "trend14Days": [],
            "machines": [],
        }


# =============================================================================
# ENDPOINTS — ÓRDENES DE TRABAJO
# =============================================================================
#
# Expone el ciclo de vida completo de las Órdenes de Trabajo: consulta,
# creación, cambio de estado y eliminación.
#


@app.get("/api/work-orders", dependencies=[Depends(require_auth)])
@app.get("/api/work_orders", dependencies=[Depends(require_auth)])
def get_work_orders():
    """
    Retorna el listado completo de OTs enriquecido con relaciones de máquina, planta, disciplina y conteo fotográfico.

    Returns:
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


@app.get("/api/work-orders/{numero_ot}", dependencies=[Depends(require_auth)])
@app.get("/api/work_orders/{numero_ot}", dependencies=[Depends(require_auth)])
def get_work_order(numero_ot: str):
    """
    Recupera una OT individual junto a su evidencia fotográfica asociada.

    Args:
        numero_ot:
            Folio único de dominio de la OT.

    Returns:
        Representación completa de la OT.

    Raises:
        HTTPException(404):
            OT no encontrada.
    """
    row = fetch_work_order_row(numero_ot)
    if not row:
        raise HTTPException(status_code=404, detail="OT no encontrada.")
    photos = fetch_work_order_photos(int(row["ot_id"]))
    return row_to_work_order(row, photos=photos)


@app.put("/api/work-orders/{numero_ot}/status", dependencies=[Depends(require_action("cambiar_estado_ot"))])
@app.put("/api/work_orders/{numero_ot}/status", dependencies=[Depends(require_action("cambiar_estado_ot"))])
async def update_work_order_status(numero_ot: str, payload: WorkOrderStatusRequest):
    """
    Ejecuta una transición de estado en el ciclo de vida de la OT,
    registrando automáticamente fechas de inicio y cierre según corresponda.

    Args:
        numero_ot:
            Folio de la OT a mutar.
        payload:
            Nuevo estado solicitado.

    Returns:
        OT actualizada con su estado definitivo.

    Raises:
        HTTPException(404):
            OT no encontrada.
        HTTPException(500):
            Error transaccional en PostgreSQL.
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


@app.delete("/api/work-orders/{numero_ot}", status_code=204, dependencies=[Depends(require_action("eliminar_ot"))])
@app.delete("/api/work_orders/{numero_ot}", status_code=204, dependencies=[Depends(require_action("eliminar_ot"))])
async def delete_work_order(numero_ot: str):
    """
    Elimina una OT con su evidencia fotográfica asociada de forma cascada.

    Args:
        numero_ot:
            Folio de dominio de la OT a eliminar.

    Raises:
        HTTPException(404):
            OT no encontrada.
        HTTPException(500):
            Error transaccional en base de datos.
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


@app.post("/api/work-orders", dependencies=[Depends(require_action("crear_ot"))])
@app.post("/api/work_orders", dependencies=[Depends(require_action("crear_ot"))])
async def create_work_order(request: Request):
    """
    Crea una OT desde un payload multipart/form-data o application/json,
    con soporte opcional para carga de fotografías en la misma solicitud.

    El número de OT se genera con formato OT-{AÑO}-{id:04d} post-inserción
    para garantizar secuencialidad basada en la clave primaria.

    Args:
        request:
            Solicitud HTTP con cabecera Content-Type definiendo el modo de lectura.

    Returns:
        OT creada con conteo y arreglo de fotografías adjuntas.

    Raises:
        HTTPException(415):
            Content-Type no soportado.
        HTTPException(500):
            Error en el pipeline transaccional o en operaciones de archivos.
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
    priority = normalize_priority(safe_text(payload.get("priority"), "medium"))
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
#
# Gestiona la carga de documentos utilizados por el motor de
# conocimiento RAG.
#


@app.post("/api/documents/upload", dependencies=[Depends(require_action("subir_documentos"))])
@app.post("/documents/upload", dependencies=[Depends(require_action("subir_documentos"))])
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    discipline: Optional[str] = Form(None),
    machine: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
):
    """
    Acepta y persiste archivos PDF o DOCX, los indexa en la base vectorial
    Chroma ("barb_manuals") para búsqueda de similitud desde /api/chat y
    /api/chat/debug, y guarda su metadata en la tabla `documento`.

    `discipline` y `machine` llegan como los IDs reales de las tablas
    `disciplina`/`maquina` (el frontend — Menu.tsx — los puebla desde
    /api/disciplines y /api/machines, no con texto libre), pero se aceptan
    como opcionales: un manual general no tiene por qué estar atado a un
    equipo o disciplina específicos.

    La indexación es best-effort: si la extracción de texto o Chroma fallan
    (ej. PDF escaneado sin texto, o chromadb no instalado), el archivo igual
    queda guardado en disco y el endpoint responde 200 con chunks_indexed: 0
    e indexing_warning explicando el motivo, en vez de fallar la subida
    completa por un problema del pipeline de RAG.

    Args:
        file:
            Archivo recibido desde el cliente HTTP (PDF o DOCX).
        title:
            Nombre descriptivo del documento.
        discipline:
            disciplina_id (como string) al que pertenece el manual, si aplica.
        machine:
            maquina_id (como string) al que pertenece el manual, si aplica.
        notes:
            Notas internas libres.

    Returns:
        Metadatos de localización del archivo persistido, más chunks_indexed
        e indexing_warning (motivo si chunks_indexed es 0).

    Raises:
        HTTPException(415):
            Si el archivo no es PDF ni DOCX (ni por content_type ni por extensión).
    """
    content_type = (file.content_type or "").strip().lower()
    original_filename = Path(file.filename or "").name
    ext = original_filename.lower().rsplit(".", 1)[-1] if "." in original_filename else ""

    # Algunos clientes (curl, ciertas libs de FormData, proxies) mandan un
    # content_type genérico como application/octet-stream para archivos
    # perfectamente válidos. Se acepta si CUALQUIERA de los dos indicadores
    # (header o extensión) confirma un formato soportado, en vez de rechazar
    # subidas legítimas por depender ciegamente del header.
    pdf_docx_content_types = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    is_supported_content_type = content_type in pdf_docx_content_types
    is_supported_extension = ext in ("pdf", "docx")
    if not (is_supported_content_type or is_supported_extension):
        raise HTTPException(
            status_code=415,
            detail="Solo se permiten archivos PDF o DOCX por ahora (.doc, .txt, .md, .xls/.xlsx e imágenes aún no se indexan).",
        )

    doc_dir = UPLOAD_DIR / "documents"
    doc_dir.mkdir(parents=True, exist_ok=True)

    stored = store_upload_file(file, doc_dir, "doc")

    # Los IDs de disciplina/máquina son opcionales y se validan de forma
    # suave: un valor inválido no debe tumbar la subida, solo se guarda como
    # NULL (documento general, sin filtro de equipo/disciplina).
    discipline_id = None
    if discipline:
        try:
            discipline_id = int(discipline)
        except (TypeError, ValueError):
            discipline_id = None

    machine_id = None
    if machine:
        try:
            machine_id = int(machine)
        except (TypeError, ValueError):
            machine_id = None

    doc_title = (title or "").strip() or stored["original_name"]

    index_result = await asyncio.to_thread(
        index_document_in_chroma,
        stored["stored_path"],
        stored["original_name"],
        stored["file_id"],
        doc_title,
        discipline_id,
        machine_id,
    )

    # Persistencia en Postgres (tabla creada en caliente, mismo patrón que
    # chat_feedback / chat_debug_attachment): permite listar/administrar
    # documentos más adelante, algo que hoy no existe en absoluto — solo se
    # podía subir, nunca ver ni borrar lo ya subido.
    conn = None
    documento_id = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS documento (
                    documento_id  SERIAL PRIMARY KEY,
                    title         VARCHAR(255) NOT NULL,
                    discipline_id INTEGER REFERENCES disciplina(disciplina_id) ON DELETE SET NULL,
                    maquina_id    INTEGER REFERENCES maquina(maquina_id) ON DELETE SET NULL,
                    notes         TEXT,
                    original_name VARCHAR(255) NOT NULL,
                    stored_name   VARCHAR(255) NOT NULL,
                    file_id       VARCHAR(64) NOT NULL,
                    chunks_indexed INTEGER NOT NULL DEFAULT 0,
                    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
                );
                """
            )
            conn.commit()
            cursor.execute(
                """
                INSERT INTO documento
                    (title, discipline_id, maquina_id, notes, original_name, stored_name, file_id, chunks_indexed)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING documento_id
                """,
                (
                    doc_title,
                    discipline_id,
                    machine_id,
                    safe_text(notes, None),
                    stored["original_name"],
                    stored["stored_name"],
                    stored["file_id"],
                    index_result["chunks_indexed"],
                ),
            )
            documento_id = cursor.fetchone()["documento_id"]
            conn.commit()
    except Exception as e:
        # No se aborta la subida por esto: el archivo ya está en disco y
        # (si tuvo éxito) ya se indexó en Chroma. Perder solo el registro
        # administrativo en Postgres es preferible a perder el archivo.
        if conn:
            conn.rollback()
        print(f"Error guardando metadata de documento en Postgres: {e}")
    finally:
        if conn:
            release_db_connection(conn)

    return {
        "id": stored["file_id"],
        "documento_id": documento_id,
        "filename": stored["stored_name"],
        "original_name": stored["original_name"],
        "title": doc_title,
        "discipline_id": discipline_id,
        "machine_id": machine_id,
        "content_type": content_type or f"application/{ext}",
        "path": str(stored["stored_path"]),
        "chunks_indexed": index_result["chunks_indexed"],
        "indexing_warning": index_result["warning"],
    }


# =============================================================================
# ENDPOINTS — CATÁLOGOS (MÁQUINAS, PLANTAS, DISCIPLINAS, TÉCNICOS)
# =============================================================================
#
# Expone los catálogos de referencia consultados por el frontend para
# poblar selectores y filtros.
#


@app.get("/api/machines", dependencies=[Depends(require_auth)])
def get_machines():
    """
    Retorna el catálogo completo de máquinas registradas en el sistema.

    Returns:
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


@app.get("/api/disciplines", dependencies=[Depends(require_auth)])
@lru_cache(maxsize=1)
def get_disciplines():
    """
    Retorna las disciplinas de mantenimiento disponibles (mecánica, eléctrica, etc.).

    Returns:
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


@app.get("/api/plants", dependencies=[Depends(require_auth)])
@app.get("/api/plantas", dependencies=[Depends(require_auth)])
def get_plants():
    """
    Retorna el registro geográfico de clústeres operativos habilitados.

    Returns:
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


@app.get("/api/technicians", dependencies=[Depends(require_auth)])
@lru_cache(maxsize=1)
def get_technicians():
    """
    Retorna los técnicos activos disponibles para asignación de órdenes de trabajo.

    Returns:
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
#
# Integra el motor conversacional DeepSeek para el asistente BARB y su
# variante de diagnóstico.
#

# Cantidad máxima de OTs históricas a inyectar como contexto RAG en el
# prompt del sistema. Se limita para no saturar el contexto del LLM.
DEBUG_HISTORY_LIMIT = 5


def fetch_recent_machine_failures(maquina_id: int, limit: int = DEBUG_HISTORY_LIMIT) -> list[dict]:
    """
    Recupera las fallas más recientes registradas para una máquina, para usarlas
    como contexto RAG (Retrieval-Augmented Generation) en el chat de diagnóstico.

    Args:
        maquina_id:
            Identificador primario de la máquina (maquina.maquina_id).
        limit:
            Máximo de OTs históricas a incluir.

    Returns:
        Lista de OTs recientes ordenadas de la más reciente a la más antigua.
        Lista vacía si el equipo no tiene historial o la consulta falla.
    """
    try:
        return _query_all(
            """
            SELECT
                ot.numero_ot,
                ot.descripcion_problema,
                ot.descripcion_reparacion,
                ot.resolution,
                ot.estado,
                ot.severity,
                ot.fecha_creacion,
                ot.fecha_cierre
            FROM orden_trabajo ot
            WHERE ot.maquina_id = %(maquina_id)s
            ORDER BY ot.fecha_creacion DESC
            LIMIT %(limit)s
            """,
            {"maquina_id": maquina_id, "limit": limit},
        )
    except Exception as e:
        print(f"Error consultando historial de fallas para máquina {maquina_id}: {e}")
        return []


def format_failure_history_for_prompt(rows: list[dict]) -> str:
    """
    Convierte el historial de OTs recuperado de la base de datos en texto plano
    legible, listo para inyectarse en el system_content del LLM.

    Args:
        rows:
            Registros de orden_trabajo devueltos por fetch_recent_machine_failures.

    Returns:
        Texto con una línea por OT, de la más reciente a la más antigua.
    """
    lines = []
    for row in rows:
        fecha = row["fecha_creacion"].strftime("%Y-%m-%d") if row.get("fecha_creacion") else "fecha N/A"
        problema = row.get("descripcion_problema") or "sin descripción registrada"
        resolucion = row.get("resolution") or row.get("descripcion_reparacion") or "sin resolución registrada"
        estado = row.get("estado") or "desconocido"
        lines.append(
            f"- [{fecha}] OT {row['numero_ot']}: {problema}. Estado: {estado}. Resolución: {resolucion}."
        )
    return "\n".join(lines)


@app.post("/api/chat", dependencies=[Depends(require_route("docchat"))])
@app.post("/chat", dependencies=[Depends(require_route("docchat"))])
async def chat(payload: ChatRequest):
    """
    Delega una consulta al motor DeepSeek con historial de conversación y caché por hash de mensaje.

    La clave de caché incluye idioma y mensaje para evitar colisiones entre usuarios con distintos idiomas.
    El historial se inyecta al contexto del LLM para mantener coherencia conversacional.

    Args:
        payload:
            Prompt del usuario con idioma, historial y contexto de máquina opcional.

    Returns:
        Respuesta del LLM con fuentes de referencia.

    Raises:
        HTTPException(500):
            API Key de IA no configurada.
        HTTPException(502):
            Error de comunicación con DeepSeek.
    """
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="API Key de IA no configurada en el servidor.")

    # corpus_version entra en la cache_key para que subir un manual nuevo
    # invalide automáticamente las respuestas cacheadas que no lo conocían,
    # sin tener que purgar el caché a mano.
    corpus_version = await asyncio.to_thread(get_manuals_corpus_version)
    cache_key = hashlib.sha256(
        f"chat:{payload.language}:{corpus_version}:{payload.message.strip()}".encode("utf-8")
    ).hexdigest()

    cached = cache_get(cache_key)
    if cached:
        return cached

    system_content = _BARB_SYSTEM_PROMPT
    if payload.language and payload.language != "es":
        system_content += f" Idioma de respuesta: {payload.language}."
    if payload.machine:
        system_content += f" Máquina en contexto: {payload.machine}."

    # payload.machine puede llegar como maquina_id real (numérico) o como un
    # nombre libre, según qué pantalla llame a /api/chat — se intenta usar
    # como filtro solo si es numérico; si no, se busca sin filtrar por
    # máquina (query_manual_chunks igual hace fallback si el filtro no
    # encuentra nada).
    machine_filter = None
    if payload.machine:
        try:
            machine_filter = int(payload.machine)
        except (TypeError, ValueError):
            machine_filter = None

    # Búsqueda de similitud en "barb_manuals": este es el chat de documentos
    # (docchat), el consumidor principal esperado del vectorial — antes no
    # llamaba a Chroma en absoluto y devolvía "sources" hardcodeado como si
    # sí lo hiciera.
    manual_chunks = await asyncio.to_thread(query_manual_chunks, payload.message, 4, machine_filter)
    if manual_chunks:
        manual_text = "\n".join(
            f"- (Fuente: {c['source']}, pág. {c['page']}): {c['text'][:600]}"
            for c in manual_chunks
        )
        system_content += (
            " Fragmentos relevantes de manuales técnicos indexados (RAG):\n"
            f"{manual_text}\n"
            " Responde basándote en estos fragmentos cuando sean pertinentes,"
            " y cita la fuente (nombre de archivo y página) si los usas."
        )

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

        # Antes esto era un string fijo ("Base de Conocimiento BARB") sin
        # relación con lo que de verdad se usó. Ahora refleja los manuales
        # realmente recuperados por Chroma, o un fallback genérico si la
        # colección está vacía / no hubo resultados relevantes.
        if manual_chunks:
            sources = sorted({c["source"] for c in manual_chunks})
        else:
            sources = ["Base de Conocimiento BARB (sin manuales indexados relevantes)"]

        result = {
            "reply": reply,
            "sources": sources,
            "language": payload.language,
        }

        # Solo cachea si no hay historial: respuestas contextuales no son reutilizables.
        if not payload.history:
            cache_set(cache_key, result, ttl_seconds=300)

        return result

    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error de comunicación con el motor de IA: {type(e).__name__}")


_chroma_client = None
_chroma_collection = None


def get_manuals_collection():
    """
    Devuelve (inicializando de forma perezosa si hace falta) la colección
    Chroma persistente "barb_manuals" usada como base vectorial de manuales
    técnicos.

    Returns:
        La colección de Chroma, o None si chromadb no está instalado o la
        inicialización falla — el resto del sistema debe seguir funcionando
        sin RAG de manuales en ese caso, no romperse.
    """
    global _chroma_client, _chroma_collection
    if not _CHROMA_AVAILABLE:
        return None
    if _chroma_collection is not None:
        return _chroma_collection
    try:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
        _chroma_collection = _chroma_client.get_or_create_collection(name=CHROMA_COLLECTION_NAME)
        return _chroma_collection
    except Exception as e:
        print(f"⚠️ No se pudo inicializar Chroma en {CHROMA_DB_PATH}: {e}")
        return None


def get_manuals_corpus_version() -> int:
    """
    Devuelve el tamaño actual de la colección "barb_manuals" (cantidad de
    fragmentos indexados). Se usa para invalidar el caché de /api/chat: si
    alguien sube un manual nuevo entre dos preguntas iguales, el conteo
    cambia, la cache_key cambia, y la respuesta cacheada vieja (que no
    conocía ese manual) deja de reutilizarse — sin necesidad de purgar nada
    activamente, solo expira sola por TTL.

    Returns:
        Cantidad de fragmentos en la colección, o 0 si Chroma no está
        disponible (en cuyo caso el caché simplemente se comporta como antes,
        sin distinguir versiones del corpus).
    """
    collection = get_manuals_collection()
    if collection is None:
        return 0
    try:
        return collection.count()
    except Exception:
        return 0


def extract_pdf_chunks(pdf_path: Path, chunk_size: int = 1000, overlap: int = 150) -> list[dict]:
    """
    Extrae el texto de un PDF y lo parte en fragmentos con solapamiento,
    listos para indexarse como embeddings.

    Args:
        pdf_path:
            Ruta al PDF ya persistido en disco.
        chunk_size:
            Tamaño máximo de cada fragmento, en caracteres.
        overlap:
            Caracteres de solapamiento entre fragmentos consecutivos, para no
            cortar contexto relevante justo en el borde de un chunk.

    Returns:
        Lista de {"text": ..., "page": ...}; vacía si pypdf no está instalado
        o el PDF no tiene texto extraíble (ej. escaneado sin OCR).
    """
    if not _PYPDF_AVAILABLE:
        return []
    try:
        reader = PdfReader(str(pdf_path))
    except Exception as e:
        print(f"Error leyendo PDF {pdf_path.name}: {e}")
        return []

    chunks: list[dict] = []
    for page_num, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            continue
        start = 0
        while start < len(text):
            piece = text[start:start + chunk_size].strip()
            if piece:
                chunks.append({"text": piece, "page": page_num})
            start += max(chunk_size - overlap, 1)
    return chunks


def extract_docx_chunks(docx_path: Path, chunk_size: int = 1000, overlap: int = 150) -> list[dict]:
    """
    Extrae el texto de un DOCX y lo parte en fragmentos con solapamiento.
    A diferencia de un PDF, un .docx no tiene páginas reales (el paginado es
    de renderizado, no del archivo), así que "page" queda como None — el
    fragmento se referencia solo por su posición en el texto extraído.

    Args:
        docx_path:
            Ruta al DOCX ya persistido en disco.
        chunk_size:
            Tamaño máximo de cada fragmento, en caracteres.
        overlap:
            Caracteres de solapamiento entre fragmentos consecutivos.

    Returns:
        Lista de {"text": ..., "page": None}; vacía si docx2txt no está
        instalado o el documento no tiene texto extraíble.
    """
    if not _DOCX2TXT_AVAILABLE:
        return []
    try:
        text = (docx2txt.process(str(docx_path)) or "").strip()
    except Exception as e:
        print(f"Error leyendo DOCX {docx_path.name}: {e}")
        return []

    if not text:
        return []

    chunks: list[dict] = []
    start = 0
    while start < len(text):
        piece = text[start:start + chunk_size].strip()
        if piece:
            chunks.append({"text": piece, "page": None})
        start += max(chunk_size - overlap, 1)
    return chunks


def extract_document_chunks(doc_path: Path, original_name: str) -> list[dict]:
    """
    Despacha la extracción de texto según la extensión del archivo original.

    Args:
        doc_path:
            Ruta al archivo persistido en disco.
        original_name:
            Nombre original (se usa para inferir el tipo por extensión, ya
            que stored_name en disco no necesariamente la conserva).

    Returns:
        Lista de fragmentos de texto, o [] si la extensión no es soportada
        para indexación (aunque el archivo igual haya sido guardado).
    """
    ext = original_name.lower().rsplit(".", 1)[-1] if "." in original_name else ""
    if ext == "pdf":
        return extract_pdf_chunks(doc_path)
    if ext == "docx":
        return extract_docx_chunks(doc_path)
    return []


def index_document_in_chroma(
    doc_path: Path,
    original_name: str,
    document_id: str,
    title: Optional[str] = None,
    discipline_id: Optional[int] = None,
    machine_id: Optional[int] = None,
) -> dict:
    """
    Extrae el texto de un manual (PDF o DOCX) y agrega sus fragmentos a la
    colección "barb_manuals" de Chroma, con metadata de título/disciplina/
    máquina para poder filtrar búsquedas por equipo más adelante.

    Es best-effort: si falla, el documento sigue guardado en disco de todas
    formas — upload_document() no depende de que esto tenga éxito para
    responder 200.

    Args:
        doc_path:
            Ruta al archivo en disco (stored_path de store_upload_file).
        original_name:
            Nombre original del archivo, usado como referencia de fuente y
            para elegir el extractor correcto por extensión.
        document_id:
            file_id generado por store_upload_file, para namespacear los IDs
            de cada fragmento y evitar colisiones entre documentos.
        title:
            Título ingresado por quien sube el documento (metadata).
        discipline_id:
            disciplina_id real (tabla disciplina), si el documento aplica a
            una disciplina específica; None para manuales generales.
        machine_id:
            maquina_id real (tabla maquina), si el documento aplica a un
            equipo específico; None para manuales generales.

    Returns:
        {"chunks_indexed": int, "warning": str | None}. `warning` explica por
        qué chunks_indexed quedó en 0 (chromadb no instalado, sin texto
        extraíble, extensión no soportada, etc.) en vez de devolver un 0
        silencioso que no le dice nada al operador que subió el manual.
    """
    if not _CHROMA_AVAILABLE:
        return {
            "chunks_indexed": 0,
            "warning": "chromadb no está instalado en el servidor; el archivo se guardó pero no se indexó.",
        }

    collection = get_manuals_collection()
    if collection is None:
        return {
            "chunks_indexed": 0,
            "warning": "No se pudo conectar con la base vectorial Chroma; el archivo se guardó pero no se indexó.",
        }

    ext = original_name.lower().rsplit(".", 1)[-1] if "." in original_name else ""
    if ext == "pdf" and not _PYPDF_AVAILABLE:
        return {
            "chunks_indexed": 0,
            "warning": "pypdf no está instalado en el servidor; no se pudo extraer texto del PDF.",
        }
    if ext == "docx" and not _DOCX2TXT_AVAILABLE:
        return {
            "chunks_indexed": 0,
            "warning": "docx2txt no está instalado en el servidor; no se pudo extraer texto del DOCX.",
        }
    if ext not in ("pdf", "docx"):
        return {
            "chunks_indexed": 0,
            "warning": f"Formato .{ext or '?'} no soportado para indexación (solo PDF y DOCX por ahora).",
        }

    chunks = extract_document_chunks(doc_path, original_name)
    if not chunks:
        return {
            "chunks_indexed": 0,
            "warning": "No se pudo extraer texto del archivo (¿es un PDF escaneado sin OCR, o un documento vacío?); no se indexó.",
        }

    # Metadata de cada fragmento: Chroma no acepta valores None en `where`,
    # así que los campos opcionales se omiten en vez de guardarse como None
    # (guardar {"machine_id": None} rompería un filtro where={"machine_id": X}
    # más adelante en algunas versiones de Chroma).
    base_metadata = {"source": original_name, "document_id": document_id}
    if title:
        base_metadata["title"] = title
    if discipline_id is not None:
        base_metadata["discipline_id"] = discipline_id
    if machine_id is not None:
        base_metadata["machine_id"] = machine_id

    try:
        metadatas = []
        for c in chunks:
            meta = dict(base_metadata)
            if c.get("page") is not None:
                meta["page"] = c["page"]
            metadatas.append(meta)

        collection.add(
            ids=[f"{document_id}-{i}" for i, _ in enumerate(chunks)],
            documents=[c["text"] for c in chunks],
            metadatas=metadatas,
        )
        return {"chunks_indexed": len(chunks), "warning": None}
    except Exception as e:
        print(f"Error indexando {original_name} en Chroma: {e}")
        return {
            "chunks_indexed": 0,
            "warning": f"Se extrajo el texto pero falló el indexado en Chroma ({type(e).__name__}).",
        }


def query_manual_chunks(query_text: str, n_results: int = 4, machine_id: Optional[int] = None) -> list[dict]:
    """
    Busca en "barb_manuals" los fragmentos más similares semánticamente a
    query_text — búsqueda de similitud real (embeddings), no full-text.

    Args:
        query_text:
            Consulta del usuario (payload.message en chat_debug/chat).
        n_results:
            Máximo de fragmentos a devolver.
        machine_id:
            Si viene, intenta acotar la búsqueda a manuales indexados con ese
            maquina_id. Es un filtro "suave": si no hay resultados para ese
            equipo específico (por ejemplo porque el manual todavía no fue
            etiquetado con esa máquina, o es un manual general), cae
            automáticamente a una búsqueda sin filtro en vez de devolver []
            y dejar al usuario sin ninguna referencia.

    Returns:
        Lista de {"text", "source", "page"}; vacía si no hay colección
        disponible, está vacía, o la consulta falla.
    """
    collection = get_manuals_collection()
    if collection is None:
        return []

    def _run_query(where: Optional[dict]):
        count = collection.count()
        if count == 0:
            return []
        kwargs = {"query_texts": [query_text], "n_results": min(n_results, count)}
        if where:
            kwargs["where"] = where
        results = collection.query(**kwargs)
        docs = (results.get("documents") or [[]])[0]
        metas = (results.get("metadatas") or [[]])[0]
        return [
            {"text": doc, "source": meta.get("source", "manual"), "page": meta.get("page")}
            for doc, meta in zip(docs, metas)
        ]

    try:
        if machine_id is not None:
            filtered = _run_query({"machine_id": machine_id})
            if filtered:
                return filtered
            # Sin resultados para esa máquina puntual: fallback a manuales
            # generales en vez de dejar al usuario sin nada.
        return _run_query(None)
    except Exception as e:
        print(f"Error consultando manuales en Chroma: {e}")
        return []


@app.post("/api/chat/debug", dependencies=[Depends(require_route("debug"))])
@app.post("/chat/debug", dependencies=[Depends(require_route("debug"))])
async def chat_debug(payload: ChatDebugRequest):
    """
    Variante de /chat para la pantalla de Debug: fuerza contexto de diagnóstico
    (máquina + datos de sensores) en el prompt del sistema. No usa caché porque
    cada sesión de debug es contextual y no debe reutilizar respuestas de otras.

    A diferencia de /chat, este endpoint no depende de que el cliente envíe el
    historial de fallas: si viene un machineId, consulta directamente la tabla
    orden_trabajo y adjunta las últimas fallas del equipo como contexto RAG,
    para que el LLM pueda razonar sobre patrones repetitivos sin ayuda del
    frontend.

    Args:
        payload:
            sessionId, machineId, message, attachments y sensorData opcionales.

    Returns:
        Respuesta del LLM enfocada en diagnóstico.

    Raises:
        HTTPException(500):
            API Key de IA no configurada.
        HTTPException(502):
            Error de comunicación con DeepSeek.
    """
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="API Key de IA no configurada en el servidor.")

    system_content = (
        _BARB_SYSTEM_PROMPT
        + " Estás en modo DEBUG/diagnóstico: prioriza causas probables, pasos de verificación"
        " y acciones correctivas concretas."
    )

    if payload.machineId:
        system_content += f" Máquina en contexto: {payload.machineId}."

    # Se calcula fuera del bloque anterior porque también lo usa la búsqueda
    # de manuales más abajo, no solo el historial de OTs.
    maquina_id = None
    if payload.machineId:
        try:
            maquina_id = int(payload.machineId)
        except (TypeError, ValueError):
            maquina_id = None

    if maquina_id is not None:
        # Consulta automática de OTs previas del equipo (núcleo RAG del MVP):
        # no depende de que el frontend envíe el historial, se extrae aquí
        # directamente de la base de datos.
        failure_rows = await asyncio.to_thread(
            fetch_recent_machine_failures, maquina_id, DEBUG_HISTORY_LIMIT
        )
        if failure_rows:
            failure_history_text = format_failure_history_for_prompt(failure_rows)
            system_content += (
                " Historial reciente de fallas registradas para este equipo (de la más"
                f" reciente a la más antigua):\n{failure_history_text}\n"
                " Usa este historial para identificar patrones de falla repetitiva,"
                " priorizar el diagnóstico más probable y proponer acciones correctivas"
                " concretas orientadas a evitar que la falla se repita."
            )

    # Búsqueda de similitud en la base vectorial Chroma ("barb_manuals"):
    # agrega pasajes de manuales técnicos relevantes al mensaje del usuario.
    # Si hay maquina_id, intenta acotar la búsqueda a manuales de ese equipo
    # (con fallback automático a manuales generales si no hay coincidencias).
    manual_chunks = await asyncio.to_thread(query_manual_chunks, payload.message, 4, maquina_id)
    if manual_chunks:
        manual_text = "\n".join(
            f"- (Fuente: {c['source']}, pág. {c['page']}): {c['text'][:600]}"
            for c in manual_chunks
        )
        system_content += (
            " Fragmentos relevantes de manuales técnicos indexados (RAG):\n"
            f"{manual_text}\n"
            " Usa estos fragmentos como referencia técnica adicional cuando sean"
            " pertinentes al problema descrito, y cita la fuente (nombre de"
            " archivo y página) si los usas en tu respuesta."
        )

    if payload.sensorData:
        system_content += f" Datos de sensores actuales: {json.dumps(payload.sensorData, default=str)}."
    if payload.attachments:
        system_content += f" El usuario adjuntó {len(payload.attachments)} archivo(s) de referencia."

    messages: list[dict] = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": payload.message},
    ]

    try:
        response = await ia_client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            temperature=0.2,
            max_tokens=1024,
        )
        reply = response.choices[0].message.content
        return {
            "reply": reply,
            "sources": ["Base de Conocimiento BARB"],
            "sessionId": payload.sessionId,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error de comunicación con el motor de IA: {type(e).__name__}")


@app.post("/api/chat/debug/attachments", dependencies=[Depends(require_route("debug"))])
@app.post("/chat/debug/attachments", dependencies=[Depends(require_route("debug"))])
async def upload_chat_debug_attachments(
    files: list[UploadFile] = File(...),
    session_id: Optional[str] = Form(None),
    machine_id: Optional[str] = Form(None),
):
    """
    Persiste imágenes adjuntadas en una consulta de Debug y devuelve sus
    metadatos de referencia, listos para incluirse en el campo `attachments`
    del siguiente POST a /api/chat/debug (ChatDebugRequest.attachments).

    ChatDebugRequest viaja como JSON y no soporta multipart, por lo que la
    subida de archivos se resuelve en un paso previo separado: el frontend
    primero sube las imágenes aquí y luego referencia lo devuelto en la
    llamada de chat.

    A diferencia de la primera versión de este endpoint, los archivos ya no
    son puramente efímeros: el metadato de cada adjunto (no el binario) queda
    trazado en la tabla chat_debug_attachment, atado al session_id de la
    conversación y, si viene, al maquina_id en contexto (FK real a
    maquina.maquina_id, ON DELETE SET NULL si el equipo se elimina después).

    Args:
        files:
            Imágenes (JPEG/PNG/WEBP) enviadas como multipart/form-data.
        session_id:
            Identificador de la sesión de Debug (ChatDebugRequest.sessionId
            generado en el cliente), para correlacionar adjuntos con su chat.
        machine_id:
            Máquina en contexto al momento de subir el adjunto, si hay una
            seleccionada. Se valida como entero; si no es válido o no viene,
            se guarda como NULL en vez de fallar la subida completa (el
            adjunto no depende de tener un equipo válido para persistirse).

    Returns:
        {"attachments": [...]} con un registro de metadatos por archivo.

    Raises:
        HTTPException(415):
            Si algún archivo no es una imagen JPEG/PNG/WEBP.
    """
    if not files:
        return {"attachments": []}

    maquina_id = None
    if machine_id:
        try:
            maquina_id = int(machine_id)
        except (TypeError, ValueError):
            maquina_id = None

    chat_dir = UPLOAD_DIR / "chat-debug"
    chat_dir.mkdir(parents=True, exist_ok=True)

    attachments: list[dict] = []
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Crea la tabla si no existe (mismo patrón lazy que chat_feedback
            # más arriba); en una BD ya establecida esto sería una migración
            # aparte en vez de un CREATE TABLE IF NOT EXISTS en caliente.
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_debug_attachment (
                    attachment_id SERIAL PRIMARY KEY,
                    session_id    VARCHAR(64),
                    maquina_id    INTEGER REFERENCES maquina(maquina_id) ON DELETE SET NULL,
                    original_name VARCHAR(255) NOT NULL,
                    stored_name   VARCHAR(255) NOT NULL,
                    content_type  VARCHAR(50) NOT NULL,
                    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
                );
                """
            )
            conn.commit()

            for file in files:
                content_type = (file.content_type or "").strip().lower()
                if content_type not in {"image/jpeg", "image/png", "image/webp"}:
                    raise HTTPException(status_code=415, detail="Solo se permiten imágenes JPEG, PNG o WEBP.")

                stored = store_upload_file(file, chat_dir, "chatdbg")

                cursor.execute(
                    """
                    INSERT INTO chat_debug_attachment
                        (session_id, maquina_id, original_name, stored_name, content_type)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING attachment_id
                    """,
                    (session_id, maquina_id, stored["original_name"], stored["stored_name"], content_type),
                )
                row = cursor.fetchone()
                conn.commit()

                attachments.append(
                    {
                        "id": row["attachment_id"],
                        "filename": stored["stored_name"],
                        "original_name": stored["original_name"],
                        "content_type": content_type,
                    }
                )
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar metadatos de adjuntos: {str(e)}")
    finally:
        if conn:
            release_db_connection(conn)

    return {"attachments": attachments}


# =============================================================================
# ENDPOINTS — HISTORIAL DE CHAT Y FEEDBACK
# =============================================================================
#
# Persiste las sesiones de conversación y la retroalimentación de los
# usuarios sobre las respuestas del asistente.
#

@app.post("/api/chat-sessions", dependencies=[Depends(require_route("docchat"))])
@app.post("/chat-sessions", dependencies=[Depends(require_route("docchat"))])
async def save_chat_session(payload: ChatSessionRequest, sesion: dict = Depends(get_sesion_actual)):
    """Guarda una sesión completa de chat (memoria RAG) en PostgreSQL.

    FIX: la tabla real (01_tablas.sql) define la columna de título como
    `titulo`, no `title`, y exige `empresa_id` (NOT NULL, FK a EMPRESA).
    El INSERT anterior usaba `title` (columna inexistente) y nunca
    enviaba `empresa_id`, por lo que todo guardado fallaba con 500 y el
    botón "Guardar Sesión" del DocChat siempre terminaba en estado de
    error. `empresa_id` y `usuario_id` ahora se toman de la sesión
    autenticada (get_sesion_actual) en vez de confiar en el payload del
    cliente.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO chat_session (
                    empresa_id, usuario_id, titulo, saved_by, discipline, plant_id, plant_name,
                    machine_id, machine_name, active_manual, messages, metadata
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING session_id;
                """,
                (
                    sesion["empresa_id"], sesion["usuario_id"],
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

@app.post("/api/reports/debug", dependencies=[Depends(require_route("report"))])
@app.post("/reports/debug", dependencies=[Depends(require_route("report"))])
def create_debug_report(payload: dict):
    """
    Guarda un reporte de diagnóstico (tabla REPORTE) generado desde la pantalla
    de Debug. Antes este endpoint no existía: api.ts ya lo llamaba
    (reports.send -> POST /reports/debug) pero el formulario de Report.tsx
    nunca lo invocaba realmente, así que ningún reporte se guardaba jamás.

    maquina_id y tecnico_id son llaves foráneas obligatorias (maquina.maquina_id
    y usuario.usuario_id): se validan como enteros antes de tocar la base de
    datos, y si de todos modos no existen en sus tablas de referencia, la
    violación de FK de Postgres se traduce a un 422 explícito en vez de un
    500 genérico.

    Args:
        payload:
            maquina_id, tecnico_id, issue_description, severity (requeridos), resolution, actions_taken, additional_notes, downtime_minutes (opcionales).

    Returns:
        report_number y reporte_id del registro creado.

    Raises:
        HTTPException(400):
            maquina_id o tecnico_id ausentes o no numéricos.
        HTTPException(422):
            issue_description vacío, o maquina_id/tecnico_id no existen en el esquema.
    """
    maquina_id = safe_int(payload.get("maquina_id"), "maquina_id")
    tecnico_id = safe_int(payload.get("tecnico_id"), "tecnico_id")
    issue_description = safe_text(payload.get("issue_description"), "")
    severity = safe_text(payload.get("severity"), "medium").lower()

    if not issue_description.strip():
        raise HTTPException(status_code=422, detail="issue_description es obligatorio.")
    if severity not in ("low", "medium", "high", "critical"):
        severity = "medium"

    report_number = f"RPT-{datetime.utcnow():%Y%m%d}-{secrets.token_hex(3).upper()}"

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO reporte (
                    report_number, maquina_id, tecnico_id, summary, issue_description,
                    resolution, actions_taken, additional_notes, severity, downtime_minutes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING reporte_id, report_number
                """,
                (
                    report_number,
                    maquina_id,
                    tecnico_id,
                    safe_text(payload.get("summary"), None),
                    issue_description,
                    safe_text(payload.get("resolution"), None),
                    json.dumps(payload.get("actions_taken")) if payload.get("actions_taken") else None,
                    safe_text(payload.get("additional_notes"), None),
                    severity,
                    payload.get("downtime_minutes"),
                ),
            )
            row = cursor.fetchone()
            conn.commit()
        return {"status": "success", "reporte_id": row["reporte_id"], "report_number": row["report_number"]}
    except psycopg2.errors.ForeignKeyViolation:
        if conn:
            conn.rollback()
        raise HTTPException(
            status_code=422,
            detail="maquina_id o tecnico_id no corresponden a registros existentes.",
        )
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar el reporte: {str(e)}")
    finally:
        if conn:
            release_db_connection(conn)


@app.get("/api/chat-sessions", dependencies=[Depends(require_route("history"))])
async def get_chat_sessions():
    """Recupera el historial de todas las sesiones de chat guardadas."""
    try:
        # La columna de fecha en la tabla `chat_session` se llama `saved_at`,
        # no `created_at` (el nombre que usan el INSERT de arriba y el
        # frontend). Antes esto tiraba 500: "column \"created_at\" does not
        # exist", y por eso SessionHistory.tsx nunca cargaba nada. Se
        # alias-ea aquí en vez de migrar la BD o tocar el frontend.
        rows = _query_all(
            "SELECT *, saved_at AS created_at FROM chat_session ORDER BY saved_at DESC LIMIT 50"
        )
        for row in rows:
            if isinstance(row.get("created_at"), datetime):
                row["created_at"] = row["created_at"].isoformat()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener sesiones: {str(e)}")

@app.post("/api/chat-feedback", dependencies=[Depends(require_route("docchat"))])
async def save_chat_feedback(payload: ChatFeedbackRequest):
    """Guarda la calificación (positiva o negativa) de una respuesta de BARB con su contexto."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Crea la tabla si no existe; en un entorno de BD ya establecido esto
            # sería una migración ALTER TABLE en lugar de un CREATE TABLE IF NOT EXISTS.
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
#
# Genera dinámicamente el mapa topológico de plantas, disciplinas y
# máquinas a partir de los datos operativos.
#

@app.put("/api/user/preferences")
@app.put("/user/preferences")
def update_user_preferences(payload: dict, sesion: dict = Depends(get_sesion_actual)):
    """
    Guarda las preferencias (JSON libre: idioma, tema, notificaciones, etc.)
    del usuario autenticado. No requiere permiso de acción específico: cada
    usuario solo puede editar sus propias preferencias (usuario_id viene del
    token de sesión, no del payload, para que nadie edite las de otro).

    Args:
        payload:
            Objeto JSON libre con las preferencias a guardar (se sobre-escribe completo).

    Returns:
        Preferencias guardadas.
    """
    try:
        _execute_write(
            "UPDATE usuario SET preferencias = :prefs WHERE usuario_id = :uid",
            {"prefs": json.dumps(payload), "uid": sesion["usuario_id"]},
        )
        return {"status": "success", "preferencias": payload}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar preferencias: {str(e)}")



@app.get("/api/topologia", dependencies=[Depends(require_route("topology", solo_lectura=True))])
@app.get("/api/topology", dependencies=[Depends(require_route("topology", solo_lectura=True))])
def get_topologia():
    """
    Genera un mapa topológico dinámico leyendo las tablas maquina, planta y disciplina.
    No requiere tablas de coordenadas manuales.
    """
    try:
        # Datos básicos de plantas, disciplinas y máquinas.
        plantas = _query_all("SELECT planta_id, nombre FROM planta")
        disciplinas = _query_all("SELECT disciplina_id, nombre FROM disciplina")
        maquinas = _query_all("SELECT maquina_id, nombre, planta_id, disciplina_id FROM maquina")

        # No existe columna de status en MAQUINA, así que el estado se deriva de
        # las órdenes de trabajo abiertas: si tiene una OT urgente/vencida -> falla;
        # cualquier otra OT abierta -> alerta; sin OTs abiertas -> operativo.
        machine_status_rows = _query_all(
            """
            SELECT
                maquina_id,
                BOOL_OR(estado NOT IN ('completed', 'cancelled') AND (priority = 'urgent' OR estado = 'overdue')) AS tiene_falla,
                BOOL_OR(estado NOT IN ('completed', 'cancelled')) AS tiene_alerta
            FROM orden_trabajo
            GROUP BY maquina_id
            """
        )
        machine_status = {}
        for row in machine_status_rows:
            if row["tiene_falla"]:
                machine_status[row["maquina_id"]] = "falla"
            elif row["tiene_alerta"]:
                machine_status[row["maquina_id"]] = "alerta"
            else:
                machine_status[row["maquina_id"]] = "operativo"
        
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
                "estado_actual": machine_status.get(m["maquina_id"], "operativo")
            })
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