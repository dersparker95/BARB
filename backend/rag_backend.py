from __future__ import annotations

import os
import httpx
import psycopg2
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor

from sqlalchemy import ForeignKey, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from pathlib import Path
import uuid

# -----------------------------------------------------------------------------
# CONFIGURACIÓN DE CONEXIONES
# -----------------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://barb_admin:barb_password123@db:5432/barb_database",
)
LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://host.docker.internal:1234/v1")


def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def _get_db_counts():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) AS count FROM ORDEN_TRABAJO;")
        total_ots = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) AS count FROM MAQUINA;")
        total_maquinas = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) AS count FROM REPORTE;")
        total_reportes = cursor.fetchone()["count"]

        return {
            "work_orders": total_ots,
            "machines": total_maquinas,
            "documents": total_reportes,
        }
    finally:
        cursor.close()
        conn.close()


# -----------------------------------------------------------------------------
# APP
# -----------------------------------------------------------------------------
app = FastAPI(
    title="BARB Plant Memory API",
    version="1.2.0",
    description="API local conectada directamente a las tablas reales de PostgreSQL.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# (startup intentionally empty: no DB migrations/inserts at app start)
# -----------------------------------------------------------------------------
# SCHEMAS Pydantic
# -----------------------------------------------------------------------------
class WorkOrderCreateRequest(BaseModel):
    title: str
    machine: str  # Enviará el código o identificador de MAQUINA (ej: MAQUINA.codigo)
    priority: str = Field(default="medium")
    description: str = Field(default="")
    status: str = Field(default="pending")


class LoginRequest(BaseModel):
    email: str
    password: str


class ChatRequest(BaseModel):
    message: str
    context_machine: Optional[str] = None
    language: str = Field(default="es")


class ChatResponse(BaseModel):
    reply: str
    sources: List[str]
    language: str


# -----------------------------------------------------------------------------
# ENDPOINTS BASE
# -----------------------------------------------------------------------------
@app.get("/")
async def root():
    return {"service": "BARB API", "status": "online"}


@app.get("/health")
@app.get("/api/health")
async def health():
    try:
        db_counts = _get_db_counts()
        return {"status": "online", **db_counts}
    except Exception as e:
        return {"status": "error_db", "detail": str(e)}


# -----------------------------------------------------------------------------
# Fase 2: Diagnóstico LLM (no requiere ping directo desde frontend)
# -----------------------------------------------------------------------------
@app.get("/api/health/llm")
async def health_llm():
    db_status = None
    try:
        db_status = {"status": "online", **_get_db_counts()}
    except Exception as e:
        db_status = {"status": "error_db", "detail": str(e)}

    lm_status = {"status": "offline", "detail": "LM Studio no respondió o es inalcanzable."}
    try:
        # Endpoint estándar OpenAI compatible (LM Studio)
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{LM_STUDIO_URL}/models",
                timeout=5.0,
            )
            if resp.status_code == 200:
                lm_status = {"status": "online", "detail": "LM Studio respondió 200 OK."}
            else:
                lm_status = {
                    "status": "error",
                    "detail": f"LM Studio respondió {resp.status_code}.",
                }
    except httpx.RequestError as e:
        lm_status = {"status": "offline", "detail": f"RequestError: {str(e)}"}
    except Exception as e:
        lm_status = {"status": "offline", "detail": f"Error: {str(e)}"}

    # Respuesta unificada para el frontend
    overall_status = "online"
    if lm_status.get("status") != "online" or (db_status and db_status.get("status") != "online"):
        overall_status = "degraded"

    return {
        "status": overall_status,
        "llm": lm_status,
        "db": db_status,
    }

# -----------------------------------------------------------------------------
# Endpoints Catálogos (los requeridos por el frontend)
# -----------------------------------------------------------------------------
@app.get("/api/disciplines", response_model=list[DisciplineResponse])
async def get_disciplines() -> list[DisciplineResponse]:
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    session = get_db_session()
    try:
        rows = session.execute(select(Discipline).order_by(Discipline.name.asc())).scalars().all()
        return [DisciplineResponse(id=r.id, name=r.name) for r in rows]
    finally:
        session.close()


@app.get("/api/technicians", response_model=list[TechnicianResponse])
async def get_technicians() -> list[TechnicianResponse]:
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    session = get_db_session()
    try:
        rows = session.execute(select(Technician).order_by(Technician.name.asc())).scalars().all()
        return [TechnicianResponse(id=r.id, name=r.name) for r in rows]
    finally:
        session.close()


@app.get("/api/machines", response_model=list[MachineResponse])
async def get_machines(discipline_id: Optional[int] = None) -> list[MachineResponse]:
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    session = get_db_session()
    try:
        stmt = select(Machine).order_by(Machine.name.asc())
        if discipline_id is not None:
            stmt = stmt.where(Machine.discipline_id == discipline_id)

        rows = session.execute(stmt).scalars().all()
        return [MachineResponse(id=r.id, name=r.name, discipline_id=r.discipline_id) for r in rows]
    finally:
        session.close()

# -----------------------------------------------------------------------------
# Work Orders (Persistencia real en PostgreSQL)
# -----------------------------------------------------------------------------
from sqlalchemy import Integer, DateTime
from typing import Any

UPLOAD_DIR = Path("static/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    # En frontend: payload.machine es el id numérico como string (ej "1")
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id", ondelete="RESTRICT"), nullable=False)

    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.id", ondelete="RESTRICT"), nullable=False)
    technician_id: Mapped[int] = mapped_column(ForeignKey("technicians.id", ondelete="RESTRICT"), nullable=False)

    priority: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)

    description: Mapped[str] = mapped_column(String(2000), nullable=False)

    photo_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


def _work_order_to_summary(order: WorkOrder) -> WorkOrderSummary:
    return WorkOrderSummary(
        id=order.id,
        title=order.title,
        machine=str(order.machine_id),
        priority=order.priority,  # type: ignore[assignment]
        status=order.status,  # type: ignore[assignment]
        age_minutes=minutes_between(order.created_at),
    )


def _work_order_to_detail(order: WorkOrder) -> WorkOrderDetail:
    return WorkOrderDetail(
        id=order.id,
        title=order.title,
        machine=str(order.machine_id),
        priority=order.priority,  # type: ignore[assignment]
        status=order.status,  # type: ignore[assignment]
        age_minutes=minutes_between(order.created_at),
        description=order.description,
        created_at=order.created_at,
        updated_at=order.updated_at,
        closed_at=order.closed_at,
    )


# -----------------------------------------------------------------------------
# AUTENTICACIÓN
# -----------------------------------------------------------------------------
@app.post("/auth/login")
@app.post("/api/auth/login")
async def login(payload: LoginRequest):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT usuario_id, nombre, email, rol
            FROM USUARIO
            WHERE email = %s;
            """,
            (payload.email,),
        )
        user = cursor.fetchone()
        cursor.close()

        if not user:
            raise HTTPException(status_code=401, detail="Usuario no registrado en la base de datos local.")

        # Bypass temporal en memoria:
        # válida si y solo si la contraseña es exactamente "password123"
        if payload.password != "password123":
            raise HTTPException(status_code=401, detail="Contraseña incorrecta")

        return {
            "status": "success",
            "access_token": "session-token-valid",
            "token_type": "bearer",
            "user": {
                "id": user["usuario_id"],
                "name": user["nombre"],
                "role": user["rol"],
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error de conexión DB: {str(e)}")
    finally:
        if conn:
            conn.close()


# -----------------------------------------------------------------------------
# ITERACIÓN 1 (Bloque 1): MAQUINA + USUARIO + Detalle OT (GET/POST)
# -----------------------------------------------------------------------------

# ---- MAQUINA ----
@app.get("/api/maquinas")
async def list_machines():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT maquina_id, nombre, codigo, planta_id
            FROM MAQUINA
            ORDER BY codigo;
            """
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar máquinas: {str(e)}")


@app.get("/api/maquinas/{maquina_id}")
async def get_machine_by_id(maquina_id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT maquina_id, planta_id, nombre, codigo
            FROM MAQUINA
            WHERE maquina_id = %s;
            """,
            (maquina_id,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="MAQUINA no encontrada.")

        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener MAQUINA: {str(e)}")


class MachineCreateRequest(BaseModel):
    planta_id: int
    nombre: str
    codigo: str


@app.post("/api/maquinas", status_code=201)
async def create_machine(payload: MachineCreateRequest):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO MAQUINA (planta_id, nombre, codigo)
            VALUES (%s, %s, %s)
            RETURNING maquina_id, planta_id, nombre, codigo;
            """,
            (payload.planta_id, payload.nombre, payload.codigo),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        return row
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear MAQUINA: {str(e)}")


class MachineUpdateRequest(BaseModel):
    planta_id: Optional[int] = None
    nombre: Optional[str] = None
    codigo: Optional[str] = None


@app.put("/api/maquinas/{maquina_id}")
async def update_machine(maquina_id: int, payload: MachineUpdateRequest):
    conn = None
    try:
        if payload.planta_id is None and payload.nombre is None and payload.codigo is None:
            raise HTTPException(status_code=400, detail="Debe enviar al menos un campo a actualizar.")

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            UPDATE MAQUINA
            SET
                planta_id = COALESCE(%s, planta_id),
                nombre = COALESCE(%s, nombre),
                codigo = COALESCE(%s, codigo)
            WHERE maquina_id = %s
            RETURNING maquina_id, planta_id, nombre, codigo;
            """,
            (payload.planta_id, payload.nombre, payload.codigo, maquina_id),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="MAQUINA no encontrada para actualizar.")
        return row
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar MAQUINA: {str(e)}")


@app.delete("/api/maquinas/{maquina_id}", status_code=204)
async def delete_machine(maquina_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM MAQUINA WHERE maquina_id = %s;", (maquina_id,))
        deleted = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()

        if deleted == 0:
            raise HTTPException(status_code=404, detail="MAQUINA no encontrada para eliminar.")
        return None
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar MAQUINA: {str(e)}")


# ---- USUARIO ----
@app.get("/api/usuarios")
async def list_users():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT usuario_id, nombre, email, rol
            FROM USUARIO
            ORDER BY usuario_id;
            """
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar usuarios: {str(e)}")


@app.get("/api/usuarios/{usuario_id}")
async def get_user_by_id(usuario_id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT usuario_id, nombre, email, rol
            FROM USUARIO
            WHERE usuario_id = %s;
            """,
            (usuario_id,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="USUARIO no encontrado.")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener USUARIO: {str(e)}")


class UserCreateRequest(BaseModel):
    nombre: str
    email: str
    rol: str


@app.post("/api/usuarios", status_code=201)
async def create_user(payload: UserCreateRequest):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO USUARIO (nombre, email, rol)
            VALUES (%s, %s, %s)
            RETURNING usuario_id, nombre, email, rol;
            """,
            (payload.nombre, payload.email, payload.rol),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        return row
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear USUARIO: {str(e)}")


class UserUpdateRequest(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    rol: Optional[str] = None


@app.put("/api/usuarios/{usuario_id}")
async def update_user(usuario_id: int, payload: UserUpdateRequest):
    conn = None
    try:
        if payload.nombre is None and payload.email is None and payload.rol is None:
            raise HTTPException(status_code=400, detail="Debe enviar al menos un campo a actualizar.")

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            UPDATE USUARIO
            SET
                nombre = COALESCE(%s, nombre),
                email = COALESCE(%s, email),
                rol = COALESCE(%s, rol)
            WHERE usuario_id = %s
            RETURNING usuario_id, nombre, email, rol;
            """,
            (payload.nombre, payload.email, payload.rol, usuario_id),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="USUARIO no encontrado para actualizar.")
        return row
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar USUARIO: {str(e)}")


@app.delete("/api/usuarios/{usuario_id}", status_code=204)
async def delete_user(usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM USUARIO WHERE usuario_id = %s;", (usuario_id,))
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
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar USUARIO: {str(e)}")


# ---- DETALLE OT: OT_REPUESTO ----
@app.get("/api/ot-repuestos")
async def list_ot_repuestos(ot_id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                otr.ot_repuesto_id,
                otr.ot_id,
                otr.repuesto_id,
                r.codigo AS repuesto_codigo,
                r.nombre AS repuesto_nombre,
                otr.cantidad,
                otr.costo_unitario,
                otr.notas,
                otr.fecha_uso
            FROM OT_REPUESTO otr
            JOIN REPUESTO r ON otr.repuesto_id = r.repuesto_id
            WHERE otr.ot_id = %s
            ORDER BY otr.fecha_uso DESC;
            """,
            (ot_id,),
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar OT_REPUESTO: {str(e)}")


class OtRepuestoCreateRequest(BaseModel):
    ot_id: int
    repuesto_id: int
    cantidad: float
    costo_unitario: Optional[float] = None
    notas: Optional[str] = None


@app.post("/api/ot-repuestos", status_code=201)
async def create_ot_repuesto(payload: OtRepuestoCreateRequest):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO OT_REPUESTO (ot_id, repuesto_id, cantidad, costo_unitario, notas)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING ot_repuesto_id, ot_id, repuesto_id, cantidad, costo_unitario, notas, fecha_uso;
            """,
            (
                payload.ot_id,
                payload.repuesto_id,
                payload.cantidad,
                payload.costo_unitario,
                payload.notas,
            ),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        return row
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear OT_REPUESTO: {str(e)}")


# ---- DETALLE OT: OT_AUDIT_LOG ----
@app.get("/api/ot-audit-logs")
async def list_ot_audit_logs(ot_id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                l.audit_id,
                l.ot_id,
                l.usuario_id,
                u.nombre AS usuario_nombre,
                l.estado_anterior,
                l.estado_nuevo,
                l.comentario,
                l.timestamp
            FROM OT_AUDIT_LOG l
            JOIN USUARIO u ON l.usuario_id = u.usuario_id
            WHERE l.ot_id = %s
            ORDER BY l.timestamp DESC;
            """,
            (ot_id,),
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar OT_AUDIT_LOG: {str(e)}")


class OtAuditLogCreateRequest(BaseModel):
    ot_id: int
    usuario_id: int
    estado_anterior: Optional[str] = None
    estado_nuevo: str
    comentario: Optional[str] = None


@app.post("/api/ot-audit-logs", status_code=201)
async def create_ot_audit_log(payload: OtAuditLogCreateRequest):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO OT_AUDIT_LOG (ot_id, usuario_id, estado_anterior, estado_nuevo, comentario)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING audit_id, ot_id, usuario_id, estado_anterior, estado_nuevo, comentario, timestamp;
            """,
            (
                payload.ot_id,
                payload.usuario_id,
                payload.estado_anterior,
                payload.estado_nuevo,
                payload.comentario,
            ),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        return row
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear OT_AUDIT_LOG: {str(e)}")


# -----------------------------------------------------------------------------
# PLANTA (Prioridad 1): CRUD completo
# -----------------------------------------------------------------------------
@app.get("/api/plantas")
async def list_plants():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT planta_id, nombre, ubicacion
            FROM PLANTA
            ORDER BY planta_id;
            """
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar PLANTAS: {str(e)}")


@app.get("/api/plantas/{planta_id}")
async def get_plant_by_id(planta_id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT planta_id, nombre, ubicacion
            FROM PLANTA
            WHERE planta_id = %s;
            """,
            (planta_id,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="PLANTA no encontrada.")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener PLANTA: {str(e)}")


class PlantCreateRequest(BaseModel):
    nombre: str
    ubicacion: Optional[str] = None


@app.post("/api/plantas", status_code=201)
async def create_plant(payload: PlantCreateRequest):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO PLANTA (nombre, ubicacion)
            VALUES (%s, %s)
            RETURNING planta_id, nombre, ubicacion;
            """,
            (payload.nombre, payload.ubicacion),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()
        return row
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear PLANTA: {str(e)}")


class PlantUpdateRequest(BaseModel):
    nombre: Optional[str] = None
    ubicacion: Optional[str] = None


@app.put("/api/plantas/{planta_id}")
async def update_plant(planta_id: int, payload: PlantUpdateRequest):
    conn = None
    try:
        nombre = payload.nombre
        ubicacion = payload.ubicacion

        # Validación simple: al menos un campo debe venir
        if nombre is None and ubicacion is None:
            raise HTTPException(status_code=400, detail="Debe enviar al menos un campo a actualizar.")

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE PLANTA
            SET
                nombre = COALESCE(%s, nombre),
                ubicacion = COALESCE(%s, ubicacion)
            WHERE planta_id = %s
            RETURNING planta_id, nombre, ubicacion;
            """,
            (nombre, ubicacion, planta_id),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="PLANTA no encontrada para actualizar.")
        return row
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar PLANTA: {str(e)}")


@app.delete("/api/plantas/{planta_id}", status_code=204)
async def delete_plant(planta_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            DELETE FROM PLANTA
            WHERE planta_id = %s;
            """,
            (planta_id,),
        )
        deleted = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()

        if deleted == 0:
            raise HTTPException(status_code=404, detail="PLANTA no encontrada para eliminar.")
        return None
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar PLANTA: {str(e)}")


# -----------------------------------------------------------------------------
# OT: WORK ORDERS
# -----------------------------------------------------------------------------
@app.get("/work-orders")
@app.get("/api/work-orders")
async def list_work_orders():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = """
            SELECT
                ot.numero_ot AS id,
                ot.descripcion_problema AS title,
                m.nombre AS machine,
                ot.priority AS priority,
                ot.estado AS status,
                0 AS age_minutes
            FROM ORDEN_TRABAJO ot
            JOIN MAQUINA m ON ot.maquina_id = m.maquina_id;
        """
        cursor.execute(query)
        records = cursor.fetchall()
        cursor.close()
        conn.close()
        return records
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar OTs: {str(e)}")


@app.post("/work-orders", status_code=201)
@app.post("/api/work-orders", status_code=201)
async def create_work_order(payload: WorkOrderCreateRequest):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Resolver MAQUINA por codigo o nombre (payload.machine puede venir de cualquiera)
        machine_value = (payload.machine or "").strip()
        if not machine_value:
            raise HTTPException(status_code=400, detail="Campo machine vacío.")

        cursor.execute(
            """
            SELECT maquina_id
            FROM MAQUINA
            WHERE codigo = %s OR nombre = %s;
            """,
            (machine_value, machine_value),
        )
        res_m = cursor.fetchone()

        if not res_m:
            raise HTTPException(
                status_code=400,
                detail=(
                    "MAQUINA no encontrada para el campo machine. "
                    "Se esperaba que fuera MAQUINA.codigo o MAQUINA.nombre. "
                    f"Recibido: '{payload.machine}'."
                ),
            )

        maquina_id = res_m["maquina_id"]

        # Obtener un técnico válido (USUARIO)
        cursor.execute("SELECT usuario_id FROM USUARIO LIMIT 1;")
        res_u = cursor.fetchone()
        tecnico_id = res_u["usuario_id"] if res_u else 1
        if not tecnico_id:
            raise HTTPException(status_code=500, detail="No se encontró técnico válido en USUARIO.")

        # Generar correlativo para numero_ot (único)
        timestamp_str = datetime.now().strftime("%M%S")
        nuevo_numero_ot = f"WO-10{timestamp_str}"

        insert_query = """
            INSERT INTO ORDEN_TRABAJO (
                numero_ot,
                maquina_id,
                tecnico_id,
                creado_por,
                tipo,
                descripcion_problema,
                priority,
                estado
            ) VALUES (%s, %s, %s, %s, 'corrective', %s, %s, %s)
            RETURNING numero_ot, descripcion_problema, estado;
        """

        priority = payload.priority.lower()
        
        # Mapeo forzado para evitar el error del ENUM "open"
        estado_web = payload.status.lower()
        estado = "pending" if estado_web == "open" else estado_web

        cursor.execute(
            insert_query,
            (
                nuevo_numero_ot,
                maquina_id,
                tecnico_id,
                tecnico_id,
                payload.title,
                priority,
                estado,
            ),
        )
        nueva_ot = cursor.fetchone()

        conn.commit()
        cursor.close()
        conn.close()

        return {
            "id": nueva_ot["numero_ot"],
            "title": nueva_ot["descripcion_problema"],
            "machine": payload.machine,
            "priority": priority.capitalize(),
            "status": nueva_ot["estado"],
            "age_minutes": 0,
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al insertar en DB: {str(e)}")


# -----------------------------------------------------------------------------
# ORDEN TRABAJO (Prioridad 1): detalle + PUT + DELETE
# -----------------------------------------------------------------------------

class WorkOrderUpdateRequest(BaseModel):
    machine: Optional[str] = None  # codigo o nombre
    title: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None  # estado_ot

_ALLOWED_PRIORITY_OT = {"low", "medium", "high", "urgent"}
_ALLOWED_ESTADO_OT = {"pending", "assigned", "in_progress", "completed", "cancelled", "overdue"}


@app.get("/api/work-orders/by-numero-ot/{numero_ot}")
@app.get("/work-orders/by-numero-ot/{numero_ot}")
async def get_work_order_id_by_numero_ot(numero_ot: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ot_id, numero_ot
            FROM ORDEN_TRABAJO
            WHERE numero_ot = %s;
            """,
            (numero_ot,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="ORDEN_TRABAJO no encontrada para ese numero_ot.")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener ot_id por numero_ot: {str(e)}")


@app.get("/api/work-orders/{ot_id}")
@app.get("/work-orders/{ot_id}")
async def get_work_order_by_id(ot_id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                ot.ot_id,
                ot.numero_ot AS id,
                ot.descripcion_problema AS title,
                m.nombre AS machine,
                m.codigo AS machine_codigo,
                ot.priority AS priority,
                ot.estado AS status,
                ot.tecnico_id,
                ot.creado_por,
                ot.tipo,
                ot.diagnostico_id,
                ot.reporte_id,
                ot.fecha_creacion,
                ot.fecha_inicio,
                ot.fecha_cierre,
                ot.fecha_vencimiento
            FROM ORDEN_TRABAJO ot
            JOIN MAQUINA m ON ot.maquina_id = m.maquina_id
            WHERE ot.ot_id = %s;
            """,
            (ot_id,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="ORDEN_TRABAJO no encontrada.")

        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener OT: {str(e)}")


@app.put("/api/work-orders/{ot_id}")
@app.put("/work-orders/{ot_id}")
async def update_work_order(ot_id: int, payload: WorkOrderUpdateRequest):
    conn = None
    try:
        if (
            payload.machine is None
            and payload.title is None
            and payload.priority is None
            and payload.status is None
        ):
            raise HTTPException(status_code=400, detail="Debe enviar al menos un campo a actualizar.")

        conn = get_db_connection()
        cursor = conn.cursor()

        # Obtener valores actuales para rellenar COALESCE de forma segura
        cursor.execute("SELECT * FROM ORDEN_TRABAJO WHERE ot_id = %s;", (ot_id,))
        current = cursor.fetchone()
        if not current:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="ORDEN_TRABAJO no encontrada.")

        maquina_id = current["maquina_id"]
        if payload.machine:
            machine_value = payload.machine.strip()
            cursor.execute(
                """
                SELECT maquina_id
                FROM MAQUINA
                WHERE codigo = %s OR nombre = %s;
                """,
                (machine_value, machine_value),
            )
            res_m = cursor.fetchone()
            if not res_m:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "MAQUINA no encontrada para el campo machine. "
                        f"Recibido: '{payload.machine}'."
                    ),
                )
            maquina_id = res_m["maquina_id"]

        title = payload.title if payload.title is not None else current.get("descripcion_problema")
        priority = payload.priority.lower() if payload.priority is not None else current.get("priority")
        estado = payload.status.lower() if payload.status is not None else current.get("estado")

        if priority not in _ALLOWED_PRIORITY_OT:
            raise HTTPException(status_code=400, detail=f"priority inválida. Permitidos: {sorted(_ALLOWED_PRIORITY_OT)}")
        if estado not in _ALLOWED_ESTADO_OT:
            raise HTTPException(status_code=400, detail=f"status inválido. Permitidos: {sorted(_ALLOWED_ESTADO_OT)}")

        cursor.execute(
            """
            UPDATE ORDEN_TRABAJO
            SET
                maquina_id = %s,
                descripcion_problema = %s,
                priority = %s,
                estado = %s
            WHERE ot_id = %s
            RETURNING ot_id, numero_ot, descripcion_problema, priority, estado;
            """,
            (maquina_id, title, priority, estado, ot_id),
        )
        row = cursor.fetchone()
        conn.commit()

        cursor.close()
        conn.close()

        return {
            "ot_id": row["ot_id"],
            "numero_ot": row["numero_ot"],
            "title": row["descripcion_problema"],
            "priority": row["priority"].capitalize(),
            "status": row["estado"],
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al actualizar OT: {str(e)}")


@app.delete("/api/work-orders/{ot_id}", status_code=204)
@app.delete("/work-orders/{ot_id}", status_code=204)
async def delete_work_order(ot_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM ORDEN_TRABAJO WHERE ot_id = %s;", (ot_id,))
        deleted = cursor.rowcount
        conn.commit()

        cursor.close()
        conn.close()

        if deleted == 0:
            raise HTTPException(status_code=404, detail="ORDEN_TRABAJO no encontrada para eliminar.")
        return None
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar OT: {str(e)}")


# -----------------------------------------------------------------------------
# PIPELINE RAG (LM STUDIO)
# -----------------------------------------------------------------------------
@app.post("/chat", response_model=ChatResponse)
@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    lm_payload = {
        "model": "local-model",
        "messages": [
            {"role": "system", "content": "Asistente experto en mantenimiento de la planta BARB."},
            {"role": "user", "content": payload.message},
        ],
        "temperature": 0.4,
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{LM_STUDIO_URL}/chat/completions",
                json=lm_payload,
                timeout=30.0,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="LM Studio devolvió un error.")

            res_json = response.json()
            reply = res_json["choices"][0]["message"]["content"]
            return ChatResponse(reply=reply, sources=["Manual_Local.pdf"], language=payload.language)
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="LM Studio local inalcanzable desde el contenedor backend.",
        )
