from __future__ import annotations

import os
<<<<<<< HEAD
from datetime import datetime
from typing import Optional
=======
import traceback
from collections import Counter
from datetime import datetime, timezone
from io import StringIO
from typing import List, Literal, Optional
>>>>>>> origin/Benja-

import bcrypt
import httpx
import psycopg2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor
from sqlalchemy import create_engine, text

<<<<<<< HEAD
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://barb_admin:barb_password123@db:5432/barb_database",
=======
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, create_engine, select, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from pathlib import Path
import uuid

# -----------------------------------------------------------------------------
# BARB Plant Memory API
# -----------------------------------------------------------------------------
# TODO: Reemplazar los datos en memoria por persistencia real en PostgreSQL.
# TODO: Conectar el endpoint /api/chat con LM Studio y el pipeline RAG real.
# TODO: Persistir cambios de estado de OTs en la base de datos.
# -----------------------------------------------------------------------------

app = FastAPI(
    title="BARB Plant Memory API",
    version="1.1.0",
    description="API local mockeada para OTs, topología de planta, reportes y chat RAG.",
>>>>>>> origin/Benja-
)
LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://host.docker.internal:1234/v1")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def _query_all(sql: str, params: Optional[dict] = None):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql, params or {})
            return cursor.fetchall()
    finally:
        conn.close()


def _query_one(sql: str, params: Optional[dict] = None):
    rows = _query_all(sql, params)
    return rows[0] if rows else None


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


app = FastAPI(title="BARB Plant Memory API", version="1.4.0")

app.add_middleware(
    CORSMiddleware,
<<<<<<< HEAD
    allow_origins=[
        "http://localhost",
        "http://localhost:80",
        "http://localhost:5173",
        "http://127.0.0.1",
        "http://127.0.0.1:80",
        "http://127.0.0.1:5173",
    ],
=======
    allow_origins=["http://localhost", "http://localhost:5173", "http://127.0.0.1"],
>>>>>>> origin/Benja-
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


<<<<<<< HEAD
class LoginRequest(BaseModel):
    email: str
    password: str
=======

def normalize_db_url(url: str) -> str:
    # Forzamos psycopg3 (psycopg) para evitar dependencia de psycopg2
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


db_url = normalize_db_url(DATABASE_URL)

engine = create_engine(db_url, pool_pre_ping=True) if db_url else None
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False) if engine else None


class Base(DeclarativeBase):
    pass


class Discipline(Base):
    __tablename__ = "disciplina"

    id: Mapped[int] = mapped_column("disciplina_id", primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column("nombre", String(255), unique=True, nullable=False)

    machines: Mapped[list["Machine"]] = relationship(back_populates="discipline", cascade="all, delete-orphan")


class Technician(Base):
    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column("usuario_id", primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column("nombre", String(255), unique=True, nullable=False)


class Plant(Base):
    __tablename__ = "planta"

    id: Mapped[int] = mapped_column("planta_id", primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column("nombre", String(255), unique=True, nullable=False)
    location: Mapped[Optional[str]] = mapped_column("ubicacion", String(255), nullable=True)


class Machine(Base):
    __tablename__ = "maquina"

    id: Mapped[int] = mapped_column("maquina_id", primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("planta.planta_id", ondelete="RESTRICT"), nullable=False)
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplina.disciplina_id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column("nombre", String(255), unique=True, nullable=False)
    code: Mapped[str] = mapped_column("codigo", String(50), unique=True, nullable=False)

    plant: Mapped["Plant"] = relationship()
    discipline: Mapped["Discipline"] = relationship(back_populates="machines")


class OrdenTrabajo(Base):
    __tablename__ = "orden_trabajo"

    id: Mapped[int] = mapped_column("ot_id", Integer, primary_key=True, autoincrement=True)
    numero_ot: Mapped[str] = mapped_column("numero_ot", String(40), unique=True, nullable=False)
    maquina_id: Mapped[int] = mapped_column(ForeignKey("maquina.maquina_id", ondelete="RESTRICT"), nullable=False)
    tecnico_id: Mapped[int] = mapped_column(ForeignKey("usuario.usuario_id", ondelete="RESTRICT"), nullable=False)
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuario.usuario_id", ondelete="RESTRICT"), nullable=False)
    diagnostico_id: Mapped[Optional[int]] = mapped_column(ForeignKey("diagnostico.diagnostico_id"), nullable=True)
    reporte_id: Mapped[Optional[int]] = mapped_column(ForeignKey("reporte.reporte_id"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    descripcion_problema: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    descripcion_reparacion: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    resolution: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False)
    severity: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    fecha_inicio: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    fecha_cierre: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    fecha_vencimiento: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    tiempo_reparacion_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    downtime_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    costo_estimado: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    costo_real: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    estado: Mapped[str] = mapped_column(String(40), nullable=False)


def get_db_session():
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")
    return SessionLocal()


def fetch_rows(sql: str, params: Optional[dict[str, object]] = None) -> list[dict[str, object]]:
    session = get_db_session()
    try:
        result = session.execute(text(sql), params or {})
        return [dict(row) for row in result.mappings().all()]
    finally:
        session.close()


def fetch_row(sql: str, params: Optional[dict[str, object]] = None) -> dict[str, object] | None:
    rows = fetch_rows(sql, params)
    return rows[0] if rows else None


# -----------------------------------------------------------------------------
# Schemas Pydantic para frontend (id/name/discipline_id)
# -----------------------------------------------------------------------------
class DisciplineResponse(BaseModel):
    id: int
    name: str


class TechnicianResponse(BaseModel):
    id: int
    name: str


class MachineResponse(BaseModel):
    id: int
    name: str
    discipline_id: int


class AssignedOTResponse(BaseModel):
    id: int
    numero_ot: str
    planta: str
    maquina: str
    estado: str
    priority: str


# -----------------------------------------------------------------------------
# Seed / bootstrap de catálogos
# -----------------------------------------------------------------------------
def seed_if_empty() -> None:
    if SessionLocal is None:
        return

    session = get_db_session()
    try:
        session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS disciplina (
                    disciplina_id SERIAL PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL UNIQUE
                )
                """
            )
        )
        session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS planta (
                    planta_id SERIAL PRIMARY KEY,
                    nombre VARCHAR(120) NOT NULL UNIQUE,
                    ubicacion VARCHAR(255)
                )
                """
            )
        )
        session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS usuario (
                    usuario_id SERIAL PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    rol VARCHAR(50) NOT NULL
                )
                """
            )
        )
        session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS maquina (
                    maquina_id SERIAL PRIMARY KEY,
                    planta_id INT NOT NULL REFERENCES planta(planta_id),
                    disciplina_id INT NOT NULL REFERENCES disciplina(disciplina_id),
                    nombre VARCHAR(100) NOT NULL,
                    codigo VARCHAR(50) UNIQUE NOT NULL
                )
                """
            )
        )
        session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS orden_trabajo (
                    ot_id SERIAL PRIMARY KEY,
                    numero_ot VARCHAR(40) UNIQUE NOT NULL,
                    maquina_id INT NOT NULL REFERENCES maquina(maquina_id),
                    tecnico_id INT NOT NULL REFERENCES usuario(usuario_id),
                    creado_por INT NOT NULL REFERENCES usuario(usuario_id),
                    diagnostico_id INT REFERENCES diagnostico(diagnostico_id),
                    reporte_id INT REFERENCES reporte(reporte_id),
                    tipo VARCHAR(40) NOT NULL,
                    descripcion_problema TEXT,
                    descripcion_reparacion TEXT,
                    resolution TEXT,
                    priority VARCHAR(20) NOT NULL,
                    severity VARCHAR(20),
                    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    fecha_inicio TIMESTAMP,
                    fecha_cierre TIMESTAMP,
                    fecha_vencimiento TIMESTAMP,
                    tiempo_reparacion_min INT,
                    downtime_minutes INT,
                    costo_estimado DECIMAL(12,2),
                    costo_real DECIMAL(12,2),
                    estado VARCHAR(40) NOT NULL DEFAULT 'pending'
                )
                """
            )
        )
        session.commit()

        session.execute(
            text("INSERT INTO disciplina (nombre) VALUES (:nombre) ON CONFLICT (nombre) DO NOTHING"),
            [{"nombre": nombre} for nombre in ["Mecánica", "Eléctrica", "Neumática", "Hidráulica"]],
        )
        session.execute(
            text("INSERT INTO planta (nombre, ubicacion) VALUES (:nombre, :ubicacion) ON CONFLICT (nombre) DO NOTHING"),
            [
                {"nombre": "Planta Chancado", "ubicacion": "Sector norte"},
                {"nombre": "Planta Concentradora", "ubicacion": "Sector central"},
                {"nombre": "Planta de Filtros", "ubicacion": "Sector sur"},
            ],
        )
        session.execute(
            text(
                "INSERT INTO usuario (usuario_id, nombre, email, rol) VALUES (:usuario_id, :nombre, :email, :rol) "
                "ON CONFLICT (usuario_id) DO NOTHING"
            ),
            [
                {"usuario_id": 1, "nombre": "Técnico Prueba", "email": "tecnico.prueba@barb.local", "rol": "technician"},
                {"usuario_id": 2, "nombre": "Supervisor Planta", "email": "supervisor.planta@barb.local", "rol": "supervisor"},
                {"usuario_id": 3, "nombre": "Técnico Apoyo", "email": "tecnico.apoyo@barb.local", "rol": "technician"},
            ],
        )
        session.commit()

        discipline_rows = session.execute(text("SELECT disciplina_id AS id, nombre FROM disciplina")).mappings().all()
        plant_rows = session.execute(text("SELECT planta_id AS id, nombre FROM planta")).mappings().all()
        discipline_ids = {str(row["nombre"]): int(row["id"]) for row in discipline_rows}
        plant_ids = {str(row["nombre"]): int(row["id"]) for row in plant_rows}

        machine_payloads = [
            {"maquina_id": 1, "planta_id": plant_ids["Planta Chancado"], "disciplina_id": discipline_ids["Mecánica"], "nombre": "Chancador Primario", "codigo": "MCH-001"},
            {"maquina_id": 2, "planta_id": plant_ids["Planta Chancado"], "disciplina_id": discipline_ids["Mecánica"], "nombre": "Chancador Secundario", "codigo": "MCH-002"},
            {"maquina_id": 3, "planta_id": plant_ids["Planta Concentradora"], "disciplina_id": discipline_ids["Eléctrica"], "nombre": "Sala Eléctrica", "codigo": "MEL-001"},
            {"maquina_id": 4, "planta_id": plant_ids["Planta Concentradora"], "disciplina_id": discipline_ids["Eléctrica"], "nombre": "Centro de Control MCC", "codigo": "MEL-002"},
            {"maquina_id": 5, "planta_id": plant_ids["Planta de Filtros"], "disciplina_id": discipline_ids["Neumática"], "nombre": "Compresor de Aire", "codigo": "MNE-001"},
            {"maquina_id": 6, "planta_id": plant_ids["Planta de Filtros"], "disciplina_id": discipline_ids["Hidráulica"], "nombre": "Bomba de Alta Presión", "codigo": "MHI-001"},
            {"maquina_id": 7, "planta_id": plant_ids["Planta Concentradora"], "disciplina_id": discipline_ids["Hidráulica"], "nombre": "Bomba de Agua Principal", "codigo": "MHI-002"},
            {"maquina_id": 8, "planta_id": plant_ids["Planta Chancado"], "disciplina_id": discipline_ids["Neumática"], "nombre": "Faja Transportadora", "codigo": "MNE-002"},
        ]
        session.execute(
            text(
                "INSERT INTO maquina (maquina_id, planta_id, disciplina_id, nombre, codigo) "
                "VALUES (:maquina_id, :planta_id, :disciplina_id, :nombre, :codigo) "
                "ON CONFLICT (codigo) DO NOTHING"
            ),
            machine_payloads,
        )
        session.commit()

        machine_rows = session.execute(text("SELECT maquina_id AS id, codigo FROM maquina")).mappings().all()
        machine_ids = {str(row["codigo"]): int(row["id"]) for row in machine_rows}

        ot_payloads = [
            {
                "ot_id": 1,
                "numero_ot": "OT-2051",
                "maquina_id": machine_ids["MCH-001"],
                "tecnico_id": 1,
                "creado_por": 2,
                "priority": "high",
                "severity": "low",
                "estado": "assigned",
                "tipo": "corrective",
                "descripcion_problema": "Vibración elevada en Chancador Primario",
            },
            {
                "ot_id": 2,
                "numero_ot": "OT-2052",
                "maquina_id": machine_ids["MEL-001"],
                "tecnico_id": 1,
                "creado_por": 2,
                "priority": "medium",
                "severity": "medium",
                "estado": "in_progress",
                "tipo": "inspection",
                "descripcion_problema": "Revisión de sala eléctrica y protecciones",
            },
            {
                "ot_id": 3,
                "numero_ot": "OT-2053",
                "maquina_id": machine_ids["MNE-001"],
                "tecnico_id": 1,
                "creado_por": 2,
                "priority": "urgent",
                "severity": "critical",
                "estado": "assigned",
                "tipo": "corrective",
                "descripcion_problema": "Caída de presión en Compresor de Aire",
            },
            {
                "ot_id": 4,
                "numero_ot": "OT-2054",
                "maquina_id": machine_ids["MHI-001"],
                "tecnico_id": 1,
                "creado_por": 2,
                "priority": "low",
                "severity": "low",
                "estado": "assigned",
                "tipo": "preventive",
                "descripcion_problema": "Mantenimiento preventivo bomba de alta presión",
            },
            {
                "ot_id": 5,
                "numero_ot": "OT-2055",
                "maquina_id": machine_ids["MCH-002"],
                "tecnico_id": 1,
                "creado_por": 2,
                "priority": "medium",
                "severity": "medium",
                "estado": "in_progress",
                "tipo": "inspection",
                "descripcion_problema": "Revisión de alineamiento en Chancador Secundario",
            },
            {
                "ot_id": 6,
                "numero_ot": "OT-2056",
                "maquina_id": machine_ids["MEL-002"],
                "tecnico_id": 1,
                "creado_por": 2,
                "priority": "high",
                "severity": "high",
                "estado": "assigned",
                "tipo": "corrective",
                "descripcion_problema": "Falla intermitente en MCC principal",
            },
            {
                "ot_id": 7,
                "numero_ot": "OT-2057",
                "maquina_id": machine_ids["MHI-002"],
                "tecnico_id": 1,
                "creado_por": 2,
                "priority": "medium",
                "severity": "medium",
                "estado": "assigned",
                "tipo": "preventive",
                "descripcion_problema": "Chequeo de bomba de agua principal",
            },
            {
                "ot_id": 8,
                "numero_ot": "OT-2058",
                "maquina_id": machine_ids["MNE-002"],
                "tecnico_id": 1,
                "creado_por": 2,
                "priority": "high",
                "severity": "high",
                "estado": "in_progress",
                "tipo": "corrective",
                "descripcion_problema": "Deslizamiento en Faja Transportadora",
            },
            {
                "ot_id": 9,
                "numero_ot": "OT-2059",
                "maquina_id": machine_ids["MCH-001"],
                "tecnico_id": 1,
                "creado_por": 2,
                "priority": "low",
                "severity": "low",
                "estado": "assigned",
                "tipo": "inspection",
                "descripcion_problema": "Inspección general de lubricación en chancado",
            },
            {
                "ot_id": 10,
                "numero_ot": "OT-2060",
                "maquina_id": machine_ids["MHI-001"],
                "tecnico_id": 1,
                "creado_por": 2,
                "priority": "urgent",
                "severity": "critical",
                "estado": "assigned",
                "tipo": "corrective",
                "descripcion_problema": "Fuga en línea hidráulica de Bomba de Alta Presión",
            },
        ]
        session.execute(
            text(
                "INSERT INTO orden_trabajo (ot_id, numero_ot, maquina_id, tecnico_id, creado_por, priority, severity, estado, tipo, descripcion_problema, fecha_creacion) "
                "VALUES (:ot_id, :numero_ot, :maquina_id, :tecnico_id, :creado_por, :priority, :severity, :estado, :tipo, :descripcion_problema, CURRENT_TIMESTAMP) "
                "ON CONFLICT (numero_ot) DO NOTHING"
            ),
            ot_payloads,
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@app.on_event("startup")
def on_startup_seed() -> None:
    #seed_if_empty()
    pass


@app.post("/api/seed")
async def seed_endpoint() -> dict[str, str]:
    seed_if_empty()
    return {"message": "Seed ejecutado (si era necesario)"}
@app.on_event("startup")
def on_startup_seed() -> None:
    seed_if_empty()


@app.post("/api/seed")
async def seed_endpoint() -> dict[str, str]:
    seed_if_empty()
    return {"message": "Seed ejecutado (si era necesario)"}

# -----------------------------------------------------------------------------
# BARB Plant Memory API (mock de OTs/topología/reportes/chat)
# -----------------------------------------------------------------------------
WorkOrderStatus = Literal["Open", "In Progress", "Done", "Closed"]
PriorityLevel = Literal["Low", "Medium", "High"]
MachineHealth = Literal["operational", "warning", "error"]
ChatLanguage = Literal["es", "en"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def minutes_between(start: datetime, end: datetime | None = None) -> int:
    end = end or utc_now()
    delta = end - start
    return max(0, int(delta.total_seconds() // 60))


def next_work_order_id() -> str:
    if SessionLocal is None:
        return "WO-1001"

    session = get_db_session()
    try:
        # ids con formato "WO-<n>"
        # buscamos el máximo del n y sumamos 1
        stmt = select(WorkOrder.id)
        rows = session.execute(stmt).scalars().all()

        numeric_suffixes: list[int] = []
        for work_order_id in rows:
            try:
                numeric_suffixes.append(int(str(work_order_id).split("-")[-1]))
            except ValueError:
                continue

        next_number = max(numeric_suffixes, default=1000) + 1
        return f"WO-{next_number}"
    finally:
        session.close()


def next_document_id() -> str:
    numeric_suffixes: list[int] = []
    for document_id in DOCUMENTS.keys():
        try:
            numeric_suffixes.append(int(document_id.split("-")[-1]))
        except ValueError:
            continue
    next_number = max(numeric_suffixes, default=2000) + 1
    return f"DOC-{next_number}"


class WorkOrderRecord(BaseModel):
    id: str
    title: str
    machine: str
    priority: PriorityLevel
    status: WorkOrderStatus
    description: str
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None


class WorkOrderSummary(BaseModel):
    id: str
    title: str
    machine: str
    priority: PriorityLevel
    status: WorkOrderStatus
    age_minutes: int


class WorkOrderDetail(WorkOrderSummary):
    description: str
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None


class WorkOrderUpdateRequest(BaseModel):
    status: WorkOrderStatus = Field(..., examples=["In Progress", "Closed"])


class WorkOrderCreateRequest(BaseModel):
    title: str = Field(..., min_length=3, examples=["Inspect Motor D1 vibration"])
    machine: str = Field(..., min_length=1, examples=["motor-d1"])
    priority: PriorityLevel = Field(default="Medium")
    description: str = Field(default="", examples=["Se detectó vibración anómala en el motor D1."])
    status: WorkOrderStatus = Field(default="Open")


class MachineStatusItem(BaseModel):
    id: str
    name: str
    status: MachineHealth


class MachineStatusCounts(BaseModel):
    operational: int
    warning: int
    error: int


class StatsOverviewResponse(BaseModel):
    total_work_orders: int
    completion_percentage: float
    machine_status_counts: MachineStatusCounts
>>>>>>> origin/Benja-


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


@app.get("/")
async def root():
    return {"service": "BARB API", "status": "online"}


@app.get("/health")
@app.get("/api/health")
<<<<<<< HEAD
async def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "online"}
=======
async def health() -> dict[str, int | str]:
    return {
        "status": "online",
        "work_orders": len(WORK_ORDERS),
        "machines": len(MACHINES),
        "documents": len(DOCUMENTS),
    }

# -----------------------------------------------------------------------------
# Endpoints Catálogos (los requeridos por el frontend)
# -----------------------------------------------------------------------------
@app.get("/api/disciplinas", response_model=list[DisciplineResponse])
@app.get("/api/disciplines", response_model=list[DisciplineResponse])
async def get_disciplines() -> list[DisciplineResponse]:
    session = get_db_session()
    try:
        queries = [
            """
            SELECT disciplina_id AS id, nombre AS name
            FROM DISCIPLINA
            ORDER BY nombre ASC
            """,
            """
            SELECT disciplina_id AS id, nombre AS name
            FROM disciplines
            ORDER BY nombre ASC
            """,
        ]

        last_error: Exception | None = None
        for sql in queries:
            try:
                rows = session.execute(text(sql)).mappings().all()
                return [DisciplineResponse(id=int(row["id"]), name=str(row["name"])) for row in rows]
            except ProgrammingError as exc:
                last_error = exc
                session.rollback()
                continue

        seed_if_empty()

        for sql in queries:
            try:
                rows = session.execute(text(sql)).mappings().all()
                return [DisciplineResponse(id=int(row["id"]), name=str(row["name"])) for row in rows]
            except ProgrammingError as exc:
                last_error = exc
                session.rollback()
                continue

        raise HTTPException(status_code=500, detail=f"No se encontró la tabla DISCIPLINA ni disciplines. Último error: {last_error}")
    except Exception as exc:
        print("ERROR /api/disciplinas:", repr(exc))
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al listar disciplinas: {exc}")
    finally:
        session.close()


@app.get("/api/technicians", response_model=list[TechnicianResponse])
async def get_technicians() -> list[TechnicianResponse]:
    rows = fetch_rows(
        """
        SELECT usuario_id AS id, nombre AS name
        FROM USUARIO
        WHERE rol IN ('technician', 'supervisor', 'engineer')
        ORDER BY nombre ASC
        """
    )
    return [TechnicianResponse(id=int(row["id"]), name=str(row["name"])) for row in rows]


@app.get("/api/maquinas", response_model=list[MachineResponse])
@app.get("/api/machines", response_model=list[MachineResponse])
async def get_machines(disciplina_id: Optional[int] = None, discipline_id: Optional[int] = None) -> list[MachineResponse]:
    params: dict[str, object] = {}
    filtered_discipline_id = disciplina_id if disciplina_id is not None else discipline_id
    sql = """
        SELECT
            m.maquina_id AS id,
            m.nombre AS name,
            m.disciplina_id AS discipline_id
        FROM MAQUINA m
    """
    if filtered_discipline_id is not None:
        sql += " WHERE m.disciplina_id = :discipline_id"
        params["discipline_id"] = filtered_discipline_id
    sql += " ORDER BY m.nombre ASC"

    rows = fetch_rows(sql, params)
    return [
        MachineResponse(
            id=int(row["id"]),
            name=str(row["name"]),
            discipline_id=int(row["discipline_id"]),
        )
        for row in rows
    ]


@app.get("/api/ots/asignadas/{tecnico_id}", response_model=list[AssignedOTResponse])
async def get_assigned_ots(tecnico_id: int) -> list[AssignedOTResponse]:
    try:
        rows = fetch_rows(
            """
            SELECT
                ot.ot_id AS id,
                ot.numero_ot AS numero_ot,
                pl.nombre AS planta,
                ma.nombre AS maquina,
                ot.estado AS estado,
                ot.priority AS priority
            FROM ORDEN_TRABAJO ot
            INNER JOIN MAQUINA ma ON ma.maquina_id = ot.maquina_id
            INNER JOIN PLANTA pl ON pl.planta_id = ma.planta_id
            WHERE ot.tecnico_id = :tecnico_id
            ORDER BY ot.numero_ot ASC
            """,
            {"tecnico_id": tecnico_id},
        )
        return [
            AssignedOTResponse(
                id=int(row["id"]),
                numero_ot=str(row["numero_ot"]),
                planta=str(row["planta"]),
                maquina=str(row["maquina"]),
                estado=str(row["estado"]),
                priority=str(row["priority"]),
            )
            for row in rows
        ]
    except Exception as e:
        print(f"Error en BD: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------------------------
# Work Orders (Persistencia real en PostgreSQL)
# -----------------------------------------------------------------------------
from typing import Any

UPLOAD_DIR = Path("static/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


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


@app.get("/api/work-orders", response_model=list[WorkOrderSummary])
async def list_work_orders() -> list[WorkOrderSummary]:
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    session = get_db_session()
    try:
        rows = session.execute(select(WorkOrder).order_by(WorkOrder.created_at.desc())).scalars().all()
        return [_work_order_to_summary(r) for r in rows]
    finally:
        session.close()


@app.get("/api/work-orders/{work_order_id}", response_model=WorkOrderDetail)
async def get_work_order(work_order_id: str) -> WorkOrderDetail:
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    session = get_db_session()
    try:
        row = session.execute(select(WorkOrder).where(WorkOrder.id == work_order_id)).scalars().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Work order not found")
        return _work_order_to_detail(row)
    finally:
        session.close()


def _save_photo(photo: UploadFile) -> str:
    # nombre único: uuid + extensión
    suffix = Path(photo.filename or "").suffix.lower()
    filename = f"{uuid.uuid4().hex}{suffix or '.bin'}"
    dest = UPLOAD_DIR / filename

    # Guardamos bytes
    # (UploadFile.read() es async; esto se llama dentro de endpoint async)
    return str(dest)


@app.post("/api/work-orders", response_model=WorkOrderDetail, status_code=201)
async def create_work_order(
    title: str = Form(...),
    machine: str = Form(...),  # viene como string del id numérico
    disciplinaId: str = Form(...),
    tecnicoId: str = Form(...),
    priority: PriorityLevel = Form("Medium"),
    status: WorkOrderStatus = Form("Open"),
    description: str = Form(...),
    photo: UploadFile | None = File(None),
) -> WorkOrderDetail:
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    try:
        machine_id = int(machine)
        discipline_id = int(disciplinaId)
        technician_id = int(tecnicoId)
    except ValueError:
        raise HTTPException(status_code=400, detail="machine/disciplineId/tecnicoId inválidos (deben ser números)")

    now = utc_now()

    photo_path: str | None = None
    session = get_db_session()
    try:
        if photo is not None and photo.filename:
            # guardamos el archivo
            suffix = Path(photo.filename).suffix.lower()
            filename = f"{uuid.uuid4().hex}{suffix or '.bin'}"
            dest = UPLOAD_DIR / filename

            data = await photo.read()
            dest.write_bytes(data)

            photo_path = str(dest)

        # Crear id
        work_order_id = next_work_order_id()

        closed_at = now if status in ("Done", "Closed") else None

        order = WorkOrder(
            id=work_order_id,
            title=title,
            machine_id=machine_id,
            discipline_id=discipline_id,
            technician_id=technician_id,
            priority=priority,
            status=status,
            description=description or title,
            photo_path=photo_path,
            created_at=now,
            updated_at=now,
            closed_at=closed_at,
        )

        session.add(order)
        session.commit()
        session.refresh(order)

        return _work_order_to_detail(order)
    finally:
        session.close()


@app.put("/api/work-orders/{work_order_id}", response_model=WorkOrderDetail)
async def update_work_order(
    work_order_id: str,
    payload: WorkOrderUpdateRequest,
) -> WorkOrderDetail:
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    session = get_db_session()
    try:
        row = session.execute(select(WorkOrder).where(WorkOrder.id == work_order_id)).scalars().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Work order not found")

        row.status = payload.status
        row.updated_at = utc_now()

        if payload.status in ("Done", "Closed") and row.closed_at is None:
            row.closed_at = row.updated_at

        if payload.status in ("Open", "In Progress"):
            if payload.status == "Open":
                row.closed_at = None

        session.add(row)
        session.commit()
        session.refresh(row)
        return _work_order_to_detail(row)
    finally:
        session.close()


@app.delete("/api/work-orders/{work_order_id}")
async def delete_work_order(work_order_id: str) -> dict[str, str]:
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    session = get_db_session()
    try:
        row = session.execute(select(WorkOrder).where(WorkOrder.id == work_order_id)).scalars().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Work order not found")

        session.delete(row)
        session.commit()
        return {"message": f"Work order {work_order_id} deleted", "id": work_order_id}
    finally:
        session.close()


@app.get("/api/work-orders/export")
async def export_work_orders() -> StreamingResponse:
    csv_content = build_work_orders_csv()
    filename = f"work_orders_{utc_now().date().isoformat()}.csv"

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/stats/overview", response_model=StatsOverviewResponse)
async def get_stats_overview() -> StatsOverviewResponse:
    if SessionLocal is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")

    session = get_db_session()
    try:
        total_work_orders = session.execute(select(WorkOrder.id)).scalars().all()
        total = len(total_work_orders)
        if total == 0:
            completion_percentage = 0.0
        else:
            completed = (
                session.execute(select(WorkOrder.id).where(WorkOrder.status.in_(["Done", "Closed"])))
                .scalars()
                .all()
            )
            completion_percentage = round((len(completed) / total) * 100, 1)

        return StatsOverviewResponse(
            total_work_orders=total,
            completion_percentage=completion_percentage,
            machine_status_counts=build_machine_status_counts(),
        )
    finally:
        session.close()


# Nota: mantenemos /api/machines mock NO—pero el frontend ahora usa /api/machines catalog.
# Si necesitas conservar el mock, cambia el path o elimina este endpoint mock.
# En esta versión, /api/machines ya está ocupado por catálogo (requerimiento del frontend).

@app.get("/api/documents", response_model=list[DocumentRecord])
async def list_documents() -> list[DocumentRecord]:
    return list(DOCUMENTS.values())


@app.post("/api/documents/upload", response_model=DocumentRecord, status_code=201)
async def upload_document(file: UploadFile = File(...)) -> DocumentRecord:
    contents = await file.read()
    document_id = next_document_id()
    now = utc_now()
    title = file.filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()

    document = DocumentRecord(
        id=document_id,
        filename=file.filename,
        title=title,
        uploaded_at=now,
        size_bytes=len(contents),
        mime_type=file.content_type,
    )
    DOCUMENTS[document_id] = document
    return document


@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    lm_studio_url = os.getenv("LM_STUDIO_URL", "http://host.docker.internal:1234/v1").strip().rstrip("/")
    url = f"{lm_studio_url}/chat/completions"

    # --- 1) Resolver contexto de máquina desde DB si viene un ID válido ---
    machine_name: str | None = None
    discipline_name: str | None = None

    context_machine_val = payload.context_machine
    machine_id_int: int | None = None
    if context_machine_val is not None:
        try:
            machine_id_int = int(context_machine_val)  # acepta int o str convertible
        except (TypeError, ValueError):
            machine_id_int = None

    if machine_id_int is not None and SessionLocal is not None:
        session = get_db_session()
        try:
            # Machine(id) -> Machine.name + Machine.discipline.name
            row = session.execute(
                select(Machine).where(Machine.id == machine_id_int)
            ).scalars().first()

            if row is not None:
                machine_name = row.name
                if row.discipline is not None:
                    discipline_name = row.discipline.name
        finally:
            session.close()

    # --- 2) RAG: obtener contexto del PDF (prioriza código y luego máquina/discipline) ---
    contexto_extraido = get_pdf_context(
        payload.message,
        pdf_path="docs/Manual_Local.pdf",
        machine_name=machine_name,
        discipline_name=discipline_name,
    )
    sources = ["Manual_Local.pdf"] if contexto_extraido else []

    # --- 3) Prompt system con contexto estructurado ---
    machine_struct = (
        f"[{machine_name}] ubicado en (ubicación no disponible en DB actual) "
        f"(Disciplina: {discipline_name})."
        if machine_name and discipline_name
        else (f"[{machine_name}] (Disciplina: {discipline_name})." if machine_name or discipline_name else "")
    )

    system_prompt = (
        f"Eres un experto en mantenimiento industrial de la planta BARB. "
        f"Estás asistiendo a un técnico en la máquina: {machine_struct} "
        f"Contexto extraído del manual: {contexto_extraido}. "
        f"Responde usando estrictamente el contexto. Si el contexto está vacío, indica que no tienes esa información en tus manuales."
    )

    request_payload = {
        "model": "local-model",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": payload.message},
        ],
        "temperature": 0.4,
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, json=request_payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"LM Studio no está disponible o no se pudo conectar: {str(e)}",
        ) from e
    except httpx.HTTPStatusError as e:
        detail_text: str
        try:
            detail_text = e.response.text
        except Exception:
            detail_text = str(e)
        raise HTTPException(
            status_code=503,
            detail=f"LM Studio respondió un error al completar el chat: {detail_text}",
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=503, detail=f"Respuesta inválida de LM Studio (no es JSON): {str(e)}") from e

    try:
        reply_text = data["choices"][0]["message"]["content"]
        if not isinstance(reply_text, str) or not reply_text.strip():
            raise KeyError("Empty reply content")
>>>>>>> origin/Benja-
    except Exception as e:
        return {"status": "error_db", "detail": str(e)}


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

<<<<<<< HEAD
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


@app.get("/api/usuarios/{usuario_id}")
async def get_user_by_id(usuario_id: int):
    try:
        row = _query_one(
            """
            SELECT usuario_id, nombre, email, rol, activo, created_at
            FROM usuario
            WHERE usuario_id = %(usuario_id)s
            LIMIT 1
            """,
            {"usuario_id": usuario_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="USUARIO no encontrado.")
        return serialize_user(row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener USUARIO: {str(e)}")




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
            ot.numero_ot,
            ot.estado,
            ot.tiempo_reparacion_min,
            ot.costo_real,
            ot.descripcion_problema,
            m.nombre AS machine_name,
            ot.fecha_creacion
        FROM orden_trabajo ot
        JOIN maquina m ON m.maquina_id = ot.maquina_id
        ORDER BY ot.numero_ot DESC
        """
    )
    try:
        with engine.connect() as conn:
            rows = conn.execute(query).mappings().all()
            resultados = []
            for r in rows:
                estado_bd = str(r.get("estado", "pending")).lower()
                estado_visual = "Closed" if estado_bd == "completed" else ("In Progress" if estado_bd in {"in_progress", "assigned"} else "Open")
                costo_bd = r.get("costo_real")
                costo_seguro = float(costo_bd) if costo_bd is not None else 0.0
                tiempo_bd = r.get("tiempo_reparacion_min")
                tiempo_seguro = int(tiempo_bd) if tiempo_bd is not None else 0

                resultados.append(
                    {
                        "id": str(r.get("numero_ot", "000")),
                        "title": str(r.get("descripcion_problema") or f"OT {r.get('numero_ot')}"),
                        "machine": str(r.get("machine_name") or "1"),
                        "priority": "High" if costo_seguro > 500 else "Medium",
                        "status": estado_visual,
                        "age_minutes": tiempo_seguro,
                    }
                )
            return resultados
    except Exception as e:
        print(f"Error BD: {e}")
        return []


@app.get("/api/machines")
def get_machines():
    try:
        rows = _query_all(
            """
            SELECT maquina_id AS id, nombre, disciplina_id
            FROM maquina
            ORDER BY nombre
            """
        )
        return [{"id": int(r["id"]), "name": r["nombre"], "discipline_id": r["disciplina_id"]} for r in rows]
    except Exception:
        return [{"id": 1, "name": "Planta Principal", "discipline_id": 1}]


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
            return {"reply": reply, "sources": ["Manual_Local.pdf"], "language": payload.language}
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="LM Studio local inalcanzable desde el contenedor backend.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

=======
class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    return {
        "token": "fake-jwt-token-123",
        "user": {
            "id": "1",
            "name": "Técnico Prueba",
            "email": req.email,
            "role": "technician"
        }
    }

@app.get("/api/chat/debug")
async def chat_debug():
    return []
>>>>>>> origin/Benja-

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("rag_backend:app", host="0.0.0.0", port=9000, reload=True)
