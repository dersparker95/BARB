// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import ChatBubble, { Thinking } from '../components/ChatBubble'
import { getTranslations, normalizeLang } from '../utils/i18n'

export default function DebugChat() {
  const { apiBase, user, lang } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])
  const nLang = normalizeLang(lang)

  const location = useLocation()

  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const [machines, setMachines] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [selectedMachineId, setSelectedMachineId] = useState(null)

  const areaRef = useRef(null)

  const apiRoot = useMemo(() => {
    if (apiBase) return apiBase.replace(/\/$/, '')
    const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV
    return isDev ? 'http://localhost:9000/api' : 'https://barb-2ih8.onrender.com/api'
  }, [apiBase])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [machRes, otRes] = await Promise.all([
          fetch(`${apiRoot}/machines`),
          fetch(`${apiRoot}/work-orders`)
        ])
        if (machRes.ok) setMachines(await machRes.json())
        if (otRes.ok) setWorkOrders(await otRes.json())
      } catch (error) {
        console.error("Error cargando datos para Debug:", error)
      }
    }
    fetchData()
  }, [apiRoot])

  useEffect(() => {
    if (location.state && typeof location.state === 'object' && location.state.machineId) {
      setSelectedMachineId(String(location.state.machineId))
    }
  }, [location.state])

  useEffect(() => {
    if (areaRef.current) areaRef.current.scrollTop = areaRef.current.scrollHeight
  }, [messages])

  const machineHistory = useMemo(() => {
    if (!selectedMachineId) return []
    return workOrders.filter(ot => String(ot.machineId ?? ot.machine_id) === String(selectedMachineId))
  }, [selectedMachineId, workOrders])

  const selectedMachine = machines.find(m => String(m.id ?? m.maquina_id) === String(selectedMachineId))

  const send = async () => {
    const query = input.trim()
    if (!query || loading) return

    setLoading(true)
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: query }])

    try {
      const response = await fetch(`${apiRoot}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          language: nLang,
          machine: selectedMachine?.name || 'general'
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Error de conexión con el motor de IA.' }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Servidor inalcanzable.' }])
    } finally {
      setLoading(false)
    }
  }

  const injectHistory = () => {
    if (!selectedMachine || machineHistory.length === 0) return;

    const historyText = machineHistory.map(ot =>
      `- [${ot.createdAt ? ot.createdAt.slice(0,10) : 'Fecha N/A'}] OT: ${ot.title}. Problema: ${ot.description}. Estado: ${ot.status}.`
    ).join('\n');

    const prompt = `Analiza el siguiente historial de fallas del equipo "${selectedMachine.name || selectedMachine.nombre}":\n\n${historyText}\n\n¿Ves algún patrón de falla repetitiva? ¿Qué componente deberíamos inspeccionar a fondo para evitar que vuelva a ocurrir?`;

    setInput(prompt);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  }

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

            {machineHistory.length > 0 && (
              <button
                onClick={injectHistory}
                className="btn btn-outline debug-inject-btn"
              >
                🧠 Inyectar historial a la IA
              </button>
            )}
          </div>
        )}
      </div>

      <div className="panel-right debug-main">
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
        </div>

        <div className="chat-messages" ref={areaRef}>
          {messages.length === 0 ? (
            <div className="debug-empty-state">
              Selecciona un equipo en el panel lateral e inyecta su historial, o haz una pregunta directa.
            </div>
          ) : (
            messages.map((msg, idx) => (
              <ChatBubble
                key={idx}
                msg={msg}
                side={msg.role === 'user' ? 'user' : 'bot'}
                onFeedback={(msgData, rating) => {
                  fetch(`${apiRoot}/chat-feedback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      message_content: msgData.content,
                      rating,
                      context: selectedMachine?.name || selectedMachine?.nombre || 'Debug General'
                    })
                  }).catch(err => console.error("Error enviando feedback:", err));
                }}
              />
            ))
          )}
          {loading && <div className="mt-sm"><Thinking /></div>}
        </div>

        <div className="input-zone">
          <div className="input-wrap">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Escribe tu consulta analítica..."
              className="debug-input"
              rows={2}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
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