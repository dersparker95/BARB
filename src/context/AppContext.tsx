import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { AppContextValue, Message, Role, User } from '../types'
import createApiService from '../services/api'

// === LÓGICA DE PERSISTENCIA DE SESIÓN (De tu HEAD) ===
type StoredAuth = {
  user: Pick<User, 'id' | 'name' | 'role'>
  token: string
  savedAt: number
}

const AUTH_STORAGE_KEY = 'barb.auth'

const safeParseJson = (txt: string | null): unknown => {
  if (!txt) return null
  try {
    return JSON.parse(txt) as unknown
  } catch {
    return null
  }
}

const readStoredString = (key: string, fallback: string | null) => {
  if (typeof window === 'undefined') return fallback
  const value = window.localStorage.getItem(key)
  return value === null ? fallback : value
}

const readStoredBoolean = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback
  const value = window.localStorage.getItem(key)
  if (value === null) return fallback
  return value === 'true'
}

const readStoredAuth = (): StoredAuth | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  const parsed = safeParseJson(raw)
  if (!parsed || typeof parsed !== 'object') {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }

  const obj = parsed as Partial<StoredAuth>
  const isValidRole = obj.user?.role === 'gerente' || obj.user?.role === 'admin' || obj.user?.role === 'tecnico'
  const isValidUser = Boolean(obj.user?.id && obj.user?.name && isValidRole)
  const isValidToken = typeof obj.token === 'string' && obj.token.trim().length > 0
  const isValidSavedAt = typeof obj.savedAt === 'number' && Number.isFinite(obj.savedAt)

  if (!isValidUser || !isValidToken || !isValidSavedAt) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }

  return obj as StoredAuth
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

// === ESTADO POR DEFECTO UNIFICADO ===
const defaultState = {
  currentScreen: 'login',
  dark: false,
  lang: 'es',
  discipline: null as string | null,
  docMachine: 'all',
  plant: 'plant1',
  selectedMachine: null as string | null,
  sessionId: null as string | null,
  sessionStart: null as number | null,
  docMessages: [] as Message[],
  // Estado rescatado de Benja para las pantallas de máquinas:
  debugMessagesByMachine: {} as Record<string, Message[]>,
  user: null as User | null,
  apiBase: ((import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api') as string,
  lmBase: ((import.meta.env.VITE_LM_STUDIO_URL as string | undefined) ?? (import.meta.env.VITE_LM_BASE as string | undefined) ?? '/lm') as string,
  loading: false,
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState<string>(
    () => readStoredString('barb.currentScreen', defaultState.currentScreen) ?? defaultState.currentScreen,
  )
  const [dark, setDark] = useState<boolean>(() => readStoredBoolean('barb.dark', defaultState.dark))
  const [lang, setLang] = useState<string>(() => readStoredString('barb.lang', defaultState.lang) ?? defaultState.lang)
  const [discipline, setDiscipline] = useState<string | null>(() => readStoredString('barb.discipline', defaultState.discipline))
  const [docMachine, setDocMachine] = useState<string>(() => readStoredString('barb.docMachine', defaultState.docMachine) ?? defaultState.docMachine)
  const [plant, setPlant] = useState<string>(() => readStoredString('barb.plant', defaultState.plant) ?? defaultState.plant)
  const [selectedMachine, setSelectedMachine] = useState<string | null>(
    () => readStoredString('barb.selectedMachine', defaultState.selectedMachine),
  )

  const [sessionId, setSessionId] = useState<string | null>(defaultState.sessionId)
  const [sessionStart, setSessionStart] = useState<number | null>(defaultState.sessionStart)
  const [docMessages, setDocMessages] = useState<Message[]>(defaultState.docMessages)
  
  // Estado de mensajes por máquina rescatado de Benja
  const [debugMessagesByMachine, setDebugMessagesByMachine] = useState<Record<string, Message[]>>(defaultState.debugMessagesByMachine)

  // Autenticación segura de tu HEAD
  const [user, setUser] = useState<User | null>(() => {
    const stored = readStoredAuth()
    if (!stored) return defaultState.user
    return {
      id: stored.user.id,
      name: stored.user.name,
      role: stored.user.role as Role,
      token: stored.token,
    }
  })

  const [apiBase, setApiBase] = useState<string>(defaultState.apiBase)
  const [lmBase, setLmBase] = useState<string>(defaultState.lmBase)
  const [loading, setLoading] = useState<boolean>(defaultState.loading)

  const pushDocMessage = useCallback((m: Message) => setDocMessages(prev => [...prev, m]), [])
  const clearDocMessages = useCallback(() => setDocMessages([]), [])
  
  // Funciones adaptadas para soportar el formato de Benja
  const getDebugMessages = useCallback((machineId: string | null | undefined) => {
    if (!machineId) return []
    return debugMessagesByMachine[machineId] ?? []
  }, [debugMessagesByMachine])
  
  const pushDebugMessage = useCallback((machineId: string, m: Message) => {
    if (!machineId) return
    setDebugMessagesByMachine(prev => {
      const current = prev[machineId] ?? []
      return { ...prev, [machineId]: [...current, m] }
    })
  }, [])

  const authService = useMemo(() => createApiService(apiBase, lmBase), [apiBase, lmBase])

  const persistAuth = useCallback((next: User | null) => {
    if (typeof window === 'undefined') return
    if (!next || !next.token) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return
    }
    const payload: StoredAuth = {
      user: { id: next.id, name: next.name, role: next.role },
      token: next.token,
      savedAt: Date.now(),
    }
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload))
  }, [])

  useEffect(() => {
    persistAuth(user)
  }, [user, persistAuth])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('barb.currentScreen', currentScreen)
  }, [currentScreen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('barb.dark', String(dark))
  }, [dark])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('barb.lang', lang)
  }, [lang])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (discipline) window.localStorage.setItem('barb.discipline', discipline)
    else window.localStorage.removeItem('barb.discipline')
  }, [discipline])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('barb.docMachine', docMachine)
  }, [docMachine])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('barb.plant', plant)
  }, [plant])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (selectedMachine) window.localStorage.setItem('barb.selectedMachine', selectedMachine)
    else window.localStorage.removeItem('barb.selectedMachine')
  }, [selectedMachine])

  const logout = useCallback(async () => {
    setLoading(true)
    try {
      await authService.auth.logout()
    } catch {
      // Logout local incluso si falla backend
    } finally {
      setUser(null)
      setLoading(false)
    }
  }, [authService])

  const login = useCallback(
    async (params: { email: string; password: string }) => {
      setLoading(true)
      try {
        const resp = await authService.auth.login(params.email, params.password)
        const nextUser: User = {
          id: String(resp.user?.id ?? Date.now()), 
          name: resp.user?.name ?? params.email,
          role: (resp.user?.role as Role) ?? 'tecnico',
          token: String(resp.token ?? 'session-token-valid'), 
        }
        setUser(nextUser)
        return nextUser
      } finally {
        setLoading(false)
      }
    },
    [authService],
  )
  const value: AppContextValue = {
    currentScreen,
    dark,
    lang,
    discipline,
    docMachine,
    plant,
    selectedMachine,
    sessionId,
    sessionStart,
    docMessages,
    debugMessagesByMachine,
    getDebugMessages,
    user,
    apiBase,
    lmBase,
    loading,
    setCurrentScreen,
    setDark,
    setLang,
    setDiscipline,
    setDocMachine,
    setPlant,
    setSelectedMachine,
    setSessionId,
    setSessionStart,
    pushDocMessage,
    clearDocMessages,
    pushDebugMessage,
    setUser,
    setApiBase,
    setLmBase,
    setLoading,
  }

  ;(value as AppContextValue & { login?: typeof login; logout?: typeof logout }).login = login
  ;(value as AppContextValue & { login?: typeof login; logout?: typeof logout }).logout = logout

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useAppContext = (): AppContextValue => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
