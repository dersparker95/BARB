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

  // ⚠️ FIX: se elimina el dominio de Render hardcodeado (mismo patrón corregido
  // en AppContext.tsx/Dashboard.tsx/api.ts). apiBase ya viene resuelto del
  // contexto (incluye el fallback a VITE_API_URL).
  const apiRoot = (apiBase || '').replace(/\/$/, '')

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
    <div className="sh-page">
      <div className="sh-header">
        <h1 className="sh-title">📚 Historial de Diagnósticos</h1>
        <p className="sh-subtitle">
          Registro de auditoría y consultas previas realizadas a la IA.
        </p>
      </div>

      <div className="sh-layout">
        {/* Panel Izquierdo: Tabla de Sesiones */}
        <div className="sh-table-panel">
          {loading ? (
            <div className="sh-empty">Cargando memoria de BARB...</div>
          ) : sessions.length === 0 ? (
            <div className="sh-empty">No hay sesiones guardadas aún.</div>
          ) : (
            <div className="sh-table-scroll">
              <table className="sh-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Título / Problema</th>
                    <th>Técnico</th>
                    <th>Equipo</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(session => (
                    <tr
                      key={session.session_id}
                      onClick={() => setSelectedSession(session)}
                      className={selectedSession?.session_id === session.session_id ? 'active' : ''}
                    >
                      <td className="sh-td-date">
                        {new Date(session.created_at).toLocaleDateString()}
                      </td>
                      <td className="sh-td-title">
                        {session.title}
                      </td>
                      <td>{session.saved_by || 'Operador'}</td>
                      <td>
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
          <div className="sh-detail-panel">
            <div className="sh-detail-header">
              <div>
                <h3 className="sh-detail-title">{selectedSession.title}</h3>
                <div className="sh-detail-meta">
                  <span>📍 {selectedSession.plant_name || 'Planta'}</span>
                  <span>⚙️ {selectedSession.machine_name || 'General'}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="sh-detail-close"
              >
                ✕
              </button>
            </div>

            <div className="sh-detail-messages">
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