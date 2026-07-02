"""
permisos.py
===========
Sistema de permisos por rol (rutas + acciones) para BARB.

Uso:
    from permisos import require_route, require_action
    from fastapi import Depends

    @app.get("/api/dashboard", dependencies=[Depends(require_route("dashboard"))])
    def get_dashboard(): ...

    @app.post("/api/work-orders", dependencies=[Depends(require_action("crear_ot"))])
    async def create_work_order(request: Request): ...
"""

from fastapi import Header, HTTPException
from typing import Optional

# =============================================================================
# ROLES VÁLIDOS
# =============================================================================

ROLES = ("operador", "tecnico", "supervisor", "engineer", "gerente", "admin", "visitante")

# =============================================================================
# PERMISOS POR RUTA  (basado en la matriz "Ruta")
# True  = acceso total
# "ver" = acceso solo lectura (equivalente a "solo ver" en la matriz)
# False = sin acceso
# =============================================================================

RUTAS: dict[str, dict[str, bool | str]] = {
    "menu":       {"operador": True, "tecnico": True, "supervisor": True, "engineer": True, "gerente": True, "admin": True, "visitante": True},
    "docchat":    {"operador": True, "tecnico": True, "supervisor": True, "engineer": True, "gerente": True, "admin": True, "visitante": False},
    "debug":      {"operador": True, "tecnico": True, "supervisor": True, "engineer": True, "gerente": True, "admin": True, "visitante": False},
    "topology":   {"operador": True, "tecnico": True, "supervisor": True, "engineer": True, "gerente": True, "admin": True, "visitante": "ver"},
    "memory":     {"operador": True, "tecnico": True, "supervisor": True, "engineer": True, "gerente": True, "admin": True, "visitante": "ver"},
    "report":     {"operador": True, "tecnico": True, "supervisor": True, "engineer": True, "gerente": True, "admin": True, "visitante": False},
    "dashboard":  {"operador": False, "tecnico": False, "supervisor": True, "engineer": True, "gerente": True, "admin": True, "visitante": "ver"},
    "history":    {"operador": False, "tecnico": False, "supervisor": True, "engineer": False, "gerente": True, "admin": True, "visitante": False},
}

# =============================================================================
# PERMISOS POR ACCIÓN  (basado en la matriz "Funciones dentro de las páginas")
# NOTA: "crear_ot" se sobre-escribe abajo según instrucción explícita:
# solo gerente y admin pueden crear OT (la foto original decía distinto).
# =============================================================================

ACCIONES: dict[str, dict[str, bool]] = {
    "crear_ot":            {"operador": False, "tecnico": False, "supervisor": False, "engineer": False, "gerente": True, "admin": True, "visitante": False},
    "cambiar_estado_ot":   {"operador": False, "tecnico": True,  "supervisor": True,  "engineer": True,  "gerente": True, "admin": True, "visitante": False},
    "eliminar_ot":         {"operador": False, "tecnico": False, "supervisor": True,  "engineer": True,  "gerente": True, "admin": True, "visitante": False},
    "subir_documentos":    {"operador": False, "tecnico": False, "supervisor": False, "engineer": True,  "gerente": True, "admin": True, "visitante": False},
    # No estaba en la matriz original; gestión de usuarios (crear/editar/eliminar) queda
    # restringida solo a admin por ser una acción sensible de administración del sistema.
    "gestionar_usuarios":  {"operador": False, "tecnico": False, "supervisor": False, "engineer": False, "gerente": False, "admin": True, "visitante": False},
    # Ver el directorio de usuarios (con email) también se limita a admin.
    "ver_usuarios":        {"operador": False, "tecnico": False, "supervisor": False, "engineer": False, "gerente": False, "admin": True, "visitante": False},
}


def _normalizar_rol(rol: Optional[str]) -> str:
    rol = (rol or "").strip().lower()
    if rol not in ROLES:
        raise HTTPException(status_code=403, detail=f"Rol desconocido: '{rol}'")
    return rol


def puede_acceder_ruta(rol: str, ruta: str) -> bool | str:
    permiso = RUTAS.get(ruta)
    if permiso is None:
        raise HTTPException(status_code=500, detail=f"Ruta '{ruta}' no está definida en permisos.py")
    return permiso.get(_normalizar_rol(rol), False)


def puede_ejecutar_accion(rol: str, accion: str) -> bool:
    permiso = ACCIONES.get(accion)
    if permiso is None:
        raise HTTPException(status_code=500, detail=f"Acción '{accion}' no está definida en permisos.py")
    return bool(permiso.get(_normalizar_rol(rol), False))


# =============================================================================
# RESOLUCIÓN DEL ROL ACTUAL
# =============================================================================
# Se recibe el usuario_id vía header (enviado por el frontend tras el login)
# y se consulta el rol REAL desde la base de datos en cada request, para no
# confiar en un rol que el cliente pudiera manipular.

def get_sesion_actual(authorization: str = Header(..., alias="Authorization")) -> dict:
    """
    Igual que get_rol_actual pero devuelve también el usuario_id de la sesión,
    necesario para endpoints que actúan "sobre el propio usuario" (ej. preferencias).
    """
    from main import _query_one

    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Falta el header Authorization: Bearer <token>.")

    sesion = _query_one(
        """
        SELECT u.usuario_id, u.rol, u.activo
        FROM sesion s
        JOIN usuario u ON u.usuario_id = s.usuario_id
        WHERE s.token = %(token)s AND s.expira_en > NOW()
        """,
        {"token": token},
    )
    if not sesion or not sesion.get("activo", True):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada. Vuelve a iniciar sesión.")

    return {"usuario_id": int(sesion["usuario_id"]), "rol": _normalizar_rol(sesion["rol"])}


def get_rol_actual(authorization: str = Header(..., alias="Authorization")) -> str:
    """
    Resuelve el rol del usuario autenticado a partir del token de sesión real
    guardado en la tabla `sesion` (creada en /auth/login). Rechaza tokens
    inexistentes, expirados o de usuarios inactivos.
    """
    from main import _query_one  # import diferido para evitar ciclo de importación

    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Falta el header Authorization: Bearer <token>.")

    sesion = _query_one(
        """
        SELECT u.rol, u.activo
        FROM sesion s
        JOIN usuario u ON u.usuario_id = s.usuario_id
        WHERE s.token = %(token)s AND s.expira_en > NOW()
        """,
        {"token": token},
    )
    if not sesion or not sesion.get("activo", True):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada. Vuelve a iniciar sesión.")

    return _normalizar_rol(sesion["rol"])


# =============================================================================
# DEPENDENCIAS PARA FASTAPI
# =============================================================================

def require_route(ruta: str, solo_lectura: bool = False):
    """
    Dependencia para proteger un endpoint según la matriz de RUTAS.

    ## Args:
    ruta: Clave de la ruta definida en RUTAS.
    solo_lectura: Si True, considera "ver" como acceso válido (endpoints GET).
                  Si False, "ver" se rechaza (endpoints que escriben datos).
    """
    async def _dep(authorization: str = Header(..., alias="Authorization")):
        rol_actual = get_rol_actual(authorization)
        permiso = puede_acceder_ruta(rol_actual, ruta)
        acceso_valido = permiso is True or (solo_lectura and permiso == "ver")
        if not acceso_valido:
            raise HTTPException(status_code=403, detail=f"El rol '{rol_actual}' no tiene acceso a '{ruta}'.")
        return rol_actual

    return _dep


def require_action(accion: str):
    """Dependencia para proteger una acción (crear/editar/eliminar/subir) según ACCIONES."""

    async def _dep(authorization: str = Header(..., alias="Authorization")):
        rol_actual = get_rol_actual(authorization)
        if not puede_ejecutar_accion(rol_actual, accion):
            raise HTTPException(status_code=403, detail=f"El rol '{rol_actual}' no puede ejecutar '{accion}'.")
        return rol_actual

    return _dep


async def require_auth(authorization: str = Header(..., alias="Authorization")) -> str:
    """
    Dependencia liviana: solo exige un usuario autenticado y válido (cualquier
    rol, incluido visitante). Para datos de referencia de solo lectura que no
    aparecen en la matriz de rutas/acciones (máquinas, plantas, disciplinas,
    técnicos, listado de OTs).
    """
    return get_rol_actual(authorization)