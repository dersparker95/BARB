// @ts-nocheck
import { WorkOrder, User, Message, Role } from '../types'

export type AuthLoginResponse = {
  token: string
  user: {
    id: string | number
    name: string
    role: Role
  }
}

// 🔐 TOKEN DE SESIÓN: se guarda tras el login y se adjunta a cada request protegido.
const TOKEN_KEY = 'barb_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

// 🔥 BLINDAJE DE URL: Evitamos el error 404 por dobles barras (//)
// y normalizamos el prefijo /api sin importar si VITE_API_URL ya lo incluye o no.
const joinPath = (base: string, path: string) => {
  const cleanBase = base.replace(/\/$/, '')
  const baseWithApi = cleanBase.endsWith('/api') ? cleanBase : `${cleanBase}/api`
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${baseWithApi}${cleanPath}`
}

async function callAPI<T>(base: string, path: string, opts?: RequestInit): Promise<T> {
  const url = joinPath(base, path)
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts?.headers as Record<string, string>),
  }
  
  const res = await fetch(url, { credentials: 'include', ...opts, headers })
  
  if (!res.ok) {
    // 🔥 FASE 1: Intercepción de sesión expirada (401)
    if (res.status === 401) {
      console.warn("⚠️ Sesión expirada o inválida. Forzando cierre de sesión...")
      clearToken()
      // Redirigimos al login solo si no estamos ya en esa pantalla
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }

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

// 🌐 Única fuente de la verdad para las URLs
export const createApiService = (
 // ⚠️ FIX: se elimina el dominio de Render hardcodeado (mismo problema ya
 // corregido en AppContext.tsx/Dashboard.tsx). apiBase normalmente llega
 // como argumento explícito desde AppContext; este default solo aplica si
 // alguien instancia createApiService() sin argumentos.
 apiBase = import.meta.env.VITE_API_URL || '',
  lmBase = import.meta.env.VITE_LM_URL || 'http://localhost:1234/v1'
) => {
  return {
    auth: {
      login: async (email: string, password: string) => {
        const data = await callAPI<AuthLoginResponse>(apiBase, '/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
        setToken(data.token)
        return data
      },
      logout: async () => {
        try {
          await callAPI<void>(apiBase, '/auth/logout', { method: 'POST' })
        } finally {
          clearToken()
        }
      },
    },
    health: async () => callAPI<any>(apiBase, '/health', { method: 'GET' }),
    
    // 🏭 CATÁLOGOS Y TOPOLOGÍA
    disciplines: async (plantId?: string) =>
      callAPI<any>(apiBase, `/disciplines${plantId ? `?plantId=${encodeURIComponent(plantId)}` : ''}`, {
        method: 'GET',
      }),
    plants: async () => callAPI<any>(apiBase, '/plants', { method: 'GET' }),
    machines: async (opts?: RequestInit) => callAPI<any>(apiBase, '/machines', { method: 'GET', ...opts }),
    technicians: async () => callAPI<any>(apiBase, '/technicians', { method: 'GET' }),
    topologia: async () => callAPI<any>(apiBase, '/topologia', { method: 'GET' }),
    
    chat: {
      // 🔥 FIX IDIOMAS: `language` ahora es un parámetro dinámico, se acabó el hardcodeo
      askRAG: async (message: string, machineId?: string, history: any[] = [], language: string = 'en') => 
        callAPI<any>(apiBase, '/chat', { 
          method: 'POST', 
          body: JSON.stringify({ message, machine: machineId, language, history }) 
        }),
      
      // ✅ NUEVO: Soporte completo para el nuevo DocChat (manual activo e imágenes)
      send: async (payload: { message: string, language: string, machine?: string | null, history?: any[], active_manual?: string | null, images?: string[] }) =>
        callAPI<any>(apiBase, '/chat', {
          method: 'POST',
          body: JSON.stringify(payload)
        }),
        
      askRAGStream: async (
        message: string, 
        machineId: string | undefined, 
        history: any[], 
        language: string, // 🔥 Requerido para i18n
        onChunk: (text: string) => void,
        onSources: (sources: string[]) => void
      ) => {
        const res = await fetch(joinPath(apiBase, '/chat'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          },
          body: JSON.stringify({ message, machine: machineId, language, history })
        });

        if (!res.ok) throw new Error(await res.text());
        if (!res.body) throw new Error("Stream no disponible");

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; 
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6).trim();
              if (dataStr === '[DONE]') continue;
              try {
                const data = JSON.parse(dataStr);
                if (data.type === 'chunk') onChunk(data.content);
                if (data.type === 'sources') onSources(data.content);
              } catch (e) {
                // Ignorar fragmentos JSON rotos que a veces causan los Streams
              }
            }
          }
        }
      },

      // 🔥 FIX CRÍTICO: Añadido el endpoint de Debug que faltaba
      debug: async (payload: { sessionId: string | null, machineId: string, message: string, attachments: any[], sensorData: any }) =>
        callAPI<any>(apiBase, '/chat/debug', {
          method: 'POST',
          body: JSON.stringify(payload)
        }),
      
      // ✅ Envío de FormData nativo para subir archivos PDF
      documents: async (formData: FormData) => {
        const res = await fetch(joinPath(apiBase, '/documents/upload'), {
          method: 'POST',
          headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
          body: formData,
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      },

      // ✅ NUEVO: Guardar historial en la base de datos (PostgreSQL)
      saveSession: async (payload: any) =>
        callAPI<any>(apiBase, '/chat-sessions', {
          method: 'POST',
          body: JSON.stringify(payload)
        }),

      // ✅ NUEVO: Enviar sistema de votos (👍/👎)
      feedback: async (payload: { message_content: string, rating: string, context?: string }) =>
        callAPI<any>(apiBase, '/chat-feedback', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
    },
    
    // 📋 BLOQUE DE ÓRDENES DE TRABAJO
    workOrders: {
      getAll: async (opts?: RequestInit) => callAPI<any>(apiBase, '/work-orders', { method: 'GET', ...opts }),
      
      create: async (payload: any) => 
        callAPI<any>(apiBase, '/work-orders', { 
          method: 'POST', 
          body: JSON.stringify(payload) 
        }),
        
      updateStatus: async (orderId: number | string, status: string) =>
        callAPI<any>(apiBase, `/work-orders/${orderId}/status`, {
          // ⚠️ FIX: el backend expone @app.put("/api/work-orders/{numero_ot}/status"),
          // no PATCH. Con PATCH, cualquier código que use esta función recibía 405.
          method: 'PUT',
          body: JSON.stringify({ status })
        }),

      delete: async (orderId: number | string) =>
        callAPI<void>(apiBase, `/work-orders/${orderId}`, { method: 'DELETE' })
    },

    stats: {
      financialImpact: async (days?: number | 'all', opts?: RequestInit) =>
        callAPI<any>(
          apiBase,
          `/stats/financial-impact${days && days !== 'all' ? `?days=${days}` : ''}`,
          { method: 'GET', ...opts }
        ),
    },

    reports: {
      send: async (payload: any) => callAPI<any>(apiBase, '/reports/debug', { method: 'POST', body: JSON.stringify(payload) }),
    },
    user: {
      savePreferences: async (payload: any) => callAPI<any>(apiBase, '/user/preferences', { method: 'PUT', body: JSON.stringify(payload) }),
    }
  }
}

export type ApiService = ReturnType<typeof createApiService>
export default createApiService