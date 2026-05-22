import React, { useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'
import MACHINES from '../data/machines'

type MachineNode = {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  icon: string
  cat: string
  status: 'operational' | 'warning' | 'maintenance' | 'offline'
  stroke: string
}

const NODES: MachineNode[] = [
  { id: 'motor-d1', name: 'Motor Drive D1', x: 140, y: 100, w: 120, h: 80, icon: '⚡', cat: 'Electrical', status: 'maintenance', stroke: '#a06a00' },
  { id: 'cnc-c2', name: 'CNC Mill C2', x: 338, y: 58, w: 120, h: 80, icon: '⚙️', cat: 'Mechanical', status: 'operational', stroke: '#1a5fa8' },
  { id: 'comp-a1', name: 'Compressor A1', x: 558, y: 90, w: 124, h: 80, icon: '💨', cat: 'Pneumatic', status: 'operational', stroke: '#5e3db3' },
  { id: 'plc', name: 'PLC Controller', x: 320, y: 265, w: 120, h: 80, icon: '🤖', cat: 'Automation', status: 'operational', stroke: '#1a7a50' },
  { id: 'press-b3', name: 'Hydraulic Press B3', x: 618, y: 270, w: 132, h: 80, icon: '💧', cat: 'Hydraulic', status: 'warning', stroke: '#0e7490' },
]

const INITIAL_VB = { x: 0, y: 0, w: 900, h: 480 }

const statusColor = (status: MachineNode['status']) => {
  if (status === 'operational') return '#3ecf8e'
  if (status === 'warning') return '#d97706'
  if (status === 'maintenance') return '#3b82f6'
  return '#6b7280'
}

const PlantTopology: React.FC = () => {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { lang, selectedMachine, setSelectedMachine } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  const [viewBox, setViewBox] = useState(INITIAL_VB)
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; node?: MachineNode }>({
    visible: false,
    x: 0,
    y: 0,
  })

  const selectedNode = useMemo(
    () => NODES.find(node => node.id === selectedMachine) ?? null,
    [selectedMachine],
  )

  const getNode = (node: MachineNode) => {
    const machine = MACHINES[node.id as keyof typeof MACHINES]
    if (!machine) return node
    return {
      ...node,
      name: machine.name,
      icon: machine.icon,
      cat: machine.cat,
      status: machine.status as MachineNode['status'],
    }
  }

  const handleNodeClick = (node: MachineNode, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    const cx = e.clientX - (rect?.left || 0)
    const cy = e.clientY - (rect?.top || 0)

    setSelectedMachine(node.id)
    setTooltip({ visible: true, x: cx, y: cy, node })
  }

  const goToDebug = (nodeId?: string) => {
    const machineId = nodeId ?? tooltip.node?.id ?? selectedMachine
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

  const reset = () => setViewBox(INITIAL_VB)

  const closeTooltip = () => setTooltip({ visible: false, x: 0, y: 0 })

  return (
    <div className="topology-body h-full" ref={containerRef}>
      <div className="topology-toolbar">
        <div>
          <div className="topo-title">{t.topology.title}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink3)' }}>
            {selectedNode ? `${t.topology.selectedMachine}: ${selectedNode.name}` : t.topology.noMachineSelected}
          </div>
        </div>
        <div className="topo-btns">
          <button className="btn btn-outline btn-sm" onClick={() => zoom(1.2)} aria-label={t.topology.zoomIn}>
            ＋ {t.topology.zoomIn}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => zoom(0.8)} aria-label={t.topology.zoomOut}>
            － {t.topology.zoomOut}
          </button>
          <button className="btn btn-outline btn-sm" onClick={reset} aria-label={t.topology.resetView}>
            {t.topology.resetView}
          </button>
        </div>
      </div>

      <div className="topo-canvas shadow-soft" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <svg
          id="topo-svg"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%' }}
        >
          <g id="topo-lines" stroke="#cfcfcf" strokeWidth={2} fill="none">
            <line x1="200" y1="160" x2="400" y2="120" strokeDasharray="6,3" opacity="0.7" />
            <line x1="400" y1="120" x2="620" y2="150" opacity="0.7" />
            <line x1="400" y1="120" x2="390" y2="320" opacity="0.7" />
            <line x1="200" y1="160" x2="390" y2="320" strokeDasharray="6,3" opacity="0.5" />
            <line x1="620" y1="150" x2="680" y2="330" opacity="0.5" />
          </g>

          {NODES.map(baseNode => {
            const node = getNode(baseNode)
            const isSelected = selectedMachine === node.id

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: 'pointer' }}
                onClick={e => handleNodeClick(node, e)}
              >
                <rect
                  x={0}
                  y={0}
                  width={node.w}
                  height={node.h}
                  rx={12}
                  fill="var(--surface)"
                  stroke={isSelected ? 'var(--accent)' : node.stroke}
                  strokeWidth={isSelected ? 4 : 2}
                />
                <text x={node.w / 2} y={28} textAnchor="middle" fontSize={22}>
                  {node.icon}
                </text>
                <text x={node.w / 2} y={50} textAnchor="middle" fontSize={11} fill="var(--ink)" fontWeight={600}>
                  {node.name}
                </text>
                <text x={node.w / 2} y={65} textAnchor="middle" fontSize={10} fill="var(--ink3)">
                  {node.cat}
                </text>
                <circle cx={node.w - 14} cy={14} r={7} fill={statusColor(node.status)} />
              </g>
            )
          })}
        </svg>

        {tooltip.visible && tooltip.node && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(tooltip.x + 12, 640),
              top: Math.min(tooltip.y + 12, 360),
              zIndex: 60,
              minWidth: 240,
              maxWidth: 320,
              background: 'var(--surface)',
              color: 'var(--ink)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-lg)',
              padding: 14,
              backdropFilter: 'blur(10px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 20 }}>{tooltip.node.icon}</div>
              <div style={{ fontWeight: 700 }}>{tooltip.node.name}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {tooltip.node.cat} · {tooltip.node.status}
            </div>
            <div
              style={{
                marginTop: 12,
                display: 'grid',
                gap: 8,
                gridTemplateColumns: '1fr',
              }}
            >
              <button className="btn btn-sm btn-primary" onClick={() => goToDebug(tooltip.node?.id)}>
                {t.topology.goToDebug}
              </button>
              <button className="btn btn-sm btn-outline" onClick={closeTooltip}>
                {t.topology.close}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PlantTopology
