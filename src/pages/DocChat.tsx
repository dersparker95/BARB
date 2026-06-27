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
  {
    id: 1,
    name: 'Planta principal de producción',
    ubicacion: 'Main Production Plant',
  },
  {
    id: 2,
    name: 'Línea de ensamblaje 2',
    ubicacion: 'Assembly Line 2',
  },
  {
    id: 3,
    name: 'Bodega / almacén',
    ubicacion: 'Warehouse Facility',
  },
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
      page: Math.max(
        1,
        Math.round((i / words.length) * Math.max(pageCount * 2, 10)),
      ),
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

        if (frequency > 0) {
          score += 1 + Math.log(frequency)
        }
      })

      return {
        ...chunk,
        score,
      }
    })
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

const normalizeCatalogName = (record: any): string => {
  if (!record) return ''

  if (typeof record === 'string') {
    return record.trim()
  }

  return String(
    record.label ??
      record.nombre ??
      record.Nombre ??
      record.name ??
      record.disciplina ??
      '',
  ).trim()
}

const normalizePlantLabel = (
  record:
    | {
        name?: string
        nombre?: string
        ubicacion?: string
      }
    | null
    | undefined,
): string =>
  String(
    record?.name ??
      record?.nombre ??
      record?.ubicacion ??
      '',
  ).trim()

const normalizeMachineLabel = (
  record: MachineRecord | null | undefined,
): string =>
  String(
    record?.name ??
      record?.nombre ??
      record?.label ??
      '',
  ).trim()

const normalizeWorkOrderMachine = (
  ot: WorkOrderRecord,
  machine?: MachineRecord | null,
): string =>
  String(
    machine?.name ??
      ot.machine_name ??
      ot.machine ??
      ot.maquina_id ??
      ot.machine_id ??
      '',
  ).trim()

const normalizeWorkOrderPlant = (
  ot: WorkOrderRecord,
  machine: MachineRecord | null,
): string => {
  const plant = String(
    ot.plant_name ??
      ot.plant ??
      ot.planta ??
      '',
  ).trim()

  if (plant) return plant

  return String(
    machine?.plant_name ??
      machine?.plant ??
      machine?.plant_id ??
      machine?.plantId ??
      machine?.planta_id ??
      '',
  ).trim()
}

const normalizeWorkOrderDiscipline = (
  ot: WorkOrderRecord,
  machine: MachineRecord | null,
): string => {
  const discipline = String(
    ot.discipline ??
      ot.disciplina ??
      ot.discipline_id ??
      '',
  ).trim()

  if (discipline) return discipline

  return String(
    machine?.discipline_id ??
      machine?.disciplineId ??
      '',
  ).trim()
}

const getWorkOrderTitle = (ot: WorkOrderRecord): string =>
  String(
    ot.numero_ot ??
      ot.title ??
      ot.nombre ??
      `OT ${ot.ot_id ?? ot.id}`,
  ).trim()

const getWorkOrderStatus = (ot: WorkOrderRecord): string =>
  String(
    ot.status ??
      ot.estado ??
      'open',
  )
    .trim()
    .toLowerCase()

const getWorkOrderPriority = (ot: WorkOrderRecord): string =>
  String(
    ot.priority ??
      'medium',
  )
    .trim()
    .toLowerCase()

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

  const [input, setInput] = useState('')
  const [manuals, setManuals] = useState<ManualDoc[]>([])
  const [activeManualId, setActiveManualId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [dragOver, setDragOver] = useState(false)

  const [plants, setPlants] = useState<PlantRecord[]>([])
  const [disciplines, setDisciplines] = useState<DisciplineRecord[]>([])
  const [machines, setMachines] = useState<MachineRecord[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([])
  const [catalogsLoading, setCatalogsLoading] = useState(false)

  const areaRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  /* -----------------------------------------------------------------------------
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
        disciplineRecord =>
          normalizeCatalogName(disciplineRecord) === discipline,
      ) ?? null
    )
  }, [discipline, disciplines])

  /* ---------------------------------------------------------------------------
   * Índice de máquinas (O(1))
   * -------------------------------------------------------------------------- */

  const machinesById = useMemo(
    () =>
      new Map(
        machines.map(machine => [String(machine.id), machine]),
      ),
    [machines],
  )

  const selectedMachineRecord = useMemo(() => {
    if (!docMachine || docMachine === 'all') {
      return null
    }

    return (
      machinesById.get(String(docMachine)) ??
      machines.find(
        machine => normalizeMachineLabel(machine) === docMachine,
      ) ??
      null
    )
  }, [docMachine, machines, machinesById])

  const availableMachines = useMemo(() => {
    if (!selectedDisciplineRecord) {
      return machines
    }

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
    if (
      location.state &&
      typeof location.state === 'object'
    ) {
      const state = location.state as {
        discipline?: string
        plant?: string
      }

      if (state.discipline) {
        setDiscipline(state.discipline)
      }

      if (state.plant) {
        setPlant(state.plant)
      }
    }
  }, [location.state, setDiscipline, setPlant])

  useEffect(() => {
    const disciplineChanged =
      prevDisciplineRef.current !== discipline

    const machineChanged =
      prevDocMachineRef.current !== docMachine

    if (disciplineChanged) {
      prevDisciplineRef.current = discipline
    }

    if (machineChanged) {
      prevDocMachineRef.current = docMachine
    }

    if (disciplineChanged || machineChanged) {
      clearDocMessages()
    }
  }, [
    discipline,
    docMachine,
    clearDocMessages,
  ])

  useEffect(() => {
    areaRef.current?.scrollTo({
      top: areaRef.current.scrollHeight,
      behavior: 'smooth',
    })
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
        const [
          plantsRes,
          disciplinesRes,
          machinesRes,
          workOrdersRes,
        ] = await Promise.all([
          fetch(`${apiRoot}/plants`, {
            signal: controller.signal,
          }),
          fetch(`${apiRoot}/disciplines`, {
            signal: controller.signal,
          }),
          fetch(`${apiRoot}/machines`, {
            signal: controller.signal,
          }),
          fetch(`${apiRoot}/work-orders`, {
            signal: controller.signal,
          }),
        ])

        if (controller.signal.aborted) return

        const [
          plantsData,
          disciplinesData,
          machinesData,
          workOrdersData,
        ] = await Promise.all([
          plantsRes.ok ? plantsRes.json() : [],
          disciplinesRes.ok ? disciplinesRes.json() : [],
          machinesRes.ok ? machinesRes.json() : [],
          workOrdersRes.ok
            ? workOrdersRes.json()
            : [],
        ])

        if (controller.signal.aborted) return

        setPlants(
          Array.isArray(plantsData)
            ? plantsData
            : [],
        )

        setDisciplines(
          Array.isArray(disciplinesData)
            ? disciplinesData
            : [],
        )

        setMachines(
          Array.isArray(machinesData)
            ? machinesData
            : [],
        )

        setWorkOrders(
          Array.isArray(workOrdersData)
            ? workOrdersData
            : workOrdersData?.data ?? [],
        )
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          setPlants([])
          setDisciplines([])
          setMachines([])
          setWorkOrders([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setCatalogsLoading(false)
        }
      }
    }

    void loadCatalogs()

    return () => controller.abort()
  }, [apiRoot])

  /* ---------------------------------------------------------------------------
   * Filtrado de OTs
   * -------------------------------------------------------------------------- */

  const filteredOTs = useMemo(() => {
    const targetPlantId = normalizeId(plant)

    const targetDisciplineId = normalizeId(
      selectedDisciplineRecord?.id,
    )

    const targetMachineId =
      docMachine && docMachine !== 'all'
        ? normalizeId(docMachine)
        : ''

    return workOrders.filter(workOrder => {
      const machineId = normalizeId(
        workOrder.maquina_id ??
          workOrder.maquinaId ??
          workOrder.machine_id ??
          workOrder.machineId,
      )

      const machine =
        machinesById.get(machineId)

      if (
        targetMachineId &&
        machineId !== targetMachineId
      ) {
        return false
      }

      if (targetPlantId) {
        const machinePlantId = normalizeId(
          machine?.planta_id ??
            machine?.plantaId ??
            machine?.plant_id,
        )

        if (machinePlantId !== targetPlantId) {
          return false
        }
      }

      if (targetDisciplineId) {
        const machineDisciplineId =
          normalizeId(
            machine?.disciplina_id ??
              machine?.disciplinaId ??
              machine?.discipline_id,
          )

        if (
          machineDisciplineId !==
          targetDisciplineId
        ) {
          return false
        }
      }

      return true
    })
  }, [
    workOrders,
    machinesById,
    plant,
    docMachine,
    selectedDisciplineRecord,
  ])

  /* ---------------------------------------------------------------------------
   * Procesamiento de archivos
   * -------------------------------------------------------------------------- */

  const processFile = useCallback(
  async (file: File) => {
    setUploading(true)
    setUploadPct(10)

    try {
      const formData = new FormData()

      formData.append('file', file)
      formData.append('type', 'document')
      formData.append(
        'context',
        'document_library',
      )

      const response = await fetch(
        `${apiRoot}/documents/upload`,
        {
          method: 'POST',
          body: formData,
        },
      )

      if (response.ok) {
        const data = (await response.json()) as {
          id?: string
        }

        const manual: ManualDoc = {
          id: data.id ?? `srv-${Date.now()}`,
          name: file.name,
          size: fmtSize(file.size),
          pages: null,
          isDemo: false,
          uploadedBy:
            user?.name ?? 'operador',
          uploadedAt: new Date(),
          chunks: [],
        }

        setManuals(previous => [
          ...previous,
          manual,
        ])

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
        pageCount = Math.max(
          1,
          Math.round(text.length / 3000),
        )
      } else if (/\.pdf$/i.test(file.name)) {
        const buffer =
          await file.arrayBuffer()

        const raw =
          new TextDecoder('latin1').decode(
            buffer,
          )

        const strings =
          raw.match(/\(([^)]{8,300})\)/g) ??
          []

        text = strings
          .map(value => value.slice(1, -1))
          .join(' ')
          .replace(
            /[^\x20-\x7E\u00C0-\u024F\n ]/g,
            ' ',
          )
          .replace(/\s+/g, ' ')
          .trim()

        const pages =
          raw.match(/\/Page\b/g)

        pageCount = pages
          ? pages.length
          : Math.max(
              1,
              Math.round(file.size / 4096),
            )
      } else {
        text = await file
          .text()
          .catch(() => '')

        pageCount = Math.max(
          1,
          Math.round(text.length / 3000),
        )
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
      uploadedBy:
        user?.name ?? 'operador',
      uploadedAt: new Date(),
      chunks:
        text.length > 100
          ? chunkText(text, file.name)
          : [],
    }

    setUploadPct(75)

    setManuals(previous => [
      ...previous,
      manual,
    ])

    setActiveManualId(manual.id)

    setUploading(false)
    setUploadPct(0)
  },
  [apiRoot, user?.name],
)

  const handleFiles = useCallback(
    if (!files) return

    for (const file of Array.from(files)) {
      await processFile(file)
    }
  },
  [processFile],
)

  /* ---------------------------------------------------------------------------
   * Eliminar manual
   * -------------------------------------------------------------------------- */

  const removeManual = useCallback(
    (id: string) => {
      setManuals(previous =>
        previous.filter(manual => manual.id !== id),
      )

      if (activeManualId === id) {
        setActiveManualId('')
      }
    },
    [activeManualId],
  )

  /* ---------------------------------------------------------------------------
   * Envío de consulta
   * -------------------------------------------------------------------------- */

  const send = useCallback(async () => {
  const query = input.trim()

  if (!query || loading || !discipline) {
    return
  }

  setLoading(true)
  setInput('')

  const chatMachine = selectedMachine ?? docMachine

  const inputElement = document.getElementById(
    'doc-input',
  ) as HTMLTextAreaElement | null

  inputElement?.style.setProperty(
    'height',
    'auto',
  )

  pushDocMessage({
    role: 'user',
    content: query,
    timestamp: Date.now(),
  })

  /* ---------------------------------------------------------------------------
   * Historial de conversación
   * ------------------------------------------------------------------------ */

  const recentHistory = docMessages
    .slice(-6)
    .map(message => ({
      role:
        message.role === 'user'
          ? 'user'
          : 'assistant',
      content: message.content,
    }))

  /* ---------------------------------------------------------------------------
   * Backend principal
   * ------------------------------------------------------------------------ */

  try {
    const response = await fetch(
      `${apiRoot}/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          message: query,
          language: nLang,
          machine: chatMachine,
          history: recentHistory,
        }),
      },
    )

    if (response.ok) {
      const data =
        (await response.json()) as ChatApiResponse

      pushDocMessage({
        role: 'assistant',
        content: data.reply,
        timestamp: Date.now(),
      })

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

      return
    }

    const errorData =
      await response
        .json()
        .catch(() => ({}))

    pushDocMessage({
      role: 'assistant',
      content: `⚠️ Falla en la IA en la nube: ${
        errorData.detail ??
        `Error ${response.status}`
      }`,
      timestamp: Date.now(),
    })

    return
  } catch {
    console.warn(
      'FastAPI no disponible. Activando modo local.',
    )
  }

  /* ---------------------------------------------------------------------------
   * Recuperación local (RAG)
   * ------------------------------------------------------------------------ */

  const chunks = retrieveFromManual(
    query,
    activeManual?.chunks ?? [],
  )

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

  /* ---------------------------------------------------------------------------
   * LM Studio
   * ------------------------------------------------------------------------ */

  try {
    const response = await fetch(
      `${lmRoot}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          model: 'local-model',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: query,
            },
          ],
        }),
      },
    )

    if (response.ok) {
      const data = await response.json()

      const answer =
        data.choices?.[0]?.message
          ?.content ??
        data.result ??
        ''

      pushDocMessage({
        role: 'assistant',
        content: `*(Modo Fallback)*\n\n${answer}`,
        timestamp: Date.now(),
      })

      return
    }
  } catch {
    const demoResponse = chunks.length
      ? `**[DEMO — Sin backend]**

Basado en el manual:

${chunks[0].text}

Inicia LM Studio o FastAPI para obtener respuestas inteligentes.`
      : '**[Modo Local]** No existe conexión al backend y tampoco hay manuales cargados.'

    pushDocMessage({
      role: 'assistant',
      content: demoResponse,
      timestamp: Date.now(),
    })
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  },
  [send],
)

return (
  <div className="two-panel w-full h-full">
    <div className="panel-left">
      {/* -----------------------------------------------------------------------
       * Órdenes de Trabajo
       * -------------------------------------------------------------------- */}

      <div className="panel-section">
        <span className="panel-label">
          Target OTs
          <span className="ml-count">
            {filteredOTs.length}
          </span>
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

            const machine =
              machinesById.get(machineId) ?? null

            const title = getWorkOrderTitle(workOrder)

            const machineLabel =
              normalizeWorkOrderMachine(
                workOrder,
                machine,
              ) || '—'

            const statusKey =
              getWorkOrderStatus(workOrder)

            const status =
              t.statuses?.[statusKey] ??
              statusKey

            const priority =
              getWorkOrderPriority(workOrder)

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

                  setInput(`Contexto de OT seleccionada:

- Orden: ${title}
- Equipo: ${machineLabel}
- Estado: ${status} (Prioridad: ${priority})
- Problema reportado: ${description}

Considerando esta información, `)

                  requestAnimationFrame(() => {
                    const input =
                      document.getElementById(
                        'doc-input',
                      ) as HTMLTextAreaElement | null

                    if (!input) return

                    input.focus()
                    input.style.height = 'auto'
                    input.style.height = `${Math.min(
                      input.scrollHeight,
                      150,
                    )}px`
                  })
                }}
              >
                <div className="mi-icon">
                  🛠️
                </div>

                <div className="mi-body">
                  <div className="mi-name">
                    {title}
                  </div>

                  <div className="mi-meta">
                    {normalizeWorkOrderPlant(
                      workOrder,
                      machine,
                    ) ||
                      selectedPlantRecord?.name ||
                      selectedPlantRecord?.nombre ||
                      '—'}
                  </div>

                  <div className="mi-meta">
                    {machineLabel}
                  </div>

                  <div className="mi-meta capitalize">
                    {status} · {priority}
                  </div>
                </div>

                <span className="mi-badge">
                  OT
                </span>
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
              {t.common?.loading ??
                'Cargando...'}
            </div>
          )}
        </div>
      </div>

      <div className="lib-sep" />

      {/* -----------------------------------------------------------------------
       * Planta
       * -------------------------------------------------------------------- */}

      <div className="panel-section">
        <span className="panel-label">
          {t.common?.plant ??
            'Planta / Ubicación'}
        </span>

        <select
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          value={String(plant ?? '')}
          onChange={event =>
            setPlant(event.target.value)
          }
          disabled={
            loading || catalogsLoading
          }
        >
          {normalizedPlants.map(
            plantRecord => (
              <option
                key={String(plantRecord.id)}
                value={String(
                  plantRecord.id,
                )}
              >
                {normalizePlantLabel(
                  plantRecord,
                ) ||
                  plantRecord.ubicacion ||
                  String(plantRecord.id)}
              </option>
            ),
          )}
        </select>
      </div>

      {/* -----------------------------------------------------------------------
       * Disciplina
       * -------------------------------------------------------------------- */}

      <div className="panel-section">
        <span className="panel-label">
          {t.common?.discipline ??
            'Disciplina'}
        </span>

        <select
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          value={discipline ?? ''}
          disabled={
            loading || catalogsLoading
          }
          onChange={event => {
            setDiscipline(
              event.target.value || null,
            )

            setDocMachine('all')
            setSelectedMachine(null)
            clearDocMessages()
          }}
        >
          <option value="">
            {t.docChat
              ?.selectDiscipline ??
              'Seleccionar disciplina...'}
          </option>

          {disciplines.map(
            (
              disciplineRecord,
              index,
            ) => {
              const name =
                normalizeCatalogName(
                  disciplineRecord,
                )

              const id =
                disciplineRecord.id ??
                disciplineRecord.disciplina_id ??
                index

              return (
                <option
                  key={String(id)}
                  value={
                    name || String(id)
                  }
                >
                  {name ||
                    `Disciplina ${id}`}
                </option>
              )
            },
          )}
        </select>
      </div>

        <div className="panel-section">
  <span className="panel-label">
    {t.common?.machine ?? 'Máquina'} (
    {t.common?.optional ?? 'opcional'})
  </span>

  <select
    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] shadow-sm outline-none transition focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue-bg)] disabled:cursor-not-allowed disabled:opacity-60"
    value={docMachine === 'all' ? '' : docMachine}
    disabled={
      loading ||
      catalogsLoading ||
      !selectedDisciplineRecord
    }
    onChange={event => {
      const machineId = event.target.value

      setDocMachine(machineId || 'all')
      setSelectedMachine(machineId || null)
      clearDocMessages()
    }}
  >
    <option value="">
      {t.docChat?.selectMachine ??
        'Seleccionar máquina...'}
    </option>

    {availableMachines.map(machine => (
      <option
        key={String(machine.id)}
        value={String(machine.id)}
      >
        {normalizeMachineLabel(machine) ||
          String(machine.id)}
      </option>
    ))}
  </select>
</div>

</div>

{/* -------------------------------------------------------------------------
 * Panel derecho
 * ---------------------------------------------------------------------- */}

<div className="panel-right">
  {activeManual && (
    <div className="manual-active-bar">
      <span style={{ fontSize: 14 }}>
        📖
      </span>

      <span className="mab-name">
        {activeManual.name}
      </span>

      <span className="mab-meta">
        {[
          activeManual.pages
            ? `${activeManual.pages} ${
                t.common?.page ?? 'p'
              }`
            : '',
          activeManual.chunks.length
            ? `${activeManual.chunks.length} ${
                t.docChat?.fragments ??
                'fragmentos'
              }`
            : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>

      <button
        type="button"
        className="mab-clear"
        title={t.common?.close ?? 'Cerrar'}
        onClick={() =>
          setActiveManualId('')
        }
      >
        ✕
      </button>
    </div>
  )}

  {/* -----------------------------------------------------------------------
   * Contexto
   * -------------------------------------------------------------------- */}

  <div
    className="context-tags"
    style={{ flexShrink: 0 }}
  >
    {!discipline ? (
      <span className="ctx-empty">
        {t.docChat?.emptyContext ??
          'Selecciona una disciplina para comenzar.'}
      </span>
    ) : (
      <>
        <span className="ctx-tag plant">
          📍{' '}
          {normalizePlantLabel(
            selectedPlantRecord,
          ) || plant}
        </span>

        {activeManual && (
          <span
            className="ctx-tag"
            style={{
              background:
                'var(--blue-bg)',
              color: 'var(--blue)',
            }}
          >
            📖{' '}
            {activeManual.name.length > 26
              ? `${activeManual.name.slice(
                  0,
                  24,
                )}…`
              : activeManual.name}
          </span>
        )}

        <span className="ctx-tag disc-au">
          ◉ {discipline}
        </span>

        {selectedMachineRecord && (
          <span className="ctx-tag machine">
            ⚙{' '}
            {selectedMachineRecord.name ??
              selectedMachineRecord.nombre ??
              selectedMachineRecord.id}
          </span>
        )}
      </>
    )}
  </div>

  {/* -----------------------------------------------------------------------
   * Chat
   * -------------------------------------------------------------------- */}

  <div
    className="chat-messages"
    ref={areaRef}
  >
    {docMessages.length === 0 ? (
      <div
        className="chat-empty"
        style={{
          background: 'transparent',
        }}
      />
    ) : (
      docMessages.map(
        (message, index) => (
          <ChatBubble
            key={index}
            msg={message}
            side={
              message.role === 'user'
                ? 'user'
                : 'bot'
            }
          />
        ),
      )
    )}

    {loading && (
      <div className="mt-md">
        <Thinking />
      </div>
    )}
  </div>

  {/* -----------------------------------------------------------------------
   * Entrada
   * -------------------------------------------------------------------- */}

  <div
    className="input-zone"
    style={{ flexShrink: 0 }}
  >
    <div
      className={`input-wrap ${
        dragOver
          ? 'ring-2 ring-[var(--blue)]'
          : ''
      }`}
      onDragOver={event => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() =>
        setDragOver(false)
      }
      onDrop={event => {
        event.preventDefault()
        setDragOver(false)
        void handleFiles(
          event.dataTransfer.files,
        )
      }}
    >
      <label
        htmlFor="doc-input"
        className="sr-only"
      >
        {t.docChat
          ?.inputPlaceholder ??
          'Escribe tu pregunta'}
      </label>

      <textarea
        id="doc-input"
        rows={1}
        value={input}
        title={
          t.docChat
            ?.inputPlaceholder ??
          'Escribe tu pregunta'
        }
        aria-label={
          t.docChat
            ?.inputPlaceholder ??
          'Escribe tu pregunta'
        }
        placeholder={
          t.docChat
            ?.inputPlaceholder ??
          'Pregunta por procedimientos, especificaciones o mantenimiento...'
        }
        disabled={
          !discipline || loading
        }
        className="flex-1 resize-none overflow-hidden bg-transparent border-none outline-none text-[13px] text-[var(--ink)] placeholder-[var(--ink3)]"
        onChange={event => {
          setInput(event.target.value)

          event.currentTarget.style.height =
            'auto'

          event.currentTarget.style.height = `${Math.min(
            event.currentTarget
              .scrollHeight,
            100,
          )}px`
        }}
        onKeyDown={handleKeyDown}
      />

      <button
        type="button"
        className="send-btn"
        title={t.common?.send ?? 'Enviar'}
        aria-label={
          t.common?.send ?? 'Enviar'
        }
        disabled={
          !discipline || loading
        }
        onClick={() => void send()}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <line
            x1="22"
            y1="2"
            x2="11"
            y2="13"
          />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>

    <div className="input-hint">
      {t.docChat?.inputHint ??
        'Enter para enviar · Shift+Enter nueva línea · '}
      {activeManual
        ? `📖 ${activeManual.name.slice(
            0,
            30,
          )}`
        : 'Powered by FastAPI + LM Studio'}
    </div>

    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,.txt,.md"
      className="hidden"
      title={
        t.docChat?.uploadManual ??
        'Cargar manual'
      }
      aria-label={
        t.docChat?.uploadManual ??
        'Cargar manual'
      }
      onChange={event => {
        void handleFiles(
          event.target.files,
        )
        event.currentTarget.value = ''
      }}
    />

    {uploading && (
      <div className="mt-2 text-xs text-[var(--ink3)]">
        {t.common?.processing ??
          'Procesando archivo...'}{' '}
        {uploadPct}%
      </div>
    )}

    {manuals.length > 0 && (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {manuals.map(manual => (
          <div
            key={manual.id}
            className="flex items-center gap-1"
          >
            <button
              type="button"
              className={`rounded-full border px-3 py-1 text-xs ${
                manual.id ===
                activeManualId
                  ? 'border-[var(--blue)] bg-[var(--blue-bg)] text-[var(--blue)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink2)]'
              }`}
              onClick={() =>
                setActiveManualId(
                  manual.id,
                )
              }
            >
              {manual.name}
            </button>

            <button
              type="button"
              className="text-xs text-[var(--red)] underline opacity-70 hover:opacity-100"
              title={
                t.common?.remove ??
                'Quitar'
              }
              onClick={() =>
                removeManual(manual.id)
              }
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