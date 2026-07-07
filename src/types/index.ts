// =============================================================================
// USUARIOS Y ROLES
// =============================================================================
//
// Define los roles de acceso del sistema y la estructura del usuario
// autenticado.
//

// Se añade (string & {}) para preservar autocompletado de los roles conocidos
// sin restringir el tipo a un enum cerrado.
export type Role = 'gerente' | 'admin' | 'tecnico' | 'operador' | 'engineer' | 'supervisor' | 'visitante' | (string & {})

export interface User {
  id: string | number // El backend SQL entrega números; el frontend puede recibirlos como string.
  name: string
  role: Role
  token?: string
}

// =============================================================================
// MÁQUINAS
// =============================================================================
//
// Modelo de máquina y sus posibles estados operativos.
//

export interface Machine {
  id: string | number
  name: string
  status: 'ok' | 'warning' | 'alarm' | 'operativo' | 'mantenimiento' | 'falla' | (string & {})
  location?: string
}

// =============================================================================
// ÓRDENES DE TRABAJO
// =============================================================================
//
// Modelo de orden de trabajo alineado con los enums reales de PostgreSQL
// (estado_ot, prioridad_ot).
//

export interface WorkOrder {
  id: string | number
  title: string
  description?: string
  machineId?: string | number
  machine?: string 
  machineName?: string

  // Refleja el enum estado_ot real de la base de datos (pending/assigned/
  // in_progress/completed/cancelled/overdue). Se conserva (string & {}) para
  // no romper valores adicionales que pueda enviar el backend.
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'overdue' | (string & {})
  // Refleja el enum prioridad_ot real de la base de datos (low/medium/high/
  // urgent). 'critical' no es un valor de prioridad: pertenece al campo
  // severity, que es distinto.
  priority?: 'low' | 'medium' | 'high' | 'urgent' | (string & {})
  
  createdAt: string
  closedAt?: string | null
  createdBy?: string
  technician?: string 
  
  durationReal?: number 
  discipline?: string 
  maintenanceType?: string 
  costoEstimado?: number 
  costoReal?: number 
  hasBarbAi?: boolean 
}

// =============================================================================
// CHAT Y MENSAJERÍA
// =============================================================================
//
// Estructuras utilizadas por el módulo de chat y el motor RAG.
//

export interface SourceHit {
  documentName?: string
  pageNumber?: number | string
  excerpt?: string
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'bot' | (string & {})
  content: string
  timestamp?: number
  sources?: SourceHit[] 
}

export type DebugMessagesByMachine = Record<string, Message[]>

// =============================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// =============================================================================
//
// Define el estado y el contrato del contexto compartido por toda la
// aplicación.
//

export interface AppState {
  currentScreen: string
  dark: boolean
  lang: string
  discipline: string | null
  docMachine: string
  plant: string
  selectedMachine: string | null
  sessionId: string | null
  sessionStart: number | null
  docMessages: Message[]
  debugMessagesByMachine: DebugMessagesByMachine
  user: User | null
  apiBase: string
  lmBase: string
  loading: boolean
}

export interface AppContextValue extends AppState {
  // Servicio API centralizado, ya vinculado al apiBase actual y con el token
  // de sesión adjunto automáticamente. Debe usarse en lugar de fetch() manual.
  api: any
  setCurrentScreen: (s: string) => void
  setDark: (v: boolean) => void
  setLang: (l: string) => void
  setDiscipline: (d: string | null) => void
  setDocMachine: (m: string) => void
  setPlant: (p: string) => void
  setSelectedMachine: (id: string | null) => void
  setSessionId: (id: string | null) => void
  setSessionStart: (t: number | null) => void
  pushDocMessage: (m: Message) => void
  clearDocMessages: () => void
  getDebugMessages: (machineId: string | null | undefined) => Message[]
  pushDebugMessage: (machineId: string, m: Message) => void
  setUser: (u: User | null) => void
  setApiBase: (u: string) => void
  setLmBase: (u: string) => void
  setLoading: (l: boolean) => void
  appendToLastDocMessage?: (chunk: string, sources?: SourceHit[]) => void 
  login?: (params: { email: string; password: string }) => Promise<User>
  logout?: () => Promise<void>
}

// =============================================================================
// RESPUESTAS DE API
// =============================================================================
//
// Estructuras de respuesta de los endpoints de documentación (RAG) y
// diagnóstico (debug).
//

export interface DocApiResponse {
  response: string
  sources?: SourceHit[]
  suggestedQuestions?: string[]
  conversationId?: string
}

export interface DebugApiResponse {
  response: string
  diagnostics?: unknown
  suggestedActions?: unknown[]
}

// =============================================================================
// REPORTES Y SESIONES DE DIAGNÓSTICO
// =============================================================================
//
// Modelos utilizados por los módulos de reportes y sesiones de debug.
//

export interface Report {
  reportId: string
  machineId?: string | number
  title: string
  summary: string
  createdAt: string
  createdBy?: string
}

export interface DebugSession {
  sessionId: string
  machineId?: string | number
  startedAt: string
  endedAt?: string
  technician?: string
  notes?: string
}

// =============================================================================
// HISTORIAL
// =============================================================================
//
// Estructura unificada para representar eventos del historial de una
// máquina, sin importar su origen (orden de trabajo, reporte o debug).
//

export type HistoryEvent = {
  id: string
  type: 'workorder' | 'report' | 'debug' | (string & {})
  date: string
  title: string
  actor?: string
  summary?: string
}
