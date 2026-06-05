// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import createApiService from '../services/api'
import ChatBubble, { Thinking } from '../components/ChatBubble'
import { retrieveContext } from '../utils/rag'
import { callLMStudio } from '../services/lm'
import { Message, DebugApiResponse } from '../types'
import { useNavigate } from 'react-router-dom'
import { getTranslations } from '../utils/i18n'

interface DebugProps {
  machineId?: string | null
}

const Debug: React.FC<DebugProps> = ({ machineId }) => {
  // 🔥 BLINDAJE: Agregamos lang y lo conectamos a las traducciones
  const { apiBase, lmBase, selectedMachine, getDebugMessages, pushDebugMessage, setLoading, loading, lang } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])
  
  const [input, setInput] = useState('')
  const areaRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  
  const [machineData, setMachineData] = useState<any>(null)
  const [disciplineName, setDisciplineName] = useState<string>('General')

  const safeApiBase = (apiBase || 'http://localhost:9000/api').replace(/\/$/, '')
  const api = useMemo(() => createApiService(safeApiBase, lmBase), [safeApiBase, lmBase])
  const navigate = useNavigate()

  const activeMachineId = machineId ?? selectedMachine

  const sessionIdVisual = useMemo(() => {
    if (!activeMachineId) return '—'
    return `ACT-${Math.floor(Date.now() % 100000)}`
  }, [activeMachineId])

  // 🔥 OPTIMIZACIÓN: AbortController en lugar de variable booleana para evitar Memory Leaks
  useEffect(() => {
    if (!activeMachineId) return;
    
    const controller = new AbortController();
    
    const fetchMachineInfo = async () => {
      try {
        const [machRes, discRes] = await Promise.all([
          fetch(`${safeApiBase}/machines`, { signal: controller.signal }),
          fetch(`${safeApiBase}/disciplines`, { signal: controller.signal })
        ]);
        
        if (machRes.ok && discRes.ok) {
          const machines = await machRes.json();
          const disciplines = await discRes.json();
          
          if (controller.signal.aborted) return;

          const currentMachine = machines.find((m: any) => String(m.id) === String(activeMachineId));
          if (currentMachine) {
            setMachineData(currentMachine);
            const disc = disciplines.find((d: any) => String(d.id) === String(currentMachine.discipline_id || currentMachine.disciplineId));
            if (disc) setDisciplineName(disc.name || disc.nombre || 'General');
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') console.error("Error cargando detalles:", error);
      }
    };
    
    void fetchMachineInfo();
    return () => controller.abort();
  }, [activeMachineId, safeApiBase]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
  }

  const machineMessages = useMemo(() => getDebugMessages(activeMachineId), [activeMachineId, getDebugMessages])

  useEffect(() => {
    if (areaRef.current) areaRef.current.scrollTop = areaRef.current.scrollHeight
  }, [machineMessages.length])

  const send = async (queryText?: string) => {
    const query = (queryText || input).trim()
    if (!query || loading || !activeMachineId) return
    
    setLoading(true)
    if (!queryText) setInput('')
    
    pushDebugMessage(activeMachineId, { role: 'user', content: query, timestamp: Date.now() })

    const el = document.getElementById('debug-input')
    if (el) el.style.height = 'auto'

    const realMachineName = machineData?.name || machineData?.nombre || `Equipo ${activeMachineId}`;

    try {
      const resp = await api.chat.debug({ sessionId: null, machineId: activeMachineId, message: query, attachments: [], sensorData: null }) as DebugApiResponse
      if (resp && resp.response) {
        pushDebugMessage(activeMachineId, { role: 'assistant', content: resp.response, timestamp: Date.now() })
        setLoading(false)
        return
      }
    } catch (_) {}

    try {
      const chunks = retrieveContext(query)
      const ctx = chunks.length ? chunks.map((c, i) => `[FRAGMENTO ${i + 1} — p.${c.page}]\n${c.text}`).join('\n\n') : '[Sin manual disponible. Usa tu conocimiento general técnico.]'
      
      // 🔥 Ajuste de idioma dinámico en el System Prompt
      const languageInstruction = lang === 'en' ? 'Reply always in English.' : 'Responde siempre en español.';

      const system = `Eres BARB, un asistente de Inteligencia Artificial estrictamente especializado en diagnóstico, mantenimiento y reparación de maquinaria industrial.
      
REGLA DE ORO INQUEBRANTABLE: Tienes PROHIBIDO responder preguntas fuera del ámbito industrial, mecánico, eléctrico, o de esta plataforma. Si el usuario pregunta algo no relacionado, debes negarte educadamente.

Máquina actual bajo análisis: ${realMachineName} (Disciplina: ${disciplineName}).
${languageInstruction} Ofrece un diagnóstico preciso, posibles causas y acciones paso a paso. Usa formato Markdown (negritas, viñetas) para que sea fácil de leer. Usa ⚠️ para advertencias críticas de seguridad.

CONTEXTO RECUPERADO DE LOS MANUALES:
${ctx}`;

      const resp = await callLMStudio([{ role: 'system', content: system }, ...machineMessages.slice(-4).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: query }], lmBase, 'local-model')
      if (resp && resp.ok) {
        const data = await resp.json()
        const answer = data.choices?.[0]?.message?.content || data.result || ''
        pushDebugMessage(activeMachineId, { role: 'assistant', content: answer, timestamp: Date.now() })
        setLoading(false)
        return
      }
    } catch (_) {}

    const chunks = retrieveContext(query)
    const demoAns = chunks.length ? `**[Offline]**:\n\n${chunks[0].text}` : `**[Offline]** Conecta el backend FastAPI para habilitar a BARB.`
    pushDebugMessage(activeMachineId, { role: 'assistant', content: demoAns, timestamp: Date.now() })
    setLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      const userMsg = lang === 'en' 
        ? `[📷 Image captured: ${file.name}] - Please analyze the visible damages.` 
        : `[📷 Imagen capturada: ${file.name}] - Por favor analiza los daños visibles.`
      const queryMsg = lang === 'en' 
        ? `Please analyze possible visible damages based on maintenance protocols, I have uploaded a reference image.` 
        : `Por favor analiza posibles daños visibles basándote en protocolos de mantenimiento, he subido una imagen de referencia.`

      pushDebugMessage(activeMachineId!, { role: 'user', content: userMsg, timestamp: Date.now() })
      send(queryMsg)
    }
  }

  const visualName = machineData?.name || machineData?.nombre || (activeMachineId ? `${t.common?.machine || 'Equipo'} ${activeMachineId}` : (t.topology?.noMachineSelected || 'Sin equipo seleccionado'));
  const visualStatus = machineData?.status || machineData?.estado || 'Operativo';

  // 🔥 Banderas para los chips de sugerencias rápidas
  const chipSecurity = lang === 'en' ? "⚠️ What are the safety risks for this equipment?" : "⚠️ ¿Cuáles son los riesgos de seguridad en este equipo?"
  const chipPreventive = lang === 'en' ? "What are the steps for basic preventive maintenance?" : "¿Cuáles son los pasos para un mantenimiento preventivo básico?"
  const chipChecklist = lang === 'en' ? "Generate an inspection checklist" : "Genera una lista de verificación (checklist) de inspección"

  return (
    <div className="two-panel">
      <div className="debug-panel-left">
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>
          {t.debug?.equipmentInfo || 'Información del Equipo'}
        </h3>
        <div className="debug-machine-img">
          <div className="big-icon">{disciplineName === 'Eléctrica' || disciplineName === 'Electrical' ? '⚡' : disciplineName === 'Hidráulica' || disciplineName === 'Hydraulics' ? '💧' : '⚙️'}</div>
          <div className="dm-name">{visualName}</div>
          <div className="dm-model">ID BD: {activeMachineId || '—'}</div>
        </div>
        
        {activeMachineId && (
          <div className="debug-specs">
            <h4>{t.debug?.specs || 'Especificaciones'}</h4>
            <div className="spec-row">
              <span className="spec-label">{t.common?.status || 'Estado'}</span>
              <span className="spec-val" style={{ 
                color: visualStatus.toLowerCase().includes('alarma') || visualStatus.toLowerCase().includes('error') ? '#ef4444' : visualStatus.toLowerCase().includes('warning') ? '#f59e0b' : '#10b981',
                fontWeight: 700,
                textTransform: 'capitalize' 
              }}>
                {t.statuses?.[visualStatus.toLowerCase()] || visualStatus}
              </span>
            </div>
            <div className="spec-row"><span className="spec-label">{t.common?.discipline || 'Disciplina'}</span><span className="spec-val">{disciplineName}</span></div>
            <div className="spec-row"><span className="spec-label">{t.debug?.sessionId || 'ID de Sesión'}</span><span className="spec-val font-mono text-secondary">{sessionIdVisual}</span></div>
            
            <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px' }}>
              <p style={{ fontSize: '11px', color: 'var(--blue)', fontWeight: 600, margin: 0, display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span>🛡️</span> {t.debug?.strictMode || 'Modo Estricto BARB Activado'}
              </p>
              <p style={{ fontSize: '10px', color: 'var(--ink3)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                {t.debug?.strictModeDesc || 'La IA está bloqueada para responder solo temas industriales.'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="debug-panel-right">
        <div className="debug-chat" ref={areaRef}>
          {machineMessages.length === 0 ? (
            <div className="chat-empty">
              <h3>{activeMachineId ? (t.debug?.startSession || 'Inicia la sesión de diagnóstico') : (t.debug?.selectMachine || 'Selecciona una máquina desde la topología')}</h3>
            </div>
          ) : (
            machineMessages.map((m, i) => (<ChatBubble key={i} msg={m} side={m.role === 'user' ? 'user' : 'bot'} />))
          )}
          {loading && <div className="mt-md"><Thinking /></div>}
        </div>

        <div className="debug-input-zone" style={{ flexShrink: 0, opacity: activeMachineId ? 1 : 0.5, pointerEvents: activeMachineId ? 'auto' : 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          
          {/* 🔥 SUGERENCIAS RÁPIDAS (CHIPS) CON i18n */}
          {activeMachineId && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }} className="hide-scrollbar">
              <button onClick={() => send(chipSecurity)} style={{ whiteSpace: 'nowrap', fontSize: '11px', padding: '6px 12px', borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink2)', cursor: 'pointer' }}>
                {t.debug?.chipSecurity || 'Riesgos de seguridad'}
              </button>
              <button onClick={() => send(chipPreventive)} style={{ whiteSpace: 'nowrap', fontSize: '11px', padding: '6px 12px', borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink2)', cursor: 'pointer' }}>
                {t.debug?.chipMaintenance || 'Mantenimiento preventivo'}
              </button>
              <button onClick={() => send(chipChecklist)} style={{ whiteSpace: 'nowrap', fontSize: '11px', padding: '6px 12px', borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink2)', cursor: 'pointer' }}>
                {t.debug?.chipChecklist || 'Generar Checklist'}
              </button>
            </div>
          )}

          <div className="debug-input-row">
            <div className="input-wrap" style={{ flex: 1 }}>
              <textarea id="debug-input" value={input} onChange={handleInput} onKeyDown={handleKeyDown} rows={1} placeholder={t.debug?.inputPlaceholder || 'Describe el problema para que BARB lo analice...'} disabled={loading || !activeMachineId} className="flex-1 resize-none overflow-hidden bg-transparent border-none outline-none text-[13px] text-[var(--ink)] placeholder-[var(--ink3)]" />
              <button className="send-btn" onClick={() => send()} disabled={loading || !activeMachineId || !input.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
            
            <input type="file" accept="image/*" capture="environment" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCameraCapture} />
            <button className="camera-btn" title={t.debug?.takePhoto || 'Tomar foto del problema'} onClick={() => fileInputRef.current?.click()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
          </div>
          
          <button className="report-btn" onClick={() => navigate('/report')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {t.debug?.generateReport || 'Generar Reporte IA'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Debug