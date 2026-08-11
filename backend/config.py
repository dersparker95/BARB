from __future__ import annotations

try:
    __import__("pysqlite3")
    import sys as _sys
    _sys.modules["sqlite3"] = _sys.modules.pop("pysqlite3")
except ImportError:
    pass

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# --- Base de datos ---
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://barb_admin:barb_password123@db:5432/barb_database",
)

# --- Redis ---
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# --- Archivos ---
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/app/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# --- ChromaDB (RAG de manuales) ---
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "/app/chroma_db")
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "barb_manuals")

# --- DeepSeek ---
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

# --- Constantes de negocio ---
SLA_TARGET_MINUTES = 24 * 60
DOWNTIME_COST_PER_MINUTE = 2000

# --- Límite de historial para debug chat ---
DEBUG_HISTORY_LIMIT = 5

# --- Prompt del sistema ---
BARB_SYSTEM_PROMPT = (
    "Eres BARB, asistente experto en mantenimiento industrial. "
    "Responde de forma clara, técnica y concisa. "
    "Si el usuario menciona una máquina específica, orienta tu respuesta a ese equipo."
)
