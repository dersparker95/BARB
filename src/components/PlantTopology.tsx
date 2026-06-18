// @ts-nocheck
import React, { useRef, useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

// --- Tipos estrictos basados en el backend ---
type BackendNode = {
  nodo_id: number
  nombre: string
  tipo: string
  estado: 'operational' | 'warning' | 'error' | 'offline' | string
  position_x: number
  position_y: number
  maquina_id?: number
  planta_id?: number
  w?: number
  h?: number
  icon?: string
}

type BackendConnection = {
  conexion_id: number
  nodo_origen_id: number
  nodo_destino_id: number
  tipo: string
}

// --- Configuración inicial y utilidades ---
const INITIAL_VB = { x: 0, y: 0, w: 900, h: 480 }

const getStatusColor = (estado: BackendNode['estado']) => {
  if (!estado) return '#64748b' // Fallback si no hay estado
  const e = estado.toLowerCase()
  if (e.includes('operational') || e === 'ok') return '#10b981' // Verde
  if (e.includes('warning') || e === 'alarma') return '#f59e0b' // Ámbar
  if (e.includes('error') || e === 'crítico') return '#ef4444' // Rojo
  return '#64748b' // Gris (offline/desconocido)
}

const getNodeIcon = (tipo: string) => {
  if (!tipo) return '📦'
  const t = tipo.toLowerCase()
  if (t.includes('hub')) return '💻'
  if (t.includes('controller') || t.includes('plc')) return '🤖'
  if (t.includes('machine') || t.includes('maquina')) return '⚙️'
  if (t.includes('sensor')) return '🔌'
  return '📦'
}

const PlantTopology: React.FC = () => {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  
  // Eliminamos 'dark' de aquí ya que CSS hará el trabajo
  const { lang, selectedMachine, setSelectedMachine, apiBase } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  // Estado de datos dinámicos
  const [nodos, setNodos] = useState<BackendNode[]>([])
  const [conexiones, setConexiones] = useState<BackendConnection[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estado de la vista interactiva
  const [viewBox, setViewBox] = useState(INITIAL_VB)
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; node?: BackendNode }>({
    visible: false,
    x: 0,
    y: 0,
  })

  // Estado para el sistema de arrastre (Pan & Drag)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startY, setStartY] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)

  // --- Fetch de datos desde la API ---
  useEffect(() => {
    const controller = new AbortController() 
    
    setCargando(true)
    setError(null)
    
    const safeApiBase = apiBase || 'http://localhost:9000/api'
    
    fetch(`${safeApiBase.replace(/\/$/, '')}/topologia`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Error al obtener la topología del servidor')
        return response.json()
      })
      .then(data => {
        const nodosProcesados = (data?.nodos || []).map((n: any) => ({
          ...n,
          w: n.w || 140,
          h: n.h || 80,
          position_x: n.position_x || 0, // Fallback si no hay coordenadas
          position_y: n.position_y || 0,
          icon: getNodeIcon(n.tipo)
        }))
        setNodos(nodosProcesados)
        setConexiones(data?.conexiones || [])
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error("Error en topología:", err)
          setError('No se pudo cargar la topología de la planta.')
        }
      })
      .finally(() => {
        setCargando(false)
      })

    return () => controller.abort()
  }, [apiBase])

  // --- Lógica de Interfaz ---
  const selectedNode = useMemo(
    () => nodos.find(node => String(node.nodo_id) === String(selectedMachine)) ?? null,
    [selectedMachine, nodos],
  )

  // 🔥 ESCUDO DE RENDIMIENTO: Diccionario de nodos para acceso O(1) instantáneo
  const nodesById = useMemo(() => {
    const dict = new Map<number, BackendNode>()
    nodos.forEach(n => dict.set(n.nodo_id, n))
    return dict
  }, [nodos])

  const handleNodeClick = (node: BackendNode, e: React.MouseEvent) => {
    if (isDragging) return 

    const rect = containerRef.current?.getBoundingClientRect()
    const cx = e.clientX - (rect?.left || 0)
    const cy = e.clientY - (rect?.top || 0)

    setSelectedMachine(String(node.nodo_id))
    setTooltip({ visible: true, x: cx, y: cy, node })
  }

  const goToDebug = (nodeId?: number) => {
    const machineId = nodeId ? String(nodeId) : selectedMachine
    if (machineId) setSelectedMachine(machineId)
    navigate('/debug')
  }

  const zoom = (factor: number) => {
    const cx = viewBox.x + viewBox.w / 2
    const cy = viewBox.y + viewBox.h / 2
    const nw = viewBox.w / factor
    const nh = viewBox.h / factor
    setViewBox({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh })
  }

  const reset = () => {
    setViewBox(INITIAL_VB)
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0
      scrollContainerRef.current.scrollTop = 0
    }
  }

  // --- Lógica de Arrastre del Mouse ---
  const handleMouseDown = (e: React.MouseEvent) => {
    const targetElement = e.target as HTMLElement
    if (
      targetElement.tagName === 'svg' || 
      targetElement.id === 'topo-lines' || 
      targetElement.tagName === 'line' ||
      targetElement.getAttribute('data-canvas') === 'true'
    ) {
      setIsDragging(true)
      setStartX(e.pageX - (scrollContainerRef.current?.offsetLeft || 0))
      setStartY(e.pageY - (scrollContainerRef.current?.offsetTop || 0))
      setScrollLeft(scrollContainerRef.current?.scrollLeft || 0)
      setScrollTop(scrollContainerRef.current?.scrollTop || 0)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return
    e.preventDefault()
    
    const x = e.pageX - scrollContainerRef.current.offsetLeft
    const y = e.pageY - scrollContainerRef.current.offsetTop
    const walkX = (x - startX) * 1.5 
    const walkY = (y - startY) * 1.5 
    
    // El scroll directo es súper rápido y no satura el estado de React
    scrollContainerRef.current.scrollLeft = scrollLeft - walkX
    scrollContainerRef.current.scrollTop = scrollTop - walkY
  }

  const handleMouseUp = () => setIsDragging(false)
  const closeTooltip = () => setTooltip({ visible: false, x: 0, y: 0 })

  // --- Renderizados Condicionales ---
  if (cargando) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[var(--ink3)] gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-[var(--border)] border-t-[var(--blue)] animate-spin"></div>
        <div className="font-medium text-sm">{t.common?.loading || 'Cargando topología...'}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[var(--ink3)] gap-4">
        <div className="text-4xl">⚠️</div>
        <div className="text-[#ef4444] font-medium">{error}</div>
        <button className="btn btn-outline mt-2" onClick={() => window.location.reload()}>
          {t.common?.refresh || 'Reintentar'}
        </button>
      </div>
    )
  }

  return (
    <div className="topology-body h-full flex flex-col" ref={containerRef}>
      <div className="topology-toolbar flex justify-between items-center p-4 shrink-0">
        <div>
          <div className="topo-title font-bold text-xl">{t.topology?.title || 'Topología de Planta'}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink3)' }}>
            {selectedNode ? `${t.topology?.selectedMachine || 'Seleccionada'}: ${selectedNode.nombre}` : (t.topology?.noMachineSelected || 'Ningún equipo seleccionado')}
          </div>
        </div>
        <div className="topo-btns flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => zoom(1.2)}>
            ＋ {t.topology?.zoomIn || 'Acercar'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => zoom(0.8)}>
            － {t.topology?.zoomOut || 'Alejar'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={reset}>
            {t.topology?.resetView || 'Centrar Vista'}
          </button>
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className="topo-canvas shadow-soft flex-1 relative m-4 mt-0 rounded-xl bg-[var(--surface)] border border-[var(--border)]" 
        style={{ 
          minHeight: 0, 
          overflow: 'auto',
          cursor: isDragging ? 'grabbing' : 'grab' 
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div data-canvas="true" style={{ width: '1600px', height: '1200px', position: 'relative' }}>
          <svg
            id="topo-svg"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full select-none"
          >
            {/* 1. Renderizado de Conexiones SUPER RÁPIDO gracias al Diccionario */}
            <g id="topo-lines" stroke="var(--ink3)" strokeWidth={2} fill="none" opacity={0.6}>
              {conexiones.map(conn => {
                const origen = nodesById.get(conn.nodo_origen_id)
                const destino = nodesById.get(conn.nodo_destino_id)
                
                if (!origen || !destino) return null

                const x1 = (origen.position_x || 0) + (origen.w || 140) / 2
                const y1 = (origen.position_y || 0) + (origen.h || 80) / 2
                const x2 = (destino.position_x || 0) + (destino.w || 140) / 2
                const y2 = (destino.position_y || 0) + (destino.h || 80) / 2

                return (
                  <line 
                    key={conn.conexion_id} 
                    x1={x1} 
                    y1={y1} 
                    x2={x2} 
                    y2={y2} 
                    strokeDasharray={conn.tipo === 'data' ? '6,3' : undefined}
                    className="transition-all duration-300"
                  />
                )
              })}
            </g>

            {/* 2. Renderizado de Nodos */}
            {nodos.map(node => {
              const isSelected = selectedMachine === String(node.nodo_id)
              const width = node.w || 140
              const height = node.h || 80
              const posX = node.position_x || 0
              const posY = node.position_y || 0

              return (
                <g
                  key={node.nodo_id}
                  transform={`translate(${posX},${posY})`}
                  style={{ cursor: 'pointer' }}
                  onClick={e => handleNodeClick(node, e)}
                >
                  <rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    rx={12}
                    fill="var(--surface2)"
                    stroke={isSelected ? 'var(--blue)' : 'var(--border2)'}
                    strokeWidth={isSelected ? 3 : 1.5}
                    className="transition-colors duration-200"
                  />
                  <text x={width / 2} y={26} textAnchor="middle" fontSize={20}>{node.icon}</text>
                  
                  {/* 🔥 Usando 'style' aseguramos la máxima prioridad y sobreescribimos cualquier otro CSS rebelde */}
                  <text x={width / 2} y={48} textAnchor="middle" fontSize={11} style={{ fill: 'var(--ink)' }} fontWeight={600}>
                    {node.nombre || 'Desconocido'}
                  </text>
                  <text x={width / 2} y={64} textAnchor="middle" fontSize={9} style={{ fill: 'var(--ink3)' }}>
                    {(node.tipo || 'default').toUpperCase()}
                  </text>

                  <circle cx={width - 14} cy={14} r={6} fill={getStatusColor(node.estado)} />
                </g>
              )
            })}
          </svg>

          {/* 3. Renderizado del Tooltip */}
          {tooltip.visible && tooltip.node && (
            <div
                className="absolute p-4 rounded-xl border shadow-glow transition-colors duration-200"
                style={{
                left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth || 800) - 260),
                top: Math.min(tooltip.y + 12, (containerRef.current?.clientHeight || 600) - 150),
                zIndex: 60,
                minWidth: 240,
                backgroundColor: 'var(--surface)',
                color: 'var(--ink)',
                borderColor: 'var(--border2)',
                }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xl">{tooltip.node.icon}</div>
                <div className="font-bold text-sm">{tooltip.node.nombre || 'Desconocido'}</div>
              </div>
              <div className="text-xs text-[var(--ink3)] mb-4">
                Categoría: {(tooltip.node.tipo || '').toUpperCase()} · Estado: {tooltip.node.estado || '—'}
              </div>
              <div className="grid gap-2 grid-cols-1">
                <button className="btn btn-sm btn-primary" onClick={() => goToDebug(tooltip.node?.nodo_id)}>
                  {t.topology?.goToDebug || 'Iniciar Diagnóstico IA'}
                </button>
                <button className="btn btn-sm btn-outline" onClick={closeTooltip}>
                  {t.topology?.close || 'Cerrar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlantTopology