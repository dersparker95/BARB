// @ts-nocheck

// =============================================================================
// IMPORTS
// =============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, Cell, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis, PieChart, Pie, Legend, ResponsiveContainer
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

// =============================================================================
// TIPOS
// =============================================================================

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

// =============================================================================
// CONSTANTES
// =============================================================================

// Paleta de gráficos alineada al Design System (var() funciona como atributo SVG en recharts)
const CHART_PALETTE = ['var(--blue)', 'var(--green)', 'var(--amber)', 'var(--purple)', 'var(--red)', 'var(--cyan)', 'var(--accent)', 'var(--online)']

// =============================================================================
// UTILIDADES
// =============================================================================

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
    title: o.title || o.numero_ot || `OT-${o.id}`,
    description: o.description || o.descripcion_problema || o.title || 'Sin descripción',
    machineId,
    machineName: o.machine_name || o.maquina_nombre || `Máquina ${machineId}`,
    // FIX: se prioriza 'estado' (valor crudo snake_case: pending/assigned/in_progress/
    // completed/cancelled/overdue) porque es la clave que usan los filtros y las
    // traducciones. 'status' es solo una etiqueta humanizada en inglés ("In Progress")
    // que nunca coincide con esas claves y rompía filtros y badges.
    status: (o.estado ?? o.status ?? 'pending').toLowerCase().replace(/\s+/g, '_'),
    priority: (o.priority ?? o.prioridad ?? 'medium').toLowerCase() as any,
    createdAt,
    closedAt,
    durationReal: duration,
    createdBy: o.tecnico_nombre || o.creado_por || 'Operador',
    discipline: o.discipline_name || o.disciplina || 'General',
    maintenanceType: o.tipo || o.maintenance_type || 'corrective',
    costoEstimado: Number(o.costo_estimado) || 0,
    costoReal: Number(o.costo_real) || 0,
    hasBarbAi: !!(o.reporte_id || o.diagnostico_id)
  }
}

// =============================================================================
// SUBCOMPONENTE: BLOCK (contenedor de tarjeta del dashboard)
// =============================================================================

const Block: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; className?: string }> = ({ title, subtitle, children, className = '' }) => (
  <div className={`dash-block ${className}`}>
    <div className="dash-block-header">
      <span className="dash-block-title">{title}</span>
      {subtitle && <span className="dash-block-subtitle">{subtitle}</span>}
    </div>
    {children}
  </div>
)

// =============================================================================
// COMPONENTE PRINCIPAL: DASHBOARD
// =============================================================================

export default function Dashboard() {
  const { lang, apiBase, api } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  // ---------------------------------------------------------------------
  // Estados
  // ---------------------------------------------------------------------

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

  // ---------------------------------------------------------------------
  // Carga de datos
  // ---------------------------------------------------------------------

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true)
    try {
      // FIX: antes esto eran 2 fetch() manuales sin el header Authorization
      // que ahora exige el backend, y sin el prefijo /api consistente.
      // api.workOrders.getAll()/api.machines() ya adjuntan el token de sesión.
      const [rawData, machinesData] = await Promise.all([
        api.workOrders.getAll({ signal } as RequestInit),
        api.machines({ signal } as RequestInit)
      ])

      setMachines(machinesData)
      const ticketsArray = Array.isArray(rawData) ? rawData : (rawData.data || []);
      setTickets(ticketsArray.map(mapApiWorkOrder))
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      showToast(t.common?.error || 'Error de conexión al cargar el Dashboard')
    } finally {
      setIsLoading(false)
    }
  }, [api, t.common])

  useEffect(() => {
    const controller = new AbortController()
    void loadData(controller.signal)
    return () => controller.abort()
  }, [loadData])

  useEffect(() => { setCurrentPage(1) }, [statusFilter, machineFilter, typeFilter, search, timeRange])

  // ---------------------------------------------------------------------
  // Datos derivados: filtros, paginación y series para los gráficos
  // ---------------------------------------------------------------------

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

  const overdueTickets = useMemo(() => {
    return filtered.filter(tk => {
      const isClosed = tk.status === 'closed' || tk.status === 'cerrado' || tk.status === 'resolved' || tk.status === 'completed';
      if (isClosed) return false;
      const ageHours = tk.durationReal / 60;
      // FIX: la BD usa 'urgent' como valor máximo de prioridad (enum prioridad_ot:
      // low/medium/high/urgent). 'critical' pertenece a otro campo (severity) y nunca
      // coincidía aquí, así que las OTs urgentes usaban el umbral de 24h en vez de 2h.
      return (tk.priority === 'high' || tk.priority === 'urgent' ? ageHours > 2 : ageHours > 24);
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

  // ---------------------------------------------------------------------
  // Exportación (CSV / XLSX)
  // ---------------------------------------------------------------------

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

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  return (
    <div className="dashboard-body">
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

      <div className="dash-charts-grid">
        <Block title={t.dashboard?.chartResolution || 'Resolución'} className="dash-block--wide">
          {resolutionData.length === 0
            ? <div className="dash-empty">{t.dashboard?.noData || 'Sin datos'}</div>
            : (
              <div className="dash-chart-scroll">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={resolutionData} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="machineName" tick={{ fontSize: 10, fill: 'var(--ink3)' }} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--ink3)' }} tickFormatter={v => `${v}m`} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface2)' }}
                    content={({ payload }) => payload?.length ? (
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
                </ResponsiveContainer>
              </div>
            )}
        </Block>

        <Block title={t.dashboard?.strategyTitle || 'Estrategia'}>
          {typeData.length === 0
            ? <div className="dash-empty">{t.dashboard?.noData || 'Sin datos'}</div>
            : (
              <div className="dash-chart-center">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                  <Pie data={typeData} innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" nameKey="name">
                    {typeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--surface)', borderRadius: 'var(--radius-sm)' }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
        </Block>
      </div>

      <div className="dash-block">
        <div className="dash-block-header">
          <h3 className="dash-block-title">{t.dashboard?.title || 'Órdenes'} ({filtered.length})</h3>
          {isMobile && (
            <button className="btn btn-outline btn-sm" onClick={() => setIsFiltersOpen(!isFiltersOpen)}>
              {t.dashboard?.filters || 'Filtros'}
            </button>
          )}
        </div>

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
            // FIX: antes era un fetch() manual sin Authorization ni prefijo /api.
            await api.workOrders.create({
              title: p.title,
              maquina_id: Number(p.machine),
              tecnico_id: Number(p.tecnicoId),
              priority: p.priority,
              status: p.status,
              description: p.description,
              disciplina_id: Number(p.disciplinaId)
            });

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
            // FIX: antes era un fetch() manual sin Authorization ni prefijo /api.
            await api.workOrders.updateStatus(id, s);
            loadData();
            setSelectedTicket(null);
            showToast(t.common?.success || "Estado actualizado");
          } catch (error) {
            showToast(t.common?.error || "Error al actualizar estado");
          }
        }}
        onDelete={async (id) => {
          try {
            // FIX: antes era un fetch() manual sin Authorization ni prefijo /api.
            await api.workOrders.delete(id);
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