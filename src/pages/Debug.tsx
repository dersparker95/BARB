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
  const apiRoot = (apiBase || 'https://barb-2ih8.onrender.com/api').replace(/\/$/, '')

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
    <div className="two-panel w-full h-full relative">
      
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div 
        className={`panel-left flex flex-col gap-4 transition-transform duration-300 ${
          isSidebarOpen
            ? 'flex absolute left-0 top-0 z-50 h-full w-[280px] bg-[var(--bg)] shadow-2xl translate-x-0'
            : 'hidden md:flex'
        }`}
      >
        <div className="md:hidden flex justify-between items-center mb-2 border-b border-[var(--border)] pb-2">
          <span className="font-bold text-[var(--ink)]">Equipos</span>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="text-[var(--ink2)] p-1 hover:text-[var(--red)] transition"
          >
            ✕
          </button>
        </div>

        <div className="panel-section">
          <span className="panel-label">🛠️ Diagnóstico de Equipos</span>
          <p className="text-xs text-[var(--ink3)] mb-4">Selecciona una máquina para analizar su patrón de fallas con IA.</p>
          
          <select 
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)]"
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
          <div className="panel-section flex-1 overflow-hidden flex flex-col">
            <span className="panel-label mb-2">Historial de OTs ({machineHistory.length})</span>
            
            <div className="overflow-y-auto pr-2 flex-1 space-y-2">
              {machineHistory.length === 0 ? (
                <div className="text-xs text-[var(--ink3)] italic">Este equipo no tiene historial de fallas reportadas.</div>
              ) : (
                machineHistory.map((ot, i) => (
                  <div key={i} className="p-3 bg-[var(--bg-body)] border border-[var(--border)] rounded-lg text-xs">
                    <div className="font-bold text-[var(--ink1)]">{ot.title || ot.numero_ot}</div>
                    <div className="text-[var(--ink2)] mt-1">{ot.description || ot.descripcion_problema || 'Sin descripción.'}</div>
                    <div className="flex justify-between items-center mt-2 text-[10px] text-[var(--ink3)]">
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
                className="mt-4 w-full py-2 bg-[var(--blue-bg)] text-[var(--blue)] border border-[var(--blue)] rounded-lg text-[13px] font-bold hover:bg-[var(--blue)] hover:text-white transition-colors"
              >
                🧠 Inyectar historial a la IA
              </button>
            )}
          </div>
        )}
      </div>

      <div className="panel-right flex flex-col h-full bg-[var(--surface)]">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)] flex items-center shrink-0">
          <button
            type="button"
            className="md:hidden flex items-center justify-center p-1.5 mr-3 rounded-md border border-[var(--border)] bg-[var(--bg-body)] text-[var(--ink)]"
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
            <h2 className="text-base font-black text-[var(--ink1)]">Debug & Análisis Predictivo</h2>
            <p className="text-xs text-[var(--ink3)] hidden sm:block">Analiza causas raíz y solicita sugerencias de mantenimiento.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={areaRef}>
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[var(--ink3)] text-sm italic text-center px-4">
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
          {loading && <div className="mt-2"><Thinking /></div>}
        </div>

        <div className="p-4 bg-[var(--surface)] border-t border-[var(--border)] shrink-0">
          <div className="flex gap-2">
            <textarea 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Escribe tu consulta analítica..."
              className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-body)] p-3 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--blue)]"
              rows={2}
            />
            <button 
              onClick={send} 
              disabled={loading || !input.trim()}
              className="px-4 bg-[var(--ink1)] text-[var(--surface)] rounded-xl font-bold hover:opacity-90 disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}