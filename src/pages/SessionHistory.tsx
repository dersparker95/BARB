// =============================================================================
// IMPORTS
// =============================================================================

import React, { useEffect, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import ChatBubble from '../components/ChatBubble'

// =============================================================================
// TIPOS
// =============================================================================

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

// =============================================================================
// COMPONENTE PRINCIPAL: SESSION HISTORY
// =============================================================================

export default function SessionHistory() {
  // ---------------------------------------------------------------------
  // Estados
  // ---------------------------------------------------------------------

  const { api } = useAppContext()
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<SavedSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ---------------------------------------------------------------------
  // Efectos
  // ---------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    api.chat.getSessions()
      .then((data: any) => {
        if (cancelled) return
        setSessions(Array.isArray(data) ? data : [])
      })
      .catch((err: any) => {
        if (cancelled) return
        console.error("Error cargando historial:", err)
        // permisos.py restringe /api/chat-sessions a supervisor/gerente/admin;
        // si alguien llega acá sin ese rol (ej. por URL directa), el mensaje
        // real del backend dice "El rol '...' no tiene acceso a 'history'."
        setError(err?.message || 'No se pudo cargar el historial de sesiones.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [api])

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

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
          ) : error ? (
            <div className="sh-empty">⚠️ {error}</div>
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