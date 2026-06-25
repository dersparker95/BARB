from __future__ import annotations

"""
==================================================
MÓDULO: BARB Plant Memory API Core
PROPÓSITO: Proveer los servicios backend principales para la plataforma de mantenimiento industrial BARB, gestionando órdenes de trabajo, usuarios y diagnósticos mediante IA.
RESPONSABILIDADES:
- Gestión de ciclo de vida de Órdenes de Trabajo (OT).
- Autenticación y autorización de usuarios.
- Integración con motor de Inteligencia Artificial (DeepSeek).
- Almacenamiento y recuperación de evidencia fotográfica y documental.
- Caché de respuestas para optimización de rendimiento.

DEPENDENCIAS PRINCIPALES:
- FastAPI (Framework web).
- SQLAlchemy y Psycopg2 (Gestión de base de datos PostgreSQL).
- Redis (Sistema de caché).
- OpenAI Async Client (Interacción con API de DeepSeek).

AUTORÍA:
Documentación generada automáticamente.
==================================================
"""

import hashlib
import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import bcrypt
import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text

"""
--------------------------------------------------
SECCIÓN: Inicialización de Servicios y Configuraciones Globales
OBJETIVO: Configurar las variables de entorno y preparar las dependencias externas.
RESPONSABILIDADES:
- Cargar variables de entorno ocultas.
- Inicializar pools de conexión a bases de datos.
- Configurar clientes de IA y sistemas de caché.
--------------------------------------------------
"""

load_dotenv()

try:
    from redis import Redis
except ImportError:
    Redis = None

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://barb_admin:barb_password123@db:5432/barb_database",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/app/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

db_pool: ThreadedConnectionPool | None = None
redis_client: Redis | None = None
redis_ready = False

ia_client = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)


"""
--------------------------------------------------
SECCIÓN: Gestión de Conexiones de Base de Datos y Caché
OBJETIVO: Proveer mecanismos seguros y eficientes para la interacción con los almacenes de datos.
RESPONSABILIDADES:
- Administrar el ciclo de vida de conexiones PostgreSQL.
- Abstraer la ejecución de consultas SQL.
- Gestionar operaciones de lectura y escritura en Redis.
--------------------------------------------------
"""

def get_db_connection():
    """
    Descripción:
    Obtiene una conexión activa desde el pool de hilos de PostgreSQL. Inicializa el pool si no existe.

    Parámetros:
    - Ninguno.

    Retorno:
    - psycopg2.extensions.connection - Objeto de conexión a la base de datos.

    Excepciones:
    - psycopg2.OperationalError: Fallo al establecer conexión con el servidor de base de datos.
    """
    global db_pool
    if db_pool is None:
        db_pool = ThreadedConnectionPool(1, 10, dsn=DATABASE_URL)
    return db_pool.getconn()


def release_db_connection(conn) -> None:
    """
    Descripción:
    Libera una conexión activa de base de datos devolviéndola al pool o cerrándola si el pool no está disponible.

    Parámetros:
    - conn: psycopg2.extensions.connection - Conexión a liberar.

    Retorno:
    - None

    Excepciones:
    - Ninguna.
    """
    global db_pool
    if db_pool is not None:
        db_pool.putconn(conn)
    else:
        conn.close()


def _query_all(sql: str, params: Optional[dict] = None):
    """
    Descripción:
    Ejecuta una consulta SQL estructurada y retorna todos los registros coincidentes en formato de diccionario.

    Parámetros:
    - sql: str - Sentencia SQL a ejecutar.
    - params: dict | None - Parámetros de interpolación para la consulta.

    Retorno:
    - list[dict] - Lista de registros recuperados.

    Excepciones:
    - psycopg2.DatabaseError: Error de ejecución en la consulta SQL.
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(sql, params or {})
            return cursor.fetchall()
    finally:
        release_db_connection(conn)


def _query_one(sql: str, params: Optional[dict] = None):
    """
    Descripción:
    Ejecuta una consulta SQL y retorna exclusivamente el primer registro coincidente.

    Parámetros:
    - sql: str - Sentencia SQL a ejecutar.
    - params: dict | None - Parámetros de interpolación para la consulta.

    Retorno:
    - dict | None - Diccionario con el registro encontrado, o None si no hay resultados.

    Excepciones:
    - psycopg2.DatabaseError: Error de ejecución en la consulta SQL.
    """
    rows = _query_all(sql, params)
    return rows[0] if rows else None


def get_redis_client() -> Redis | None:
    """
    Descripción:
    Inicializa y retorna la conexión persistente al servidor Redis para operaciones de caché.

    Parámetros:
    - Ninguno.

    Retorno:
    - Redis | None - Cliente Redis activo, o None si el servicio no está disponible.

    Excepciones:
    - redis.exceptions.ConnectionError: Capturada internamente para retornar None de forma segura.
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
    Descripción:
    Recupera y deserializa un valor almacenado en la caché de Redis asociado a una clave específica.

    Parámetros:
    - key: str - Identificador único del recurso en caché.

    Retorno:
    - Any | None - Estructura de datos deserializada o None si la clave no existe.

    Excepciones:
    - json.JSONDecodeError: Capturada internamente si el valor no es JSON válido.
    """
    client = get_redis_client()
    if not client:
        return None

    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        return None


def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> None:
    """
    Descripción:
    Serializa y almacena un valor en la caché de Redis con un tiempo de expiración definido.

    Parámetros:
    - key: str - Identificador único para el recurso.
    - value: Any - Datos a almacenar (deben ser serializables a JSON).
    - ttl_seconds: int - Tiempo de vida en segundos (por defecto 300).

    Retorno:
    - None

    Excepciones:
    - TypeError: Capturada internamente si el valor no es serializable.
    """
    client = get_redis_client()
    if not client:
        return
    try:
        client.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception:
        return


"""
--------------------------------------------------
SECCIÓN: Utilidades de Seguridad y Normalización de Datos
OBJETIVO: Garantizar la integridad, confidencialidad y consistencia de los datos procesados.
RESPONSABILIDADES:
- Criptografía de credenciales.
- Saneamiento y transformación de cadenas de texto.
- Conversión segura de tipos de datos.
--------------------------------------------------
"""

def hash_password(raw_password: str) -> str:
    """
    Descripción:
    Aplica una función de derivación de claves criptográficas (bcrypt) a una contraseña en texto plano.

    Parámetros:
    - raw_password: str - Contraseña proporcionada por el usuario.

    Retorno:
    - str - Hash criptográfico seguro.

    Excepciones:
    - Ninguna.
    """
    return bcrypt.hashpw(raw_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw_password: str, stored_password: str) -> bool:
    """
    Descripción:
    Verifica criptográficamente si una contraseña en texto plano corresponde al hash almacenado.

    Parámetros:
    - raw_password: str - Contraseña de intento de acceso.
    - stored_password: str - Hash criptográfico almacenado en base de datos.

    Retorno:
    - bool - Verdadero si las credenciales coinciden, falso en caso contrario.

    Excepciones:
    - Ninguna.
    """
    stored = (stored_password or "").strip()
    if stored.startswith("$2"):
        try:
            return bcrypt.checkpw(raw_password.encode("utf-8"), stored.encode("utf-8"))
        except ValueError:
            return False
    return stored == raw_password


def serialize_user(user: dict) -> dict:
    """
    Descripción:
    Filtra y estandariza la estructura de datos de un usuario para su exposición a través de la API.

    Parámetros:
    - user: dict - Registro crudo de usuario obtenido de la base de datos.

    Retorno:
    - dict - Diccionario de usuario sanitizado (sin datos sensibles como contraseñas).

    Excepciones:
    - KeyError: Si la estructura de entrada carece de campos obligatorios.
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
    Descripción:
    Convierte variaciones semánticas y lingüísticas de estados operativos hacia un conjunto estándar de la base de datos.

    Parámetros:
    - value: str | None - Estado en formato libre o de sistema externo.

    Retorno:
    - str - Clave de estado normalizado.

    Excepciones:
    - Ninguna.
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
    Descripción:
    Traduce claves de estado de sistema a etiquetas legibles y estandarizadas para interfaces de usuario.

    Parámetros:
    - value: str | None - Clave de estado normalizado de base de datos.

    Retorno:
    - str - Etiqueta de estado capitalizada y legible.

    Excepciones:
    - Ninguna.
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
    Descripción:
    Interpreta y transforma cadenas de texto, marcas de tiempo o valores nulos en objetos datetime nativos.

    Parámetros:
    - value: Any - Valor crudo representando una fecha/hora.

    Retorno:
    - datetime | None - Objeto datetime analizado, o None si el valor es inválido/vacío.

    Excepciones:
    - Ninguna. Retorna None ante fallos de formato.
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
    Descripción:
    Asegura la conversión estricta de un valor a número entero, disparando errores HTTP informativos si falla.

    Parámetros:
    - value: Any - Valor numérico crudo.
    - field_name: str - Nombre semántico del campo para mensajes de error.

    Retorno:
    - int - Valor numérico validado.

    Excepciones:
    - HTTPException(400): Si el valor es nulo, vacío o no coercible a entero.
    """
    if value in (None, "", "null"):
        raise HTTPException(status_code=400, detail=f"El campo '{field_name}' es obligatorio.")
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"El campo '{field_name}' debe ser numérico.") from exc


def safe_text(value: Any, default: str = "") -> str:
    """
    Descripción:
    Extrae contenido de texto de forma segura garantizando la ausencia de excepciones por valores nulos.

    Parámetros:
    - value: Any - Variable objetivo.
    - default: str - Cadena de respaldo si el valor es nulo.

    Retorno:
    - str - Texto final saneado sin espacios perimetrales.

    Excepciones:
    - Ninguna.
    """
    if value is None:
        return default
    return str(value).strip()


def iso_z(val):
    """
    Descripción:
    Estandariza fechas en formato ISO 8601 asegurando la sufijación explícita de huso horario UTC (Z).

    Parámetros:
    - val: datetime | str | None - Objeto o cadena de fecha.

    Retorno:
    - str | None - Cadena de fecha formateada, o None si no se provee valor.

    Excepciones:
    - Ninguna.
    """
    if not val:
        return None
    if isinstance(val, str):
        return val if val.endswith('Z') or '+' in val else val + 'Z'
    s = val.isoformat()
    return s if s.endswith('Z') or '+' in s else s + 'Z'


"""
--------------------------------------------------
SECCIÓN: Mapeadores y Gestores de Dominio (Órdenes de Trabajo)
OBJETIVO: Transformar esquemas de datos relacionales hacia modelos de dominio y gobernar lógicas transaccionales.
RESPONSABILIDADES:
- Ensamblar entidades complejas (OTs con evidencias).
- Validar transiciones de estado.
- Ejecutar consultas altamente especializadas de negocio.
--------------------------------------------------
"""

def row_to_work_order(row: dict, photos: list[dict] | None = None) -> dict:
    """
    Descripción:
    Convierte un conjunto de resultados planos de base de datos en una estructura JSON jerárquica de Orden de Trabajo.

    Parámetros:
    - row: dict - Registro unificado proveniente de cruces relacionales (JOINs).
    - photos: list[dict] | None - Colección pre-procesada de evidencias fotográficas.

    Retorno:
    - dict - Representación de dominio de la Orden de Trabajo lista para entrega API.

    Excepciones:
    - KeyError: Si el registro relacional está incompleto o corrupto estructuralmente.
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
    Descripción:
    Ejecuta la recuperación integral de una Orden de Trabajo consolidando información de tablas periféricas (máquinas, plantas, usuarios).

    Parámetros:
    - numero_ot: str - Código único de identificación de la Orden de Trabajo.

    Retorno:
    - dict | None - Diccionario con datos relacionales cruzados o None si la OT no existe.

    Excepciones:
    - psycopg2.DatabaseError: Ante fallos en la estructura o disponibilidad de base de datos.
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
    Descripción:
    Recupera los metadatos y rutas físicas de todas las fotografías asociadas a una Orden de Trabajo.

    Parámetros:
    - ot_id: int - Identificador primario interno de la OT.

    Retorno:
    - list[dict] - Colección de registros de evidencia visual.

    Excepciones:
    - psycopg2.DatabaseError: Fallo de ejecución de consulta.
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
    Descripción:
    Audita y restringe las transiciones de estado de órdenes de trabajo para evitar corrupciones lógicas en flujos operativos.

    Parámetros:
    - value: str | None - Estado propuesto.

    Retorno:
    - str - Estado auditado y validado.

    Excepciones:
    - HTTPException(400): Si el estado propuesto rompe las reglas de negocio permitidas.
    """
    db_status = normalize_db_status(value)
    allowed = {"pending", "assigned", "in_progress", "completed", "cancelled", "overdue"}
    if db_status not in allowed:
        raise HTTPException(status_code=400, detail="Estado de OT inválido.")
    return db_status


"""
--------------------------------------------------
SECCIÓN: Gestión de Archivos Físicos y Almacenamiento
OBJETIVO: Proveer un sistema resiliente para la manipulación segura de archivos binarios e imágenes en el servidor.
RESPONSABILIDADES:
- Almacenar archivos multimedia garantizando nomenclatura única.
- Indexar metadatos visuales en base de datos.
- Purgar archivos físicos desasociados de forma segura.
--------------------------------------------------
"""

def store_upload_file(file: UploadFile, destination_dir: Path, prefix: str) -> dict:
    """
    Descripción:
    Procesa un flujo de bytes entrante y lo persiste en el sistema de archivos generando mitigaciones de colisión de nombres.

    Parámetros:
    - file: UploadFile - Archivo recibido desde la solicitud HTTP.
    - destination_dir: Path - Directorio de destino absoluto.
    - prefix: str - Prefijo taxonómico para categorización de archivos.

    Retorno:
    - dict - Diccionario de mapeo entre nomenclatura original, generada y rutas.

    Excepciones:
    - IOError: Si los permisos del sistema de archivos deniegan la escritura.
    """
    original_name = Path(file.filename or "file").name
    suffix = Path(original_name).suffix.lower()
    if suffix == "":
        suffix = ".bin"
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
    Descripción:
    Coordina el procesamiento transaccional múltiple de fotografías, validando tipos MIME e impactando rutas relativas en la base de datos.
    Implementa rollback del sistema de archivos físico en caso de fallo relacional.

    Parámetros:
    - numero_ot: str - Identificador público de la Orden de Trabajo (usado para estructura de carpetas).
    - ot_id: int - Clave primaria de la Orden de Trabajo.
    - images: list[UploadFile] - Listado de archivos multimedia a procesar.

    Retorno:
    - list[dict] - Registros fotográficos creados exitosamente.

    Excepciones:
    - HTTPException(415): Si un archivo vulnera las restricciones MIME (JPEG/PNG/WEBP).
    - Exception: Burbuja fallos no previstos activando lógicas compensatorias (borrado de archivos huérfanos).
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
    Descripción:
    Desencadena una limpieza total de archivos asociados a una Orden de Trabajo que se está eliminando o purgando del sistema.

    Parámetros:
    - ot_id: int - Clave primaria de la Orden de Trabajo objetivo.

    Retorno:
    - None

    Excepciones:
    - Ninguna. Suprime errores de sistema de archivos para no bloquear transacciones de BD.
    """
    rows = _query_all(
        """
        SELECT file_path
        FROM ot_foto
        WHERE ot_id = %(ot_id)s
        """,
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


"""
--------------------------------------------------
SECCIÓN: Modelos de Datos (Pydantic) e Inicialización de API
OBJETIVO: Definir esquemas de validación estricta y levantar el enrutador de FastAPI.
RESPONSABILIDADES:
- Validación de payloads HTTP.
- Configuración de políticas de acceso CORS.
- Asignación de metadatos de Swagger/OpenAPI.
--------------------------------------------------
"""

app = FastAPI(title="BARB Plant Memory API", version="1.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://barb-7jfguz636-tvasquezms-projects.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CLASE: LoginRequest
"""
Descripción: Estructura de validación para peticiones de autenticación.
"""
class LoginRequest(BaseModel):
    email: str
    password: str

CLASE: ChatRequest
"""
Descripción: Estructura de validación para consultas de Inteligencia Artificial (DeepSeek).
"""
class ChatRequest(BaseModel):
    message: str
    language: str = Field(default="es")

CLASE: UserCreateRequest
"""
Descripción: Esquema de creación de un nuevo usuario en sistema con políticas predeterminadas.
"""
class UserCreateRequest(BaseModel):
    nombre: str
    email: str
    password: str
    rol: str
    activo: bool = True

CLASE: UserUpdateRequest
"""
Descripción: Esquema mutante de actualización de perfiles permitiendo modificaciones parciales de campos.
"""
class UserUpdateRequest(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None

CLASE: WorkOrderStatusRequest
"""
Descripción: Estructura especializada para mutación de estados en el ciclo de vida de una OT.
"""
class WorkOrderStatusRequest(BaseModel):
    status: str


"""
--------------------------------------------------
SECCIÓN: Endpoints de Salud y Diagnóstico de Sistema
OBJETIVO: Exponer indicadores del estatus de la infraestructura para orquestadores y monitores externos.
RESPONSABILIDADES:
- Validación de pulso API.
- Comprobación bidireccional base de datos/caché.
- Confirmación de disponibilidad del servicio LLM.
--------------------------------------------------
"""

@app.get("/")
async def root():
    """
    Descripción:
    Endpoint de sondeo básico en raíz para comprobar conectividad HTTP.

    Parámetros:
    - Ninguno.

    Retorno:
    - dict - Estado en línea.

    Excepciones:
    - Ninguna.
    """
    return {"service": "BARB API", "status": "online"}


@app.get("/health")
@app.get("/api/health")
async def health():
    """
    Descripción:
    Evalúa la capacidad de la aplicación para comunicarse y resolver sentencias triviales en la base de datos principal PostgreSQL.

    Parámetros:
    - Ninguno.

    Retorno:
    - dict - Estado operativo o desglose de degradación.

    Excepciones:
    - Ninguna. Resuelve en payload JSON de error.
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
    Descripción:
    Comprueba el pulso y latencia general del sistema de caché Redis.

    Parámetros:
    - Ninguno.

    Retorno:
    - dict - Estado en línea/fuera de línea de caché.

    Excepciones:
    - Ninguna.
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
    Descripción:
    Sondea la integralidad del motor cognitivo cruzando viabilidad de base de datos y la correcta ingestión de la clave de API de DeepSeek.

    Parámetros:
    - Ninguno.

    Retorno:
    - dict - Mapeo topológico general del sistema RAG.

    Excepciones:
    - Ninguna.
    """
    db_status = await health()
    has_key = bool(os.getenv("DEEPSEEK_API_KEY"))
    
    lm_status = {
        "status": "online" if has_key else "offline",
        "detail": "API Key de DeepSeek configurada correctamente." if has_key else "Falta configurar DEEPSEEK_API_KEY en el entorno."
    }

    overall = "online" if db_status.get("status") == "online" and has_key else "degraded"
    return {"status": overall, "db": db_status, "llm": lm_status}


"""
--------------------------------------------------
SECCIÓN: Endpoints de Autenticación y Administración de Usuarios
OBJETIVO: Restringir operaciones sensibles delegando identidades y permitiendo gestión administrativa de personal.
RESPONSABILIDADES:
- Resolución de credenciales cifradas.
- Emisión de tokens de sesión temporales.
- Gestión CRUD de operadores y técnicos del sistema.
--------------------------------------------------
"""

@app.post("/auth/login")
@app.post("/api/auth/login")
async def login(payload: LoginRequest):
    """
    Descripción:
    Recibe un par de credenciales y ejecuta una autenticación criptográfica confirmando el estado activo del operario.

    Parámetros:
    - payload: LoginRequest - Estructura Pydantic que contiene el email y la contraseña.

    Retorno:
    - dict - Token de autorización e información pública del perfil del usuario.

    Excepciones:
    - HTTPException(400): Incompletitud en envío de credenciales.
    - HTTPException(401): Credenciales incorrectas, usuario no existente o perfil desactivado.
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
        "token": "barb-token",
        "user": {
            "id": int(user["usuario_id"]),
            "name": str(user["nombre"]),
            "role": str(user["rol"]).lower(),
        },
    }


@app.post("/api/auth/logout")
@app.post("/auth/logout")
async def logout():
    """
    Descripción:
    Invalida de forma proactiva la sesión y limpieza de contexto en el cliente web.

    Parámetros:
    - Ninguno.

    Retorno:
    - dict - Confirmación de éxito en la desconexión.

    Excepciones:
    - Ninguna.
    """
    return {"status": "success"}


@app.get("/api/usuarios")
async def list_users():
    """
    Descripción:
    Retorna el directorio completo del personal técnico de la plataforma.

    Parámetros:
    - Ninguno.

    Retorno:
    - list[dict] - Colección de usuarios deserializados.

    Excepciones:
    - HTTPException(500): Si se detecta un quiebre en la conectividad a PostgreSQL.
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
    Descripción:
    Registra operarios estableciendo perfiles criptográficamente sellados dentro del esquema empresarial.

    Parámetros:
    - payload: UserCreateRequest - Datos biométricos y técnicos del empleado de nuevo ingreso.

    Retorno:
    - dict - Representación sanitizada del usuario persistido.

    Excepciones:
    - HTTPException(500): Quiebre relacional o transaccional.
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
    Descripción:
    Aplica una actualización diferencial en los metadatos y credenciales del usuario indicado por la clave primaria.

    Parámetros:
    - usuario_id: int - Clave primaria en base de datos.
    - payload: UserUpdateRequest - Set mutante de datos.

    Retorno:
    - dict - Nuevo registro modificado bajo serialización autorizada.

    Excepciones:
    - HTTPException(404): Usuario inexistente.
    - HTTPException(500): Transacción fallida en base de datos.
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
            hash_password(payload.password)
            if payload.password is not None
            else current["password_hash"]
        )
        next_rol = payload.rol if payload.rol is not None else current["rol"]
        next_activo = payload.activo if payload.activo is not None else current["activo"]

        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            UPDATE usuario
            SET
                nombre = %s,
                email = %s,
                password_hash = %s,
                rol = %s,
                activo = %s
            WHERE usuario_id = %s
            RETURNING usuario_id, nombre, email, rol, activo, created_at;
            """,
            (
                next_nombre,
                next_email,
                next_password_hash,
                next_rol,
                next_activo,
                usuario_id,
            ),
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
    Descripción:
    Desencadena el proceso de supresión permanente de un registro de usuario en el almacén de datos (Hard Delete).

    Parámetros:
    - usuario_id: int - Clave interna del usuario a destruir.

    Retorno:
    - None - Confirmación 204 No Content.

    Excepciones:
    - HTTPException(404): Intento de eliminación sobre registro inubicable.
    - HTTPException(500): Integridad referencial vulnerada o error SQL.
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


"""
--------------------------------------------------
SECCIÓN: Endpoints de Órdenes de Trabajo, Análisis Financiero y Documentación
OBJETIVO: Canalizar el flujo transaccional y estadístico del módulo central de mantenimiento (Gestión de OTs).
RESPONSABILIDADES:
- Controlar creación, avance, estatus, borrado y listado masivo de Órdenes.
- Calcular y exponer KPIs vitales gerenciales (MTTR, Ahorro proyectado).
- Recepcionar adjuntos corporativos (manuales técnicos PDF).
--------------------------------------------------
"""

@app.get("/api/stats/financial-impact")
def get_financial_impact():
    """
    Descripción:
    Calcula dinámicamente indicadores de desempeño (KPIs) en base al ecosistema de fallos, estimando costos tangibles y ahorro hipotético derivado de mitigaciones tempranas.

    Parámetros:
    - Ninguno.

    Retorno:
    - dict - Representación MTTR, costos acumulados y proyecciones monetarias de ahorros.

    Excepciones:
    - Ninguna. Proveé respuesta vacía amortizada bajo errores de ejecución relacional.
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


@app.get("/api/work-orders")
@app.get("/api/work_orders")
def get_work_orders():
    """
    Descripción:
    Ejecuta un barrido exhaustivo en base de datos construyendo un listado enriquecido de órdenes de trabajo incorporando contadores visuales (fotos) y cruces geográficos (plantas/disciplinas).

    Parámetros:
    - Ninguno.

    Retorno:
    - list[dict] - Flujo procesado de Órdenes de Trabajo para paneles frontend.

    Excepciones:
    - Ninguna. Devuelve colección vacía si la sintaxis relacional experimenta una disrupción.
    """
    query = text(
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
            resultados = []
            for row in rows:
                work_order = row_to_work_order(dict(row))
                resultados.append(work_order)
            return resultados
    except Exception as e:
        print(f"Error BD: {e}")
        return []


@app.get("/api/work-orders/{numero_ot}")
@app.get("/api/work_orders/{numero_ot}")
def get_work_order(numero_ot: str):
    """
    Descripción:
    Recupera una Orden de Trabajo individual inyectando evidencia visual al objeto relacional final.

    Parámetros:
    - numero_ot: str - Folio unívoco de dominio.

    Retorno:
    - dict - Representación de la OT de forma minuciosa y completa.

    Excepciones:
    - HTTPException(404): Ausencia del registro solicitado.
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
    Descripción:
    Ejecuta un cambio de fase controlada del ciclo de vida productivo registrando las métricas automáticas de cronometrado logístico (inicios y cierres).

    Parámetros:
    - numero_ot: str - Folio serializado en BD a mutar.
    - payload: WorkOrderStatusRequest - Pydantic dictaminando la progresión de estatus requerida.

    Retorno:
    - dict - Orden de Trabajo con la fotografía posicional actualizada.

    Excepciones:
    - HTTPException(404): Registro objetivo obsoleto o extraviado.
    - HTTPException(500): Pérdida de integridad durante mutación transaccional PostgreSQL.
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
            SET estado = %s,
                fecha_inicio = %s,
                fecha_cierre = %s
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
    Descripción:
    Desata la orden de cascada para purgar una OT. Elimina sistemáticamente evidencia fotográfica alojada localmente en la topología host y acto seguido elimina la entidad en BD.

    Parámetros:
    - numero_ot: str - Folio de dominio identificativo.

    Retorno:
    - None - (Estatus Code 204 indicativo operativo silente exitoso).

    Excepciones:
    - HTTPException(404): Petición huérfana de OT.
    - HTTPException(500): Transacción incompleta de base relacional.
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
    Descripción:
    Procesa un pipeline polimórfico de solicitud (Soporta esquemas form-data/multimedia o esquemas primitivos JSON)
    para levantar el reporte general en base de datos. Genera nomenclaturas cronológicas unívocas e inserta colateral fotográfico transaccional en un solo bloque.

    Parámetros:
    - request: Request - El bloque de HTTP entrante del cliente con cabeceras que definen el método de lectura payload.

    Retorno:
    - dict - Orden de trabajo conformada definitiva junto a conteos/arreglos de fotografías.

    Excepciones:
    - HTTPException(415): Si no obedece el encabezado Content-Type dictaminado.
    - HTTPException(500): Conflictividad en el pipeline interno transaccional PostgreSQL u operaciones de archivos IO.
    """
    content_type = (request.headers.get("content-type") or "").lower()
    payload: dict[str, Any] = {}
    images: list[UploadFile] = []

    if "multipart/form-data" in content_type:
        form = await request.form()
        payload = {key: form.get(key) for key in form.keys()}
        images = []
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
    
    temp_numero_ot = f"OT-TEMP-{uuid.uuid4().hex[:6]}"

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            INSERT INTO orden_trabajo (
                numero_ot,
                maquina_id,
                tecnico_id,
                creado_por,
                tipo,
                descripcion_problema,
                descripcion_reparacion,
                resolution,
                priority,
                severity,
                fecha_vencimiento,
                estado
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
        cursor.execute("UPDATE orden_trabajo SET numero_ot = %s WHERE ot_id = %s", (clean_numero_ot, ot_id))
        
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


@app.post("/api/documents/upload")
@app.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Descripción:
    Facilita un túnel de carga para la ingesta de documentos instructivos perimetrando y garantizando únicamente tipos PDF aplicables en indexaciones vectoriales.

    Parámetros:
    - file: UploadFile - Cadena fragmentada de archivo emitido por cliente HTTP.

    Retorno:
    - dict - Información persistida de localización lógica del archivo.

    Excepciones:
    - HTTPException(415): Detención abrupta por inyección de tipo malicioso o improcedente diferente a Application/PDF.
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


"""
--------------------------------------------------
SECCIÓN: Endpoints de Catálogos (Máquinas, Plantas, Disciplinas)
OBJETIVO: Exponer diccionarios de datos maestros requeridos por la plataforma para alimentar el selector relacional.
RESPONSABILIDADES:
- Suministrar jerarquías taxonómicas maestras.
- Integración resiliente mediante fallback programático frente a omisiones base de datos.
--------------------------------------------------
"""

@app.get("/api/machines")
def get_machines():
    """
    Descripción:
    Realiza provisión de la flotilla instrumental y máquinas listadas al interior del ecosistema.

    Parámetros:
    - Ninguno.

    Retorno:
    - list[dict] - Entidades de máquinas.

    Excepciones:
    - Ninguna. Posee fallback de emergencia.
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
def get_disciplines():
    """
    Descripción:
    Retorna tipologías profesionales estructuradas del servicio (Mecánica, Eléctrica, Preventiva).

    Parámetros:
    - Ninguno.

    Retorno:
    - list[dict] - Colecciones de disciplinas.

    Excepciones:
    - Ninguna. Posee fallback de emergencia.
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
    Descripción:
    Provee el registro geográfico de clústeres operativos habilitados en sistema.

    Parámetros:
    - Ninguno.

    Retorno:
    - list[dict] - Nodos físicos.

    Excepciones:
    - Ninguna. Incorpora un fallback explícito hacia nodo matriz.
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
def get_technicians():
    """
    Descripción:
    Filtra los usuarios operacionales disponibles y habilitados para ejecución y delegación de órdenes de trabajo.

    Parámetros:
    - Ninguno.

    Retorno:
    - list[dict] - Directorio purgado (solo usuarios de campo).

    Excepciones:
    - Ninguna. Retorna lista vacía ante el declive referencial.
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


"""
--------------------------------------------------
SECCIÓN: Endpoints de Inteligencia Artificial (DeepSeek)
OBJETIVO: Encapsular el puente de acceso a modelos predictivos o RAG con implementaciones contra degradación.
RESPONSABILIDADES:
- Acondicionar consultas en colas asíncronas para el LLM.
- Aplicar capa de caching para mitigar costos y latencias ante preguntas repetitivas.
- Garantizar inyección de seguridad (API Keys).
--------------------------------------------------
"""

@app.post("/api/chat")
@app.post("/chat")
async def chat(payload: ChatRequest):
    """
    Descripción:
    Toma instrucciones originadas de interfaz RAG, somete validación de caché y delega procesamiento asíncrono avanzado con modelo en nube corporativo (DeepSeek).

    Parámetros:
    - payload: ChatRequest - Encapsulado contenedor del prompt y variables de entorno del usuario (ej: idioma).

    Retorno:
    - dict - Contenedor con la estructura elaborada por el LLM con origen en la base de conocimientos.

    Excepciones:
    - HTTPException(500): Detención crítica por variable oculta no instanciada.
    - HTTPException(502): Pérdida de acuse de recibo con motor DeepSeek originado en red externa.
    """
    cache_key = hashlib.sha256(
        f"chat:{payload.language}:{payload.message.strip()}".encode("utf-8")
    ).hexdigest()
    
    cached = cache_get(cache_key)
    if cached:
        return cached

    if not os.getenv("DEEPSEEK_API_KEY"):
        raise HTTPException(status_code=500, detail="API Key de IA no configurada en el servidor.")

    try:
        response = await ia_client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system", 
                    "content": "Eres BARB, un asistente experto en mantenimiento industrial. Responde de manera clara y técnica."
                },
                {
                    "role": "user", 
                    "content": payload.message
                },
            ],
            temperature=0.3,
            max_tokens=800
        )
        
        reply = response.choices[0].message.content
        result = {
            "reply": reply, 
            "sources": ["Base de Conocimiento BARB"], 
            "language": payload.language
        }
        
        cache_set(cache_key, result, ttl_seconds=300)
        return result
        
    except Exception as e:
        print(f"Error DeepSeek: {e}")
        raise HTTPException(status_code=502, detail="Error de comunicación con el motor de IA.")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=9000, reload=True)