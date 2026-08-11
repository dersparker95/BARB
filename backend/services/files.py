from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from psycopg2.extras import RealDictCursor

from config import UPLOAD_DIR
from database import get_db_connection, release_db_connection, _query_all


def store_upload_file(file: UploadFile, destination_dir: Path, prefix: str) -> dict:
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
                    (ot_id, stored["stored_name"], stored["original_name"], content_type, str(stored["stored_path"])),
                )
                row = cursor.fetchone()
                saved_photos.append({
                    "id": int(row["ot_foto_id"]),
                    "ot_id": ot_id,
                    "file_name": stored["stored_name"],
                    "original_name": stored["original_name"],
                    "content_type": content_type,
                    "file_path": str(stored["stored_path"]),
                    "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                })
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
