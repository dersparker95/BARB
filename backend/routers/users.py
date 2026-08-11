from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from psycopg2.extras import RealDictCursor

from database import get_db_connection, _query_one, _query_all
from models import UserCreateRequest, UserUpdateRequest
from utils import hash_password, serialize_user
from permisos import require_action

router = APIRouter()


@router.get("/api/usuarios", dependencies=[Depends(require_action("ver_usuarios"))])
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


@router.post("/api/usuarios", status_code=201, dependencies=[Depends(require_action("gestionar_usuarios"))])
async def create_user(payload: UserCreateRequest):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            INSERT INTO usuario (nombre, email, password_hash, rol, activo)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING usuario_id, nombre, email, rol, activo, created_at;
            """,
            (payload.nombre, payload.email, hash_password(payload.password), payload.rol, payload.activo),
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


@router.put("/api/usuarios/{usuario_id}", dependencies=[Depends(require_action("gestionar_usuarios"))])
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
            hash_password(payload.password) if payload.password is not None else current["password_hash"]
        )
        next_rol = payload.rol if payload.rol is not None else current["rol"]
        next_activo = payload.activo if payload.activo is not None else current["activo"]

        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            UPDATE usuario
            SET nombre = %s, email = %s, password_hash = %s, rol = %s, activo = %s
            WHERE usuario_id = %s
            RETURNING usuario_id, nombre, email, rol, activo, created_at;
            """,
            (next_nombre, next_email, next_password_hash, next_rol, next_activo, usuario_id),
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


@router.delete("/api/usuarios/{usuario_id}", status_code=204, dependencies=[Depends(require_action("gestionar_usuarios"))])
async def delete_user(usuario_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
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
