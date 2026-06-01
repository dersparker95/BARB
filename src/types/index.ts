export type Role = 'gerente' | 'admin' | 'tecnico'

export interface User {
  id: string
  name: string
  role: Role
  token?: string
}

export interface Machine {
  id: string
  name: string
  status: 'ok' | 'warning' | 'alarm'
  location?: string
}

export interface WorkOrder {
  id: string
  title: string
  description?: string
  machineId?: string
  status: 'open' | 'in_progress' | 'done' | 'closed'
  priority?: 'low' | 'medium' | 'high'
  createdAt: string
  closedAt?: string | null
  createdBy?: string
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | string
  content: string
  timestamp?: number
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
}

export interface SourceHit {
  documentName?: string
  pageNumber?: number
  excerpt?: string
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
  machineId?: string
  title: string
  summary: string
  createdAt: string
  createdBy?: string
}

export interface DebugSession {
  sessionId: string
  machineId?: string
  startedAt: string
  endedAt?: string
  technician?: string
  notes?: string
}

export type HistoryEvent = {
  id: string
  type: 'workorder' | 'report' | 'debug'
  date: string
  title: string
  actor?: string
  summary?: string
}
