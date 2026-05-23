import React, { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import * as XLSX from 'xlsx'
import { computeMTTR, filterTickets, WO_STATUSES } from '../services/workOrders'
import TicketTable from '../components/TicketTable'
import { WorkOrder } from '../types'
import TicketDetailModal from '../components/TicketDetailModal'
import WorkOrderCreateModal, { type WorkOrderCreatePayload } from '../components/WorkOrderCreateModal'
import { showToast } from '../components/Toast'
import FinancialDashboard from '../components/FinancialDashboard'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

type ApiWorkOrderStatus = 'Open' | 'In Progress' | 'Done' | 'Closed'

interface ApiWorkOrder {
  id: string
  title: string
  machine: string
  priority: 'Low' | 'Medium' | 'High' | string
  status: ApiWorkOrderStatus
  age_minutes: number
  description?: string
  created_at?: string
  updated_at?: string
  closed_at?: string | null
}

const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:9000/api').replace(/\/$/, '')

const STATUS_TO_INTERNAL: Record<ApiWorkOrderStatus, WorkOrder['status']> = {
  Open: 'open',
  'In Progress': 'in_progress',
  Done: 'done',
  Closed: 'closed',
}

const INTERNAL_TO_STATUS: Record<WorkOrder['status'], ApiWorkOrderStatus> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  closed: 'Closed',
}

const STATUS_LABELS: Record<WorkOrder['status'], string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  closed: 'Closed',
}

const MACHINE_LABELS: Record<string, string> = {
  'comp-a1': 'Compressor A1',
  'press-b3': 'Hydraulic Press B3',
  'cnc-c2': 'CNC Mill C2',
  'motor-d1': 'Motor Drive D1',
  'pump-e4': 'Pump E4',
}

const PRIORITY_LABELS: Record<WorkOrder['priority'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

const STATUS_COLORS: Record<WorkOrder['status'], string> = {
  open: '#f59e0b',
  in_progress: '#3b82f6',
  done: '#10b981',
  closed: '#64748b',
}

const normalizePriority = (priority?: string): WorkOrder['priority'] => {
  const normalized = (priority || 'medium').toLowerCase()
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') return normalized
  return 'medium'
}

const minutesAgoIso = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()

const mapApiWorkOrder = (order: ApiWorkOrder): WorkOrder => {
  const createdAt = order.created_at ?? minutesAgoIso(order.age_minutes)
  const closedAt =
    order.closed_at ??
    (order.status === 'Done' || order.status === 'Closed' ? new Date().toISOString() : undefined)

  return {
    id: order.id,
    title: order.title,
    description: order.description ?? order.title,
    machineId: order.machine,
    status: STATUS_TO_INTERNAL[order.status],
    priority: normalizePriority(order.priority),
    createdAt,
    closedAt,
    createdBy: 'api',
  }
}

const Dashboard: React.FC = () => {
  const { lang } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  const [tickets, setTickets] = useState<WorkOrder[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [machineFilter, setMachineFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const [selectedTicket, setSelectedTicket] = useState<WorkOrder | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date().toLocaleTimeString('es-CL'))

  const loadWorkOrders = async (showToastOnSuccess = false) => {
    setIsRefreshing(true)
    setIsLoading(true)

    try {
      const response = await fetch(`${API_URL}/work-orders`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(await response.text().catch(() => response.statusText))
      }

      const data = (await response.json()) as ApiWorkOrder[]
      const normalized = data.map(mapApiWorkOrder)

      setTickets(normalized)
      setLastRefresh(new Date().toLocaleTimeString('es-CL'))

      if (showToastOnSuccess) {
        showToast('✅ OTs actualizadas correctamente')
      }

      return normalized
    } catch (error) {
      console.error('Error loading work orders', error)
      showToast('❌ No se pudo conectar con el backend de OTs')
      setTickets([])
      return []
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void loadWorkOrders()
  }, [])

  const total = tickets.length
  const activeCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length
  const closedCount = tickets.filter(t => t.status === 'done' || t.status === 'closed').length
  const mttr = computeMTTR(tickets)

  const filtered = useMemo(
    () => filterTickets(tickets, { status: statusFilter, machineId: machineFilter, search }),
    [tickets, statusFilter, machineFilter, search],
  )

  const statusData = useMemo(
    () =>
      WO_STATUSES.map(status => ({
        name: STATUS_LABELS[status],
        value: tickets.filter(ticket => ticket.status === status).length,
        fill: STATUS_COLORS[status],
      })),
    [tickets],
  )

  const machineData = useMemo(() => {
    const counts: Record<string, number> = {}
    tickets.forEach(ticket => {
      const key = ticket.machineId || ticket.title || 'Desconocida'
      counts[key] = (counts[key] || 0) + 1
    })

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({
        name: MACHINE_LABELS[name] || name,
        value,
      }))
  }, [tickets])

  const resolutionData = useMemo(() => {
    return tickets
      .filter(ticket => ticket.closedAt)
      .slice(0, 8)
      .map(ticket => ({
        id: ticket.id,
        minutes: Math.max(1, Math.round((new Date(ticket.closedAt as string).getTime() - new Date(ticket.createdAt).getTime()) / 60000)),
      }))
  }, [tickets])

  const timelineTickets = useMemo(() => {
    return tickets
      .map(t => {
        const duration = t.closedAt
          ? Math.round((new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / 60000)
          : null
        return { ...t, computedDuration: duration }
      })
      .filter(t => t.computedDuration != null)
      .slice(0, 8)
  }, [tickets])

  const maxDuration = Math.max(...timelineTickets.map(t => t.computedDuration || 0), 60)

  const topMachines = useMemo(() => {
    const counts: Record<string, number> = {}
    tickets.forEach(t => {
      const name = t.machineId || t.title || 'Desconocida'
      counts[name] = (counts[name] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [tickets])

  const maxMachineCount = topMachines[0]?.[1] || 1

  const formatDur = (min?: number | null) => {
    if (min == null) return '—'
    if (min < 60) return `${min}m`
    return `${Math.floor(min / 60)}h ${min % 60}m`
  }

  const handleSelect = async (id: string) => {
    const current = tickets.find(x => x.id === id) || null
    setSelectedTicket(current)

    try {
      const response = await fetch(`${API_URL}/work-orders/${id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(await response.text().catch(() => response.statusText))
      }

      const detail = (await response.json()) as ApiWorkOrder
      setSelectedTicket(mapApiWorkOrder(detail))
    } catch (error) {
      console.error('Error loading work order detail', error)
      if (!current) {
        showToast('❌ No se pudo cargar el detalle de la OT')
      }
    }
  }

  const handleUpdateStatus = async (id: string, status: WorkOrder['status']) => {
    try {
      const response = await fetch(`${API_URL}/work-orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: INTERNAL_TO_STATUS[status] }),
      })

      if (!response.ok) {
        throw new Error(await response.text().catch(() => response.statusText))
      }

      const updated = mapApiWorkOrder((await response.json()) as ApiWorkOrder)

      setTickets(prev => prev.map(t => (t.id === id ? updated : t)))
      setSelectedTicket(prev => (prev && prev.id === id ? updated : prev))
      showToast('✅ Estado actualizado correctamente')
    } catch (error) {
      console.error('Error updating work order', error)
      showToast('❌ No se pudo actualizar la OT')
    }
  }

  const handleCreateWorkOrder = async (payload: WorkOrderCreatePayload) => {
    try {
      const formData = new FormData()
      formData.append('title', payload.title)
      formData.append('machine', payload.machine)
      formData.append('priority', payload.priority)
      formData.append('status', payload.status)
      formData.append('description', payload.description)

      // Campos exactos esperados por FastAPI
      formData.append('disciplinaId', payload.disciplinaId)
      formData.append('tecnicoId', payload.tecnicoId)

      if (payload.photoFile) {
        formData.append('photo', payload.photoFile, payload.photoFile.name)
      }

      const response = await fetch(`${API_URL}/work-orders`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(await response.text().catch(() => response.statusText))
      }

      const created = mapApiWorkOrder((await response.json()) as ApiWorkOrder)
      const refreshed = await loadWorkOrders()
      setSelectedTicket(refreshed.find(ticket => ticket.id === created.id) ?? created)
      showToast(`✅ OT ${created.id} creada correctamente`)
    } catch (error) {
      console.error('Error creating work order', error)
      showToast('❌ No se pudo crear la OT')
      throw error
    }
  }

  const handleDeleteWorkOrder = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/work-orders/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(await response.text().catch(() => response.statusText))
      }

      setTickets(prev => prev.filter(t => t.id !== id))
      setSelectedTicket(prev => (prev && prev.id === id ? null : prev))
      setLastRefresh(new Date().toLocaleTimeString('es-CL'))
      showToast('🗑️ OT eliminada correctamente')
    } catch (error) {
      console.error('Error deleting work order', error)
      showToast('❌ No se pudo eliminar la OT')
      throw error
    }
  }

  const handleRefresh = () => {
    void loadWorkOrders(true)
  }

  const handleExportCsv = () => {
    const header = ['id', 'title', 'machine', 'status', 'priority', 'createdAt', 'closedAt']
    const rows = filtered.map(ticket => [
      ticket.id,
      ticket.title,
      ticket.machineId,
      ticket.status,
      ticket.priority,
      ticket.createdAt,
      ticket.closedAt || '',
    ])

    const csv = [header, ...rows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = 'barb-work-orders.csv'
    link.click()
    URL.revokeObjectURL(url)
    showToast('📄 CSV exportado correctamente')
  }

  const handleExportXlsx = () => {
    const rows = filtered.map(ticket => ({
      ID: ticket.id,
      Título: ticket.title,
      Máquina: MACHINE_LABELS[ticket.machineId] || ticket.machineId,
      Estado: STATUS_LABELS[ticket.status],
      Prioridad: PRIORITY_LABELS[ticket.priority],
      Creada: ticket.createdAt,
      Cerrada: ticket.closedAt || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Work Orders')
    XLSX.writeFile(workbook, 'barb-work-orders.xlsx')
    showToast('📊 XLSX exportado correctamente')
  }

  return (
    <div className="dashboard-body">
      <FinancialDashboard />

      <div className="dash-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div className="kpi-icon" style={{ background: 'var(--blue-bg)' }}>📋</div>
            <svg width="40" height="24"><polyline points="0,20 10,10 20,15 30,5 40,8" fill="none" stroke="var(--ink2)" strokeWidth="2" /></svg>
          </div>
          <div className="kpi-num">{total}</div>
          <div className="kpi-label">{t.dashboard.totalWorkOrders}</div>
          <div className="kpi-delta up">↑ {total} en el período</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-top"><div className="kpi-icon" style={{ background: 'var(--amber-bg)' }}>🔄</div></div>
          <div className="kpi-num" style={{ color: 'var(--amber)' }}>{activeCount}</div>
          <div className="kpi-label">{t.dashboard.activeWorkOrders}</div>
          <div className="kpi-delta">— en progreso</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-top"><div className="kpi-icon" style={{ background: 'var(--green-bg)' }}>✅</div></div>
          <div className="kpi-num" style={{ color: 'var(--green)' }}>{closedCount}</div>
          <div className="kpi-label">{t.dashboard.completedWorkOrders}</div>
          <div className="kpi-delta up">— resueltas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-top"><div className="kpi-icon" style={{ background: 'var(--accent-bg)' }}>⏱</div></div>
          <div className="kpi-num" style={{ color: 'var(--accent)' }}>{mttr}</div>
          <div className="kpi-label">{t.dashboard.mttr}</div>
          <div className="kpi-delta">— vs objetivo 35 min</div>
        </div>
      </div>

      <div className="dash-filters">
        <select
          aria-label={t.common.status}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">{t.dashboard.allStatuses}</option>
          {WO_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>

        <select
          aria-label={t.common.machine}
          value={machineFilter}
          onChange={e => setMachineFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">{t.dashboard.allMachines}</option>
          <option value="comp-a1">Compressor A1</option>
          <option value="press-b3">Hydraulic Press B3</option>
          <option value="cnc-c2">CNC Mill C2</option>
          <option value="motor-d1">Motor Drive D1</option>
          <option value="pump-e4">Pump E4</option>
        </select>

        <input
          aria-label={t.common.search}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={lang === 'es' ? 'Buscar OTs, técnicos…' : 'Search work orders, technicians…'}
          className="filter-search"
        />

        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setIsCreateOpen(true)}>
          {t.dashboard.createWorkOrder}
        </button>

        <button className="dash-refresh-btn" onClick={handleRefresh}>
          <svg className={isRefreshing ? 'spinning' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {t.common.refresh}
        </button>

        <button className="dash-refresh-btn" onClick={handleExportCsv}>
          {t.common.export} {t.common.csv}
        </button>

        <button className="dash-refresh-btn" onClick={handleExportXlsx}>
          {t.common.export} {t.common.xlsx}
        </button>

        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink3)' }}>
          {t.dashboard.updatedAt(lastRefresh)}
        </div>
      </div>

      <div className="dash-section-title">
        {t.dashboard.title}{' '}
        <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--ink3)' }}>
          {filtered.length} registros
        </span>
      </div>

      {isLoading && tickets.length === 0 ? (
        <div style={{ padding: 16, color: 'var(--ink3)', fontSize: 12 }}>{t.common.loading}</div>
      ) : (
        <TicketTable tickets={filtered} onSelect={handleSelect} />
      )}

      <div className="dash-bottom">
        <div className="timeline-card">
          <div className="dash-section-title">{t.dashboard.chartResolution} <span>duración real</span></div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={resolutionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.18)" />
                <XAxis dataKey="id" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="minutes" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="top-machines-card">
          <div className="dash-section-title">{t.dashboard.chartMachines} <span>período</span></div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={machineData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={90} paddingAngle={3}>
                  {machineData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'][index % 6]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="dash-bottom" style={{ marginTop: 16 }}>
        <div className="timeline-card">
          <div className="dash-section-title">{t.dashboard.chartStatus} <span>OTs actuales</span></div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.18)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {statusData.map(entry => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="top-machines-card">
          <div className="dash-section-title">Top máquinas con fallas <span>período</span></div>
          <div>
            {topMachines.length === 0 ? (
              <div style={{ color: 'var(--ink3)', fontSize: '12px', textAlign: 'center', padding: '16px' }}>
                {t.dashboard.noData}
              </div>
            ) : (
              topMachines.map(([name, count], i) => (
                <div key={name} className="tm-row">
                  <div className="tm-rank">{i + 1}</div>
                  <div className="tm-info">
                    <div className="tm-name">{MACHINE_LABELS[name] || name}</div>
                    <div className="tm-count">{count} OT{count !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="tm-bar-mini">
                    <div className="tm-bar-fill" style={{ width: `${Math.round((count / maxMachineCount) * 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <WorkOrderCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateWorkOrder}
      />

      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onUpdateStatus={handleUpdateStatus}
        onDelete={handleDeleteWorkOrder}
      />
    </div>
  )
}

export default Dashboard
