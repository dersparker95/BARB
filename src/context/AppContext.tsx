// @ts-nocheck
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { AppContextValue, Message, Role, User } from '../types'
import { createApiService } from '../services/api'

// === LÓGICA DE PERSISTENCIA DE SESIÓN ===
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
  if (!obj.user?.id || !obj.token || !obj.savedAt) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
  return obj as StoredAuth
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

// === VARIABLES DE ENTORNO DINÁMICAS ===
const defaultApiUrl: string = import.meta.env.VITE_API_URL || 'https://barb-2ih8.onrender.com/api'
const defaultLmUrl: string = import.meta.env.VITE_LM_URL || 'http://localhost:1234/v1'

const isLocalUrl = (url: string): boolean =>
  url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')

const isProduction: boolean =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'

/**
 * Resuelve la URL base de la API desde localStorage descartando valores de localhost
 * en entornos de producción, lo que evita que URLs residuales de desarrollo rompan
 * la app desplegada en Vercel.
 */
const resolveApiBase = (): string => {
  if (typeof window === 'undefined') return defaultApiUrl
  const stored = window.localStorage.getItem('barb.apiBase')
  if (stored && isProduction && isLocalUrl(stored)) {
    window.localStorage.removeItem('barb.apiBase')
    return defaultApiUrl
  }
  return stored ?? defaultApiUrl
}

const resolveLmBase = (): string => {
  if (typeof window === 'undefined') return defaultLmUrl
  // lmBase puede ser localhost legítimamente (LM Studio local), no se filtra.
  return window.localStorage.getItem('barb.lmBase') ?? defaultLmUrl
}

// === ESTADO POR DEFECTO ===
const defaultState = {
  currentScreen: 'dashboard', 
  dark: false,
  lang: 'es',
  discipline: null as string | null,
  docMachine: 'all',
  plant: 'plant1',
  selectedMachine: null as string | null,
  sessionId: null as string | null,
  sessionStart: null as number | null,
  docMessages: [] as Message[],
  debugMessagesByMachine: {} as Record<string, Message[]>,
  loading: false,
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- ESTADOS BASE ---
  const [currentScreen, setCurrentScreen] = useState<string>(() => readStoredString('barb.currentScreen', defaultState.currentScreen) ?? defaultState.currentScreen)
  const [dark, setDark] = useState<boolean>(() => readStoredBoolean('barb.dark', defaultState.dark))
  const [lang, setLang] = useState<string>(() => readStoredString('barb.lang', defaultState.lang) ?? defaultState.lang)
  const [discipline, setDiscipline] = useState<string | null>(() => readStoredString('barb.discipline', defaultState.discipline))
  const [docMachine, setDocMachine] = useState<string>(() => readStoredString('barb.docMachine', defaultState.docMachine) ?? defaultState.docMachine)
  const [plant, setPlant] = useState<string>(() => readStoredString('barb.plant', defaultState.plant) ?? defaultState.plant)
  const [selectedMachine, setSelectedMachine] = useState<string | null>(() => readStoredString('barb.selectedMachine', defaultState.selectedMachine))
  const [sessionId, setSessionId] = useState<string | null>(defaultState.sessionId)
  const [sessionStart, setSessionStart] = useState<number | null>(defaultState.sessionStart)
  
  // --- ESTADOS DE CHAT E IA ---
  const [docMessages, setDocMessages] = useState<Message[]>(defaultState.docMessages)
  const [debugMessagesByMachine, setDebugMessagesByMachine] = useState<Record<string, Message[]>>(defaultState.debugMessagesByMachine)
  const [loading, setLoading] = useState<boolean>(defaultState.loading)

  // Estados dinámicos para las URLs. Se resuelven con guards que descartan
  // valores de localStorage inválidos para el entorno actual.
  const [apiBase, setApiBase] = useState<string>(resolveApiBase)
  const [lmBase, setLmBase] = useState<string>(resolveLmBase)

  // API Dinámica: Se reconstruye sola si el usuario cambia la URL en Configuración
  const authService = useMemo(() => createApiService(apiBase), [apiBase])

  // --- AUTENTICACIÓN ---
  const [user, setUser] = useState<User | null>(() => {
    const stored = readStoredAuth()
    if (!stored) return null
    return {
      id: stored.user.id,
      name: stored.user.name,
      role: stored.user.role as Role,
      token: stored.token,
    }
  })

  // --- LÓGICA DE MENSAJES ---
  const pushDocMessage = useCallback((msg: Message) => {
    setDocMessages((prev) => [...prev, msg])
  }, [])

  const clearDocMessages = useCallback(() => {
    setDocMessages([])
  }, [])

  const appendToLastDocMessage = useCallback((chunk: string, sources?: any[]) => {
    setDocMessages((prev) => {
      if (prev.length === 0) return prev;
      const lastMsg = { ...prev[prev.length - 1] };
      if (lastMsg.role !== 'bot') return prev;

      lastMsg.content += chunk;
      
      // Adaptado para funcionar perfecto con el componente ChatBubble blindado
      if (sources && sources.length > 0) {
        lastMsg.sources = sources.map(s => {
          // Si ya viene como objeto, lo dejamos. Si viene como string, lo parseamos.
          if (typeof s === 'string') return { documentName: s, pageNumber: '' }
          return s
        });
      }
      return [...prev.slice(0, -1), lastMsg];
    });
  }, []);

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

  // --- EFECTOS DE PERSISTENCIA ---
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!user || !user.token) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return
    }
    const payload: StoredAuth = {
      user: { id: user.id, name: user.name, role: user.role },
      token: user.token,
      savedAt: Date.now(),
    }
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload))
  }, [user])

  useEffect(() => { if (typeof window !== 'undefined') window.localStorage.setItem('barb.currentScreen', currentScreen) }, [currentScreen])
  useEffect(() => { if (typeof window !== 'undefined') window.localStorage.setItem('barb.dark', String(dark)) }, [dark])
  useEffect(() => { if (typeof window !== 'undefined') window.localStorage.setItem('barb.lang', lang) }, [lang])
  
  // Persiste las URLs solo si son válidas para el entorno actual.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isProduction && isLocalUrl(apiBase)) return
    window.localStorage.setItem('barb.apiBase', apiBase)
  }, [apiBase])
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('barb.lmBase', lmBase)
  }, [lmBase])

  useEffect(() => { if (typeof window !== 'undefined') { if (discipline) window.localStorage.setItem('barb.discipline', discipline); else window.localStorage.removeItem('barb.discipline') } }, [discipline])
  useEffect(() => { if (typeof window !== 'undefined') { if (selectedMachine) window.localStorage.setItem('barb.selectedMachine', selectedMachine); else window.localStorage.removeItem('barb.selectedMachine') } }, [selectedMachine])

  // --- FUNCIONES DE AUTH ---
  const login = useCallback(async (params: { email: string; password: string }) => {
    setLoading(true)
    try {
      const resp = await authService.auth.login(params.email, params.password)
      const nextUser: User = {
        id: String(resp.user?.id), 
        name: resp.user?.name,
        role: resp.user?.role as Role,
        token: resp.token, 
      }
      setUser(nextUser)
      setCurrentScreen('dashboard') 
      return nextUser
    } finally {
      setLoading(false)
    }
  }, [authService])

  const logout = useCallback(async () => {
    setLoading(true)
    try {
      await authService.auth.logout()
    } catch {
      // Ignorar fallo de red
    } finally {
      setUser(null)
      setCurrentScreen('login')
      setLoading(false)
    }
  }, [authService])

  const value: AppContextValue = {
    currentScreen, setCurrentScreen,
    dark, setDark,
    lang, setLang,
    discipline, setDiscipline,
    docMachine, setDocMachine,
    plant, setPlant,
    selectedMachine, setSelectedMachine,
    sessionId, setSessionId,
    sessionStart, setSessionStart,
    docMessages, pushDocMessage, clearDocMessages, appendToLastDocMessage,
    debugMessagesByMachine, getDebugMessages, pushDebugMessage,
    user, setUser, login, logout,
    apiBase, setApiBase,  // 🚀 ¡Agregados!
    lmBase, setLmBase,    // 🚀 ¡Agregados!
    loading, setLoading,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useAppContext = (): AppContextValue => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}