// @ts-nocheck
import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import { createApiService } from '../services/api'
import { getTranslations } from '../utils/i18n'

type TopologyNode = {
  nodo_id: number
  maquina_id: number
  nombre_visual: string
  pos_x: number
  pos_y: number
  icono: string
  tipo: string
  estado_actual: string
}

type TopologyEdge = {
  conexion_id: number
  origen_nodo_id: number
  destino_nodo_id: number
  tipo_relacion: string
}

const INITIAL_VB = { x: -100, y: -50, w: 1200, h: 800 }
const NODE_W = 130
const NODE_H = 85

const PlantTopology: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { setSelectedMachine, lang, apiBase } = useAppContext()
  const navigate = useNavigate()
  
  const t = useMemo(() => getTranslations(lang), [lang])
  
  const [viewBox, setViewBox] = useState(INITIAL_VB)
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; node?: TopologyNode }>({ visible: false, x: 0, y: 0 })
  
  // 👇 NUEVOS ESTADOS PARA EL ARRASTRE (PANNING)
  const [isPanning, setIsPanning] = useState(false)
  const [startPan, setStartPan] = useState({ x: 0, y: 0 })
  
  const [nodes, setNodes] = useState<TopologyNode[]>([])
  const [edges, setEdges] = useState<TopologyEdge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    
    async function fetchTopology() {
      try {
        const api = createApiService(apiBase)
        const data = await api.topologia() 
        if (!controller.signal.aborted && data) {
          setNodes(Array.isArray(data.nodos) ? data.nodos : [])
          setEdges(Array.isArray(data.conexiones) ? data.conexiones : [])
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') console.error("Error cargando topología:", error)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    
    void fetchTopology()
    return () => controller.abort()
  }, [apiBase])

  const nodesDict = useMemo(() => {
    const dict = new Map<number, {x: number, y: number}>()
    nodes.forEach(n => {
      dict.set(n.nodo_id, {
        x: (n.pos_x || 0) + NODE_W / 2,
        y: (n.pos_y || 0) + NODE_H / 2
      })
    })
    return dict
  }, [nodes])

  // 👇 NUEVAS FUNCIONES PARA MANEJAR EL MOUSE (ARRASRE)
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.topo-node')) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !svgRef.current) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    
    const dx = (e.clientX - startPan.x) * scaleX;
    const dy = (e.clientY - startPan.y) * scaleY;
    
    setViewBox(prev => ({
      ...prev,
      x: prev.x - dx,
      y: prev.y - dy
    }));
    
    setStartPan({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUpOrLeave = () => {
    setIsPanning(false);
  };

  const handleNodeClick = (node: TopologyNode, e: React.MouseEvent) => {
    e.stopPropagation(); // 👈 EVITA QUE EL CLICK SE CONFUNDA CON ARRASTRE
    const rect = containerRef.current?.getBoundingClientRect()
    const cx = e.clientX - (rect?.left || 0)
    const cy = e.clientY - (rect?.top || 0)
    setTooltip({ visible: true, x: cx, y: cy, node })
  }

  const goToDebug = (machineId?: number) => {
    if (machineId) {
      setSelectedMachine(String(machineId))
      navigate('/debug', { state: { machineId: String(machineId) } })
    } else {
      navigate('/debug')
    }
  }

  const zoom = (factor: number) => {
    const cx = viewBox.x + viewBox.w / 2
    const cy = viewBox.y + viewBox.h / 2
    const nw = viewBox.w / factor
    const nh = viewBox.h / factor
    setViewBox({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh })
  }

  const reset = () => setViewBox(INITIAL_VB)

  // ⚠️ FIX: el enum real de la BD (estado_nodo) es operational/warning/error/offline
  // (inglés). Antes se buscaban valores en español ('operativo'/'alerta'/'falla')
  // que nunca existen ahí, así que 'operational' y 'offline' nunca coincidían con
  // ninguna condición y caían al gris por defecto — la topología se veía casi toda
  // gris en vez de reflejar el estado real de cada nodo.
  const getStatusColor = (status: string) => {
    const s = String(status || '').toLowerCase()
    if (s === 'operational') return 'var(--green)'
    if (s === 'warning') return 'var(--amber)'
    if (s === 'error') return 'var(--red)'
    if (s === 'offline') return 'var(--ink3)'
    return 'var(--ink3)'
  }

  // Traducción local del enum real (i18n.ts no tiene estas claves; sus claves
  // 'operativo'/'alerta'/'mantenimiento'/'falla' pertenecen a otro sistema de
  // estados — Machine.status — no a estado_nodo).
  const NODE_STATUS_LABEL: Record<string, Record<string, string>> = {
    es: { operational: 'Operativo', warning: 'Alerta', error: 'Falla', offline: 'Fuera de línea' },
    en: { operational: 'Operational', warning: 'Warning', error: 'Error', offline: 'Offline' },
  }
  const nodeStatusLabel = (status?: string) => {
    const s = String(status || '').toLowerCase()
    const dict = NODE_STATUS_LABEL[lang] || NODE_STATUS_LABEL.en
    return dict[s] || status || ''
  }

  if (loading) {
    return <div className="topo-loading">{t.common?.loading || 'Cargando Topología...'}</div>
  }

  return (
    <div className="topo-page" ref={containerRef}>
      <div className="topo-header">
        <div className="topo-title">{t.topology?.title || 'Topología de Planta (En Vivo)'}</div>
        <div className="topo-header-actions">
          <button className="btn btn-outline btn-sm" onClick={() => zoom(1.2)}>＋ {t.topology?.zoomIn || 'Zoom In'}</button>
          <button className="btn btn-outline btn-sm" onClick={() => zoom(0.8)}>－ {t.topology?.zoomOut || 'Zoom Out'}</button>
          <button className="btn btn-outline btn-sm" onClick={reset}>{t.topology?.resetView || 'Reset View'}</button>
        </div>
      </div>

      <div className="topo-canvas">
        <svg 
          ref={svgRef} 
          id="topo-svg" 
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} 
          preserveAspectRatio="xMidYMid meet" 
          className="topo-svg-el"
          style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}       // 👈 EVENTOS DE MOUSE PARA ARRASTRAR
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
        >
          
          <g id="topo-lines" className="topo-edges" strokeWidth={2} fill="none">
            {edges.map(edge => {
              const start = nodesDict.get(edge.origen_nodo_id)
              const end = nodesDict.get(edge.destino_nodo_id)
              
              if (!start || !end) return null

              const strokeDash = edge.tipo_relacion === 'energia' ? "6,3" : ""
              return (
                <line 
                  key={edge.conexion_id} 
                  x1={start.x} y1={start.y} 
                  x2={end.x} y2={end.y} 
                  strokeDasharray={strokeDash} 
                  className="topo-edge"
                />
              )
            })}
          </g>

          {nodes.map(n => {
            const nodeColor = getStatusColor(n.estado_actual)
            return (
              <g key={n.nodo_id} transform={`translate(${n.pos_x || 0},${n.pos_y || 0})`} className="topo-node" onClick={(e) => handleNodeClick(n, e)}>
                <rect x={0} y={0} width={NODE_W} height={NODE_H} rx={12} fill="var(--surface2)" stroke={nodeColor} strokeWidth={2} />
                <text x={NODE_W / 2} y={28} textAnchor="middle" fontSize={22}>{n.icono}</text>

                {/* Textos con el color corregido para modo oscuro */}
                <text x={NODE_W / 2} y={50} textAnchor="middle" fontSize={11} fill="var(--ink)" fontWeight={600}>{n.nombre_visual || 'Sin nombre'}</text>
                <text x={NODE_W / 2} y={65} textAnchor="middle" fontSize={10} fill="var(--ink3)">{n.tipo || 'Desconocido'}</text>

                <circle cx={NODE_W - 14} cy={14} r={7} fill={nodeColor} />
              </g>
            )
          })}
        </svg>

        {tooltip.visible && tooltip.node && (
          <div 
            style={{ 
              left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth || 800) - 220), 
              top: Math.min(tooltip.y + 12, (containerRef.current?.clientHeight || 600) - 100)
            }} 
            className="topo-tooltip"
          >
            <div className="topo-tooltip-title">{tooltip.node.nombre_visual}</div>
            <div className="topo-tooltip-meta">
              {tooltip.node.tipo} · {nodeStatusLabel(tooltip.node.estado_actual)}
            </div>
            <div className="topo-tooltip-actions">
              <button className="btn btn-sm btn-primary" onClick={() => goToDebug(tooltip.node?.maquina_id)}>
                {t.topology?.goToDebug || 'Diagnóstico IA'}
              </button>
              <button className="btn btn-sm btn-outline" onClick={() => setTooltip({ visible: false, x: 0, y: 0 })}>
                {t.topology?.close || 'Cerrar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PlantTopology