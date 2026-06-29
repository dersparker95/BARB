// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, Cell, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis, PieChart, Pie, Legend
} from 'recharts'
import * as XLSX from 'xlsx'
import TicketTable from '../components/TicketTable'
import { WorkOrder } from '../types'
import TicketDetailModal from '../components/TicketDetailModal'
import WorkOrderCreateModal from '../components/WorkOrderCreateModal'
import { showToast } from '../components/Toast'
import FinancialDashboard from '../components/FinancialDashboard'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'
import { BARB_BUSINESS } from '../hooks/useFinancialStats'

// Interfaz flexibilizada para soportar las nuevas llaves de FastAPI
interface ApiWorkOrder {
  id?: string | number; ot_id?: string | number;
  title?: string; numero_ot?: string;
  machine_id?: string | number; maquina_id?: string | number;
  machineId?: string | number; maquinaId?: string | number;
  priority?: string; prioridad?: string;
  status?: string; estado?: string;
  age_minutes?: number;
  description?: string; descripcion_problema?: string;
  created_at?: string; fecha_creacion?: string;
  closed_at?: string | null; fecha_cierre?: string | null;
  tecnico_nombre?: string; creado_por?: string;
  discipline_name?: string; disciplina?: string;
  tipo?: string; maintenance_type?: string;
  costo_estimado?: number; costo_real?: number;
  reporte_id?: number | null; diagnostico_id?: number | null;
  downtime_minutes?: number | null;
  machine_name?: string; maquina_nombre?: string;
}

interface ApiMachine { id: number; name: string; discipline_id: number; plant_id?: number }

const API_URL = 'https://barb-2ih8.onrender.com/api'
const CHART_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16']

const ensureUTC = (d?: string | null) => { if (!d) return undefined; return d.endsWith('Z') || d.includes('+') ? d : d + 'Z' }

const mapApiWorkOrder = (o: ApiWorkOrder): WorkOrder => {
  const createdAt = ensureUTC(o.created_at ?? o.fecha_creacion) ?? new Date(Date.now() - (o.age_minutes || 0) * 60000).toISOString()
  const closedAt = ensureUTC(o.closed_at ?? o.fecha_cierre)
  let duration = 0

  if (o.downtime_minutes != null) duration = Number(o.downtime_minutes)
  else if (closedAt) duration = Math.max(1, Math.round((new Date(closedAt).getTime() - new Date(createdAt).getTime()) / 60000))
  else duration = Math.max(1, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000))

  const machineId = String(o.machine_id ?? o.maquina_id ?? o.machineId ?? o.maquinaId ?? '')

  return {
    id: String(o.id ?? o.ot_id),
    title: o.title ?? o.numero_ot ?? `OT-${o.id}`,
    description: o.description ?? o.descripcion_problema ?? o.title ?? 'Sin descripción',
    machineId,
    machineName: o.machine_name ?? o.maquina_nombre ?? `Máquina ${machineId}`,
    status: (o.status ?? o.estado ?? 'pending').toLowerCase(),
    priority: (o.priority ?? o.prioridad ?? 'medium').toLowerCase() as any,
    createdAt,
    closedAt,
    durationReal: duration,
    createdBy: o.tecnico_nombre ?? o.creado_por ?? 'Operador',
    discipline: o.discipline_name ?? o.disciplina ?? 'General',
    maintenanceType: o.tipo ?? o.maintenance_type ?? 'corrective',
    costoEstimado: Number(o.costo_estimado) || 0,
    costoReal: Number(o.costo_real) || 0,
    hasBarbAi: !!(o.reporte_id || o.diagnostico_id)
  }
}

// ✅ CORREGIDO: Block usa clases BEM en lugar de estilos inline
const Block: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; className?: string }> = ({ title, subtitle, children, className = '' }) => (
  <div className={`dash-block ${className}`}>
    <div className="dash-block-header">
      <span className="dash-block-title">{title}</span>
      {subtitle && <span className="dash-block-subtitle">{subtitle}</span>}
    </div>
    {children}
  </div>
)

export default function Dashboard() {
  const { lang, apiBase } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  const [tickets, setTickets] = useState<WorkOrder[]>([])
  const [machines, setMachines] = useState<ApiMachine[]>([])
  const [timeRange, setTimeRange] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [machineFilter, setMachineFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [isFiltersOpen, setIsFiltersOpen] = useState(!isMobile)

  useEffect(() => {
    const handleResize = () => { setIsMobile(window.innerWidth <= 768); if (window.innerWidth > 768) setIsFiltersOpen(true) }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [selectedTicket, setSelectedTicket] = useState<WorkOrder | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true)
    try {
      const safeApi = apiBase ? apiBase.replace(/\/$/, '') : API_URL
      const [resOts, resMach] = await Promise.all([
        fetch(`${safeApi}/work-orders`, { signal }),
        fetch(`${safeApi}/machines`, { signal })
      ])

      if (resMach.ok) setMachines(await resMach.json())
      if (resOts.ok) {
        const rawData = await resOts.json();
        const ticketsArray = Array.isArray(rawData) ? rawData : (rawData.data || []);
        setTickets(ticketsArray.map(mapApiWorkOrder))
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      showToast(t.common?.error || 'Error de conexión al cargar el Dashboard')
    } finally {
      setIsLoading(false)
    }
  }, [apiBase, t.common])

  useEffect(() => {
    const controller = new AbortController()
    void loadData(controller.signal)
    return () => controller.abort()
  }, [loadData])

  useEffect(() => { setCurrentPage(1) }, [statusFilter, machineFilter, typeFilter, search, timeRange])

  const machineLabel = useCallback((id: string) => machines.find(m => String(m.id) === id)?.name ?? id, [machines])

  const filtered = useMemo(() => {
    const cutoff = timeRange !== 'all' ? new Date(Date.now() - timeRange * 86400000).getTime() : 0
    return tickets.filter(tk => {
      if (cutoff > 0 && new Date(tk.createdAt).getTime() < cutoff) return false
      if (statusFilter !== 'all' && tk.status !== statusFilter) return false
      if (machineFilter !== 'all' && String(tk.machineId) !== String(machineFilter)) return false
      if (typeFilter !== 'all' && tk.maintenanceType !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!tk.title.toLowerCase().includes(q) && !String(tk.id).toLowerCase().includes(q) && !tk.createdBy.toLowerCase().includes(q) && !machineLabel(tk.machineId).toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [tickets, statusFilter, machineFilter, typeFilter, search, timeRange, machineLabel])

  // SMART NOTIFICATION: Calculamos OTs vencidas en el frontend
  const overdueTickets = useMemo(() => {
    return filtered.filter(tk => {
      const isClosed = tk.status === 'closed' || tk.status === 'cerrado' || tk.status === 'resolved';
      if (isClosed) return false;
      const ageHours = tk.durationReal / 60;
      return (tk.priority === 'high' || tk.priority === 'critical' ? ageHours > 2 : ageHours > 24);
    });
  }, [filtered]);

  const paginatedTickets = useMemo(() => filtered.slice((currentPage - 1) * 10, currentPage * 10), [filtered, currentPage])

  const resolutionData = useMemo(() => filtered.filter(tk => tk.closedAt).slice(0, 15).map(tk => ({
    id: String(tk.id).split('-').pop(), machineName: machineLabel(tk.machineId), tech: tk.createdBy,
    minutos: tk.durationReal, hasBarbAi: tk.hasBarbAi
  })).reverse(), [filtered, machineLabel])

  const typeData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(tk => { counts[tk.maintenanceType] = (counts[tk.maintenanceType] || 0) + 1 })
    return Object.entries(counts).map(([name, value], i) => ({
      name: t.maintenanceTypes?.[name] || name,
      value, fill: CHART_PALETTE[i % CHART_PALETTE.length]
    }))
  }, [filtered, t.maintenanceTypes])

  const handleExportCsv = () => {
    const header = ['ID', 'Titulo', 'Maquina', 'Estado', 'Tipo', 'Tecnico', 'Duracion Real (m)']
    const rows = filtered.map(tk => [
      tk.id, tk.title, machineLabel(tk.machineId),
      t.statuses?.[tk.status] || tk.status,
      t.maintenanceTypes?.[tk.maintenanceType] || tk.maintenanceType,
      tk.createdBy, tk.durationReal
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); link.download = 'barb_reporte.csv'; link.click()
  }

  const handleExportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(tk => ({
      ID: tk.id, Título: tk.title, Máquina: machineLabel(tk.machineId),
      Estado: t.statuses?.[tk.status] || tk.status,
      Tipo: t.maintenanceTypes?.[tk.maintenanceType] || tk.maintenanceType,
      Técnico: tk.createdBy, 'Duración (m)': tk.durationReal, 'Costo Real': tk.costoReal, 'Barb AI': tk.hasBarbAi ? 'SI' : 'NO'
    })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data'); XLSX.writeFile(wb, 'barb_reporte.xlsx')
  }

  return (
    <div className="dashboard-body">

      {/* Selector de rango de tiempo */}
      <div className="dash-time-range">
        <select
          value={timeRange}
          onChange={e => setTimeRange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="filter-select dash-time-select"
        >
          <option value={7}>{t.dashboard?.last7Days || 'Últimos 7 días'}</option>
          <option value={30}>{t.dashboard?.last30Days || 'Últimos 30 días'}</option>
          <option value={90}>{t.dashboard?.last90Days || 'Últimos 90 días'}</option>
          <option value="all">{t.dashboard?.allTime || 'Histórico Completo'}</option>
        </select>
      </div>

      {/* ✅ CORREGIDO: Banner de alertas usa variables DS y clases BEM — sin hardcodes ni emoji */}
      {overdueTickets.length > 0 && (
        <div className="dash-alert-banner" role="alert">
          <svg className="dash-alert-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="sr-only">Alerta:</span>
          <div>
            <strong className="dash-alert-title">
              Atención: Tienes {overdueTickets.length} Órdenes de Trabajo estancadas o críticas.
            </strong>
            <span className="dash-alert-body">
              Revisa el listado inferior para gestionar las intervenciones y evitar tiempos muertos en la planta.
            </span>
          </div>
        </div>
      )}

      <FinancialDashboard timeRange={timeRange} />

      {/* ✅ CORREGIDO: Contenedor de charts usa clase BEM */}
      <div className="dash-charts-grid">
        <Block title={t.dashboard?.chartResolution || 'Resolución'} className="dash-block--wide">
          {resolutionData.length === 0
            ? <div className="dash-empty">{t.dashboard?.noData || 'Sin datos'}</div>
            : (
              <div className="dash-chart-scroll">
                <BarChart width={500} height={260} data={resolutionData} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="machineName" tick={{ fontSize: 10, fill: 'var(--ink3)' }} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--ink3)' }} tickFormatter={v => `${v}m`} />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    content={({ payload }) => payload?.length ? (
                      // ✅ CORREGIDO: tooltip usa variables DS en lugar de clases Tailwind hardcodeadas
                      <div className="dash-tooltip">
                        <div className="dash-tooltip-title">{payload[0].payload.machineName}</div>
                        <div>
                          {t.common?.duration || 'Duración'}:{' '}
                          <b className={payload[0].payload.minutos > (BARB_BUSINESS?.SLA_TARGET || 24) ? 'dash-tooltip-value--danger' : 'dash-tooltip-value--ok'}>
                            {payload[0].payload.minutos}m
                          </b>
                        </div>
                        <div className="dash-tooltip-secondary">{t.common?.technician || 'Técnico'}: {payload[0].payload.tech}</div>
                      </div>
                    ) : null}
                  />
                  <ReferenceLine y={BARB_BUSINESS?.SLA_TARGET || 24} stroke="var(--red)" strokeDasharray="3 3" />
                  <Bar dataKey="minutos" radius={[4, 4, 0, 0]}>
                    {resolutionData.map((d, i) => (
                      <Cell key={i} fill={d.minutos > (BARB_BUSINESS?.SLA_TARGET || 24) ? 'var(--red)' : 'var(--green)'} />
                    ))}
                  </Bar>
                </BarChart>
              </div>
            )}
        </Block>

        <Block title={t.dashboard?.strategyTitle || 'Estrategia'}>
          {typeData.length === 0
            ? <div className="dash-empty">{t.dashboard?.noData || 'Sin datos'}</div>
            : (
              <div className="dash-chart-center">
                <PieChart width={300} height={260}>
                  <Pie data={typeData} innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" nameKey="name">
                    {typeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--surface)', borderRadius: 'var(--radius-sm)' }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </div>
            )}
        </Block>
      </div>

      {/* ✅ CORREGIDO: Tabla de OTs usa clase del DS en lugar de styles inline */}
      <div className="dash-block">
        <div className="dash-block-header">
          <h3 className="dash-block-title">{t.dashboard?.title || 'Órdenes'} ({filtered.length})</h3>
          {isMobile && (
            <button className="btn btn-outline btn-sm" onClick={() => setIsFiltersOpen(!isFiltersOpen)}>
              {t.dashboard?.filters || 'Filtros'}
            </button>
          )}
        </div>

        {/* ✅ CORREGIDO: Filtros usan .dash-filters del DS en lugar de styles inline */}
        {isFiltersOpen && (
          <div className="dash-filters">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="filter-select">
              <option value="all">{t.dashboard?.allStatuses || 'Todos los estados'}</option>
              {Object.entries(t.statuses || {}).map(([k, v]) => <option key={k} value={k}>{String(v)}</option>)}
            </select>

            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="filter-select">
              <option value="all">{t.dashboard?.allTypes || 'Todos los tipos'}</option>
              {Object.entries(t.maintenanceTypes || {}).map(([k, v]) => <option key={k} value={k}>{String(v)}</option>)}
            </select>

            <select value={machineFilter} onChange={e => setMachineFilter(e.target.value)} className="filter-select">
              <option value="all">{t.dashboard?.allMachines || 'Todas las máquinas'}</option>
              {machines.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
            </select>

            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={(t.common?.search || 'Buscar') + '...'}
              className="filter-search"
            />

            <div className="dash-filters-actions">
              <button className="btn btn-outline" onClick={handleExportCsv}>{t.common?.csv || 'CSV'}</button>
              <button className="btn btn-outline" onClick={handleExportXlsx}>{t.common?.xlsx || 'XLSX'}</button>
              <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>+ {t.dashboard?.createWorkOrder || 'Crear'}</button>
            </div>
          </div>
        )}

        {isLoading
          ? <div className="dash-loading">{t.common?.loading || 'Cargando...'}</div>
          : (
            <>
              <TicketTable tickets={paginatedTickets} onSelect={id => setSelectedTicket(tickets.find(tk => tk.id === id) || null)} />
              {filtered.length > 0 && (
                // ✅ CORREGIDO: Paginación usa clase BEM en lugar de styles inline
                <div className="dash-pagination">
                  <span className="dash-pagination-info">
                    {t.common?.page || 'Pág'} {currentPage} / {Math.ceil(filtered.length / 10) || 1}
                  </span>
                  <div className="dash-pagination-controls">
                    <button className="btn btn-outline" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                      {t.common?.prev || 'Anterior'}
                    </button>
                    <button className="btn btn-outline" onClick={() => setCurrentPage(p => Math.min(Math.ceil(filtered.length / 10), p + 1))} disabled={currentPage === Math.ceil(filtered.length / 10)}>
                      {t.common?.next || 'Siguiente'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
      </div>

      <WorkOrderCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={async (p) => {
          try {
            const safeApi = apiBase ? apiBase.replace(/\/$/, '') : API_URL
            const response = await fetch(`${safeApi}/work-orders`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: p.title,
                maquina_id: Number(p.machine),
                tecnico_id: Number(p.tecnicoId),
                priority: p.priority,
                status: p.status,
                description: p.description,
                disciplina_id: Number(p.disciplinaId)
              })
            });

            if (!response.ok) throw new Error("Error del servidor");

            showToast(t.common?.success || "Orden creada con éxito", "success");
            loadData();
            setIsCreateOpen(false);
          } catch (error) {
            showToast(t.common?.error || "Hubo un error al crear la OT", "error");
            console.error(error);
          }
        }}
      />
      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onUpdateStatus={async (id, s) => {
          try {
            const safeApi = apiBase ? apiBase.replace(/\/$/, '') : API_URL
            const response = await fetch(`${safeApi}/work-orders/${id}/status`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: s })
            });
            if (!response.ok) throw new Error("Error actualizando");
            loadData();
            setSelectedTicket(null);
            showToast(t.common?.success || "Estado actualizado");
          } catch (error) {
            showToast(t.common?.error || "Error al actualizar estado");
          }
        }}
        onDelete={async (id) => {
          try {
            const safeApi = apiBase ? apiBase.replace(/\/$/, '') : API_URL
            const response = await fetch(`${safeApi}/work-orders/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error("Error borrando");
            loadData();
            setSelectedTicket(null);
          } catch (error) {
            showToast(t.common?.error || "Error al eliminar");
            throw error;
          }
        }}
      />
    </div>
  )
}