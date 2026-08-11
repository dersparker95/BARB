from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from psycopg2.extras import RealDictCursor
from sqlalchemy import text

from database import engine, get_db_connection, release_db_connection, _query_all, _query_one
from models import WorkOrderStatusRequest
from utils import (
    humanize_status, iso_z, normalize_priority, normalize_db_status,
    parse_optional_datetime, parse_work_order_status, safe_int, safe_text,
)
from services.files import save_ot_photos, delete_ot_files
from permisos import require_auth, require_action

router = APIRouter()


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
            ot.ot_id, ot.numero_ot, ot.maquina_id, ot.tecnico_id, ot.creado_por,
            ot.diagnostico_id, ot.reporte_id, ot.tipo, ot.descripcion_problema,
            ot.descripcion_reparacion, ot.resolution, ot.priority, ot.severity,
            ot.fecha_creacion, ot.fecha_inicio, ot.fecha_cierre, ot.fecha_vencimiento,
            ot.tiempo_reparacion_min, ot.downtime_minutes, ot.costo_estimado,
            ot.costo_real, ot.estado,
            m.nombre AS machine_name, m.planta_id,
            d.disciplina_id AS discipline_id, d.nombre AS discipline_name,
            p.nombre AS plant_name, u.nombre AS tecnico_nombre
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
        FROM ot_foto WHERE ot_id = %(ot_id)s ORDER BY ot_foto_id ASC
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


@router.get("/api/work-orders", dependencies=[Depends(require_auth)])
@router.get("/api/work_orders", dependencies=[Depends(require_auth)])
def get_work_orders():
    query = text(
        """
        SELECT
            ot.ot_id, ot.numero_ot, ot.maquina_id, ot.tecnico_id, ot.creado_por,
            ot.diagnostico_id, ot.reporte_id, ot.tipo, ot.descripcion_problema,
            ot.descripcion_reparacion, ot.resolution, ot.priority, ot.severity,
            ot.fecha_creacion, ot.fecha_inicio, ot.fecha_cierre, ot.fecha_vencimiento,
            ot.tiempo_reparacion_min, ot.downtime_minutes, ot.costo_estimado,
            ot.costo_real, ot.estado,
            m.nombre AS machine_name, m.planta_id,
            d.disciplina_id AS discipline_id, d.nombre AS discipline_name,
            p.nombre AS plant_name, u.nombre AS tecnico_nombre,
            COALESCE(photos.photo_count, 0) AS photo_count
        FROM orden_trabajo ot
        JOIN maquina m ON m.maquina_id = ot.maquina_id
        LEFT JOIN disciplina d ON d.disciplina_id = m.disciplina_id
        LEFT JOIN planta p ON p.planta_id = m.planta_id
        LEFT JOIN usuario u ON u.usuario_id = ot.tecnico_id
        LEFT JOIN (SELECT ot_id, COUNT(*) AS photo_count FROM ot_foto GROUP BY ot_id) photos ON photos.ot_id = ot.ot_id
        ORDER BY ot.fecha_creacion DESC, ot.ot_id DESC
        """
    )
    try:
        with engine.connect() as conn:
            rows = conn.execute(query).mappings().all()
            return [row_to_work_order(dict(row)) for row in rows]
    except Exception as e:
        print(f"Error BD: {e}")
        return []


@router.get("/api/work-orders/{numero_ot}", dependencies=[Depends(require_auth)])
@router.get("/api/work_orders/{numero_ot}", dependencies=[Depends(require_auth)])
def get_work_order(numero_ot: str):
    row = fetch_work_order_row(numero_ot)
    if not row:
        raise HTTPException(status_code=404, detail="OT no encontrada.")
    photos = fetch_work_order_photos(int(row["ot_id"]))
    return row_to_work_order(row, photos=photos)


@router.put("/api/work-orders/{numero_ot}/status", dependencies=[Depends(require_action("cambiar_estado_ot"))])
@router.put("/api/work_orders/{numero_ot}/status", dependencies=[Depends(require_action("cambiar_estado_ot"))])
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
        cursor.execute(
            """
            UPDATE orden_trabajo SET estado = %s, fecha_inicio = %s, fecha_cierre = %s
            WHERE numero_ot = %s RETURNING numero_ot
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


@router.delete("/api/work-orders/{numero_ot}", status_code=204, dependencies=[Depends(require_action("eliminar_ot"))])
@router.delete("/api/work_orders/{numero_ot}", status_code=204, dependencies=[Depends(require_action("eliminar_ot"))])
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


@router.post("/api/work-orders", dependencies=[Depends(require_action("crear_ot"))])
@router.post("/api/work_orders", dependencies=[Depends(require_action("crear_ot"))])
async def create_work_order(request: Request):
    content_type = (request.headers.get("content-type") or "").lower()
    payload: dict[str, Any] = {}
    images: list[UploadFile] = []

    if "multipart/form-data" in content_type:
        form = await request.form()
        payload = {key: form.get(key) for key in form.keys()}
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
        payload.get("descripcion_problema") or payload.get("description") or payload.get("title") or payload.get("issue_description"), ""
    )
    descripcion_reparacion = safe_text(payload.get("descripcion_reparacion"), "")
    resolution = safe_text(payload.get("resolution"), "")
    priority = normalize_priority(safe_text(payload.get("priority"), "medium"))
    severity = safe_text(payload.get("severity"), "") or None
    estado = parse_work_order_status(safe_text(payload.get("estado") or payload.get("status"), "pending"))
    fecha_vencimiento = parse_optional_datetime(payload.get("fecha_vencimiento") or payload.get("due_date"))

    temp_numero_ot = f"OT-TEMP-{uuid.uuid4().hex[:6]}"

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            INSERT INTO orden_trabajo (
                numero_ot, maquina_id, tecnico_id, creado_por, tipo,
                descripcion_problema, descripcion_reparacion, resolution,
                priority, severity, fecha_vencimiento, estado
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING ot_id
            """,
            (temp_numero_ot, maquina_id, tecnico_id, creado_por, tipo,
             descripcion_problema or None, descripcion_reparacion or None, resolution or None,
             priority, severity, fecha_vencimiento, estado),
        )
        row = cursor.fetchone()
        ot_id = int(row["ot_id"])
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
