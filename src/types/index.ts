// 🔥 BLINDAJE: Agregados los roles de Login y el truco de autocompletado
export type Role = 'gerente' | 'admin' | 'tecnico' | 'operador' | 'engineer' | 'supervisor' | 'visitante' | (string & {})

export interface User {
  id: string | number // 🛠️ SQL envía números (1, 2), React a veces usa strings ('1')
  name: string
  role: Role
  token?: string
}

export interface Machine {
  id: string | number
  name: string
  // 🔥 FIX: Mantenemos el autocompletado de los estados conocidos
  status: 'ok' | 'warning' | 'alarm' | 'operativo' | 'mantenimiento' | 'falla' | (string & {})
  location?: string
}

export interface WorkOrder {
  id: string | number
  title: string
  description?: string
  machineId?: string | number
  machine?: string 
  machineName?: string // 🛠️ Integrado desde el mapeo del Dashboard

  // ⚠️ FIX: antes decía 'open'|'in_progress'|'done'|'closed', que NO son los
  // valores reales del enum estado_ot en Postgres (pending/assigned/in_progress/
  // completed/cancelled/overdue). Se corrige para que el tipo documente lo que
  // realmente llega del backend; se mantiene (string & {}) para no romper nada
  // que dependa de valores adicionales.
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'overdue' | (string & {})
  // ⚠️ FIX: faltaba 'urgent', que es el valor máximo real del enum prioridad_ot
  // (low/medium/high/urgent). 'critical' no es un valor de prioridad en la BD
  // (pertenece a severity, un campo distinto).
  priority?: 'low' | 'medium' | 'high' | 'urgent' | (string & {})
  
  createdAt: string
  closedAt?: string | null
  createdBy?: string
  technician?: string 
  
  // 🛠️ Integrado desde el mapeo del Dashboard para evitar "any" en la tabla
  durationReal?: number 
  discipline?: string 
  maintenanceType?: string 
  costoEstimado?: number 
  costoReal?: number 
  hasBarbAi?: boolean 
}

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
  // Servicio API centralizado (ya vinculado al apiBase actual y con el token de
  // sesión adjunto automáticamente). Úsalo en vez de hacer fetch() manual.
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
  // 🔥 FIX: Actualizado a SourceHit[] para hacer match perfecto con la lógica RAG
  appendToLastDocMessage?: (chunk: string, sources?: SourceHit[]) => void 
  login?: (params: { email: string; password: string }) => Promise<User>
  logout?: () => Promise<void>
}

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

export type HistoryEvent = {
  id: string
  type: 'workorder' | 'report' | 'debug' | (string & {})
  date: string
  title: string
  actor?: string
  summary?: string
}