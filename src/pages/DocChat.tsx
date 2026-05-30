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

interface PlantRecord {
  id: number | string
  name?: string
  nombre?: string
  ubicacion?: string
}

interface DisciplineRecord {
  id: number | string
  name?: string
  nombre?: string
}

interface MachineRecord {
  id: number | string
  name?: string
  nombre?: string
  discipline_id?: number | string | null
  disciplineId?: number | string | null
  plant_id?: number | string | null
  plantId?: number | string | null
  planta_id?: number | string | null
  plant_name?: string | null
  plant?: string | null
}

interface WorkOrderRecord {
  id: number | string
  numero_ot?: string | number
  title?: string
  nombre?: string
  description?: string
  descripcion_problema?: string
  machine?: string | null
  machine_name?: string | null
  machineId?: number | string | null
  machine_id?: number | string | null
  plant?: string | null
  planta?: string | null
  plant_name?: string | null
  plant_id?: number | string | null
  disciplina?: string | null
  discipline?: string | null
  discipline_id?: number | string | null
  priority?: string
  status?: string
  estado?: string
  age_minutes?: number
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

const normalizeCatalogName = (record: { name?: string; nombre?: string } | null | undefined): string => {
  if (!record) return ''
  return String(record.name ?? record.nombre ?? '').trim()
}

const normalizePlantLabel = (
  record: { name?: string; nombre?: string; ubicacion?: string } | null | undefined
): string => {
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

  const machinePlant =
    machine?.plant_name ??
    machine?.plant ??
    machine?.plant_id ??
    machine?.plantId ??
    machine?.planta_id

  return machinePlant ? String(machinePlant).trim() : ''
}

const normalizeWorkOrderDiscipline = (ot: WorkOrderRecord, machine: MachineRecord | null): string => {
  const raw = String(ot.discipline ?? ot.disciplina ?? ot.discipline_id ?? '').trim()
  if (raw) return raw

  const machineDiscipline = machine?.discipline_id ?? machine?.disciplineId
  return machineDiscipline === null || machineDiscipline === undefined ? '' : String(machineDiscipline).trim()
}

const getWorkOrderTitle = (ot: WorkOrderRecord): string => {
  return String(ot.numero_ot ?? ot.title ?? ot.nombre ?? `OT ${ot.id}`).trim()
}

const getWorkOrderStatus = (ot: WorkOrderRecord): string => {
  return String(ot.status ?? ot.estado ?? 'Open').trim()
}

const getWorkOrderPriority = (ot: WorkOrderRecord): string => {
  return String(ot.priority ?? 'Medium').trim()
}

const DocChat: React.FC = () => {
  const {
    apiBase,
    lmBase,
    discipline,
    plant,
    docMachine,
    docMessages,
    pushDocMessage,
    loading,
    setLoading,
    setDiscipline,
    setPlant,
    setDocMachine,
    selectedMachine,
    setSelectedMachine,
    user,
    lang,
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
  const location = useLocation()
  const t = useMemo(() => getTranslations(lang), [lang])
  const isEs = normalizeLang(lang) === 'es'
  const apiRoot = apiBase.replace(/\/$/, '')
  const lmRoot = lmBase.replace(/\/$/, '')
  const langKey = normalizeLang(lang) as 'es' | 'en'

  const activeManual = useMemo(
    () => manuals.find(m => m.id === activeManualId) ?? null,
    [manuals, activeManualId]
  )

  const normalizedPlants = useMemo<PlantRecord[]>(() => {
    if (plants.length > 0) return plants
    return PLANTS_FALLBACK
  }, [plants])

  const selectedPlantRecord = useMemo(() => {
    const selected = normalizedPlants.find(item => String(item.id) === String(plant))
    return selected ?? normalizedPlants[0] ?? null
  }, [normalizedPlants, plant])

  const selectedDisciplineRecord = useMemo(() => {
    if (!discipline) return null
    return disciplines.find(item => normalizeCatalogName(item) === discipline) ?? null
  }, [discipline, disciplines])

  const selectedMachineRecord = useMemo(() => {
    if (!docMachine || docMachine === 'all') return null
    return (
      machines.find(item => String(item.id) === docMachine) ??
      machines.find(item => normalizeMachineLabel(item) === docMachine) ??
      null
    )
  }, [docMachine, machines])

  const availableMachines = useMemo(() => {
    if (!selectedDisciplineRecord) return machines
    return machines.filter(machine => {
      const machineDiscipline = machine.discipline_id ?? machine.disciplineId
      if (machineDiscipline === undefined || machineDiscipline === null || machineDiscipline === '') return true
      return String(machineDiscipline) === String(selectedDisciplineRecord.id)
    })
  }, [machines, selectedDisciplineRecord])

  useEffect(() => {
    if (location.state && typeof location.state === 'object') {
      const s = location.state as { discipline?: string; plant?: string }
      if (s.discipline) setDiscipline(s.discipline)
      if (s.plant) setPlant(s.plant)
    }
  }, [location.state, setDiscipline, setPlant])

  useEffect(() => {
    if (areaRef.current) areaRef.current.scrollTop = areaRef.current.scrollHeight
  }, [docMessages.length])

  useEffect(() => {
    let alive = true

    const loadCatalogs = async () => {
      setCatalogsLoading(true)
      try {
        const [plantsRes, disciplinesRes, machinesRes, workOrdersRes] = await Promise.all([
          fetch(`${apiRoot}/plants`, { method: 'GET' }),
          fetch(`${apiRoot}/disciplines`, { method: 'GET' }),
          fetch(`${apiRoot}/machines`, { method: 'GET' }),
          fetch(`${apiRoot}/work-orders`, { method: 'GET' }),
        ])

        const [plantsData, disciplinesData, machinesData, workOrdersData] = await Promise.all([
          plantsRes.ok ? plantsRes.json() : Promise.resolve([]),
          disciplinesRes.ok ? disciplinesRes.json() : Promise.resolve([]),
          machinesRes.ok ? machinesRes.json() : Promise.resolve([]),
          workOrdersRes.ok ? workOrdersRes.json() : Promise.resolve([]),
        ])

        if (!alive) return

        setPlants(Array.isArray(plantsData) ? plantsData : [])
        setDisciplines(Array.isArray(disciplinesData) ? disciplinesData : [])
        setMachines(Array.isArray(machinesData) ? machinesData : [])
        setWorkOrders(Array.isArray(workOrdersData) ? workOrdersData : [])
      } catch {
        if (!alive) return
        setPlants([])
        setDisciplines([])
        setMachines([])
        setWorkOrders([])
      } finally {
        if (alive) setCatalogsLoading(false)
      }
    }

    void loadCatalogs()
    return () => { alive = false }
  }, [apiRoot])

  useEffect(() => {
    if (!selectedDisciplineRecord) return
    if (docMachine === 'all') return

    const machineStillValid = availableMachines.some(
      machine => String(machine.id) === docMachine || normalizeMachineLabel(machine) === docMachine
    )

    if (!machineStillValid) {
      setDocMachine('all')
      setSelectedMachine(null)
    }
  }, [availableMachines, docMachine, selectedDisciplineRecord, setDocMachine, setSelectedMachine])

  const filteredOTs = useMemo(() => {
    const selectedPlantId = String(plant || '')
    const selectedDisciplineId = selectedDisciplineRecord ? String(selectedDisciplineRecord.id) : ''
    const selectedMachineId = docMachine && docMachine !== 'all' ? String(docMachine) : ''

    return workOrders.filter(ot => {
      const machineMatch =
        selectedMachineId === ''
          ? true
          : (() => {
              const otMachineName = normalizeWorkOrderMachine(ot)
              const machineById = machines.find(machine => String(machine.id) === selectedMachineId)
              const machineByName = machines.find(machine => normalizeMachineLabel(machine) === selectedMachineId)
              const selectedMachineLabel = normalizeMachineLabel(machineById ?? machineByName ?? null)
              if (selectedMachineLabel) {
                return otMachineName === selectedMachineLabel || otMachineName === selectedMachineId
              }
              return otMachineName === selectedMachineId
            })()

      const machineForOt =
        machines.find(machine => normalizeMachineLabel(machine) === normalizeWorkOrderMachine(ot)) ??
        machines.find(machine => String(machine.id) === String(ot.machineId ?? ot.machine_id ?? '')) ??
        null

      const disciplineMatch =
        selectedDisciplineId === ''
          ? true
          : (() => {
              const otDiscipline = normalizeWorkOrderDiscipline(ot, machineForOt)
              if (!otDiscipline) return true
              return otDiscipline === selectedDisciplineId || otDiscipline === normalizeCatalogName(selectedDisciplineRecord)
            })()

      const plantMatch =
        selectedPlantId === ''
          ? true
          : (() => {
              const selectedPlantLabel = normalizePlantLabel(selectedPlantRecord)
              const otPlant = normalizeWorkOrderPlant(ot, machineForOt)
              if (!otPlant) return true
              return (
                otPlant === selectedPlantId ||
                otPlant === selectedPlantLabel ||
                otPlant === String(selectedPlantRecord?.id ?? '')
              )
            })()

      return machineMatch && disciplineMatch && plantMatch
    })
  }, [docMachine, machines, plant, selectedDisciplineRecord, selectedPlantRecord, workOrders])

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

      const response = await fetch(`${apiRoot}/documents/upload`, {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(30_000),
      })

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
    } catch {
      // fallback local
    }

    setUploadPct(40)
    let text = ''
    let pageCount = 1

    try {
      if (/\.(txt|md)$/i.test(file.name)) {
        text = await file.text()
        pageCount = Math.max(1, Math.round(text.length / 3000))
      } else if (/\.pdf$/i.test(file.name)) {
        const ab = await file.arrayBuffer()
        const raw = new TextDecoder('latin1').decode(ab)
        const strings = raw.match(/\(([^)]{8,300})\)/g) ?? []
        text = strings
          .map(s => s.slice(1, -1))
          .join(' ')
          .replace(/[^\x20-\x7E\u00C0-\u024F\n ]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        const pageMatches = raw.match(/\/Page\b/g)
        pageCount = pageMatches ? pageMatches.length : Math.max(1, Math.round(file.size / 4096))
      } else {
        text = await file.text().catch(() => '')
        pageCount = Math.max(1, Math.round(text.length / 3000))
      }
    } catch {
      text = ''
    }

    setUploadPct(75)
    const chunks = text.length > 100 ? chunkText(text, file.name) : []
    const doc: ManualDoc = {
      id: `local-${Date.now()}`,
      name: file.name,
      size: fmtSize(file.size),
      pages: pageCount,
      isDemo: false,
      uploadedBy: user?.name ?? 'operador',
      uploadedAt: new Date(),
      chunks,
    }
    setManuals(prev => [...prev, doc])
    setActiveManualId(doc.id)
    setUploading(false)
    setUploadPct(0)
  }, [apiRoot, user?.name])

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      await processFile(file)
    }
  }, [processFile])

  const removeManual = (id: string) => {
    setManuals(prev => prev.filter(m => m.id !== id))
    if (activeManualId === id) {
      setActiveManualId('')
    }
  }

  const send = async () => {
    const query = input.trim()
    if (!query || loading || !discipline) return

    setLoading(true)
    setInput('')

    const contextMachine = selectedMachineRecord ? Number(selectedMachineRecord.id) : null
    const el = document.getElementById('doc-input')
    if (el) (el as HTMLTextAreaElement).style.height = 'auto'

    pushDocMessage({ role: 'user', content: query, timestamp: Date.now() })

    try {
      const response = await fetch(`${apiRoot}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          context_machine: contextMachine,
          language: normalizeLang(lang),
        }),
        signal: AbortSignal.timeout(30_000),
      })

      if (response.ok) {
        const data = await response.json() as ChatApiResponse
        pushDocMessage({ role: 'assistant', content: data.reply, timestamp: Date.now() })
        setLoading(false)
        return
      }

      if (response.status === 503) {
        const friendly = isEs
          ? 'El asistente está desconectado temporalmente (LM Studio no está disponible). Intenta nuevamente en unos segundos.'
          : 'The assistant is temporarily disconnected (LM Studio is not available). Please try again in a few seconds.'
        pushDocMessage({ role: 'assistant', content: friendly, timestamp: Date.now() })
        setLoading(false)
        return
      }
    } catch {
      // fallback abajo
    }

    const chunks = retrieveFromManual(query, activeManual?.chunks ?? [])
    const ctx = chunks.length
      ? chunks.map((chunk, index) => `[FRAGMENTO ${index + 1} — ${chunk.doc} p.${chunk.page}]\n${chunk.text}`).join('\n\n')
      : '[Sin manual cargado — responde con conocimiento general de mantenimiento industrial]'
    const manualNote = activeManual ? `Manual activo: ${activeManual.name}.` : ''
    const machineName = selectedMachineRecord?.name ?? null
    const system = `Eres BARB, asistente experto en mantenimiento industrial. Disciplina: ${discipline}. ${machineName ? `Equipo seleccionado: ${machineName}.` : ''} ${manualNote}\nResponde en ${isEs ? 'español' : 'inglés'}, paso a paso, citando página del manual cuando disponible. Usa ⚠️ para advertencias de seguridad.\n\nCONTEXTO MANUAL:\n${ctx}`

    try {
      const response = await fetch(`${lmRoot}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local-model',
          temperature: 0.1,
          max_tokens: 1500,
          stream: false,
          messages: [
            { role: 'system', content: system },
            ...docMessages.slice(-4).map(message => ({ role: message.role, content: message.content })),
            { role: 'user', content: query },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      })

      if (response.ok) {
        const data = await response.json() as { choices?: Array<{ message: { content: string } }> }
        const answer = data.choices?.[0]?.message?.content ?? ''
        pushDocMessage({ role: 'assistant', content: answer, timestamp: Date.now() })
        setLoading(false)
        return
      }
    } catch {
      // demo fallback
    }

    const demoAns = chunks.length
      ? `**[DEMO — sin backend activo]**\n\nBasado en el manual:\n\n${chunks[0].text}\n\n*Inicia LM Studio (${lmBase}) o el backend FastAPI (${apiBase}) para respuestas inteligentes.*`
      : `**[DEMO]** No hay contexto disponible. Carga un manual PDF o inicia el backend.`
    pushDocMessage({ role: 'assistant', content: demoAns, timestamp: Date.now() })
    setLoading(false)
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
            🗂️ {isEs ? 'OTs asignadas' : 'Assigned OTs'}
            <span className="ml-count">{filteredOTs.length}</span>
          </span>

          <div className="manual-list-scroll">
            {filteredOTs.map(ot => {
              const title = getWorkOrderTitle(ot)
              const machineLabel = normalizeWorkOrderMachine(ot) || '—'
              const status = getWorkOrderStatus(ot)
              const priority = getWorkOrderPriority(ot)

              return (
                <button
                  key={String(ot.id)}
                  className="manual-item"
                  type="button"
                  title={`${title} · ${machineLabel} · ${status} · ${priority}`}
                  onClick={() => {}}
                >
                  <div className="mi-icon">🛠️</div>
                  <div className="mi-body">
                    <div className="mi-name">{title}</div>
                    <div className="mi-meta">{normalizeWorkOrderPlant(ot, ot.machine_meta ?? null) || selectedPlantRecord?.name || selectedPlantRecord?.nombre || '—'}</div>
                    <div className="mi-meta">{machineLabel}</div>
                    <div className="mi-meta">{status} · {priority}</div>
                  </div>
                  <span className="mi-badge">OT</span>
                </button>
              )
            })}

            {catalogsLoading && (
              <div style={{ fontSize: 11, color: 'var(--ink3)', textAlign: 'center', padding: '8px 0' }}>
                {isEs ? 'Cargando catálogos...' : 'Loading catalogs...'}
              </div>
            )}
          </div>
        </div>

        <div className="lib-sep" />

        <div className="panel-section">
          <span className="panel-label">{isEs ? 'Planta / Ubicación' : 'Plant / Location'}</span>
          <select
            aria-label={isEs ? 'Seleccionar planta' : 'Select plant'}
            className="form-select"
            value={String(plant)}
            onChange={e => setPlant(e.target.value)}
            disabled={loading || catalogsLoading}
          >
            {normalizedPlants.map(p => {
              const label = normalizePlantLabel(p)
              return (
                <option key={String(p.id)} value={String(p.id)}>
                  {label || p.ubicacion || String(p.id)}
                </option>
              )
            })}
          </select>
        </div>

        <div className="panel-section">
          <span className="panel-label">{isEs ? 'Disciplina' : 'Discipline'}</span>
          <select
            aria-label={isEs ? 'Seleccionar disciplina' : 'Select discipline'}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            value={discipline ?? ''}
            onChange={e => {
              const nextName = e.target.value
              setDiscipline(nextName || null)
              setDocMachine('all')
              setSelectedMachine(null)
            }}
            disabled={loading || catalogsLoading}
          >
            <option value="">{isEs ? 'Seleccionar disciplina...' : 'Select discipline...'}</option>
            {disciplines.map(option => {
              const name = normalizeCatalogName(option)
              return (
                <option key={String(option.id)} value={name}>
                  {name || String(option.id)}
                </option>
              )
            })}
          </select>
        </div>

        <div className="panel-section">
          <span className="panel-label">{isEs ? 'Máquina (opcional)' : 'Machine (optional)'}</span>
          <select
            aria-label={isEs ? 'Seleccionar máquina' : 'Select machine'}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            value={docMachine === 'all' ? '' : docMachine}
            onChange={e => {
              const nextMachineId = e.target.value
              setDocMachine(nextMachineId || 'all')
              setSelectedMachine(nextMachineId || null)
            }}
            disabled={loading || catalogsLoading || !selectedDisciplineRecord}
          >
            <option value="">{isEs ? 'Seleccionar máquina...' : 'Select machine...'}</option>
            {availableMachines.map(option => {
              const machineName = normalizeMachineLabel(option)
              return (
                <option key={String(option.id)} value={String(option.id)}>
                  {machineName || String(option.id)}
                </option>
              )
            })}
          </select>
        </div>
      </div>

      <div className="panel-right">
        {activeManual && (
          <div className="manual-active-bar">
            <span style={{ fontSize: 14 }}>📖</span>
            <span className="mab-name">{activeManual.name}</span>
            <span className="mab-meta">
              {[activeManual.pages ? `${activeManual.pages}p` : '', activeManual.chunks.length ? `${activeManual.chunks.length} fragmentos` : '']
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span className="mab-clear" onClick={() => setActiveManualId('')} title={isEs ? 'Deseleccionar' : 'Clear'}>✕</span>
          </div>
        )}

        <div className="context-tags" style={{ flexShrink: 0 }}>
          {!discipline ? (
            <span className="ctx-empty">
              {isEs ? 'Selecciona una disciplina para empezar a chatear con la documentación' : 'Select a discipline to start chatting with documentation'}
            </span>
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
            <div className="chat-empty">
              <div style={{ fontSize: 44, marginBottom: 12, opacity: 0.4 }}>💬</div>
              <h3 style={{ fontSize: 16, color: 'var(--ink2)', marginBottom: 8, fontWeight: 500 }}>
                {!activeManualId
                  ? (isEs ? 'Selecciona un manual de la biblioteca' : 'Select a manual from the library')
                  : !discipline
                    ? (isEs ? 'Selecciona una disciplina para empezar' : 'Select a discipline to start')
                    : (isEs ? 'Haz tu primera pregunta' : 'Ask your first question')}
              </h3>
              <p style={{ fontSize: 13, maxWidth: 320, lineHeight: 1.6 }}>
                {isEs
                  ? 'Puedes cambiar planta, disciplina y máquina desde el panel lateral. Carga un manual PDF para activar el RAG.'
                  : 'Change plant, discipline and machine from the side panel. Upload a PDF manual to activate RAG.'}
              </p>
              <button
                className="btn btn-outline btn-sm"
                style={{ marginTop: 16, width: 200 }}
                onClick={() => fileInputRef.current?.click()}
              >
                📄 {isEs ? 'Cargar manual ahora' : 'Upload manual now'}
              </button>
            </div>
          ) : (
            docMessages.map((message, index) => (
              <ChatBubble key={index} msg={message} side={message.role === 'user' ? 'user' : 'bot'} />
            ))
          )}
          {loading && <div className="mt-md"><Thinking /></div>}
        </div>

        <div className="input-zone" style={{ flexShrink: 0 }}>
          <div
            className={`input-wrap ${dragOver ? 'ring-2 ring-[var(--blue)]' : ''}`}
            onDragOver={e => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              void handleFiles(e.dataTransfer.files)
            }}
          >
            <label htmlFor="doc-input" className="sr-only">
              {isEs ? 'Escribe tu pregunta' : 'Type your question'}
            </label>
            <textarea
              id="doc-input"
              value={input}
              title={isEs ? 'Escribe tu pregunta' : 'Type your question'}
              aria-label={isEs ? 'Escribe tu pregunta para el asistente' : 'Type your question for the assistant'}
              onChange={e => {
                setInput(e.target.value)
                e.currentTarget.style.height = 'auto'
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 100)}px`
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={isEs ? 'Pregunta por procedimientos, especificaciones, mantenimiento…' : 'Ask about procedures, specifications, maintenance…'}
              disabled={!discipline || loading}
              className="flex-1 resize-none overflow-hidden bg-transparent border-none outline-none text-[13px] text-[var(--ink)] placeholder-[var(--ink3)]"
            />
            <button
              title={isEs ? 'Enviar mensaje' : 'Send message'}
              aria-label={isEs ? 'Enviar' : 'Send'}
              className="send-btn"
              onClick={() => { void send() }}
              disabled={!discipline || loading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>

          <div className="input-hint">
            {isEs ? 'Enter para enviar · Shift+Enter nueva línea · ' : 'Enter to send · Shift+Enter new line · '}
            {activeManual ? `📖 ${activeManual.name.slice(0, 30)}` : 'Powered by FastAPI + LM Studio'}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            aria-label={isEs ? 'Cargar manual desde archivo' : 'Upload manual from file'}
            title={isEs ? 'Cargar manual desde archivo' : 'Upload manual from file'}
            onChange={e => {
              void handleFiles(e.target.files)
              e.currentTarget.value = ''
            }}
          />

          {uploading && (
            <div className="mt-2 text-xs text-[var(--ink3)]">
              {isEs ? 'Procesando archivo...' : 'Processing file...'} {uploadPct}%
            </div>
          )}

          {manuals.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {manuals.map(manual => (
                <button
                  key={manual.id}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs ${manual.id === activeManualId ? 'border-[var(--blue)] bg-[var(--blue-bg)] text-[var(--blue)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink2)]'}`}
                  onClick={() => setActiveManualId(manual.id)}
                >
                  {manual.name}
                </button>
              ))}
            </div>
          )}

          {manuals.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {manuals.map(manual => (
                <button
                  key={`${manual.id}-remove`}
                  type="button"
                  className="text-xs text-[var(--ink3)] underline"
                  onClick={() => removeManual(manual.id)}
                >
                  {isEs ? 'Quitar' : 'Remove'} {manual.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DocChat
