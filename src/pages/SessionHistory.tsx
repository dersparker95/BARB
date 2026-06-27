import React, { useEffect, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import ChatBubble from '../components/ChatBubble'

interface SavedSession {
  session_id: number
  title: string
  saved_by: string
  discipline: string
  plant_name: string
  machine_name: string
  created_at: string
  messages: any[]
}

export default function SessionHistory() {
  const { apiBase } = useAppContext()
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<SavedSession | null>(null)

  const apiRoot = (apiBase || 'https://barb-2ih8.onrender.com/api').replace(/\/$/, '')

  useEffect(() => {
    fetch(`${apiRoot}/chat-sessions`)
      .then(res => res.json())
      .then(data => {
        setSessions(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(err => {
        console.error("Error cargando historial:", err)
        setLoading(false)
      })
  }, [apiRoot])

  return (
    <div className="w-full h-full flex flex-col p-6 bg-[var(--bg)]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--ink)]">📚 Historial de Diagnósticos</h1>
        <p className="text-[var(--ink3)] text-sm mt-1">
          Registro de auditoría y consultas previas realizadas a la IA.
        </p>
      </div>

      <div className="flex flex-1 gap-6 min-h-0">
        {/* Panel Izquierdo: Tabla de Sesiones */}
        <div className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-[var(--ink3)]">Cargando memoria de BARB...</div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center text-[var(--ink3)]">No hay sesiones guardadas aún.</div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[var(--bg-body)] text-[var(--ink2)] sticky top-0">
                  <tr>
                    <th className="p-3 border-b border-[var(--border)] font-semibold">Fecha</th>
                    <th className="p-3 border-b border-[var(--border)] font-semibold">Título / Problema</th>
                    <th className="p-3 border-b border-[var(--border)] font-semibold">Técnico</th>
                    <th className="p-3 border-b border-[var(--border)] font-semibold">Equipo</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(session => (
                    <tr 
                      key={session.session_id} 
                      onClick={() => setSelectedSession(session)}
                      className={`cursor-pointer transition-colors border-b border-[var(--border)] last:border-0 ${
                        selectedSession?.session_id === session.session_id 
                          ? 'bg-[var(--blue-bg)]' 
                          : 'hover:bg-[var(--bg-body)]'
                      }`}
                    >
                      <td className="p-3 text-[var(--ink2)] whitespace-nowrap">
                        {new Date(session.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 font-medium text-[var(--ink)]">
                        {session.title}
                      </td>
                      <td className="p-3 text-[var(--ink2)]">{session.saved_by || 'Operador'}</td>
                      <td className="p-3 text-[var(--ink2)]">
                        {session.machine_name || session.discipline || 'General'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel Derecho: Visor de Conversación */}
        {selectedSession && (
          <div className="w-[450px] bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col shadow-sm">
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-start bg-[var(--bg-body)] rounded-t-xl">
              <div>
                <h3 className="font-bold text-[var(--ink)] text-lg">{selectedSession.title}</h3>
                <div className="text-xs text-[var(--ink3)] mt-1 flex gap-2">
                  <span>📍 {selectedSession.plant_name || 'Planta'}</span>
                  <span>⚙️ {selectedSession.machine_name || 'General'}</span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedSession(null)}
                className="text-[var(--ink3)] hover:text-[var(--red)] transition-colors p-1"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[var(--bg)]">
              {Array.isArray(selectedSession.messages) && selectedSession.messages.map((msg, idx) => (
                <ChatBubble 
                  key={idx} 
                  msg={{ ...msg, content: msg.content, timestamp: msg.timestamp || Date.now() }} 
                  side={msg.role === 'user' ? 'user' : 'bot'} 
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}