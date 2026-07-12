// @ts-nocheck

// =============================================================================
// IMPORTS
// =============================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import ChatBubble, { Thinking } from '../components/ChatBubble'

// =============================================================================
// COMPONENTE PRINCIPAL: DEBUG CHAT
// =============================================================================

export default function DebugChat() {
  const { user, api, getDebugMessages, pushDebugMessage } = useAppContext()

  const location = useLocation()

  // ---------------------------------------------------------------------
  // Estados
  // ---------------------------------------------------------------------

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const [machines, setMachines] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [selectedMachineId, setSelectedMachineId] = useState(null)

  // Los mensajes viven en AppContext (debugMessagesByMachine), uno por
  // máquina, no en estado local — antes se usaba useState([]) acá mismo, lo
  // que perdía el chat al cambiar de equipo o navegar fuera de la pantalla,
  // y hacía que el historial nunca se sintiera "guardado" en ningún lado.
  const HISTORY_KEY = selectedMachineId || '_general'
  const messages = getDebugMessages(HISTORY_KEY)

  // Imágenes adjuntas pendientes de enviar en el próximo mensaje.
  // Cada item: { file: File, preview: string (object URL) }
  const [attachments, setAttachments] = useState([])

  // Estado del cierre de sesión de diagnóstico ("Finalizar Diagnóstico").
  const [diagnosisClosed, setDiagnosisClosed] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [severity, setSeverity] = useState('medium')

  const areaRef = useRef(null)
  const fileInputRef = useRef(null)

  // Identificador de la sesión de Debug actual, enviado en cada llamada a
  // /api/chat/debug (ChatDebugRequest.sessionId). Antes era un único
  // useRef fijo para todo el ciclo de vida del componente: si cambiabas de
  // máquina sin recargar la página, diagnosisClosed (de la máquina previa)
  // seguía en true y el input quedaba bloqueado para SIEMPRE, sin importar
  // qué equipo eligieras después. Ahora ambos se regeneran por máquina.
  const [sessionId, setSessionId] = useState(() =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `debug-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )

  useEffect(() => {
    setDiagnosisClosed(false)
    setFinalizing(false)
    setSessionId(
      (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `debug-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
  }, [selectedMachineId])

  // ---------------------------------------------------------------------
  // Efectos: carga de datos, navegación entrante y auto-scroll
  // ---------------------------------------------------------------------

  useEffect(() => {
    const fetchData = async () => {
      try {
        // api.machines()/api.workOrders.getAll() adjuntan el token de sesión
        // automáticamente, a diferencia de un fetch() manual.
        const [machRes, otRes] = await Promise.all([
          api.machines(),
          api.workOrders.getAll()
        ])
        if (machRes) setMachines(machRes)
        if (otRes) setWorkOrders(otRes.data || otRes)
      } catch (error) {
        console.error("Error cargando datos para Debug:", error)
      }
    }
    fetchData()
  }, [api])

  useEffect(() => {
    if (location.state && typeof location.state === 'object' && location.state.machineId) {
      setSelectedMachineId(String(location.state.machineId))
    }
  }, [location.state])

  useEffect(() => {
    if (areaRef.current) areaRef.current.scrollTop = areaRef.current.scrollHeight
  }, [messages])

  // Libera los object URLs de los adjuntos pendientes al desmontar,
  // para no filtrar memoria del navegador.
  useEffect(() => {
    return () => {
      attachments.forEach(a => URL.revokeObjectURL(a.preview))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------
  // Datos derivados
  // ---------------------------------------------------------------------

  const machineHistory = useMemo(() => {
    if (!selectedMachineId) return []
    return workOrders.filter(ot => String(ot.machineId ?? ot.machine_id) === String(selectedMachineId))
  }, [selectedMachineId, workOrders])

  const selectedMachine = machines.find(m => String(m.id ?? m.maquina_id) === String(selectedMachineId))

  // ---------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------

  const send = async () => {
    const query = input.trim()
    if ((!query && attachments.length === 0) || loading || diagnosisClosed) return

    const pendingAttachments = attachments

    setLoading(true)
    setInput('')
    setAttachments([])
    pushDebugMessage(HISTORY_KEY, {
      role: 'user',
      content: query,
      images: pendingAttachments.map(a => a.preview)
    })

    try {
      // Paso 1: si hay imágenes, se suben primero por separado (multipart)
      // vía api.chat.debugAttachments(). api.chat.debug() (ChatDebugRequest)
      // viaja siempre en JSON y no soporta multipart/archivos.
      let uploadedAttachments = []
      if (pendingAttachments.length > 0) {
        const formData = new FormData()
        formData.append('session_id', sessionId)
        if (selectedMachineId) formData.append('machine_id', selectedMachineId)
        pendingAttachments.forEach(a => formData.append('files', a.file, a.file.name))

        const uploadData = await api.chat.debugAttachments(formData)
        uploadedAttachments = uploadData?.attachments || []
      }

      // Paso 2: llamada real a /api/chat/debug vía el servicio centralizado,
      // que ya adjunta el token de sesión automáticamente.
      const data = await api.chat.debug({
        sessionId,
        machineId: selectedMachineId,
        message: query,
        attachments: uploadedAttachments,
        sensorData: null
      })

      if (data && data.reply) {
        pushDebugMessage(HISTORY_KEY, { role: 'assistant', content: data.reply })
      } else {
        pushDebugMessage(HISTORY_KEY, { role: 'assistant', content: '⚠️ Error de conexión con el motor de IA.' })
      }
    } catch (err) {
      pushDebugMessage(HISTORY_KEY, { role: 'assistant', content: '⚠️ Servidor inalcanzable.' })
    } finally {
      setLoading(false)
      pendingAttachments.forEach(a => URL.revokeObjectURL(a.preview))
    }
  }

  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const newAttachments = files
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({ file: f, preview: URL.createObjectURL(f) }))

    setAttachments(prev => [...prev, ...newAttachments])
    // Permite volver a seleccionar el mismo archivo si se remueve y reagrega.
    e.target.value = ''
  }

  const removeAttachment = (index) => {
    setAttachments(prev => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const finalizeDiagnosis = async () => {
    if (finalizing || diagnosisClosed || messages.length === 0) return

    // AppContext.login() setea user.id = String(resp.user?.id) (ver AppContext.tsx),
    // así que este es el campo confirmado, no una suposición defensiva.
    const maquinaId = selectedMachineId
    const tecnicoId = user?.id

    if (!maquinaId) return
    if (!tecnicoId) {
      pushDebugMessage(HISTORY_KEY, { role: 'assistant', content: '⚠️ No se pudo identificar al técnico de la sesión. Vuelve a iniciar sesión e intenta de nuevo.' })
      return
    }

    setFinalizing(true)
    try {
      const firstUserMessage = messages.find(m => m.role === 'user' && m.content?.trim())
      const summary = messages
        .map(m => `${m.role === 'user' ? 'Usuario' : 'IA'}: ${m.content}`)
        .join('\n')

      // Contrato real de /api/reports/debug: maquina_id y tecnico_id son
      // obligatorios, igual que issue_description; el resto es opcional.
      const payload = {
        maquina_id: maquinaId,
        tecnico_id: tecnicoId,
        issue_description: firstUserMessage?.content || 'Diagnóstico asistido por IA (sin descripción inicial).',
        severity,
        summary
      }

      // api.reports.send() ya apunta a /api/reports/debug y adjunta el token
      // de sesión automáticamente, igual que el resto de las llamadas de
      // esta pantalla (api.chat.debug, api.chat.feedback, api.machines...).
      const data = await api.reports.send(payload)

      pushDebugMessage(HISTORY_KEY, {
        role: 'assistant',
        content: `✅ Diagnóstico finalizado. Reporte ${data.report_number} generado correctamente.`
      })
      setDiagnosisClosed(true)
    } catch (err) {
      const detail = err?.message || err?.detail || 'No se pudo generar el reporte de diagnóstico.'
      pushDebugMessage(HISTORY_KEY, { role: 'assistant', content: `⚠️ ${detail}` })
    } finally {
      setFinalizing(false)
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  return (
    <div className="two-panel debug-shell">

      {isSidebarOpen && (
        <div
          className="debug-sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`panel-left debug-sidebar ${isSidebarOpen ? 'debug-sidebar--open' : ''}`}>
        <div className="debug-sidebar-mobile-header">
          <span className="debug-sidebar-mobile-title">Equipos</span>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="icon-btn"
          >
            ✕
          </button>
        </div>

        <div className="panel-section">
          <span className="panel-label">🛠️ Diagnóstico de Equipos</span>
          <p className="debug-sidebar-hint">Selecciona una máquina para analizar su patrón de fallas con IA.</p>

          <select
            className="form-select w-full"
            value={selectedMachineId || ''}
            onChange={e => setSelectedMachineId(e.target.value)}
          >
            <option value="">Seleccionar equipo...</option>
            {machines.map(m => (
              <option key={m.id || m.maquina_id} value={m.id || m.maquina_id}>{m.name || m.nombre}</option>
            ))}
          </select>
        </div>

        {selectedMachine && (
          <div className="panel-section debug-history">
            <span className="panel-label debug-history-label">Historial de OTs ({machineHistory.length})</span>
            <p className="debug-sidebar-hint">✓ Se envía automáticamente a la IA en cada mensaje, no hace falta seleccionarlo.</p>

            <div className="debug-history-list">
              {machineHistory.length === 0 ? (
                <div className="debug-history-empty">Este equipo no tiene historial de fallas reportadas.</div>
              ) : (
                machineHistory.map((ot, i) => (
                  <div key={i} className="debug-history-card">
                    <div className="debug-history-card-title">{ot.title || ot.numero_ot}</div>
                    <div className="debug-history-card-desc">{ot.description || ot.descripcion_problema || 'Sin descripción.'}</div>
                    <div className="debug-history-card-meta">
                      <span className="capitalize">{ot.status || ot.estado}</span>
                      <span>{ot.createdAt ? ot.createdAt.slice(0, 10) : ''}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="panel-right">
        <div className="topbar debug-topbar">
          <button
            type="button"
            className="icon-btn debug-sidebar-toggle"
            onClick={() => setIsSidebarOpen(true)}
            title="Seleccionar Equipo"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <div>
            <h2 className="topbar-title">Debug & Análisis Predictivo</h2>
            <p className="debug-topbar-sub">Analiza causas raíz y solicita sugerencias de mantenimiento.</p>
          </div>

          <div className="debug-finalize-group">
            <select
              className="form-select debug-severity-select"
              value={severity}
              onChange={e => setSeverity(e.target.value)}
              disabled={finalizing || diagnosisClosed}
              title="Severidad del reporte"
            >
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>

            <button
              type="button"
              onClick={finalizeDiagnosis}
              disabled={finalizing || diagnosisClosed || messages.length === 0}
              className="btn btn-outline debug-finalize-btn"
              title="Compila el resumen de la conversación y solicita el reporte"
            >
              {diagnosisClosed ? '✅ Diagnóstico Finalizado' : finalizing ? 'Generando reporte…' : '🏁 Finalizar Diagnóstico'}
            </button>
          </div>
        </div>

        <div className="chat-messages" ref={areaRef}>
          {messages.length === 0 ? (
            <div className="debug-empty-state">
              Escribe una pregunta directa, o selecciona un equipo en el panel lateral para que la IA use su historial de fallas automáticamente.
            </div>
          ) : (
            messages.map((msg, idx) => (
              <ChatBubble
                key={idx}
                msg={msg}
                side={msg.role === 'user' ? 'user' : 'bot'}
                onFeedback={(msgData, rating) => {
                  // api.chat.feedback() adjunta el token automáticamente y ya
                  // apunta a /api/chat-feedback; no hace falta un fetch manual
                  // ni recuperar el token de localStorage a mano — `api` es
                  // una referencia estable (useMemo en AppContext), así que
                  // sigue disponible sin importar cuándo dispare el callback.
                  api.chat.feedback({
                    message_content: msgData.content,
                    rating,
                    context: selectedMachine?.name || selectedMachine?.nombre || 'Debug General'
                  }).catch(err => console.error("Error enviando feedback:", err));
                }}
              />
            ))
          )}
          {loading && <div className="mt-sm"><Thinking /></div>}
        </div>

        <div className="input-zone">
          {attachments.length > 0 && (
            <div className="dc-pending-images">
              {attachments.map((a, i) => (
                <div key={i} className="dc-pending-image">
                  <img className="dc-pending-image-thumb" src={a.preview} alt={a.file.name} />
                  <button
                    type="button"
                    className="dc-pending-image-remove"
                    onClick={() => removeAttachment(i)}
                    title="Quitar imagen"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="input-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFilesSelected}
              style={{ display: 'none' }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || diagnosisClosed}
              className="icon-btn"
              title="Adjuntar imágenes"
            >
              📎
            </button>

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={diagnosisClosed ? 'El diagnóstico fue finalizado.' : 'Escribe tu consulta analítica...'}
              className="debug-input"
              rows={2}
              disabled={diagnosisClosed}
            />
            <button
              onClick={send}
              disabled={loading || diagnosisClosed || (!input.trim() && attachments.length === 0)}
              className="btn btn-primary debug-send-btn"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}