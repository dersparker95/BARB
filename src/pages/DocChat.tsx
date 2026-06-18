// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import ChatBubble, { Thinking } from '../components/ChatBubble'
import { SourceHit } from '../types'
import { getTranslations, normalizeLang } from '../utils/i18n'
import { tokenize } from '../utils/rag'

interface ChatApiResponse {
  reply: string
  sources?: SourceHit[]
}

interface ManualDoc {
  id: string
  name: string
  size: string
  pages: number | null
  isDemo: boolean
  uploadedBy: string
  uploadedAt: Date
  chunks: Array<{ text: string; page: number; doc: string }>
}

interface PlantRecord { id: number | string; name?: string; nombre?: string; ubicacion?: string }
interface DisciplineRecord { id: number | string; name?: string; nombre?: string }
interface MachineRecord {
  id: number | string; name?: string; nombre?: string;
  // 🔥 AQUÍ AGREGAMOS disciplinaId
  discipline_id?: number | string | null; disciplineId?: number | string | null; disciplina_id?: number | string | null; disciplinaId?: number | string | null;
  plant_id?: number | string | null; plantId?: number | string | null; planta_id?: number | string | null;
  plant_name?: string | null; plant?: string | null
}
interface WorkOrderRecord {
  id: number | string; numero_ot?: string | number; title?: string; nombre?: string;
  description?: string; descripcion_problema?: string;
  machine?: string | null; machine_name?: string | null; machineId?: number | string | null; machine_id?: number | string | null;
  plant?: string | null; planta?: string | null; plant_name?: string | null; plant_id?: number | string | null;
  disciplina?: string | null; discipline?: string | null; discipline_id?: number | string | null;
  priority?: string; status?: string; estado?: string; age_minutes?: number;
  machine_meta?: MachineRecord | null
}

const PLANTS_FALLBACK: PlantRecord[] = [
  { id: 1, name: 'Planta principal de producción', ubicacion: 'Main Production Plant' },
  { id: 2, name: 'Línea de ensamblaje 2', ubicacion: 'Assembly Line 2' },
  { id: 3, name: 'Bodega / almacén', ubicacion: 'Warehouse Facility' },
]

const fmtSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const chunkText = (text: string, filename: string, chunkSize = 500, overlap = 60): ManualDoc['chunks'] => {
  const words = text.trim().split(/\s+/)
  const chunks: ManualDoc['chunks'] = []
  const pageCount = Math.max(1, Math.round(text.length / 3000))

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const slice = words.slice(i, i + chunkSize).join(' ')
    if (slice.trim().length < 40) continue
    const estimatedPage = Math.max(1, Math.round((i / words.length) * Math.max(pageCount * 2, 10)))
    chunks.push({ text: slice, page: estimatedPage, doc: filename })
  }
  return chunks
}

const retrieveFromManual = (query: string, chunks: ManualDoc['chunks'], k = 4) => {
  if (!chunks.length) return []
  const qTok = new Set(tokenize(query))
  return chunks
    .map(chunk => {
      const cTok = tokenize(chunk.text)
      let score = 0
      qTok.forEach(q => {
        const freq = cTok.filter(t => t.includes(q) || q.includes(t)).length
        if (freq > 0) score += 1 + Math.log(freq)
      })
      return { ...chunk, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter(chunk => chunk.score > 0)
}

const normalizeCatalogName = (record: any): string => {
  if (!record) return '';
  if (typeof record === 'string') return record.trim();
  
  // 🔥 ¡AQUÍ ESTÁ LA CLAVE! Agregamos "record.label" al principio
  const possibleName = record.label ?? record.nombre ?? record.Nombre ?? record.name ?? record.disciplina;
  
  if (possibleName) return String(possibleName).trim();
  
  return '';
}

const normalizePlantLabel = (record: { name?: string; nombre?: string; ubicacion?: string } | null | undefined): string => {
  if (!record) return ''
  return String(record.name ?? record.nombre ?? record.ubicacion ?? '').trim()
}

const normalizeMachineLabel = (record: MachineRecord | null | undefined): string => {
  if (!record) return ''
  return String(record.name ?? record.nombre ?? '').trim()
}

const normalizeWorkOrderMachine = (ot: WorkOrderRecord): string => {
  return String(ot.machine_name ?? ot.machine ?? ot.machineId ?? ot.machine_id ?? '').trim()
}

const normalizeWorkOrderPlant = (ot: WorkOrderRecord, machine: MachineRecord | null): string => {
  const raw = String(ot.plant_name ?? ot.plant ?? ot.planta ?? '').trim()
  if (raw) return raw
  const machinePlant = machine?.plant_name ?? machine?.plant ?? machine?.plant_id ?? machine?.plantId ?? machine?.planta_id
  return machinePlant ? String(machinePlant).trim() : ''
}

const normalizeWorkOrderDiscipline = (ot: WorkOrderRecord, machine: MachineRecord | null): string => {
  const raw = String(ot.discipline ?? ot.disciplina ?? ot.discipline_id ?? '').trim()
  if (raw) return raw
  const machineDiscipline = machine?.discipline_id ?? machine?.disciplineId
  return machineDiscipline === null || machineDiscipline === undefined ? '' : String(machineDiscipline).trim()
}

const getWorkOrderTitle = (ot: WorkOrderRecord): string => String(ot.numero_ot ?? ot.title ?? ot.nombre ?? `OT ${ot.id}`).trim()
const getWorkOrderStatus = (ot: WorkOrderRecord): string => String(ot.status ?? ot.estado ?? 'open').trim().toLowerCase()
const getWorkOrderPriority = (ot: WorkOrderRecord): string => String(ot.priority ?? 'medium').trim().toLowerCase()

export default function DocChat() {
  const {
    apiBase, lmBase, discipline, plant, docMachine, docMessages, pushDocMessage,
    clearDocMessages, loading, setLoading, setDiscipline, setPlant, setDocMachine,
    selectedMachine, setSelectedMachine, user, lang,
  } = useAppContext()

  const [input, setInput] = useState('')
  const [manuals, setManuals] = useState<ManualDoc[]>([])
  const [activeManualId, setActiveManualId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [dragOver, setDragOver] = useState(false)

  const [plants, setPlants] = useState<PlantRecord[]>([])
  const [disciplines, setDisciplines] = useState<DisciplineRecord[]>([])
  const [machines, setMachines] = useState<MachineRecord[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([])
  const [catalogsLoading, setCatalogsLoading] = useState(false)

  const areaRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const prevDisciplineRef = useRef<string | null>(discipline)
  const prevDocMachineRef = useRef<string>(docMachine)
  const location = useLocation()
  
  const t = useMemo(() => getTranslations(lang), [lang])
  const nLang = normalizeLang(lang)
  
  const apiRoot = (apiBase || 'http://localhost:9000/api').replace(/\/$/, '')
  const lmRoot = (lmBase || 'http://localhost:1234/v1').replace(/\/$/, '')

  const activeManual = useMemo(() => manuals.find(m => m.id === activeManualId) ?? null, [manuals, activeManualId])
  const normalizedPlants = useMemo(() => plants.length > 0 ? plants : PLANTS_FALLBACK, [plants])
  const selectedPlantRecord = useMemo(() => normalizedPlants.find(item => String(item.id) === String(plant)) ?? normalizedPlants[0] ?? null, [normalizedPlants, plant])
  const selectedDisciplineRecord = useMemo(() => discipline ? (disciplines.find(item => normalizeCatalogName(item) === discipline) ?? null) : null, [discipline, disciplines])
  const selectedMachineRecord = useMemo(() => (!docMachine || docMachine === 'all') ? null : (machines.find(item => String(item.id) === docMachine) ?? machines.find(item => normalizeMachineLabel(item) === docMachine) ?? null), [docMachine, machines])

const availableMachines = useMemo(() => {
    if (!selectedDisciplineRecord) return machines;

    return machines.filter(m => {
      // 🔥 AHORA SÍ: Buscamos m.disciplinaId
      const mId = m.discipline_id ?? m.disciplineId ?? m.disciplina_id ?? m.disciplinaId;

      // Comparamos el ID de la máquina con el de la disciplina seleccionada
      if (mId !== undefined && mId !== null && mId !== '') {
        return String(mId) === String(selectedDisciplineRecord.id);
      }

      // Si por alguna razón la máquina viene sin disciplina, la ocultamos
      return false;
    });
  }, [machines, selectedDisciplineRecord]);

  useEffect(() => {
    if (location.state && typeof location.state === 'object') {
      const s = location.state as { discipline?: string; plant?: string }
      if (s.discipline) setDiscipline(s.discipline)
      if (s.plant) setPlant(s.plant)
    }
  }, [location.state, setDiscipline, setPlant])

  useEffect(() => {
    const disciplineChanged = prevDisciplineRef.current !== discipline
    const machineChanged = prevDocMachineRef.current !== docMachine
    if (disciplineChanged) prevDisciplineRef.current = discipline
    if (machineChanged) prevDocMachineRef.current = docMachine
    if (disciplineChanged || machineChanged) clearDocMessages()
  }, [clearDocMessages, discipline, docMachine])

  useEffect(() => {
    if (areaRef.current) areaRef.current.scrollTop = areaRef.current.scrollHeight
  }, [docMessages.length])

  useEffect(() => {
    const controller = new AbortController()

    const loadCatalogs = async () => {
      setCatalogsLoading(true)
      try {
        const [plantsRes, disciplinesRes, machinesRes, workOrdersRes] = await Promise.all([
          fetch(`${apiRoot}/plants`, { signal: controller.signal }),
          fetch(`${apiRoot}/disciplines`, { signal: controller.signal }),
          fetch(`${apiRoot}/machines`, { signal: controller.signal }),
          fetch(`${apiRoot}/work-orders`, { signal: controller.signal }),
        ])

        if (controller.signal.aborted) return

        const [plantsData, disciplinesData, machinesData, workOrdersData] = await Promise.all([
          plantsRes.ok ? plantsRes.json() : [],
          disciplinesRes.ok ? disciplinesRes.json() : [],
          machinesRes.ok ? machinesRes.json() : [],
          workOrdersRes.ok ? workOrdersRes.json() : [],
        ])

        if (controller.signal.aborted) return

        setPlants(Array.isArray(plantsData) ? plantsData : [])
        setDisciplines(Array.isArray(disciplinesData) ? disciplinesData : [])
        setMachines(Array.isArray(machinesData) ? machinesData : [])
        setWorkOrders(Array.isArray(workOrdersData) ? workOrdersData : (workOrdersData?.data || []))
      } catch (err: any) {
        if (err.name === 'AbortError') return
        setPlants([]); setDisciplines([]); setMachines([]); setWorkOrders([])
      } finally {
        if (!controller.signal.aborted) setCatalogsLoading(false)
      }
    }

    void loadCatalogs()
    return () => controller.abort()
  }, [apiRoot])

  // 🔥 MEJORA DE FILTRADO: Comparación robusta por todas las variantes de la interfaz
  const filteredOTs = useMemo(() => {
    const targetPlantId = String(plant || '');
    const targetDisc = discipline ? String(discipline).toLowerCase() : '';
    const targetMachineId = (docMachine && docMachine !== 'all') ? String(docMachine) : '';

    return workOrders.filter(ot => {
      // 1. Validar Planta (ID o Nombres)
      const otPlantId = String(ot.plant_id ?? ot.planta_id ?? '');
      const otPlantStr = String(ot.plant_name ?? ot.plant ?? ot.planta ?? '');
      const plantMatch = targetPlantId === '' || otPlantId === targetPlantId || otPlantStr === targetPlantId;

      // 2. Validar Disciplina (Cubre discipline, disciplina, discipline_id)
      const otDisc = String(ot.discipline ?? ot.disciplina ?? ot.discipline_id ?? '').toLowerCase();
      const discMatch = targetDisc === '' || otDisc === targetDisc;

      // 3. Validar Máquina (Cubre machine_id, machineId, machine y machine_name)
      const otMachId = String(ot.machine_id ?? ot.machineId ?? '');
      const otMachStr = String(ot.machine_name ?? ot.machine ?? '');
      const machMatch = targetMachineId === '' || otMachId === targetMachineId || otMachStr === targetMachineId;

      return plantMatch && discMatch && machMatch;
    });
  }, [docMachine, discipline, plant, workOrders]);

  useEffect(() => {
    const selectedPlantId = String(plant || '')
    if (!selectedPlantId && normalizedPlants[0]) {
      setPlant(String(normalizedPlants[0].id))
    }
  }, [normalizedPlants, plant, setPlant])

  const processFile = useCallback(async (file: File) => {
    setUploading(true)
    setUploadPct(10)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', 'document')
      fd.append('context', 'document_library')

      const response = await fetch(`${apiRoot}/documents/upload`, { method: 'POST', body: fd })

      if (response.ok) {
        const data = await response.json() as { id?: string }
        setUploadPct(95)
        const doc: ManualDoc = {
          id: data.id ?? `srv-${Date.now()}`,
          name: file.name,
          size: fmtSize(file.size),
          pages: null,
          isDemo: false,
          uploadedBy: user?.name ?? 'operador',
          uploadedAt: new Date(),
          chunks: [],
        }
        setManuals(prev => [...prev, doc])
        setActiveManualId(doc.id)
        setUploading(false)
        setUploadPct(0)
        return
      }
    } catch { /* fallback local */ }

    setUploadPct(40)
    let text = '', pageCount = 1

    try {
      if (/\.(txt|md)$/i.test(file.name)) {
        text = await file.text()
        pageCount = Math.max(1, Math.round(text.length / 3000))
      } else if (/\.pdf$/i.test(file.name)) {
        const ab = await file.arrayBuffer()
        const raw = new TextDecoder('latin1').decode(ab)
        const strings = raw.match(/\(([^)]{8,300})\)/g) ?? []
        text = strings.map(s => s.slice(1, -1)).join(' ').replace(/[^\x20-\x7E\u00C0-\u024F\n ]/g, ' ').replace(/\s+/g, ' ').trim()
        const pageMatches = raw.match(/\/Page\b/g)
        pageCount = pageMatches ? pageMatches.length : Math.max(1, Math.round(file.size / 4096))
      } else {
        text = await file.text().catch(() => '')
        pageCount = Math.max(1, Math.round(text.length / 3000))
      }
    } catch { text = '' }

    setUploadPct(75)
    const chunks = text.length > 100 ? chunkText(text, file.name) : []
    const doc: ManualDoc = {
      id: `local-${Date.now()}`, name: file.name, size: fmtSize(file.size), pages: pageCount, isDemo: false,
      uploadedBy: user?.name ?? 'operador', uploadedAt: new Date(), chunks,
    }
    setManuals(prev => [...prev, doc])
    setActiveManualId(doc.id)
    setUploading(false)
    setUploadPct(0)
  }, [apiRoot, user?.name])

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) await processFile(file)
  }, [processFile])

  const removeManual = (id: string) => {
    setManuals(prev => prev.filter(m => m.id !== id))
    if (activeManualId === id) setActiveManualId('')
  }

  const send = async () => {
    const query = input.trim()
    if (!query || loading || !discipline) return

    setLoading(true)
    setInput('')

    const chatMachine = selectedMachine ?? docMachine
    const el = document.getElementById('doc-input')
    if (el) (el as HTMLTextAreaElement).style.height = 'auto'

    pushDocMessage({ role: 'user', content: query, timestamp: Date.now() })

    try {
      const response = await fetch(`${apiRoot}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          language: nLang,
          machine: chatMachine,
        }),
      })

      if (response.ok) {
        const data = await response.json() as ChatApiResponse
        pushDocMessage({ role: 'assistant', content: data.reply, timestamp: Date.now() })
        setLoading(false)
        return
      }

      if (response.status === 503) {
        const friendly = t.docChat?.lmStudioOffline || 'El asistente está desconectado temporalmente. Revisa la conexión de LM Studio.'
        pushDocMessage({ role: 'assistant', content: friendly, timestamp: Date.now() })
        setLoading(false)
        return
      }
    } catch {
      console.warn("Fallo conexión con FastAPI, intentando modo Offline (RAG Local)")
    }

    const chunks = retrieveFromManual(query, activeManual?.chunks ?? [])
    const ctx = chunks.length
      ? chunks.map((chunk, index) => `[FRAGMENTO ${index + 1} — ${chunk.doc} p.${chunk.page}]\n${chunk.text}`).join('\n\n')
      : '[Sin manual cargado — responde con conocimiento general de mantenimiento industrial]'
    
    const manualNote = activeManual ? `Manual activo: ${activeManual.name}.` : ''
    const machineName = selectedMachineRecord?.name ?? null
    
    const sysPrompt = `Eres BARB, asistente experto en mantenimiento industrial. Disciplina: ${discipline}. ${machineName ? `Equipo seleccionado: ${machineName}.` : ''} ${manualNote}\nResponde en ${nLang === 'en' ? 'inglés' : 'español'}, paso a paso, citando página del manual cuando disponible. Usa ⚠️ para advertencias de seguridad.\n\nCONTEXTO MANUAL:\n${ctx}`

    try {
      const lmResponse = await fetch(`${lmRoot}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "local-model",
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: query }
          ]
        })
      });
      
      if (lmResponse.ok) {
        const data = await lmResponse.json();
        const answer = data.choices?.[0]?.message?.content || data.result || ''
        pushDocMessage({ role: 'assistant', content: `*(Modo Fallback)*\n\n${answer}`, timestamp: Date.now() })
        setLoading(false)
        return
      }
    } catch {
      const demoAns = chunks.length
        ? `**[DEMO — sin backend activo]**\n\nBasado en el manual:\n\n${chunks[0].text}\n\n*Inicia LM Studio o el backend FastAPI para respuestas inteligentes.*`
        : `**[Modo Local]** No hay conexión al backend ni manuales PDF cargados.`
      pushDocMessage({ role: 'assistant', content: demoAns, timestamp: Date.now() })
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="two-panel w-full h-full">
      <div className="panel-left">
        <div className="panel-section">
          <span className="panel-label">
            Target OTs
            <span className="ml-count">{filteredOTs.length}</span>
          </span>

          <div className="manual-list-scroll">
            {filteredOTs.map(ot => {
              const title = getWorkOrderTitle(ot)
              const machineLabel = normalizeWorkOrderMachine(ot) || '—'
              const statusKey = getWorkOrderStatus(ot)
              const status = t.statuses?.[statusKey] || statusKey
              const priority = getWorkOrderPriority(ot)

              return (
                <button 
                  key={String(ot.id)} 
                  className="manual-item" 
                  type="button" 
                  title={`${title} · ${machineLabel} · ${status} · ${priority}`} 
                  onClick={() => {
                    // 🔥 INYECCIÓN DE CONTEXTO: Carga automatizada de variables de la OT en el input
                    const descripcion = ot.description || ot.descripcion_problema || 'Sin descripción detallada';
                    const contextPrompt = `Contexto de OT seleccionada:
- Orden: ${title}
- Equipo: ${machineLabel}
- Estado: ${status} (Prioridad: ${priority})
- Problema reportado: ${descripcion}

Considerando esta información, `;
                    
                    setInput(contextPrompt);
                    setTimeout(() => {
                      const el = document.getElementById('doc-input');
                      if (el) {
                        el.focus();
                        el.style.height = 'auto';
                        el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
                      }
                    }, 50);
                  }}
                >
                  <div className="mi-icon">🛠️</div>
                  <div className="mi-body">
                    <div className="mi-name">{title}</div>
                    <div className="mi-meta">{normalizeWorkOrderPlant(ot, ot.machine_meta ?? null) || selectedPlantRecord?.name || selectedPlantRecord?.nombre || '—'}</div>
                    <div className="mi-meta">{machineLabel}</div>
                    <div className="mi-meta capitalize">{status} · {priority}</div>
                  </div>
                  <span className="mi-badge">OT</span>
                </button>
              )
            })}
            {catalogsLoading && <div style={{ fontSize: 11, color: 'var(--ink3)', textAlign: 'center', padding: '8px 0' }}>{t.common?.loading || 'Cargando...'}</div>}
          </div>
        </div>

        <div className="lib-sep" />

        {/* 🔥 UNIFICACIÓN DE DISEÑO: Selectores con la misma clase estilizada de los modales */}
        <div className="panel-section">
          <span className="panel-label">{t.common?.plant || 'Planta / Ubicación'}</span>
          <select 
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60" 
            value={String(plant || '')} 
            onChange={e => setPlant(e.target.value)} 
            disabled={loading || catalogsLoading}
          >
            {normalizedPlants.map(p => (
              <option key={String(p.id)} value={String(p.id)}>{normalizePlantLabel(p) || p.ubicacion || String(p.id)}</option>
            ))}
          </select>
        </div>

        <div className="panel-section">
          <span className="panel-label">{t.common?.discipline || 'Disciplina'}</span>
          <select 
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            value={discipline ?? ''} 
            onChange={e => {
              setDiscipline(e.target.value || null); setDocMachine('all'); setSelectedMachine(null); clearDocMessages()
            }} 
            disabled={loading || catalogsLoading}
          >
            <option value="">{t.docChat?.selectDiscipline || 'Seleccionar disciplina...'}</option>
            {disciplines.map((option, index) => {
              // Ahora sí encontrará el "label" (Ej: "Automatización")
              const finalName = normalizeCatalogName(option);
              const fallbackId = option.id ?? option.disciplina_id ?? index;

              return (
                <option key={String(fallbackId)} value={finalName || String(fallbackId)}>
                  {finalName || `Disciplina ${fallbackId}`}
                </option>
              );
            })}
          </select>
        </div>

        <div className="panel-section">
          <span className="panel-label">{t.common?.machine || 'Máquina'} ({t.common?.optional || 'opcional'})</span>
          <select 
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            value={docMachine === 'all' ? '' : docMachine} 
            onChange={e => {
              const nextMachineId = e.target.value; setDocMachine(nextMachineId || 'all'); setSelectedMachine(nextMachineId || null); clearDocMessages()
            }} 
            disabled={loading || catalogsLoading || !selectedDisciplineRecord}
          >
            <option value="">{t.docChat?.selectMachine || 'Seleccionar máquina...'}</option>
            {availableMachines.map(option => (
              <option key={String(option.id)} value={String(option.id)}>{normalizeMachineLabel(option) || String(option.id)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel-right">
        {activeManual && (
          <div className="manual-active-bar">
            <span style={{ fontSize: 14 }}>📖</span>
            <span className="mab-name">{activeManual.name}</span>
            <span className="mab-meta">
              {[activeManual.pages ? `${activeManual.pages} ${t.common?.page || 'p'}` : '', activeManual.chunks.length ? `${activeManual.chunks.length} ${t.docChat?.fragments || 'fragmentos'}` : ''].filter(Boolean).join(' · ')}
            </span>
            <span className="mab-clear" onClick={() => setActiveManualId('')} title={t.common?.close || 'Cerrar'}>✕</span>
          </div>
        )}

        <div className="context-tags" style={{ flexShrink: 0 }}>
          {!discipline ? (
            <span className="ctx-empty">{t.docChat?.emptyContext || 'Selecciona una disciplina para empezar a chatear con la documentación'}</span>
          ) : (
            <>
              <span className="ctx-tag plant">📍 {String(normalizePlantLabel(selectedPlantRecord) || plant)}</span>
              {activeManual && (
                <span className="ctx-tag" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
                  📖 {activeManual.name.length > 26 ? `${activeManual.name.slice(0, 24)}…` : activeManual.name}
                </span>
              )}
              <span className="ctx-tag disc-au">◉ {discipline}</span>
              {selectedMachineRecord && (
                <span className="ctx-tag machine">
                  ⚙ {selectedMachineRecord.name ?? selectedMachineRecord.nombre ?? selectedMachineRecord.id}
                </span>
              )}
            </>
          )}
        </div>

        <div className="chat-messages" ref={areaRef}>
          {docMessages.length === 0 ? (
            <div className="chat-empty" style={{ background: 'transparent' }} />
          ) : (
            docMessages.map((message, index) => (
              <ChatBubble key={index} msg={message} side={message.role === 'user' ? 'user' : 'bot'} />
            ))
          )}
          {loading && <div className="mt-md"><Thinking /></div>}
        </div>

        <div className="input-zone" style={{ flexShrink: 0 }}>
          <div className={`input-wrap ${dragOver ? 'ring-2 ring-[var(--blue)]' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files) }}
          >
            <label htmlFor="doc-input" className="sr-only">{t.docChat?.inputPlaceholder || 'Escribe tu pregunta'}</label>
            <textarea id="doc-input" value={input} title={t.docChat?.inputPlaceholder || 'Escribe tu pregunta'} aria-label={t.docChat?.inputPlaceholder || 'Escribe tu pregunta'}
              onChange={e => {
                setInput(e.target.value)
                e.currentTarget.style.height = 'auto'
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 100)}px`
              }}
              onKeyDown={handleKeyDown} rows={1} placeholder={t.docChat?.inputPlaceholder || 'Pregunta por procedimientos, especificaciones, mantenimiento…'} disabled={!discipline || loading}
              className="flex-1 resize-none overflow-hidden bg-transparent border-none outline-none text-[13px] text-[var(--ink)] placeholder-[var(--ink3)]"
            />
            <button title={t.common?.send || 'Enviar'} aria-label={t.common?.send || 'Enviar'} className="send-btn" onClick={() => { void send() }} disabled={!discipline || loading}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>

          <div className="input-hint">
            {t.docChat?.inputHint || 'Enter para enviar · Shift+Enter nueva línea · '}
            {activeManual ? `📖 ${activeManual.name.slice(0, 30)}` : 'Powered by FastAPI + LM Studio'}
          </div>

          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" className="hidden" aria-label={t.docChat?.uploadManual || 'Cargar manual'} title={t.docChat?.uploadManual || 'Cargar manual'}
            onChange={e => { void handleFiles(e.target.files); e.currentTarget.value = '' }}
          />

          {uploading && (
            <div className="mt-2 text-xs text-[var(--ink3)]">
              {t.common?.processing || 'Procesando archivo...'} {uploadPct}%
            </div>
          )}

          {manuals.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {manuals.map(manual => (
                <div key={manual.id} className="flex items-center gap-1">
                  <button type="button" className={`rounded-full border px-3 py-1 text-xs ${manual.id === activeManualId ? 'border-[var(--blue)] bg-[var(--blue-bg)] text-[var(--blue)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink2)]'}`} onClick={() => setActiveManualId(manual.id)}>
                    {manual.name}
                  </button>
                  <button type="button" className="text-xs text-[var(--red)] underline opacity-70 hover:opacity-100" onClick={() => removeManual(manual.id)} title={t.common?.remove || 'Quitar'}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}