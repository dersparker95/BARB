import { WorkOrder, User, Message, Role } from '../types'

export type AuthLoginResponse = {
  status: string
  access_token: string
  token_type: string
  user: {
    id: string
    name: string
    role: Role
  }
}

async function callAPI<T>(base: string, path: string, opts?: RequestInit): Promise<T> {
  const url = base + path
  const headers = { 'Content-Type': 'application/json', ...(opts?.headers as any) }
  const res = await fetch(url, { credentials: 'include', ...opts, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || res.statusText)
  }
  const txt = await res.text()
  try {
    return JSON.parse(txt) as T
  } catch {
    return (txt as unknown) as T
  }
}

export const createApiService = (apiBase = 'http://localhost:9000/api', lmBase = '/lm') => {
  return {
    auth: {
      login: async (email: string, password: string) =>
        callAPI<AuthLoginResponse>(apiBase, '/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }),
      logout: async () => callAPI<any>(apiBase, '/auth/logout', { method: 'POST' }),
    },
    health: async () => callAPI<any>(apiBase, '/health', { method: 'GET' }),
    disciplines: async (plantId?: string) =>
      callAPI<any>(apiBase, `/disciplines${plantId ? `?plantId=${encodeURIComponent(plantId)}` : ''}`, {
        method: 'GET',
      }),
    plants: async () => callAPI<any>(apiBase, '/plants', { method: 'GET' }),
    chat: {
      documents: async (payload: any) => callAPI<any>(apiBase, '/chat/documents', { method: 'POST', body: JSON.stringify(payload) }),
      debug: async (payload: any) => callAPI<any>(apiBase, '/chat/debug', { method: 'POST', body: JSON.stringify(payload) }),
    },
    debug: {
      startSession: async (payload: any) => callAPI<any>(apiBase, '/debug/sessions', { method: 'POST', body: JSON.stringify(payload) }),
    },
    reports: {
      send: async (payload: any) => callAPI<any>(apiBase, '/reports/debug', { method: 'POST', body: JSON.stringify(payload) }),
      upload: async (payload: any) => callAPI<any>(apiBase, '/reports/upload', { method: 'POST', body: JSON.stringify(payload) }),
    },
    user: {
      savePreferences: async (payload: any) => callAPI<any>(apiBase, '/user/preferences', { method: 'PUT', body: JSON.stringify(payload) }),
    },
    lmBase,
  }
}

export type ApiService = ReturnType<typeof createApiService>

export default createApiService
