from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

import bcrypt
import httpx
import psycopg2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://barb_admin:barb_password123@db:5432/barb_database",
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
    allow_origins=[
        "http://localhost",
        "http://localhost:80",
        "http://localhost:5173",
        "http://127.0.0.1",
        "http://127.0.0.1:80",
        "http://127.0.0.1:5173",
    ],
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
        cursor = conn.cursor()
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
        cursor = conn.cursor()
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
        cursor = conn.cursor()
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("rag_backend:app", host="0.0.0.0", port=9000, reload=True)
