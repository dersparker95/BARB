// @ts-nocheck

/* -----------------------------------------------------------------------------
 * Imports
 * -------------------------------------------------------------------------- */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import ChatBubble, { Thinking } from '../components/ChatBubble'
import { SourceHit } from '../types'
import { getTranslations, normalizeLang } from '../utils/i18n'
import { tokenize } from '../utils/rag'

/* -----------------------------------------------------------------------------
 * Tipos
 * -------------------------------------------------------------------------- */

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
    api,
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [pendingImages, setPendingImages] = useState<Array<{ id: string; dataUrl: string; name: string }>>([])

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
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevDisciplineRef = useRef<string | null>(discipline)
  const prevDocMachineRef = useRef(docMachine)

  const location = useLocation()

  const t = useMemo(() => getTranslations(lang), [lang])
  const nLang = normalizeLang(lang)

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
        // Usa el servicio `api` centralizado (adjunta el token automáticamente)
        // en vez de fetch() manuales por catálogo.
        const [plantsData, disciplinesData, machinesData, workOrdersData] = await Promise.all([
          api.plants().catch(() => []),
          api.disciplines().catch(() => []),
          api.machines({ signal: controller.signal }).catch(() => []),
          api.workOrders.getAll({ signal: controller.signal }).catch(() => [])
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
  }, [api])

  /* ---------------------------------------------------------------------------
   * Filtrado de OTs
   * -------------------------------------------------------------------------- */

  const filteredOTs = useMemo(() => {
    const hasPlant      = Boolean(plant)
    const hasDiscipline = Boolean(discipline)
    const hasMachine    = Boolean(docMachine && docMachine !== 'all')

    return workOrders.filter(workOrder => {
      const otMachineId = normalizeId(
        workOrder.machine_id ?? workOrder.maquina_id ?? workOrder.machineId ?? workOrder.maquinaId
      )
      const machine = machinesById.get(otMachineId)

      if (hasMachine && otMachineId !== normalizeId(docMachine)) return false

      if (hasPlant) {
        const otPlantId = normalizeId(
          workOrder.plant_id ?? workOrder.planta_id ?? machine?.plant_id ?? machine?.planta_id
        )
        if (otPlantId && otPlantId !== normalizeId(plant)) return false
      }

      if (hasDiscipline && selectedDisciplineRecord) {
        const targetDiscId = normalizeId(selectedDisciplineRecord.id)
        const otDiscId = normalizeId(
          workOrder.discipline_id ??
          workOrder.disciplina_id ??
          machine?.discipline_id ??
          machine?.disciplina_id ??
          machine?.disciplineId
        )
        if (otDiscId && otDiscId !== targetDiscId) return false
      }

      return true
    })
  }, [workOrders, machinesById, plant, discipline, docMachine, selectedDisciplineRecord])

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

      const data = await api.chat.documents(formData)

      if (data) {
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
        setUploading(false)
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
  }, [api, user?.name])

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
      // Usa el servicio `api.chat.saveSession` centralizado: resuelve
      // correctamente el prefijo /api, adjunta el token vigente y maneja
      // sesión expirada (401), a diferencia del fetch manual anterior.
      await api.chat.saveSession(payload)

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
    api,
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
   * Envío de consulta
   * -------------------------------------------------------------------------- */

  const send = useCallback(async () => {
    const query = input.trim()
    if (!query || loading || !discipline) return

    setLoading(true)
    setInput('')

    const chatMachine = selectedMachine ?? docMachine

    const inputElement = document.getElementById('doc-input') as HTMLTextAreaElement | null
    inputElement?.style.setProperty('height', 'auto')

    const userContent = pendingImages.length > 0
      ? `${query}\n\n[${pendingImages.length} imagen(es) adjunta(s)]`
      : query
    pushDocMessage({
      role: 'user',
      content: userContent,
      timestamp: Date.now(),
      images: pendingImages.map(img => img.dataUrl),
    })
    setPendingImages([])

    const recentHistory = docMessages
      .slice(-6)
      .map(message => ({
        role: message.role === 'user' ? 'user' : 'assistant',
        content: message.content,
      }))

    try {
      // Usa el servicio `api.chat.send` centralizado (mismo prefijo /api,
      // token y manejo de 401 que el resto de la app) en vez de fetch manual.
      const data = (await api.chat.send({
        message: query,
        language: nLang,
        machine: chatMachine,
        history: recentHistory,
        active_manual: activeManual?.name ?? null,
        images: pendingImages.map(img => img.dataUrl),
      })) as ChatApiResponse

      pushDocMessage({ role: 'assistant', content: data.reply, timestamp: Date.now() })
      setLoading(false)
    } catch (error: any) {
      const msg = String(error?.message ?? '')
      const isServiceUnavailable = msg.includes('503')

      pushDocMessage({
        role: 'assistant',
        content: isServiceUnavailable
          ? (t.docChat?.serviceUnavailable ??
             'El servicio de IA no está disponible temporalmente. Inténtalo de nuevo en unos minutos.')
          : `No se pudo conectar con el servidor: ${msg || 'Error desconocido'}`,
        timestamp: Date.now(),
      })
      setLoading(false)
    }
  }, [
    input,
    loading,
    discipline,
    selectedMachine,
    docMachine,
    docMessages,
    api,
    nLang,
    pushDocMessage,
    pendingImages,
    activeManual,
    t,
    setLoading,
  ])

  const handleCameraCapture = useCallback((files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        if (!dataUrl) return
        setPendingImages(prev => [
          ...prev,
          { id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`, dataUrl, name: file.name },
        ])
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const removePendingImage = useCallback((id: string) => {
    setPendingImages(prev => prev.filter(img => img.id !== id))
  }, [])

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
    <div className="two-panel">

      {/* -----------------------------------------------------------------------
       * Panel izquierdo — colapsable
       * -------------------------------------------------------------------- */}
      <div
        className={`panel-left dc-sidebar ${isSidebarOpen ? 'dc-sidebar--open' : 'dc-sidebar--collapsed'}`}
      >
        <div className={`dc-sidebar-header ${isSidebarOpen ? 'dc-sidebar-header--open' : ''}`}>
          {isSidebarOpen && (
            <span className="dc-sidebar-label">Filtros y OTs</span>
          )}

          <button
            type="button"
            onClick={() => setIsSidebarOpen(prev => !prev)}
            aria-expanded={isSidebarOpen}
            aria-label={isSidebarOpen ? 'Colapsar panel' : 'Expandir panel'}
            className={`dc-toggle-btn ${isSidebarOpen ? 'dc-toggle-btn--active' : ''}`}
          >
            {isSidebarOpen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </button>
        </div>

        <div className={`dc-sidebar-content ${isSidebarOpen ? 'dc-sidebar-content--visible' : 'dc-sidebar-content--hidden'}`}>

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
                    <div className="mi-icon" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                      </svg>
                    </div>
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
                <div className="dc-catalog-loading">
                  {t.common?.loading ?? 'Cargando...'}
                </div>
              )}
            </div>
          </div>

          <div className="lib-sep" />

          <div className="panel-section">
            <span className="panel-label">{t.common?.plant ?? 'Planta / Ubicación'}</span>
            <select
              className="form-select"
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

          <div className="panel-section">
            <span className="panel-label">{t.common?.discipline ?? 'Disciplina'}</span>
            <select
              className="form-select"
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

          <div className="panel-section">
            <span className="panel-label">
              {t.common?.machine ?? 'Máquina'} ({t.common?.optional ?? 'opcional'})
            </span>
            <select
              className="form-select"
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

          {docMessages.length > 0 && (
            <div className="panel-section dc-save-section">
              <button
                type="button"
                disabled={saveStatus === 'saving'}
                className={`btn dc-save-btn dc-save-btn--${saveStatus}`}
                onClick={openSaveModal}
              >
                {saveStatus === 'saving' && (
                  <>
                    <span className="spinning" aria-hidden="true">⟳</span>
                    <span className="sr-only">Guardando...</span>
                    Guardando...
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                    Sesión guardada
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Error al guardar
                  </>
                )}
                {saveStatus === 'idle' && (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/>
                      <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    {t.docChat?.saveSession ?? 'Guardar Sesión'}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* -----------------------------------------------------------------------
       * Panel derecho
       * -------------------------------------------------------------------- */}

      <div className="panel-right">
        {activeManual && (
          <div className="manual-active-bar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
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

        <div className="context-tags">
          {!discipline ? (
            <span className="ctx-empty">
              {t.docChat?.emptyContext ?? 'Selecciona una disciplina para comenzar.'}
            </span>
          ) : (
            <>
              <span className="ctx-tag plant">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {normalizePlantLabel(selectedPlantRecord) || plant}
              </span>

              {activeManual && (
                <span className="ctx-tag ctx-tag--manual">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  {activeManual.name.length > 26
                    ? `${activeManual.name.slice(0, 24)}…`
                    : activeManual.name}
                </span>
              )}

              <span className="ctx-tag disc-au">◉ {discipline}</span>

              {selectedMachineRecord && (
                <span className="ctx-tag machine">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 0 0 4.93 4.93"/><path d="M4.93 19.07A10 10 0 0 0 19.07 19.07"/></svg>
                  {selectedMachineRecord.name ?? selectedMachineRecord.nombre ?? selectedMachineRecord.id}
                </span>
              )}
            </>
          )}
        </div>

        {saveModalOpen && (
          <div
            className="modal-overlay"
            onClick={e => {
              if (e.target === e.currentTarget) setSaveModalOpen(false)
            }}
          >
            <div className="modal-box dc-save-modal">
              <h3 className="dc-save-modal-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                {t.docChat?.saveSession ?? 'Guardar sesión'}
              </h3>
              <p className="dc-save-modal-meta">
                {docMessages.length} mensajes · {discipline ?? '—'} ·{' '}
                {normalizePlantLabel(selectedPlantRecord) || '—'}
              </p>

              <label htmlFor="session-title-input" className="dc-save-modal-label">
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
                className="form-input"
              />

              <div className="dc-save-modal-actions">
                <button
                  type="button"
                  onClick={() => setSaveModalOpen(false)}
                  className="btn btn-outline"
                >
                  {t.common?.cancel ?? 'Cancelar'}
                </button>
                <button
                  type="button"
                  onClick={() => void saveSession(sessionTitle)}
                  className="btn btn-primary"
                >
                  {t.docChat?.saveSession ?? 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="chat-messages" ref={areaRef}>
          {docMessages.length === 0 ? (
            <div className="chat-empty" />
          ) : (
            docMessages.map((message, index) => (
              <ChatBubble
                key={index}
                msg={message}
                side={message.role === 'user' ? 'user' : 'bot'}
                onFeedback={(msg, rating) => {
                  // Usa api.chat.feedback: el backend solo expone
                  // /api/chat-feedback (sin alias sin prefijo), por lo que el
                  // fetch manual anterior fallaba con 404.
                  api.chat
                    .feedback({ message_content: msg.content, rating })
                    .catch(err => console.error('Error enviando feedback:', err))
                }}
              />
            ))
          )}

          {loading && (
            <div className="mt-md">
              <Thinking />
            </div>
          )}
        </div>

        <div className="input-zone">
          <div
            className={`input-wrap ${dragOver ? 'input-wrap--drag' : ''}`}
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
              className="dc-textarea"
              onChange={event => {
                setInput(event.target.value)
                event.currentTarget.style.height = 'auto'
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 100)}px`
              }}
              onKeyDown={handleKeyDown}
            />

            <button
              type="button"
              title="Tomar foto"
              aria-label="Tomar foto"
              disabled={!discipline || loading}
              onClick={() => cameraInputRef.current?.click()}
              className="dc-camera-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>

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
              ? activeManual.name.slice(0, 30)
              : 'Powered by API externa'}
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

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            title="Tomar foto"
            aria-label="Tomar foto"
            onChange={event => {
              handleCameraCapture(event.target.files)
              event.currentTarget.value = ''
            }}
          />

          {pendingImages.length > 0 && (
            <div className="dc-pending-images">
              {pendingImages.map(img => (
                <div key={img.id} className="dc-pending-image">
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="dc-pending-image-thumb"
                  />
                  <button
                    type="button"
                    onClick={() => removePendingImage(img.id)}
                    aria-label="Quitar imagen"
                    className="dc-pending-image-remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div className="dc-upload-progress">
              {t.common?.processing ?? 'Procesando archivo...'} {uploadPct}%
            </div>
          )}

          {manuals.length > 0 && (
            <div className="dc-manual-tags">
              {manuals.map(manual => (
                <div key={manual.id} className="dc-manual-tag-group">
                  <button
                    type="button"
                    className={`dc-manual-tag ${manual.id === activeManualId ? 'dc-manual-tag--active' : ''}`}
                    onClick={() => setActiveManualId(manual.id)}
                  >
                    {manual.name}
                  </button>
                  <button
                    type="button"
                    className="dc-manual-tag-remove"
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