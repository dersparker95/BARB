from __future__ import annotations

import hashlib
import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import bcrypt
import httpx
import psycopg2
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from sqlalchemy import create_engine, text

try:
    from redis import Redis
except ImportError:  # pragma: no cover - import guard for local/dev parity
    Redis = None  # type: ignore[assignment]

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://barb_db_user:I50BKrmPxZXOVyH38Sv2ExCLxJ11IkAD@dpg-d8dkl23bc2fs73enmu90-a.ohio-postgres.render.com/barb_db?sslmode=require",
)
LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://host.docker.internal:1234/v1")
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


def get_db_connection():
    global db_pool
    if db_pool is None:
        db_pool = ThreadedConnectionPool(1, 10, dsn=DATABASE_URL)
    return db_pool.getconn()


def release_db_connection(conn) -> None:
    global db_pool
    if db_pool is not None:
        db_pool.putconn(conn)
    else:
        conn.close()


def _query_all(sql: str, params: Optional[dict] = None):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(sql, params or {})
            return cursor.fetchall()
    finally:
        release_db_connection(conn)


def _query_one(sql: str, params: Optional[dict] = None):
    rows = _query_all(sql, params)
    return rows[0] if rows else None


def get_redis_client() -> Redis | None:
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
    client = get_redis_client()
    if not client:
        return
    try:
        client.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception:
        return


def hash_password(raw_password: str) -> str:
    return bcrypt.hashpw(raw_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw_password: str, stored_password: str) -> bool:
    stored = (stored_password or "").strip()
    if stored.startswith("$2"):
        try:
            return bcrypt.checkpw(raw_password.encode("utf-8"), stored.encode("utf-8"))
        except ValueError:
            return False
    return stored == raw_password


def serialize_user(user: dict) -> dict:
    return {
        "usuario_id": int(user["usuario_id"]),
        "nombre": str(user["nombre"]),
        "email": str(user["email"]),
        "rol": str(user["rol"]).lower(),
        "activo": bool(user["activo"]),
        "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
    }


def normalize_db_status(value: str | None) -> str:
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
    if value in (None, "", "null"):
        raise HTTPException(status_code=400, detail=f"El campo '{field_name}' es obligatorio.")
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"El campo '{field_name}' debe ser numérico.") from exc


def safe_text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


# FIX: Función auxiliar para formatear la fecha como UTC estricto
def iso_z(val):
    if not val:
        return None
    if isinstance(val, str):
        return val if val.endswith('Z') or '+' in val else val + 'Z'
    s = val.isoformat()
    return s if s.endswith('Z') or '+' in s else s + 'Z'


def row_to_work_order(row: dict, photos: list[dict] | None = None) -> dict:
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
        
        # FIX: Se exponen explícitamente los datos para los Dashboards de BI
        "tipo": str(row.get("tipo") or "corrective"),
        "costo_estimado": float(row.get("costo_estimado") or 0),
        "costo_real": float(row.get("costo_real") or 0),
        "downtime_minutes": int(row.get("downtime_minutes")) if row.get("downtime_minutes") is not None else None,
        "reporte_id": row.get("reporte_id"),
        "diagnostico_id": row.get("diagnostico_id"),
    }


def fetch_work_order_row(numero_ot: str) -> dict | None:
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
    db_status = normalize_db_status(value)
    allowed = {"pending", "assigned", "in_progress", "completed", "cancelled", "overdue"}
    if db_status not in allowed:
        raise HTTPException(status_code=400, detail="Estado de OT inválido.")
    return db_status


def store_upload_file(file: UploadFile, destination_dir: Path, prefix: str) -> dict:
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


app = FastAPI(title="BARB Plant Memory API", version="1.5.0")

origins = [
    "http://localhost",
    "http://localhost:5173",
    "https://barb-2ih8.onrender.com",
    "https://barb-git-integracion-final-tvasquezms-projects.vercel.app" 
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    email: str
    password: str


class ChatRequest(BaseModel):
    message: str
    language: str = Field(default="es")


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


@app.get("/")
async def root():
    return {"service": "BARB API", "status": "online"}


@app.get("/health")
@app.get("/api/health")
async def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "online"}
    except Exception as e:
        return {"status": "error_db", "detail": str(e)}


@app.get("/api/health/redis")
async def health_redis():
    client = get_redis_client()
    if not client:
        return {"status": "offline"}
    try:
        return {"status": "online", "ping": client.ping()}
    except Exception as exc:
        return {"status": "offline", "detail": str(exc)}


@app.get("/api/health/llm")
async def health_llm():
    db_status = await health()
    lm_status = {"status": "offline", "detail": "LM Studio no configurado o no disponible."}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{LM_STUDIO_URL}/models", timeout=5.0)
            if resp.status_code == 200:
                lm_status = {"status": "online", "detail": "LM Studio respondió 200 OK."}
            else:
                lm_status = {"status": "error", "detail": f"LM Studio respondió {resp.status_code}."}
    except Exception as e:
        lm_status = {"status": "offline", "detail": str(e)}

    overall = "online" if db_status.get("status") == "online" and lm_status.get("status") == "online" else "degraded"
    return {"status": overall, "db": db_status, "llm": lm_status}


@app.post("/auth/login")
@app.post("/api/auth/login")
async def login(payload: LoginRequest):
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
    return {"status": "success"}


@app.get("/api/usuarios")
async def list_users():
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


@app.get("/api/stats/financial-impact")
def get_financial_impact():
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
    row = fetch_work_order_row(numero_ot)
    if not row:
        raise HTTPException(status_code=404, detail="OT no encontrada.")
    photos = fetch_work_order_photos(int(row["ot_id"]))
    return row_to_work_order(row, photos=photos)


@app.put("/api/work-orders/{numero_ot}/status")
@app.put("/api/work_orders/{numero_ot}/status")
async def update_work_order_status(numero_ot: str, payload: WorkOrderStatusRequest):
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
        # FIX: Removemos el COALESCE problemático
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
    
    # FIX: Generamos un nombre temporal antes de guardar
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
        
        # FIX: Estandarización elegante (Ej: OT-2026-0012)
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


@app.get("/api/machines")
def get_machines():
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


@app.post("/api/chat")
@app.post("/chat")
async def chat(payload: ChatRequest):
    cache_key = hashlib.sha256(
        f"chat:{payload.language}:{payload.message.strip()}".encode("utf-8")
    ).hexdigest()
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{LM_STUDIO_URL}/chat/completions",
                json={
                    "model": "local-model",
                    "messages": [
                        {"role": "system", "content": "Asistente experto en mantenimiento de la planta BARB."},
                        {"role": "user", "content": payload.message},
                    ],
                    "temperature": 0.4,
                },
                timeout=30.0,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="LM Studio devolvió un error.")

            data = response.json()
            reply = data["choices"][0]["message"]["content"]
            result = {"reply": reply, "sources": ["Manual_Local.pdf"], "language": payload.language}
            cache_set(cache_key, result, ttl_seconds=300)
            return result
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="LM Studio local inalcanzable desde el contenedor backend.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=9000, reload=True)