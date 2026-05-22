import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { User, AppContextValue, Message } from '../types'

const defaultState = {
  currentScreen: 'login',
  dark: false,
  lang: 'es',
  discipline: null,
  docMachine: 'all',
  plant: 'plant1',
  selectedMachine: null,
  sessionId: null,
  sessionStart: null,
  docMessages: [] as Message[],
  debugMessagesByMachine: {} as Record<string, Message[]>,
  user: null,
  apiBase:
    (import.meta.env.VITE_API_URL as string | undefined) ??
    (import.meta.env.VITE_API_BASE as string | undefined) ??
    'http://localhost:9000/api',
  lmBase:
    (import.meta.env.VITE_LM_STUDIO_URL as string | undefined) ??
    (import.meta.env.VITE_LM_BASE as string | undefined) ??
    '/lm',
  loading: false,
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

const AppContext = createContext<AppContextValue | undefined>(undefined)

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState<string>(() => readStoredString('barb.currentScreen', defaultState.currentScreen) ?? defaultState.currentScreen)
  const [dark, setDark] = useState<boolean>(() => readStoredBoolean('barb.dark', defaultState.dark))
  const [lang, setLang] = useState<string>(() => readStoredString('barb.lang', defaultState.lang) ?? defaultState.lang)
  const [discipline, setDiscipline] = useState<string | null>(() => readStoredString('barb.discipline', defaultState.discipline))
  const [docMachine, setDocMachine] = useState<string>(() => readStoredString('barb.docMachine', defaultState.docMachine) ?? defaultState.docMachine)
  const [plant, setPlant] = useState<string>(() => readStoredString('barb.plant', defaultState.plant) ?? defaultState.plant)
  const [selectedMachine, setSelectedMachine] = useState<string | null>(() => readStoredString('barb.selectedMachine', defaultState.selectedMachine))
  const [sessionId, setSessionId] = useState<string | null>(defaultState.sessionId)
  const [sessionStart, setSessionStart] = useState<number | null>(defaultState.sessionStart)
  const [docMessages, setDocMessages] = useState<Message[]>(defaultState.docMessages)
  const [debugMessagesByMachine, setDebugMessagesByMachine] = useState<Record<string, Message[]>>(defaultState.debugMessagesByMachine)
  const [user, setUser] = useState<User | null>(defaultState.user)
  const [apiBase, setApiBase] = useState<string>(defaultState.apiBase)
  const [lmBase, setLmBase] = useState<string>(defaultState.lmBase)
  const [loading, setLoading] = useState<boolean>(defaultState.loading)

  const pushDocMessage = useCallback((m: Message) => setDocMessages(prev => [...prev, m]), [])
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
    pushDebugMessage,
    setUser,
    setApiBase,
    setLmBase,
    setLoading,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useAppContext = (): AppContextValue => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
