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

// 🔥 BLINDAJE DE URL: Evitamos el error 404 por dobles barras (//)
const joinPath = (base: string, path: string) => {
  const cleanBase = base.replace(/\/$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${cleanBase}${cleanPath}`
}

async function callAPI<T>(base: string, path: string, opts?: RequestInit): Promise<T> {
  const url = joinPath(base, path)
  const headers = { 'Content-Type': 'application/json', ...(opts?.headers as Record<string, string>) }
  
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

// 🌐 Única fuente de la verdad para las URLs
export const createApiService = (
 apiBase = 'https://barb-2ih8.onrender.com/api',
  lmBase = import.meta.env.VITE_LM_URL || 'http://localhost:1234/v1'
) => {
  return {
    auth: {
      login: async (email: string, password: string) =>
        callAPI<AuthLoginResponse>(apiBase, '/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }),
      logout: async () => callAPI<void>(apiBase, '/auth/logout', { method: 'POST' }),
    },
    health: async () => callAPI<any>(apiBase, '/health', { method: 'GET' }),
    
    // 🏭 CATÁLOGOS Y TOPOLOGÍA
    disciplines: async (plantId?: string) =>
      callAPI<any>(apiBase, `/disciplines${plantId ? `?plantId=${encodeURIComponent(plantId)}` : ''}`, {
        method: 'GET',
      }),
    plants: async () => callAPI<any>(apiBase, '/plants', { method: 'GET' }),
    machines: async () => callAPI<any>(apiBase, '/machines', { method: 'GET' }),
    technicians: async () => callAPI<any>(apiBase, '/technicians', { method: 'GET' }),
    topologia: async () => callAPI<any>(apiBase, '/topologia', { method: 'GET' }),
    
    chat: {
      // 🔥 FIX IDIOMAS: `language` ahora es un parámetro dinámico, se acabó el hardcodeo
      askRAG: async (message: string, machineId?: string, history: any[] = [], language: string = 'en') => 
        callAPI<any>(apiBase, '/chat', { 
          method: 'POST', 
          body: JSON.stringify({ message, machine: machineId, language, history }) 
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
          headers: { 'Content-Type': 'application/json' },
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
          body: formData, 
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      }
    },
    
    // 📋 BLOQUE DE ÓRDENES DE TRABAJO
    workOrders: {
      getAll: async () => callAPI<any>(apiBase, '/work-orders', { method: 'GET' }),
      
      create: async (payload: any) => 
        callAPI<any>(apiBase, '/work-orders', { 
          method: 'POST', 
          body: JSON.stringify(payload) 
        }),
        
      updateStatus: async (orderId: number | string, status: string) =>
        callAPI<any>(apiBase, `/work-orders/${orderId}/status`, {
          method: 'PATCH', // Corregido de PUT a PATCH para seguir estándares REST
          body: JSON.stringify({ status })
        })
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