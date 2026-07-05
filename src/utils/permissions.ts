import { Role } from '../types'

/**
 * FUENTE DE VERDAD DE PERMISOS (frontend) — espejo exacto de `permisos.py`
 * en el backend. Mismos nombres de rutas y acciones, mismos valores.
 *
 * ⚠️ Si agregas una página o acción nueva, agrégala en AMBOS lugares
 * (aquí y en permisos.py). El backend es quien realmente lo hace cumplir
 * (vía require_route/require_action); este archivo solo controla qué se
 * muestra en la UI para evitar que un usuario vea botones que igual le
 * rechazaría el servidor.
 */

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
  // ⚠️ Solo gerente/admin — confirmado explícitamente por el usuario,
  // anula la matriz original de 6 roles.
  crear_ot:           { operador: false, tecnico: false, supervisor: false, engineer: false, gerente: true, admin: true, visitante: false },
  cambiar_estado_ot:  { operador: false, tecnico: true, supervisor: true, engineer: true, gerente: true, admin: true, visitante: false },
  eliminar_ot:        { operador: false, tecnico: false, supervisor: true, engineer: true, gerente: true, admin: true, visitante: false },
  subir_documentos:   { operador: false, tecnico: false, supervisor: false, engineer: true, gerente: true, admin: true, visitante: false },
  gestionar_usuarios: { operador: false, tecnico: false, supervisor: false, engineer: false, gerente: false, admin: true, visitante: false },
  ver_usuarios:       { operador: false, tecnico: false, supervisor: false, engineer: false, gerente: false, admin: true, visitante: false },
}

/** ¿Puede este rol ver/navegar a esta ruta? `soloLectura=true` acepta también 'ver'. */
export const puedeAccederRuta = (role: Role | null | undefined, ruta: RutaKey, soloLectura = true): boolean => {
  if (!role) return false
  const permiso = RUTAS[ruta]?.[role]
  if (permiso === true) return true
  if (soloLectura && permiso === 'ver') return true
  return false
}

/** ¿Puede este rol ejecutar esta acción (crear/editar/eliminar/subir)? */
export const puedeEjecutarAccion = (role: Role | null | undefined, accion: AccionKey): boolean => {
  if (!role) return false
  return ACCIONES[accion]?.[role] === true
}

/**
 * Devuelve la primera página "principal" a la que un rol tiene acceso,
 * usada como destino post-login.
 */
export const getDefaultRouteForRole = (role: Role | null | undefined): string => {
  if (puedeAccederRuta(role, 'dashboard')) return '/dashboard'
  if (puedeAccederRuta(role, 'menu')) return '/menu'
  return '/login'
}

// --- Alias en inglés, por compatibilidad con código ya escrito esta sesión
// (App.tsx, Menu.tsx) que usa canAccessPage/canPerformAction con rutas tipo
// '/dashboard'. Internamente delegan en las funciones espejo de arriba.
export type AppPage = `/${RutaKey}`
export type AppAction = AccionKey

export const canAccessPage = (role: Role | null | undefined, page: AppPage, soloLectura = true): boolean =>
  puedeAccederRuta(role, page.slice(1) as RutaKey, soloLectura)

export const canPerformAction = (role: Role | null | undefined, action: AppAction): boolean =>
  puedeEjecutarAccion(role, action)
