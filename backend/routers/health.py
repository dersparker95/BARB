from __future__ import annotations

import os

from fastapi import APIRouter
from sqlalchemy import text

from database import engine
from cache import get_redis_client

router = APIRouter()


@router.get("/")
async def root():
    return {"service": "BARB API", "status": "online"}


@router.get("/health")
@router.get("/api/health")
async def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "online"}
    except Exception as e:
        return {"status": "error_db", "detail": str(e)}


@router.get("/api/health/redis")
async def health_redis():
    client = get_redis_client()
    if not client:
        return {"status": "offline"}
    try:
        return {"status": "online", "ping": client.ping()}
    except Exception as exc:
        return {"status": "offline", "detail": str(exc)}


@router.get("/api/health/llm")
async def health_llm():
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
