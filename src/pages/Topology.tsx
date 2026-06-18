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
  const { setSelectedMachine, lang } = useAppContext()
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
        const api = createApiService()
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
  }, [])

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

  const getStatusColor = (status: string) => {
    const s = String(status || '').toLowerCase()
    if (s.includes('operativo') || s.includes('ok') || s === 'open') return '#10B981'
    if (s.includes('alerta') || s.includes('warning') || s.includes('mantenimiento')) return '#F59E0B'
    if (s.includes('falla') || s.includes('error') || s.includes('closed')) return '#ef4444'
    return '#64748B'
  }

  if (loading) {
    return <div className="p-4 text-center">{t.common?.loading || 'Cargando Topología...'}</div>
  }

  return (
    <div className="w-full relative h-full flex flex-col" ref={containerRef}>
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="text-lg font-semibold">{t.topology?.title || 'Topología de Planta (En Vivo)'}</div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => zoom(1.2)}>＋ {t.topology?.zoomIn || 'Zoom In'}</button>
          <button className="btn btn-outline btn-sm" onClick={() => zoom(0.8)}>－ {t.topology?.zoomOut || 'Zoom Out'}</button>
          <button className="btn btn-outline btn-sm" onClick={reset}>{t.topology?.resetView || 'Reset View'}</button>
        </div>
      </div>

      <div style={{ minHeight: 0, borderRadius: 12, overflow: 'hidden' }} className="topo-canvas flex-1 bg-[var(--surface)] border border-[var(--border)] shadow-soft relative">
        <svg 
          ref={svgRef} 
          id="topo-svg" 
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} 
          preserveAspectRatio="xMidYMid meet" 
          style={{ 
            width: '100%', 
            height: '100%',
            cursor: isPanning ? 'grabbing' : 'grab' // 👈 CAMBIA EL CURSOR
          }}
          onMouseDown={handleMouseDown}       // 👈 EVENTOS DE MOUSE PARA ARRASTRAR
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
        >
          
          <g id="topo-lines" stroke="currentColor" className="text-[var(--ink3)] opacity-40" strokeWidth={2} fill="none">
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
                  className="transition-all duration-300"
                />
              )
            })}
          </g>

          {nodes.map(n => {
            const nodeColor = getStatusColor(n.estado_actual)
            return (
              <g key={n.nodo_id} transform={`translate(${n.pos_x || 0},${n.pos_y || 0})`} className="topo-node transition-transform" style={{ cursor: 'pointer' }} onClick={(e) => handleNodeClick(n, e)}>
                <rect x={0} y={0} width={NODE_W} height={NODE_H} rx={12} fill="var(--surface2)" stroke={nodeColor} strokeWidth={2} />
                <text x={NODE_W / 2} y={28} textAnchor="middle" fontSize={22}>{n.icono}</text>
                
                {/* Textos con el color corregido para modo oscuro */}
                <text x={NODE_W / 2} y={50} textAnchor="middle" fontSize={11} className="text-[var(--ink)]" fill="currentColor" fontWeight={600}>{n.nombre_visual || 'Sin nombre'}</text>
                <text x={NODE_W / 2} y={65} textAnchor="middle" fontSize={10} className="text-[var(--ink3)]" fill="currentColor">{n.tipo || 'Desconocido'}</text>
                
                <circle cx={NODE_W - 14} cy={14} r={7} fill={nodeColor} />
              </g>
            )
          })}
        </svg>

        {tooltip.visible && tooltip.node && (
          <div 
            style={{ 
              position: 'absolute', 
              left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth || 800) - 220), 
              top: Math.min(tooltip.y + 12, (containerRef.current?.clientHeight || 600) - 100), 
              zIndex: 60,
              minWidth: 200 
            }} 
            className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-xl shadow-lg"
          >
            <div className="font-semibold text-[var(--ink)]">{tooltip.node.nombre_visual}</div>
            <div className="text-xs text-[var(--ink3)] mt-1 mb-3">
              {tooltip.node.tipo} · {t.statuses?.[tooltip.node.estado_actual?.toLowerCase()] || tooltip.node.estado_actual}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-primary py-1 px-3" onClick={() => goToDebug(tooltip.node?.maquina_id)}>
                {t.topology?.goToDebug || 'Diagnóstico IA'}
              </button>
              <button className="btn btn-sm btn-outline py-1 px-3" onClick={() => setTooltip({ visible: false, x: 0, y: 0 })}>
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