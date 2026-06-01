import { WorkOrder, User, Message, Role } from '../types'

export type AuthLoginResponse = {
  token: string
  user: {
    id: string | number
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

// 🌐 Única fuente de la verdad para las URLs
export const createApiService = (
  apiBase = import.meta.env.VITE_API_URL || 'http://localhost:9000/api'
) => {
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
    machines: async () => callAPI<any>(apiBase, '/machines', { method: 'GET' }),
    technicians: async () => callAPI<any>(apiBase, '/technicians', { method: 'GET' }),
    
    chat: {
      askRAG: async (message: string, machineId?: string, history: any[] = []) => 
        callAPI<any>(apiBase, '/chat', { 
          method: 'POST', 
          body: JSON.stringify({ message, machine: machineId, language: "es", history }) 
        }),
        
      // NUEVO: Función para leer texto en tiempo real
      askRAGStream: async (
        message: string, 
        machineId: string | undefined, 
        history: any[], 
        onChunk: (text: string) => void,
        onSources: (sources: string[]) => void
      ) => {
        const res = await fetch(`${apiBase}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, machine: machineId, language: "es", history })
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
          buffer = lines.pop() || ''; // Guardar línea incompleta en buffer
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6).trim();
              if (dataStr === '[DONE]') continue;
              try {
                const data = JSON.parse(dataStr);
                if (data.type === 'chunk') onChunk(data.content);
                if (data.type === 'sources') onSources(data.content);
              } catch (e) {
                // Ignorar fragmentos JSON rotos
              }
            }
          }
        }
      },
      documents: async (payload: any) => callAPI<any>(apiBase, '/documents/upload', { method: 'POST', body: JSON.stringify(payload) }),
    },
    
    // 📋 BLOQUE DE ÓRDENES DE TRABAJO (Conexión real al backend)
    workOrders: {
      getAll: async () => callAPI<any>(apiBase, '/work-orders', { method: 'GET' }),
      create: async (formData: FormData) => {
        // Para FormData no enviamos 'Content-Type: application/json', el navegador lo auto-asigna
        const res = await fetch(`${apiBase}/work-orders`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      }
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