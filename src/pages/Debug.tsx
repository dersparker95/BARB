import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import createApiService from '../services/api'
import ChatBubble, { Thinking } from '../components/ChatBubble'
import { retrieveContext } from '../utils/rag'
import { callLMStudio } from '../services/lm'
import { Message, DebugApiResponse } from '../types'
import { useNavigate } from 'react-router-dom'
import MACHINES from '../data/machines'
import { showToast } from '../components/Toast'

interface DebugProps {
  machineId?: string | null
}

const Debug: React.FC<DebugProps> = ({ machineId }) => {
  const { apiBase, lmBase, selectedMachine, getDebugMessages, pushDebugMessage, setLoading, loading } = useAppContext()
  const [input, setInput] = useState('')
  const areaRef = useRef<HTMLDivElement | null>(null)
  const api = createApiService(apiBase, lmBase)
  const navigate = useNavigate()

  const activeMachineId = machineId ?? selectedMachine

  // Auto-ajustar altura del textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
  }

  const machineMessages = useMemo(() => getDebugMessages(activeMachineId), [activeMachineId, getDebugMessages])

  useEffect(() => {
    if (areaRef.current) areaRef.current.scrollTop = areaRef.current.scrollHeight
  }, [machineMessages.length])

  const send = async () => {
    const query = input.trim()
    if (!query || loading || !activeMachineId) return
    setLoading(true)
    setInput('')
    const userMsg: Message = { role: 'user', content: query, timestamp: Date.now() }
    pushDebugMessage(activeMachineId, userMsg)

    // Reset height of textarea
    const el = document.getElementById('debug-input')
    if (el) el.style.height = 'auto'

    // Try FastAPI debug endpoint
    try {
      const resp = await api.chat.debug({ sessionId: null, machineId: activeMachineId, message: query, attachments: [], sensorData: null }) as DebugApiResponse
      if (resp && resp.response) {
        pushDebugMessage(activeMachineId, { role: 'assistant', content: resp.response, timestamp: Date.now() })
        setLoading(false)
        return
      }
    } catch (_) {}

    // LM Studio fallback (centralized helper)
    try {
      const chunks = retrieveContext(query)
      const ctx = chunks.length ? chunks.map((c, i) => `[FRAGMENTO ${i + 1} — p.${c.page}]\n${c.text}`).join('\n\n') : '[Sin manual disponible]'
      const system = `Eres BARB, experto en diagnóstico de maquinaria industrial. Máquina: ${activeMachineId || 'desconocida'}.\nResponde en español con: diagnóstico preciso, causas posibles, acciones paso a paso. Usa ⚠️ para advertencias de seguridad.\n\nCONTEXTO:\n${ctx}`
      const resp = await callLMStudio([{ role: 'system', content: system }, ...machineMessages.slice(-4).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: query }], lmBase, 'local-model')
      if (resp && resp.ok) {
        const data = await resp.json()
        const answer = data.choices?.[0]?.message?.content || data.result || ''
        pushDebugMessage(activeMachineId, { role: 'assistant', content: answer, timestamp: Date.now() })
        setLoading(false)
        return
      }
    } catch (_) {}

    // Demo fallback
    const chunks = retrieveContext(query)
    const demoAns = chunks.length ? `**[DEMO — Machine Debug]**\n\n${chunks[0].text}` : `**[DEMO]** Inicia LM Studio o el backend FastAPI.`
    pushDebugMessage(activeMachineId, { role: 'assistant', content: demoAns, timestamp: Date.now() })
    setLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const machine = activeMachineId ? MACHINES[activeMachineId] : null

  return (
    <div className="two-panel">
      <div className="debug-panel-left">
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>Machine Information</h3>
        <div className="debug-machine-img">
          <div className="big-icon">{machine?.icon || '⚙️'}</div>
          <div className="dm-name">{machine?.name || '—'}</div>
          <div className="dm-model">{machine?.model || '—'}</div>
        </div>
        <div className="debug-specs">
          <h4>Specifications</h4>
          <div className="spec-row"><span className="spec-label">Status</span><span className="spec-val" style={{ textTransform: 'capitalize' }}>{machine?.status || '—'}</span></div>
          <div className="spec-row"><span className="spec-label">Category</span><span className="spec-val">{machine?.cat || '—'}</span></div>
          <div className="spec-row"><span className="spec-label">Session ID</span><span className="spec-val font-mono text-secondary">ACT-{(Date.now() % 100000)}</span></div>
        </div>
      </div>
      <div className="debug-panel-right">
        <div className="debug-chat" ref={areaRef}>
          {machineMessages.length === 0 ? (
            <div className="chat-empty"><h3>Start debugging session</h3></div>
          ) : (
            machineMessages.map((m, i) => (<ChatBubble key={i} msg={m} side={m.role === 'user' ? 'user' : 'bot'} />))
          )}
          {loading && <div className="mt-md"><Thinking /></div>}
        </div>
        <div className="debug-input-zone" style={{ flexShrink: 0 }}>
          <div className="debug-input-row">
            <div className="input-wrap" style={{ flex: 1 }}>
              <textarea id="debug-input" value={input} onChange={handleInput} onKeyDown={handleKeyDown} rows={1} placeholder="Describe the issue or ask questions..." disabled={loading} className="flex-1 resize-none overflow-hidden bg-transparent border-none outline-none text-[13px] text-[var(--ink)] placeholder-[var(--ink3)]" />
              <button className="send-btn" onClick={send} disabled={loading}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
            <button className="camera-btn" title="Attach photo" onClick={() => showToast('📷 Camera: attach feature — POST /api/debug/attachments')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
          </div>
          <button className="report-btn" onClick={() => navigate('/report')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Generate & Send Report
          </button>
        </div>
      </div>
    </div>
  )
}

export default Debug
