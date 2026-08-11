from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Depends

from database import _query_all
from permisos import require_auth

router = APIRouter()


@router.get("/api/machines", dependencies=[Depends(require_auth)])
def get_machines():
    try:
        rows = _query_all(
            """
            SELECT maquina_id AS id, nombre, disciplina_id, planta_id
            FROM maquina
            ORDER BY nombre
            """
        )
        return [
            {"id": int(r["id"]), "name": r["nombre"], "discipline_id": r["disciplina_id"], "plant_id": r["planta_id"]}
            for r in rows
        ]
    except Exception:
        return [{"id": 1, "name": "Planta Principal", "discipline_id": 1, "plant_id": 1}]


@router.get("/api/disciplines", dependencies=[Depends(require_auth)])
@lru_cache(maxsize=1)
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


@router.get("/api/plants", dependencies=[Depends(require_auth)])
@router.get("/api/plantas", dependencies=[Depends(require_auth)])
def get_plants():
    try:
        rows = _query_all(
            """
            SELECT planta_id AS id, nombre, ubicacion
            FROM planta
            ORDER BY planta_id
            """
        )
        return [{"id": int(r["id"]), "name": r["nombre"], "ubicacion": r["ubicacion"]} for r in rows]
    except Exception:
        return [{"id": 1, "name": "Planta Central San Bernardo", "ubicacion": "San Bernardo, Región Metropolitana, Chile"}]


@router.get("/api/technicians", dependencies=[Depends(require_auth)])
@lru_cache(maxsize=1)
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
