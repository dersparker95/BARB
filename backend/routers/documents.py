from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from psycopg2.extras import RealDictCursor

from config import UPLOAD_DIR
from database import get_db_connection, release_db_connection
from utils import safe_text
from services.files import store_upload_file
from services.ai import index_document_in_chroma
from permisos import require_action

router = APIRouter()


@router.post("/api/documents/upload", dependencies=[Depends(require_action("subir_documentos"))])
@router.post("/documents/upload", dependencies=[Depends(require_action("subir_documentos"))])
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    discipline: Optional[str] = Form(None),
    machine: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
):
    content_type = (file.content_type or "").strip().lower()
    original_filename = Path(file.filename or "").name
    ext = original_filename.lower().rsplit(".", 1)[-1] if "." in original_filename else ""

    pdf_docx_content_types = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    is_supported_content_type = content_type in pdf_docx_content_types
    is_supported_extension = ext in ("pdf", "docx")
    if not (is_supported_content_type or is_supported_extension):
        raise HTTPException(status_code=415, detail="Solo se permiten archivos PDF o DOCX.")

    doc_dir = UPLOAD_DIR / "documents"
    doc_dir.mkdir(parents=True, exist_ok=True)
    stored = store_upload_file(file, doc_dir, "doc")

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
        index_document_in_chroma, stored["stored_path"], stored["original_name"],
        stored["file_id"], doc_title, discipline_id, machine_id,
    )

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
                INSERT INTO documento (title, discipline_id, maquina_id, notes, original_name, stored_name, file_id, chunks_indexed)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING documento_id
                """,
                (doc_title, discipline_id, machine_id, safe_text(notes, None),
                 stored["original_name"], stored["stored_name"], stored["file_id"], index_result["chunks_indexed"]),
            )
            documento_id = cursor.fetchone()["documento_id"]
            conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error guardando metadata de documento: {e}")
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
