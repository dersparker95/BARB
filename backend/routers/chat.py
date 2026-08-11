from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
from datetime import datetime
from typing import Optional

import httpx
import psycopg2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from openai import AsyncOpenAI
from psycopg2.extras import RealDictCursor

from config import DEEPSEEK_API_KEY, BARB_SYSTEM_PROMPT, UPLOAD_DIR, DEBUG_HISTORY_LIMIT
from database import get_db_connection, release_db_connection, _query_all
from cache import cache_get, cache_set
from models import ChatRequest, ChatDebugRequest, ChatSessionRequest, ChatFeedbackRequest
from utils import safe_int, safe_text
from services.files import store_upload_file
from services.ai import (
    get_manuals_corpus_version, query_manual_chunks,
    fetch_recent_machine_failures, format_failure_history_for_prompt,
)
from permisos import require_route, get_sesion_actual

router = APIRouter()

_http_limits = httpx.Limits(max_connections=10, max_keepalive_connections=5, keepalive_expiry=30)
ia_client = AsyncOpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com",
    timeout=60.0,
    max_retries=2,
    http_client=httpx.AsyncClient(timeout=60.0, limits=_http_limits),
)


@router.post("/api/chat", dependencies=[Depends(require_route("docchat"))])
@router.post("/chat", dependencies=[Depends(require_route("docchat"))])
async def chat(payload: ChatRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="API Key de IA no configurada en el servidor.")

    corpus_version = await asyncio.to_thread(get_manuals_corpus_version)
    cache_key = hashlib.sha256(
        f"chat:{payload.language}:{corpus_version}:{payload.message.strip()}".encode("utf-8")
    ).hexdigest()

    cached = cache_get(cache_key)
    if cached:
        return cached

    system_content = BARB_SYSTEM_PROMPT
    if payload.language and payload.language != "es":
        system_content += f" Idioma de respuesta: {payload.language}."
    if payload.machine:
        system_content += f" Máquina en contexto: {payload.machine}."

    machine_filter = None
    if payload.machine:
        try:
            machine_filter = int(payload.machine)
        except (TypeError, ValueError):
            machine_filter = None

    manual_chunks = await asyncio.to_thread(query_manual_chunks, payload.message, 4, machine_filter)
    if manual_chunks:
        manual_text = "\n".join(
            f"- (Fuente: {c['source']}, pág. {c['page']}): {c['text'][:600]}" for c in manual_chunks
        )
        system_content += (
            " Fragmentos relevantes de manuales técnicos indexados (RAG):\n"
            f"{manual_text}\n"
            " Responde basándote en estos fragmentos cuando sean pertinentes,"
            " y cita la fuente (nombre de archivo y página) si los usas."
        )

    messages: list[dict] = [{"role": "system", "content": system_content}]
    for item in payload.history:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": payload.message})

    try:
        response = await ia_client.chat.completions.create(
            model="deepseek-chat", messages=messages, temperature=0.3, max_tokens=1024,
        )
        reply = response.choices[0].message.content

        if manual_chunks:
            sources = sorted({c["source"] for c in manual_chunks})
        else:
            sources = ["Base de Conocimiento BARB (sin manuales indexados relevantes)"]

        result = {"reply": reply, "sources": sources, "language": payload.language}
        if not payload.history:
            cache_set(cache_key, result, ttl_seconds=300)
        return result

    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error de comunicación con el motor de IA: {type(e).__name__}")


@router.post("/api/chat/debug", dependencies=[Depends(require_route("debug"))])
@router.post("/chat/debug", dependencies=[Depends(require_route("debug"))])
async def chat_debug(payload: ChatDebugRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="API Key de IA no configurada en el servidor.")

    system_content = (
        BARB_SYSTEM_PROMPT
        + " Estás en modo DEBUG/diagnóstico: prioriza causas probables, pasos de verificación"
        " y acciones correctivas concretas."
    )

    if payload.machineId:
        system_content += f" Máquina en contexto: {payload.machineId}."

    maquina_id = None
    if payload.machineId:
        try:
            maquina_id = int(payload.machineId)
        except (TypeError, ValueError):
            maquina_id = None

    if maquina_id is not None:
        failure_rows = await asyncio.to_thread(fetch_recent_machine_failures, maquina_id, DEBUG_HISTORY_LIMIT)
        if failure_rows:
            failure_history_text = format_failure_history_for_prompt(failure_rows)
            system_content += (
                " Historial reciente de fallas registradas para este equipo:\n"
                f"{failure_history_text}\n"
                " Usa este historial para identificar patrones de falla repetitiva."
            )

    manual_chunks = await asyncio.to_thread(query_manual_chunks, payload.message, 4, maquina_id)
    if manual_chunks:
        manual_text = "\n".join(
            f"- (Fuente: {c['source']}, pág. {c['page']}): {c['text'][:600]}" for c in manual_chunks
        )
        system_content += (
            " Fragmentos relevantes de manuales técnicos (RAG):\n" f"{manual_text}\n"
            " Cita la fuente si los usas en tu respuesta."
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
            model="deepseek-chat", messages=messages, temperature=0.2, max_tokens=1024,
        )
        reply = response.choices[0].message.content
        return {"reply": reply, "sources": ["Base de Conocimiento BARB"], "sessionId": payload.sessionId}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error de comunicación con el motor de IA: {type(e).__name__}")


@router.post("/api/chat/debug/attachments", dependencies=[Depends(require_route("debug"))])
@router.post("/chat/debug/attachments", dependencies=[Depends(require_route("debug"))])
async def upload_chat_debug_attachments(
    files: list[UploadFile] = File(...),
    session_id: Optional[str] = Form(None),
    machine_id: Optional[str] = Form(None),
):
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
                    INSERT INTO chat_debug_attachment (session_id, maquina_id, original_name, stored_name, content_type)
                    VALUES (%s, %s, %s, %s, %s) RETURNING attachment_id
                    """,
                    (session_id, maquina_id, stored["original_name"], stored["stored_name"], content_type),
                )
                row = cursor.fetchone()
                conn.commit()
                attachments.append({
                    "id": row["attachment_id"],
                    "filename": stored["stored_name"],
                    "original_name": stored["original_name"],
                    "content_type": content_type,
                })
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar adjuntos: {str(e)}")
    finally:
        if conn:
            release_db_connection(conn)

    return {"attachments": attachments}


@router.post("/api/chat-sessions", dependencies=[Depends(require_route("docchat"))])
@router.post("/chat-sessions", dependencies=[Depends(require_route("docchat"))])
async def save_chat_session(payload: ChatSessionRequest, sesion: dict = Depends(get_sesion_actual)):
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
                (sesion["empresa_id"], sesion["usuario_id"], payload.title, payload.saved_by,
                 payload.discipline, payload.plant_id, payload.plant_name, payload.machine_id,
                 payload.machine_name, payload.active_manual,
                 json.dumps(payload.messages), json.dumps(payload.metadata_info)),
            )
            row = cursor.fetchone()
            conn.commit()
            return {"status": "success", "session_id": row["session_id"]}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar sesión: {str(e)}")
    finally:
        if conn:
            release_db_connection(conn)


@router.get("/api/chat-sessions", dependencies=[Depends(require_route("history"))])
async def get_chat_sessions(sesion: dict = Depends(get_sesion_actual)):
    try:
        rows = _query_all(
            """
            SELECT *, saved_at AS created_at, titulo AS title
            FROM chat_session
            WHERE empresa_id = %(empresa_id)s
            ORDER BY saved_at DESC LIMIT 50
            """,
            {"empresa_id": sesion["empresa_id"]},
        )
        for row in rows:
            if isinstance(row.get("created_at"), datetime):
                row["created_at"] = row["created_at"].isoformat()
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener sesiones: {str(e)}")


@router.post("/api/chat-feedback", dependencies=[Depends(require_route("docchat"))])
async def save_chat_feedback(payload: ChatFeedbackRequest):
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
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
                (payload.message_content, payload.rating, payload.context),
            )
            conn.commit()
            return {"status": "success"}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar feedback: {str(e)}")
    finally:
        if conn:
            release_db_connection(conn)


@router.put("/api/user/preferences")
@router.put("/user/preferences")
def update_user_preferences(payload: dict, sesion: dict = Depends(get_sesion_actual)):
    from database import _execute_write
    try:
        _execute_write(
            "UPDATE usuario SET preferencias = :prefs WHERE usuario_id = :uid",
            {"prefs": json.dumps(payload), "uid": sesion["usuario_id"]},
        )
        return {"status": "success", "preferencias": payload}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar preferencias: {str(e)}")


@router.post("/api/reports/debug", dependencies=[Depends(require_route("report"))])
@router.post("/reports/debug", dependencies=[Depends(require_route("report"))])
def create_debug_report(payload: dict):
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
                (report_number, maquina_id, tecnico_id, safe_text(payload.get("summary"), None),
                 issue_description, safe_text(payload.get("resolution"), None),
                 json.dumps(payload.get("actions_taken")) if payload.get("actions_taken") else None,
                 safe_text(payload.get("additional_notes"), None), severity, payload.get("downtime_minutes")),
            )
            row = cursor.fetchone()
            conn.commit()
        return {"status": "success", "reporte_id": row["reporte_id"], "report_number": row["report_number"]}
    except psycopg2.errors.ForeignKeyViolation:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=422, detail="maquina_id o tecnico_id no corresponden a registros existentes.")
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar el reporte: {str(e)}")
    finally:
        if conn:
            release_db_connection(conn)
