// @ts-nocheck

// =============================================================================
// IMPORTS
// =============================================================================

import React, { useRef, useState, useEffect, useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import { getTranslations } from '../utils/i18n'

// =============================================================================
// TIPOS
// =============================================================================

type TopologyNode = {
  nodo_id: number | string
  maquina_id: number | string
  nombre_visual: string
  pos_x: number
  pos_y: number
  icono: string
  tipo: string
  estado_actual: string
}

type TopologyEdge = {
  conexion_id: number | string
  origen_nodo_id: number | string
  destino_nodo_id: number | string
  tipo_relacion: string
}

// =============================================================================
// CONSTANTES
// =============================================================================

const INITIAL_VB = { x: -100, y: -50, w: 1200, h: 800 }
const NODE_W = 130
const NODE_H = 85

// =============================================================================
// UTILIDADES: MAPEO DE DATOS DE LA API
// =============================================================================

const mapApiNode = (n: any): TopologyNode => ({
  nodo_id: n.nodo_id ?? n.id,
  maquina_id: n.maquina_id ?? n.machine_id ?? n.machineId ?? '',
  nombre_visual: n.nombre_visual ?? n.name ?? n.nombre ?? 'Sin nombre',
  pos_x: Number(n.pos_x ?? n.x ?? 0),
  pos_y: Number(n.pos_y ?? n.y ?? 0),
  icono: n.icono ?? n.icon ?? '⚙️',
  tipo: n.tipo ?? n.type ?? 'Componente',
  estado_actual: n.estado_actual ?? n.status ?? n.estado ?? 'ok'
})

const mapApiEdge = (e: any): TopologyEdge => ({
  conexion_id: e.conexion_id ?? e.id,
  origen_nodo_id: e.origen_nodo_id ?? e.source_id ?? e.source,
  destino_nodo_id: e.destino_nodo_id ?? e.target_id ?? e.target,
  tipo_relacion: e.tipo_relacion ?? e.relation_type ?? e.type ?? 'default'
})

// =============================================================================
// COMPONENTE PRINCIPAL: PLANT TOPOLOGY
// =============================================================================

const PlantTopology: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // ---------------------------------------------------------------------
  // Estados
  // ---------------------------------------------------------------------

  const { setSelectedMachine, lang, api } = useAppContext()
  const navigate = useNavigate()
  
  const t = useMemo(() => getTranslations(lang), [lang])
  
  const [viewBox, setViewBox] = useState(INITIAL_VB)
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; node?: TopologyNode }>({ visible: false, x: 0, y: 0 })
  
  const [isPanning, setIsPanning] = useState(false)
  const [startPan, setStartPan] = useState({ x: 0, y: 0 })

  // Referencia para gestos táctiles: modo activo (pan/pinch), última posición y última distancia entre dedos.
  const touchRef = useRef<{ mode: 'pan' | 'pinch' | null; x: number; y: number; dist: number }>({ mode: null, x: 0, y: 0, dist: 0 })
  
  const [nodes, setNodes] = useState<TopologyNode[]>([])
  const [edges, setEdges] = useState<TopologyEdge[]>([])
  const [loading, setLoading] = useState(true)

  // ---------------------------------------------------------------------
  // Carga de datos
  // ---------------------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController()
    
    async function fetchTopology() {
      try {
        // api.topologia() adjunta el token de sesión automáticamente,
        // a diferencia de un fetch() manual.
        const data = await api.topologia() 
        if (!controller.signal.aborted && data) {
          const rawNodes = Array.isArray(data.nodos) ? data.nodos : (Array.isArray(data.nodes) ? data.nodes : [])
          const rawEdges = Array.isArray(data.conexiones) ? data.conexiones : (Array.isArray(data.edges) ? data.edges : [])
          
          setNodes(rawNodes.map(mapApiNode))
          setEdges(rawEdges.map(mapApiEdge))
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') console.error("Error cargando topología:", error)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    
    void fetchTopology()
    return () => controller.abort()
  }, [api])

  const nodesDict = useMemo(() => {
    const dict = new Map<string, {x: number, y: number}>()
    nodes.forEach(n => {
      dict.set(String(n.nodo_id), {
        x: (n.pos_x || 0) + NODE_W / 2,
        y: (n.pos_y || 0) + NODE_H / 2
      })
    })
    return dict
  }, [nodes])

  // ---------------------------------------------------------------------
  // Handlers de mouse (paneo)
  // ---------------------------------------------------------------------

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

  // ---------------------------------------------------------------------
  // Handlers táctiles (pan / pinch-zoom)
  // ---------------------------------------------------------------------

  // Calcula la distancia entre dos puntos de contacto (usado para el gesto de pellizco/zoom).
  const getTouchDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.topo-node')) return;

    if (e.touches.length === 1) {
      touchRef.current = { mode: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 }
      setIsPanning(true);
    } else if (e.touches.length === 2) {
      touchRef.current = { mode: 'pinch', x: 0, y: 0, dist: getTouchDistance(e.touches) }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!svgRef.current) return;
    const mode = touchRef.current.mode;
    if (!mode) return;

    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;

    if (mode === 'pan' && e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = (touch.clientX - touchRef.current.x) * scaleX;
      const dy = (touch.clientY - touchRef.current.y) * scaleY;

      setViewBox(prev => ({
        ...prev,
        x: prev.x - dx,
        y: prev.y - dy
      }));

      touchRef.current.x = touch.clientX;
      touchRef.current.y = touch.clientY;
    } else if (mode === 'pinch' && e.touches.length === 2) {
      const newDist = getTouchDistance(e.touches);
      if (touchRef.current.dist > 0) {
        const factor = newDist / touchRef.current.dist;
        const nw = viewBox.w / factor;
        const nh = viewBox.h / factor;
        const cx = viewBox.x + viewBox.w / 2;
        const cy = viewBox.y + viewBox.h / 2;

        setViewBox({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
      }
      touchRef.current.dist = newDist;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      touchRef.current = { mode: null, x: 0, y: 0, dist: 0 };
      setIsPanning(false);
    } else if (e.touches.length === 1) {
      // Se levantó un dedo durante un pellizco: continúa el gesto como desplazamiento simple.
      touchRef.current = { mode: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY, dist: 0 }
    }
  };

  // ---------------------------------------------------------------------
  // Acciones de la vista: selección de nodo, navegación y zoom
  // ---------------------------------------------------------------------

  const handleNodeClick = (node: TopologyNode, e: React.MouseEvent) => {
    e.stopPropagation(); 
    const rect = containerRef.current?.getBoundingClientRect()
    const cx = e.clientX - (rect?.left || 0)
    const cy = e.clientY - (rect?.top || 0)
    setTooltip({ visible: true, x: cx, y: cy, node })
  }

  const goToDebug = (machineId?: number | string) => {
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
    if (s.includes('operativo') || s.includes('ok') || s === 'open' || s === 'activo') return 'var(--green)'
    if (s.includes('alerta') || s.includes('warning') || s.includes('mantenimiento')) return 'var(--amber)'
    if (s.includes('falla') || s.includes('error') || s.includes('closed') || s.includes('crítico')) return 'var(--red)'
    return 'var(--ink3)'
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

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

      <div className="topo-canvas shadow-soft">
        <svg 
          ref={svgRef} 
          id="topo-svg" 
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} 
          preserveAspectRatio="xMidYMid meet" 
          className={`topo-svg ${isPanning ? 'topo-svg--panning' : ''}`}
          style={{ touchAction: 'none' }}
          onMouseDown={handleMouseDown}       
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          
          <g className="topo-lines" strokeWidth={2} fill="none">
            {edges.map(edge => {
              const start = nodesDict.get(String(edge.origen_nodo_id))
              const end = nodesDict.get(String(edge.destino_nodo_id))
              
              if (!start || !end) return null

              const strokeDash = edge.tipo_relacion === 'energia' ? "6,3" : ""
              return (
                <line 
                  key={String(edge.conexion_id)} 
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
              <g key={String(n.nodo_id)} transform={`translate(${n.pos_x || 0},${n.pos_y || 0})`} className="topo-node" onClick={(e) => handleNodeClick(n, e)}>
                <rect x={0} y={0} width={NODE_W} height={NODE_H} rx={12} fill="var(--surface2)" stroke={nodeColor} strokeWidth={2} />
                <text x={NODE_W / 2} y={28} textAnchor="middle" fontSize={22}>{n.icono}</text>
                
                <text x={NODE_W / 2} y={50} textAnchor="middle" fontSize={11} className="topo-node-name" fontWeight={600}>{n.nombre_visual}</text>
                <text x={NODE_W / 2} y={65} textAnchor="middle" fontSize={10} className="topo-node-type">{n.tipo}</text>
                
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
              {tooltip.node.tipo} · {t.statuses?.[tooltip.node.estado_actual?.toLowerCase()] || tooltip.node.estado_actual}
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