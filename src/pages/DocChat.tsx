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

interface SavedSession {
  id: string
  title: string
  saved_at: string
  saved_by: string
  discipline: string | null
  plant_id: string | null
  machine_id: string | null
  machine_name: string | null
  active_manual: string | null
  messages: Array<{ role: string; content: string; timestamp: number }>
  metadata: {
    ot_context?: string
    lang: string
    message_count: number
  }
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface ManualDoc {
  id: string
  name: string
  size: string
  pages: number | null
  isDemo: boolean
  uploadedBy: string
  uploadedAt: Date
  chunks: Array<{
    text: string
    page: number
    doc: string
  }>
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
  disciplina_id?: number | string | null
  disciplinaId?: number | string | null
  plant_id?: number | string | null
  plantId?: number | string | null
  planta_id?: number | string | null
  plant_name?: string | null
  plant?: string | null
}

interface WorkOrderRecord {
  id?: number | string
  ot_id?: number | string
  numero_ot?: string | number
  title?: string
  nombre?: string
  description?: string
  descripcion_problema?: string
  machine?: string | null
  machine_name?: string | null
  machineId?: number | string | null
  machine_id?: number | string | null
  maquina_id?: number | string | null
  maquinaId?: number | string | null
  plant?: string | null
  planta?: string | null
  plant_name?: string | null
  plant_id?: number | string | null
  planta_id?: number | string | null
  disciplina?: string | null
  discipline?: string | null
  discipline_id?: number | string | null
  discipline_name?: string | null
  priority?: string
  status?: string
  estado?: string
  age_minutes?: number
  machine_meta?: MachineRecord | null
}

/* -----------------------------------------------------------------------------
 * Constantes
 * -------------------------------------------------------------------------- */

const PLANTS_FALLBACK: PlantRecord[] = [
  { id: 1, name: 'Planta principal de producción', ubicacion: 'Main Production Plant' },
  { id: 2, name: 'Línea de ensamblaje 2', ubicacion: 'Assembly Line 2' },
  { id: 3, name: 'Bodega / almacén', ubicacion: 'Warehouse Facility' },
]

/* -----------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */

const normalizeId = (value: unknown): string =>
  value == null ? '' : String(value)

const fmtSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const chunkText = (
  text: string,
  filename: string,
  chunkSize = 500,
  overlap = 60,
): ManualDoc['chunks'] => {
  const words = text.trim().split(/\s+/)
  const chunks: ManualDoc['chunks'] = []
  const pageCount = Math.max(1, Math.round(text.length / 3000))

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const slice = words.slice(i, i + chunkSize).join(' ')
    if (slice.trim().length < 40) continue
    chunks.push({
      text: slice,
      page: Math.max(1, Math.round((i / words.length) * Math.max(pageCount * 2, 10))),
      doc: filename,
    })
  }

  return chunks
}

const retrieveFromManual = (
  query: string,
  chunks: ManualDoc['chunks'],
  k = 4,
) => {
  if (!chunks.length) return []

  const queryTokens = new Set(tokenize(query))

  return chunks
    .map(chunk => {
      const tokens = tokenize(chunk.text)
      let score = 0

      queryTokens.forEach(token => {
        const frequency = tokens.filter(
          t => t.includes(token) || token.includes(t),
        ).length
        if (frequency > 0) score += 1 + Math.log(frequency)
      })

      return { ...chunk, score }
    })
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

const normalizeCatalogName = (record: any): string => {
  if (!record) return ''
  if (typeof record === 'string') return record.trim()
  return String(
    record.label ?? record.nombre ?? record.Nombre ?? record.name ?? record.disciplina ?? '',
  ).trim()
}

const normalizePlantLabel = (
  record: { name?: string; nombre?: string; ubicacion?: string } | null | undefined,
): string =>
  String(record?.name ?? record?.nombre ?? record?.ubicacion ?? '').trim()

const normalizeMachineLabel = (record: MachineRecord | null | undefined): string =>
  String(record?.name ?? record?.nombre ?? record?.label ?? '').trim()

const normalizeWorkOrderMachine = (
  ot: WorkOrderRecord,
  machine?: MachineRecord | null,
): string =>
  String(
    machine?.name ?? ot.machine_name ?? ot.machine ?? ot.maquina_id ?? ot.machine_id ?? '',
  ).trim()

const normalizeWorkOrderPlant = (
  ot: WorkOrderRecord,
  machine: MachineRecord | null,
): string => {
  const plant = String(ot.plant_name ?? ot.plant ?? ot.planta ?? '').trim()
  if (plant) return plant
  return String(
    machine?.plant_name ?? machine?.plant ?? machine?.plant_id ?? machine?.plantId ?? machine?.planta_id ?? '',
  ).trim()
}

const normalizeWorkOrderDiscipline = (
  ot: WorkOrderRecord,
  machine: MachineRecord | null,
): string => {
  const discipline = String(ot.discipline ?? ot.disciplina ?? ot.discipline_id ?? '').trim()
  if (discipline) return discipline
  return String(machine?.discipline_id ?? machine?.disciplineId ?? '').trim()
}

const getWorkOrderTitle = (ot: WorkOrderRecord): string =>
  String(ot.numero_ot ?? ot.title ?? ot.nombre ?? `OT ${ot.ot_id ?? ot.id}`).trim()

const getWorkOrderStatus = (ot: WorkOrderRecord): string =>
  String(ot.status ?? ot.estado ?? 'open').trim().toLowerCase()

const getWorkOrderPriority = (ot: WorkOrderRecord): string =>
  String(ot.priority ?? 'medium').trim().toLowerCase()

/* -----------------------------------------------------------------------------
 * Componente principal
 * -------------------------------------------------------------------------- */

export default function DocChat() {
  const {
    apiBase,
    lmBase,
    discipline,
    plant,
    docMachine,
    docMessages,
    pushDocMessage,
    clearDocMessages,
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

  /* ---------------------------------------------------------------------------
   * Estado local
   * -------------------------------------------------------------------------- */

  const [input, setInput] = useState('')
  const [manuals, setManuals] = useState<ManualDoc[]>([])
  const [activeManualId, setActiveManualId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false) // ESTADO PARA MOVIL

  const [plants, setPlants] = useState<PlantRecord[]>([])
  const [disciplines, setDisciplines] = useState<DisciplineRecord[]>([])
  const [machines, setMachines] = useState<MachineRecord[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([])
  const [catalogsLoading, setCatalogsLoading] = useState(false)

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('')

  const areaRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevDisciplineRef = useRef<string | null>(discipline)
  const prevDocMachineRef = useRef(docMachine)

  const location = useLocation()

  const t = useMemo(() => getTranslations(lang), [lang])
  const nLang = normalizeLang(lang)

  const apiRoot = useMemo(
    () => (apiBase || 'http://localhost:9000/api').replace(/\/$/, ''),
    [apiBase],
  )

  const lmRoot = useMemo(
    () => (lmBase || 'http://localhost:1234/v1').replace(/\/$/, ''),
    [lmBase],
  )

  /* ---------------------------------------------------------------------------
   * Estado derivado
   * -------------------------------------------------------------------------- */

  const activeManual = useMemo(
    () => manuals.find(manual => manual.id === activeManualId) ?? null,
    [manuals, activeManualId],
  )

  const normalizedPlants = useMemo(
    () => (plants.length ? plants : PLANTS_FALLBACK),
    [plants],
  )

  const selectedPlantRecord = useMemo(
    () =>
      normalizedPlants.find(
        plantRecord => String(plantRecord.id) === String(plant),
      ) ??
      normalizedPlants[0] ??
      null,
    [normalizedPlants, plant],
  )

  const selectedDisciplineRecord = useMemo(() => {
    if (!discipline) return null
    return (
      disciplines.find(
        disciplineRecord => normalizeCatalogName(disciplineRecord) === discipline,
      ) ?? null
    )
  }, [discipline, disciplines])

  const machinesById = useMemo(
    () => new Map(machines.map(machine => [String(machine.id), machine])),
    [machines],
  )

  const selectedMachineRecord = useMemo(() => {
    if (!docMachine || docMachine === 'all') return null
    return (
      machinesById.get(String(docMachine)) ??
      machines.find(machine => normalizeMachineLabel(machine) === docMachine) ??
      null
    )
  }, [docMachine, machines, machinesById])

  const availableMachines = useMemo(() => {
    if (!selectedDisciplineRecord) return machines

    const disciplineId = String(selectedDisciplineRecord.id)

    return machines.filter(machine => {
      const machineDisciplineId =
        machine.discipline_id ??
        machine.disciplineId ??
        machine.disciplina_id ??
        machine.disciplinaId

      return (
        machineDisciplineId !== null &&
        machineDisciplineId !== undefined &&
        machineDisciplineId !== '' &&
        String(machineDisciplineId) === disciplineId
      )
    })
  }, [machines, selectedDisciplineRecord])

  /* ---------------------------------------------------------------------------
   * Efectos
   * -------------------------------------------------------------------------- */

  useEffect(() => {
    if (location.state && typeof location.state === 'object') {
      const state = location.state as { discipline?: string; plant?: string }
      if (state.discipline) setDiscipline(state.discipline)
      if (state.plant) setPlant(state.plant)
    }
  }, [location.state, setDiscipline, setPlant])

  useEffect(() => {
    const disciplineChanged = prevDisciplineRef.current !== discipline
    const machineChanged = prevDocMachineRef.current !== docMachine
    if (disciplineChanged) prevDisciplineRef.current = discipline
    if (machineChanged) prevDocMachineRef.current = docMachine
    if (disciplineChanged || machineChanged) clearDocMessages()
  }, [discipline, docMachine, clearDocMessages])

  useEffect(() => {
    areaRef.current?.scrollTo({ top: areaRef.current.scrollHeight, behavior: 'smooth' })
  }, [docMessages.length])

  useEffect(() => {
    if (!plant && normalizedPlants.length > 0) {
      setPlant(String(normalizedPlants[0].id))
    }
  }, [plant, normalizedPlants, setPlant])

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
        setWorkOrders(Array.isArray(workOrdersData) ? workOrdersData : workOrdersData?.data ?? [])
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          setPlants([])
          setDisciplines([])
          setMachines([])
          setWorkOrders([])
        }
      } finally {
        if (!controller.signal.aborted) setCatalogsLoading(false)
      }
    }

    void loadCatalogs()
    return () => controller.abort()
  }, [apiRoot])

  /* ---------------------------------------------------------------------------
   * Filtrado de OTs (Ahora MÁS PERMISIVO para que siempre aparezcan)
   * -------------------------------------------------------------------------- */

  const filteredOTs = useMemo(() => {
    const targetPlantId = normalizeId(plant)
    const targetDisciplineId = normalizeId(selectedDisciplineRecord?.id)
    const targetMachineId =
      docMachine && docMachine !== 'all' ? normalizeId(docMachine) : ''

    return workOrders.filter(workOrder => {
      const machineId = normalizeId(
        workOrder.machine_id ?? workOrder.maquina_id ?? workOrder.machineId ?? workOrder.maquinaId
      )
      const machine = machinesById.get(machineId)

      // 1. Filtro de Máquina (Si el usuario eligió una, DEBE coincidir)
      if (targetMachineId && machineId !== targetMachineId) return false

      // 2. Filtro de Planta (Solo ocultamos si la OT TIENE planta y es DISTINTA)
      const otPlantId = normalizeId(
        workOrder.plant_id ?? workOrder.planta_id ?? machine?.plant_id ?? machine?.planta_id
      )
      if (targetPlantId && otPlantId && otPlantId !== targetPlantId) return false

      // 3. Filtro de Disciplina (Solo ocultamos si la OT TIENE disciplina y es DISTINTA)
      const otDiscId = normalizeId(
        machine?.discipline_id ?? machine?.disciplina_id ?? workOrder.discipline_id ?? workOrder.disciplina_id
      )
      if (targetDisciplineId && otDiscId && otDiscId !== targetDisciplineId) return false

      return true
    })
  }, [workOrders, machinesById, plant, docMachine, selectedDisciplineRecord])

  /* ---------------------------------------------------------------------------
   * Procesamiento de archivos
   * -------------------------------------------------------------------------- */

  const processFile = useCallback(async (file: File) => {
    setUploading(true)
    setUploadPct(10)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'document')
      formData.append('context', 'document_library')

      const response = await fetch(`${apiRoot}/documents/upload`, {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const data = (await response.json()) as { id?: string }

        const manual: ManualDoc = {
          id: data.id ?? `srv-${Date.now()}`,
          name: file.name,
          size: fmtSize(file.size),
          pages: null,
          isDemo: false,
          uploadedBy: user?.name ?? 'operador',
          uploadedAt: new Date(),
          chunks: [],
        }

        setManuals(previous => [...previous, manual])
        setActiveManualId(manual.id)
        setUploadPct(100)
        return
      }
    } catch {
      // Fallback local
    }

    setUploadPct(40)

    let text = ''
    let pageCount = 1

    try {
      if (/\.(txt|md)$/i.test(file.name)) {
        text = await file.text()
        pageCount = Math.max(1, Math.round(text.length / 3000))
      } else if (/\.pdf$/i.test(file.name)) {
        const buffer = await file.arrayBuffer()
        const raw = new TextDecoder('latin1').decode(buffer)
        const strings = raw.match(/\(([^)]{8,300})\)/g) ?? []

        text = strings
          .map(value => value.slice(1, -1))
          .join(' ')
          .replace(/[^\x20-\x7E\u00C0-\u024F\n ]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        const pages = raw.match(/\/Page\b/g)
        pageCount = pages
          ? pages.length
          : Math.max(1, Math.round(file.size / 4096))
      } else {
        text = await file.text().catch(() => '')
        pageCount = Math.max(1, Math.round(text.length / 3000))
      }
    } catch {
      text = ''
    }

    const manual: ManualDoc = {
      id: `local-${Date.now()}`,
      name: file.name,
      size: fmtSize(file.size),
      pages: pageCount,
      isDemo: false,
      uploadedBy: user?.name ?? 'operador',
      uploadedAt: new Date(),
      chunks: text.length > 100 ? chunkText(text, file.name) : [],
    }

    setUploadPct(75)
    setManuals(previous => [...previous, manual])
    setActiveManualId(manual.id)
    setUploading(false)
    setUploadPct(0)
  }, [apiRoot, user?.name])

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      await processFile(file)
    }
  }, [processFile])

  const removeManual = useCallback((id: string) => {
    setManuals(previous => previous.filter(manual => manual.id !== id))
    if (activeManualId === id) setActiveManualId('')
  }, [activeManualId])

  /* ---------------------------------------------------------------------------
   * Guardar sesión
   * -------------------------------------------------------------------------- */

  const saveSession = useCallback(async (title: string) => {
    if (!docMessages.length) return

    setSaveStatus('saving')
    setSaveModalOpen(false)

    const machineRecord = selectedMachineRecord
    const plantRecord = selectedPlantRecord

    const payload = {
      title: title.trim() || `Sesión ${new Date().toLocaleString(nLang === 'en' ? 'en-US' : 'es-CL')}`,
      saved_by: user?.name ?? 'operador',
      discipline: discipline ?? null,
      plant_id: plant ? String(plant) : null,
      plant_name: normalizePlantLabel(plantRecord) || null,
      machine_id: docMachine && docMachine !== 'all' ? String(docMachine) : null,
      machine_name: machineRecord
        ? (machineRecord.name ?? machineRecord.nombre ?? null)
        : null,
      active_manual: activeManual?.name ?? null,
      messages: docMessages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp ?? Date.now(),
      })),
      metadata: {
        lang: nLang,
        message_count: docMessages.length,
      },
    }

    try {
      const response = await fetch(`${apiRoot}/chat-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail ?? `HTTP ${response.status}`)
      }

      setSaveStatus('saved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (error) {
      console.error('[DocChat] Error guardando sesión:', error)
      setSaveStatus('error')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 4000)
    }
  }, [
    docMessages,
    discipline,
    plant,
    selectedPlantRecord,
    docMachine,
    selectedMachineRecord,
    activeManual,
    user?.name,
    nLang,
    apiRoot,
  ])

  const openSaveModal = useCallback(() => {
    if (!docMessages.length) return
    const firstUserMsg = docMessages.find(m => m.role === 'user')
    const autoTitle = firstUserMsg
      ? firstUserMsg.content.slice(0, 60).replace(/\n/g, ' ')
      : `Sesión ${new Date().toLocaleDateString()}`
    setSessionTitle(autoTitle)
    setSaveModalOpen(true)
  }, [docMessages])

  /* ---------------------------------------------------------------------------
   * Envío de consulta (CON BUG DE LOADING CORREGIDO)
   * -------------------------------------------------------------------------- */

  const send = useCallback(async () => {
    const query = input.trim()
    if (!query || loading || !discipline) return

    setLoading(true)
    setInput('')

    const chatMachine = selectedMachine ?? docMachine

    const inputElement = document.getElementById('doc-input') as HTMLTextAreaElement | null
    inputElement?.style.setProperty('height', 'auto')

    pushDocMessage({ role: 'user', content: query, timestamp: Date.now() })

    const recentHistory = docMessages
      .slice(-6)
      .map(message => ({
        role: message.role === 'user' ? 'user' : 'assistant',
        content: message.content,
      }))

    try {
      const response = await fetch(`${apiRoot}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          language: nLang,
          machine: chatMachine,
          history: recentHistory,
        }),
      })

      if (response.ok) {
        const data = (await response.json()) as ChatApiResponse
        pushDocMessage({ role: 'assistant', content: data.reply, timestamp: Date.now() })
        setLoading(false) // <-- CORRECCIÓN APLICADA AQUI
        return
      }

      if (response.status === 503) {
        pushDocMessage({
          role: 'assistant',
          content:
            t.docChat?.lmStudioOffline ??
            'El asistente está desconectado temporalmente. Revisa LM Studio.',
          timestamp: Date.now(),
        })
        setLoading(false) // <-- CORRECCIÓN APLICADA AQUI
        return
      }

      const errorData = await response.json().catch(() => ({}))
      pushDocMessage({
        role: 'assistant',
        content: `⚠️ Falla en la IA en la nube: ${errorData.detail ?? `Error ${response.status}`}`,
        timestamp: Date.now(),
      })
      setLoading(false) // <-- CORRECCIÓN APLICADA AQUI
      return
    } catch {
      console.warn('FastAPI no disponible. Activando modo local.')
    }

    const chunks = retrieveFromManual(query, activeManual?.chunks ?? [])

    const context = chunks.length
      ? chunks
          .map(
            (chunk, index) =>
              `[FRAGMENTO ${index + 1} — ${chunk.doc} p.${chunk.page}]\n${chunk.text}`,
          )
          .join('\n\n')
      : '[Sin manual cargado — responde usando conocimiento general de mantenimiento industrial.]'

    const systemPrompt = `
Eres BARB, asistente experto en mantenimiento industrial.

Disciplina: ${discipline}
${selectedMachineRecord?.name ? `Equipo: ${selectedMachineRecord.name}` : ''}
${activeManual ? `Manual activo: ${activeManual.name}` : ''}

Responde en ${nLang === 'en' ? 'inglés' : 'español'}.

Prioridades:
- Explicar paso a paso.
- Priorizar seguridad.
- Citar la página del manual cuando exista.
- Utilizar ⚠️ para advertencias.

CONTEXTO:

${context}
`.trim()

    try {
      const response = await fetch(`${lmRoot}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local-model',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query },
          ],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const answer = data.choices?.[0]?.message?.content ?? data.result ?? ''
        pushDocMessage({
          role: 'assistant',
          content: `*(Modo Fallback)*\n\n${answer}`,
          timestamp: Date.now(),
        })
        return
      }
    } catch {
      const demoResponse = chunks.length
        ? `**[DEMO — Sin backend]**\n\nBasado en el manual:\n\n${chunks[0].text}\n\nInicia LM Studio o FastAPI para obtener respuestas inteligentes.`
        : '**[Modo Local]** No existe conexión al backend y tampoco hay manuales cargados.'

      pushDocMessage({ role: 'assistant', content: demoResponse, timestamp: Date.now() })
    } finally {
      setLoading(false)
    }
  }, [
    input,
    loading,
    discipline,
    selectedMachine,
    docMachine,
    docMessages,
    apiRoot,
    nLang,
    pushDocMessage,
    activeManual,
    selectedMachineRecord,
    lmRoot,
    t,
    setLoading,
  ])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void send()
      }
    },
    [send],
  )

  /* ---------------------------------------------------------------------------
   * Render
   * -------------------------------------------------------------------------- */

  return (
    <div className="two-panel w-full h-full relative">
      
      {/* OVERLAY FONDO OSCURO PARA MOVIL */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* -----------------------------------------------------------------------
       * Panel izquierdo (AHORA RESPONSIVO)
       * -------------------------------------------------------------------- */}
      <div
        className={`panel-left transition-transform duration-300 ${
          isSidebarOpen
            ? 'flex absolute left-0 top-0 z-50 h-full w-[280px] bg-[var(--bg)] shadow-2xl translate-x-0'
            : 'hidden md:flex'
        }`}
      >
        {/* ENCABEZADO MOVIL DEL PANEL */}
        <div className="md:hidden flex justify-between items-center mb-4 border-b border-[var(--border)] pb-2">
          <span className="font-bold text-[var(--ink)]">Filtros y OTs</span>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="text-[var(--ink2)] p-1 hover:text-[var(--red)] transition"
          >
            ✕
          </button>
        </div>

        {/* Órdenes de Trabajo */}
        <div className="panel-section">
          <span className="panel-label">
            Target OTs
            <span className="ml-count">{filteredOTs.length}</span>
          </span>

          <div className="manual-list-scroll">
            {filteredOTs.map(workOrder => {
              const machineId = String(
                workOrder.maquina_id ??
                  workOrder.maquinaId ??
                  workOrder.machine_id ??
                  workOrder.machineId ??
                  '',
              )
              const machine = machinesById.get(machineId) ?? null
              const title = getWorkOrderTitle(workOrder)
              const machineLabel = normalizeWorkOrderMachine(workOrder, machine) || '—'
              const statusKey = getWorkOrderStatus(workOrder)
              const status = t.statuses?.[statusKey] ?? statusKey
              const priority = getWorkOrderPriority(workOrder)

              return (
                <button
                  key={String(workOrder.id)}
                  type="button"
                  className="manual-item"
                  title={`${title} · ${machineLabel} · ${status} · ${priority}`}
                  onClick={() => {
                    const description =
                      workOrder.description ??
                      workOrder.descripcion_problema ??
                      'Sin descripción detallada'

                    setInput(
                      `Contexto de OT seleccionada:\n\n- Orden: ${title}\n- Equipo: ${machineLabel}\n- Estado: ${status} (Prioridad: ${priority})\n- Problema reportado: ${description}\n\nConsiderando esta información, `,
                    )
                    
                    // Si el usuario toca una OT en móvil, cerramos el panel automáticamente
                    if (window.innerWidth < 768) setIsSidebarOpen(false)

                    requestAnimationFrame(() => {
                      const el = document.getElementById('doc-input') as HTMLTextAreaElement | null
                      if (!el) return
                      el.focus()
                      el.style.height = 'auto'
                      el.style.height = `${Math.min(el.scrollHeight, 150)}px`
                    })
                  }}
                >
                  <div className="mi-icon">🛠️</div>
                  <div className="mi-body">
                    <div className="mi-name">{title}</div>
                    <div className="mi-meta">
                      {normalizeWorkOrderPlant(workOrder, machine) ||
                        selectedPlantRecord?.name ||
                        selectedPlantRecord?.nombre ||
                        '—'}
                    </div>
                    <div className="mi-meta">{machineLabel}</div>
                    <div className="mi-meta capitalize">
                      {status} · {priority}
                    </div>
                  </div>
                  <span className="mi-badge">OT</span>
                </button>
              )
            })}

            {catalogsLoading && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--ink3)',
                  textAlign: 'center',
                  padding: '8px 0',
                }}
              >
                {t.common?.loading ?? 'Cargando...'}
              </div>
            )}
          </div>
        </div>

        <div className="lib-sep" />

        {/* Planta */}
        <div className="panel-section">
          <span className="panel-label">{t.common?.plant ?? 'Planta / Ubicación'}</span>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            value={String(plant ?? '')}
            onChange={event => setPlant(event.target.value)}
            disabled={loading || catalogsLoading}
          >
            {normalizedPlants.map(plantRecord => (
              <option key={String(plantRecord.id)} value={String(plantRecord.id)}>
                {normalizePlantLabel(plantRecord) || plantRecord.ubicacion || String(plantRecord.id)}
              </option>
            ))}
          </select>
        </div>

        {/* Disciplina */}
        <div className="panel-section">
          <span className="panel-label">{t.common?.discipline ?? 'Disciplina'}</span>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            value={discipline ?? ''}
            disabled={loading || catalogsLoading}
            onChange={event => {
              setDiscipline(event.target.value || null)
              setDocMachine('all')
              setSelectedMachine(null)
              clearDocMessages()
            }}
          >
            <option value="">{t.docChat?.selectDiscipline ?? 'Seleccionar disciplina...'}</option>
            {disciplines.map((disciplineRecord, index) => {
              const name = normalizeCatalogName(disciplineRecord)
              const id = disciplineRecord.id ?? disciplineRecord.disciplina_id ?? index
              return (
                <option key={String(id)} value={name || String(id)}>
                  {name || `Disciplina ${id}`}
                </option>
              )
            })}
          </select>
        </div>

        {/* Máquina */}
        <div className="panel-section">
          <span className="panel-label">
            {t.common?.machine ?? 'Máquina'} ({t.common?.optional ?? 'opcional'})
          </span>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60"
            value={docMachine === 'all' ? '' : docMachine}
            disabled={loading || catalogsLoading || !selectedDisciplineRecord}
            onChange={event => {
              const machineId = event.target.value
              setDocMachine(machineId || 'all')
              setSelectedMachine(machineId || null)
              clearDocMessages()
            }}
          >
            <option value="">{t.docChat?.selectMachine ?? 'Seleccionar máquina...'}</option>
            {availableMachines.map(machine => (
              <option key={String(machine.id)} value={String(machine.id)}>
                {normalizeMachineLabel(machine) || String(machine.id)}
              </option>
            ))}
          </select>
        </div>

        {/* BOTÓN GUARDAR SESIÓN (Integrado al panel izquierdo) */}
        {docMessages.length > 0 && (
          <div
            className="panel-section"
            style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)' }}
          >
            <button
              type="button"
              disabled={saveStatus === 'saving'}
              className="w-full rounded-lg px-3 py-2 text-[13px] font-medium transition shadow-sm outline-none"
              style={{
                background:
                  saveStatus === 'saved'
                    ? 'var(--green-bg, #d1fae5)'
                    : saveStatus === 'error'
                      ? 'var(--red-bg, #fee2e2)'
                      : 'var(--blue)',
                color:
                  saveStatus === 'saved'
                    ? 'var(--green, #059669)'
                    : saveStatus === 'error'
                      ? 'var(--red, #dc2626)'
                      : '#fff',
                cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                border: 'none',
              }}
              onClick={openSaveModal}
            >
              {saveStatus === 'saving' && '⏳ Guardando...'}
              {saveStatus === 'saved' && '✅ Sesión guardada'}
              {saveStatus === 'error' && '❌ Error'}
              {saveStatus === 'idle' && (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
                  {t.docChat?.saveSession ?? 'Guardar Sesión'}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* -----------------------------------------------------------------------
       * Panel derecho
       * -------------------------------------------------------------------- */}

      <div className="panel-right">
        {/* Barra manual activo */}
        {activeManual && (
          <div className="manual-active-bar">
            <span style={{ fontSize: 14 }}>📖</span>
            <span className="mab-name">{activeManual.name}</span>
            <span className="mab-meta">
              {[
                activeManual.pages ? `${activeManual.pages} ${t.common?.page ?? 'p'}` : '',
                activeManual.chunks.length
                  ? `${activeManual.chunks.length} ${t.docChat?.fragments ?? 'fragmentos'}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <button
              type="button"
              className="mab-clear"
              title={t.common?.close ?? 'Cerrar'}
              onClick={() => setActiveManualId('')}
            >
              ✕
            </button>
          </div>
        )}

        {/* Contexto y Botón Menú Móvil */}
        <div className="context-tags" style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          
          {/* NUEVO: Botón Hamburguesa para Móviles */}
          <button
            type="button"
            className="md:hidden flex items-center justify-center p-1.5 mr-2 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
            onClick={() => setIsSidebarOpen(true)}
            title="Mostrar Filtros y OTs"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          {!discipline ? (
            <span className="ctx-empty">
              {t.docChat?.emptyContext ?? 'Selecciona una disciplina para comenzar.'}
            </span>
          ) : (
            <>
              <span className="ctx-tag plant">
                📍 {normalizePlantLabel(selectedPlantRecord) || plant}
              </span>

              {activeManual && (
                <span className="ctx-tag" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
                  📖{' '}
                  {activeManual.name.length > 26
                    ? `${activeManual.name.slice(0, 24)}…`
                    : activeManual.name}
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

        {/* Modal guardar sesión */}
        {saveModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={e => {
              if (e.target === e.currentTarget) setSaveModalOpen(false)
            }}
          >
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '24px 28px',
                width: 380,
                maxWidth: '90vw',
                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              }}
            >
              <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                💾 {t.docChat?.saveSession ?? 'Guardar sesión'}
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--ink3)' }}>
                {docMessages.length} mensajes · {discipline ?? '—'} ·{' '}
                {normalizePlantLabel(selectedPlantRecord) || '—'}
              </p>

              <label
                htmlFor="session-title-input"
                style={{ fontSize: 12, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}
              >
                {t.docChat?.sessionTitle ?? 'Título de la sesión'}
              </label>
              <input
                id="session-title-input"
                type="text"
                value={sessionTitle}
                maxLength={120}
                onChange={e => setSessionTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void saveSession(sessionTitle)
                  if (e.key === 'Escape') setSaveModalOpen(false)
                }}
                placeholder={`Sesión ${new Date().toLocaleDateString()}`}
                autoFocus
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'var(--bg)',
                  outline: 'none',
                  marginBottom: 16,
                }}
              />

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setSaveModalOpen(false)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--ink2)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {t.common?.cancel ?? 'Cancelar'}
                </button>
                <button
                  type="button"
                  onClick={() => void saveSession(sessionTitle)}
                  style={{
                    padding: '7px 18px',
                    borderRadius: 7,
                    border: 'none',
                    background: 'var(--blue)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t.docChat?.saveSession ?? 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chat messages */}
        <div className="chat-messages" ref={areaRef}>
          {docMessages.length === 0 ? (
            <div className="chat-empty" style={{ background: 'transparent' }} />
          ) : (
            docMessages.map((message, index) => (
              <ChatBubble key={index} msg={message} side={message.role === 'user' ? 'user' : 'bot'} />
            ))
          )}

          {loading && (
            <div className="mt-md">
              <Thinking />
            </div>
          )}
        </div>

        {/* Zona de entrada */}
        <div className="input-zone" style={{ flexShrink: 0 }}>
          <div
            className={`input-wrap ${dragOver ? 'ring-2 ring-[var(--blue)]' : ''}`}
            onDragOver={event => {
              event.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={event => {
              event.preventDefault()
              setDragOver(false)
              void handleFiles(event.dataTransfer.files)
            }}
          >
            <label htmlFor="doc-input" className="sr-only">
              {t.docChat?.inputPlaceholder ?? 'Escribe tu pregunta'}
            </label>

            <textarea
              id="doc-input"
              rows={1}
              value={input}
              title={t.docChat?.inputPlaceholder ?? 'Escribe tu pregunta'}
              aria-label={t.docChat?.inputPlaceholder ?? 'Escribe tu pregunta'}
              placeholder={
                t.docChat?.inputPlaceholder ??
                'Pregunta por procedimientos, especificaciones o mantenimiento...'
              }
              disabled={!discipline || loading}
              className="flex-1 resize-none overflow-hidden bg-transparent border-none outline-none text-[13px] text-[var(--ink)] placeholder-[var(--ink3)]"
              onChange={event => {
                setInput(event.target.value)
                event.currentTarget.style.height = 'auto'
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 100)}px`
              }}
              onKeyDown={handleKeyDown}
            />

            <button
              type="button"
              className="send-btn"
              title={t.common?.send ?? 'Enviar'}
              aria-label={t.common?.send ?? 'Enviar'}
              disabled={!discipline || loading}
              onClick={() => void send()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>

          <div className="input-hint">
            {t.docChat?.inputHint ?? 'Enter para enviar · Shift+Enter nueva línea · '}
            {activeManual
              ? `📖 ${activeManual.name.slice(0, 30)}`
              : 'Powered by FastAPI + LM Studio'}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            title={t.docChat?.uploadManual ?? 'Cargar manual'}
            aria-label={t.docChat?.uploadManual ?? 'Cargar manual'}
            onChange={event => {
              void handleFiles(event.target.files)
              event.currentTarget.value = ''
            }}
          />

          {uploading && (
            <div className="mt-2 text-xs text-[var(--ink3)]">
              {t.common?.processing ?? 'Procesando archivo...'} {uploadPct}%
            </div>
          )}

          {manuals.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {manuals.map(manual => (
                <div key={manual.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs ${
                      manual.id === activeManualId
                        ? 'border-[var(--blue)] bg-[var(--blue-bg)] text-[var(--blue)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink2)]'
                    }`}
                    onClick={() => setActiveManualId(manual.id)}
                  >
                    {manual.name}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-[var(--red)] underline opacity-70 hover:opacity-100"
                    title={t.common?.remove ?? 'Quitar'}
                    onClick={() => removeManual(manual.id)}
                  >
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