from __future__ import annotations

from datetime import datetime
from typing import Any

import bcrypt
from fastapi import HTTPException


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


def ensure_passwords_hashed(cursor) -> int:
    cursor.execute("SELECT usuario_id, password_hash FROM usuario")
    usuarios = cursor.fetchall()
    actualizados = 0
    for u in usuarios:
        uid = u["usuario_id"] if isinstance(u, dict) else u[0]
        stored = (u["password_hash"] if isinstance(u, dict) else u[1]) or ""
        if not stored.strip().startswith("$2"):
            hashed = hash_password(stored)
            cursor.execute(
                "UPDATE usuario SET password_hash = %s WHERE usuario_id = %s",
                (hashed, uid),
            )
            actualizados += 1
    return actualizados


def serialize_user(user: dict) -> dict:
    return {
        "usuario_id": int(user["usuario_id"]),
        "nombre": str(user["nombre"]),
        "email": str(user["email"]),
        "rol": str(user["rol"]).lower(),
        "activo": bool(user["activo"]),
        "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
    }


def normalize_priority(value: str | None) -> str:
    raw = (value or "").strip().lower()
    mapping = {
        "low": "low",
        "medium": "medium",
        "normal": "medium",
        "high": "high",
        "urgent": "urgent",
        "critical": "urgent",
    }
    return mapping.get(raw, "medium")


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


def iso_z(val) -> str | None:
    if not val:
        return None
    if isinstance(val, str):
        return val if val.endswith("Z") or "+" in val else val + "Z"
    s = val.isoformat()
    return s if s.endswith("Z") or "+" in s else s + "Z"


def parse_work_order_status(value: str | None) -> str:
    db_status = normalize_db_status(value)
    allowed = {"pending", "assigned", "in_progress", "completed", "cancelled", "overdue"}
    if db_status not in allowed:
        raise HTTPException(status_code=400, detail="Estado de OT inválido.")
    return db_status
