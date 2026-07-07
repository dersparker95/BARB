import { Role } from '../types'

// =============================================================================
// SEGURIDAD — MATRIZ DE PERMISOS
// =============================================================================
//
// Fuente de verdad de permisos del frontend, espejo exacto de permisos.py
// en el backend (mismos nombres de rutas y acciones, mismos valores). Toda
// página o acción nueva debe agregarse en ambos lugares. El backend es quien
// hace cumplir los permisos realmente (vía require_route/require_action);
// este archivo solo controla qué se muestra en la UI, para evitar exponer
// botones que el servidor de todas formas rechazaría.
//

export const ROLES = ['operador', 'tecnico', 'supervisor', 'engineer', 'gerente', 'admin', 'visitante'] as const

export type PermisoValor = boolean | 'ver'

// Mismas claves que RUTAS en permisos.py (sin barra inicial, para calzar 1:1).
export type RutaKey = 'menu' | 'docchat' | 'debug' | 'topology' | 'memory' | 'report' | 'dashboard' | 'history'

export const RUTAS: Record<RutaKey, Record<string, PermisoValor>> = {
  menu:      { operador: true, tecnico: true, supervisor: true, engineer: true, gerente: true, admin: true, visitante: true },
  docchat:   { operador: true, tecnico: true, supervisor: true, engineer: true, gerente: true, admin: true, visitante: false },
  debug:     { operador: true, tecnico: true, supervisor: true, engineer: true, gerente: true, admin: true, visitante: false },
  topology:  { operador: true, tecnico: true, supervisor: true, engineer: true, gerente: true, admin: true, visitante: 'ver' },
  memory:    { operador: true, tecnico: true, supervisor: true, engineer: true, gerente: true, admin: true, visitante: 'ver' },
  report:    { operador: true, tecnico: true, supervisor: true, engineer: true, gerente: true, admin: true, visitante: false },
  dashboard: { operador: false, tecnico: false, supervisor: true, engineer: true, gerente: true, admin: true, visitante: 'ver' },
  history:   { operador: false, tecnico: false, supervisor: true, engineer: false, gerente: true, admin: true, visitante: false },
}

// Mismas claves que ACCIONES en permisos.py.
export type AccionKey =
  | 'crear_ot'
  | 'cambiar_estado_ot'
  | 'eliminar_ot'
  | 'subir_documentos'
  | 'gestionar_usuarios'
  | 'ver_usuarios'

export const ACCIONES: Record<AccionKey, Record<string, boolean>> = {
  // Restringido a gerente/admin únicamente, confirmado explícitamente por el
  // cliente; anula la matriz original de 6 roles.
  crear_ot:           { operador: false, tecnico: false, supervisor: false, engineer: false, gerente: true, admin: true, visitante: false },
  cambiar_estado_ot:  { operador: false, tecnico: true, supervisor: true, engineer: true, gerente: true, admin: true, visitante: false },
  eliminar_ot:        { operador: false, tecnico: false, supervisor: true, engineer: true, gerente: true, admin: true, visitante: false },
  subir_documentos:   { operador: false, tecnico: false, supervisor: false, engineer: true, gerente: true, admin: true, visitante: false },
  gestionar_usuarios: { operador: false, tecnico: false, supervisor: false, engineer: false, gerente: false, admin: true, visitante: false },
  ver_usuarios:       { operador: false, tecnico: false, supervisor: false, engineer: false, gerente: false, admin: true, visitante: false },
}

// =============================================================================
// VALIDACIONES DE ACCESO
// =============================================================================
//
// Expone las funciones de verificación de permisos consumidas por la UI.
//

/**
 * Verifica si un rol puede acceder o navegar a una ruta determinada.
 *
 * Args:
 *     role:
 *         Rol del usuario actual.
 *     ruta:
 *         Ruta a validar.
 *     soloLectura:
 *         Si es true, acepta también el permiso 'ver' como acceso válido.
 *
 * Returns:
 *     True si el rol tiene acceso a la ruta.
 */
export const puedeAccederRuta = (role: Role | null | undefined, ruta: RutaKey, soloLectura = true): boolean => {
  if (!role) return false
  const permiso = RUTAS[ruta]?.[role]
  if (permiso === true) return true
  if (soloLectura && permiso === 'ver') return true
  return false
}

/**
 * Verifica si un rol puede ejecutar una acción (crear, editar, eliminar
 * o subir).
 *
 * Args:
 *     role:
 *         Rol del usuario actual.
 *     accion:
 *         Acción a validar.
 *
 * Returns:
 *     True si el rol tiene permiso para ejecutar la acción.
 */
export const puedeEjecutarAccion = (role: Role | null | undefined, accion: AccionKey): boolean => {
  if (!role) return false
  return ACCIONES[accion]?.[role] === true
}

/**
 * Determina la primera página principal a la que un rol tiene acceso,
 * utilizada como destino posterior al login.
 *
 * Args:
 *     role:
 *         Rol del usuario autenticado.
 *
 * Returns:
 *     Ruta de destino por defecto para ese rol.
 */
export const getDefaultRouteForRole = (role: Role | null | undefined): string => {
  if (puedeAccederRuta(role, 'dashboard')) return '/dashboard'
  if (puedeAccederRuta(role, 'menu')) return '/menu'
  return '/login'
}

// =============================================================================
// ALIAS EN INGLÉS
// =============================================================================
//
// Provee equivalentes en inglés (canAccessPage/canPerformAction) para el
// código que consume rutas con formato '/dashboard'. Delegan internamente
// en las funciones de validación definidas arriba.
//

export type AppPage = `/${RutaKey}`
export type AppAction = AccionKey

export const canAccessPage = (role: Role | null | undefined, page: AppPage, soloLectura = true): boolean =>
  puedeAccederRuta(role, page.slice(1) as RutaKey, soloLectura)

export const canPerformAction = (role: Role | null | undefined, action: AppAction): boolean =>
  puedeEjecutarAccion(role, action)
