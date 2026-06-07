// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis, PieChart, Pie, Legend
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

interface ApiWorkOrder {
  id: string; title: string; machine_id?: string | number; priority: string;
  status: string; estado: string; age_minutes: number; description?: string;
  created_at?: string; closed_at?: string | null; tecnico_nombre?: string;
  discipline_name?: string; tipo?: string; costo_estimado?: number; costo_real?: number;
  reporte_id?: number | null; diagnostico_id?: number | null; downtime_minutes?: number | null;
  machine_name?: string;
}

interface ApiMachine { id: number; name: string; discipline_id: number }

const API_URL = 'https://barb-2ih8.onrender.com/api'
const CHART_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16']

const ensureUTC = (d?: string | null) => { if (!d) return undefined; return d.endsWith('Z') || d.includes('+') ? d : d + 'Z' }

const mapApiWorkOrder = (o: ApiWorkOrder): WorkOrder => {
  const createdAt = ensureUTC(o.created_at) ?? new Date(Date.now() - (o.age_minutes || 0) * 60000).toISOString()
  const closedAt = ensureUTC(o.closed_at)
  let duration = 0
  if (o.downtime_minutes != null) duration = Number(o.downtime_minutes)
  else if (closedAt) duration = Math.max(1, Math.round((new Date(closedAt).getTime() - new Date(createdAt).getTime()) / 60000))

  return {
    id: o.id, title: o.title, description: o.description ?? o.title, machineId: String(o.machine_id || ''),
    machineName: o.machine_name || `Máquina ${o.machine_id}`,
    status: o.estado?.toLowerCase() || 'pending', priority: (o.priority || 'medium').toLowerCase() as any,
    createdAt, closedAt, durationReal: duration,
    createdBy: o.tecnico_nombre || 'Operador', discipline: o.discipline_name || 'General',
    maintenanceType: o.tipo || 'corrective', costoEstimado: Number(o.costo_estimado) || 0, costoReal: Number(o.costo_real) || 0,
    hasBarbAi: !!(o.reporte_id || o.diagnostico_id)
  }
}

const Block: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ title, subtitle, children, style }) => (
  <div style={{ ...style, minWidth: 320, flex: '1 1 auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
    <div style={{ marginBottom: 16 }}>
      <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--ink1)' }}>{title}</span>
      {subtitle && <span style={{ fontSize: 12, color: 'var(--ink3)', display: 'block', marginTop: 2 }}>{subtitle}</span>}
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
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <select value={timeRange} onChange={e => setTimeRange(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="filter-select" style={{ background: 'var(--surface)', fontWeight: 700, border: '2px solid var(--border)' }}>
          <option value={7}>{t.dashboard?.last7Days || 'Últimos 7 días'}</option>
          <option value={30}>{t.dashboard?.last30Days || 'Últimos 30 días'}</option>
          <option value={90}>{t.dashboard?.last90Days || 'Últimos 90 días'}</option>
          <option value="all">{t.dashboard?.allTime || 'Histórico Completo'}</option>
        </select>
      </div>

      <FinancialDashboard timeRange={timeRange} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <Block title={t.dashboard?.chartResolution || 'Resolución'} style={{ flex: '2 1 400px' }}>
          {resolutionData.length === 0 ? <div className="p-8 text-center text-slate-500">{t.dashboard?.noData || 'Sin datos'}</div> : (
            <div style={{ height: 260 }}>
              {/* 🔥 FIX APLICADO AQUÍ: minWidth y minHeight */}
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <BarChart data={resolutionData} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="machineName" tick={{ fontSize: 10, fill: 'var(--ink3)' }} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--ink3)' }} tickFormatter={v => `${v}m`} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} content={({ payload }) => payload?.length ? (
                    <div className="bg-slate-900 border border-slate-700 p-3 rounded text-xs text-white">
                      <div className="font-bold mb-2">{payload[0].payload.machineName}</div>
                      <div>{t.common?.duration || 'Duración'}: <b className={payload[0].payload.minutos > (BARB_BUSINESS?.SLA_TARGET || 24) ? 'text-red-400' : 'text-emerald-400'}>{payload[0].payload.minutos}m</b></div>
                      <div className="text-slate-400 mt-1">{t.common?.technician || 'Técnico'}: {payload[0].payload.tech}</div>
                    </div>
                  ) : null} />
                  <ReferenceLine y={BARB_BUSINESS?.SLA_TARGET || 24} stroke="#ef4444" strokeDasharray="3 3" />
                  <Bar dataKey="minutos" radius={[4, 4, 0, 0]}>
                    {resolutionData.map((d, i) => <Cell key={i} fill={d.minutos > (BARB_BUSINESS?.SLA_TARGET || 24) ? '#ef4444' : '#10b981'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Block>

        <Block title={t.dashboard?.strategyTitle || 'Estrategia'} style={{ flex: '1 1 300px' }}>
          {typeData.length === 0 ? <div className="p-8 text-center text-slate-500">{t.dashboard?.noData || 'Sin datos'}</div> : (
            <div style={{ height: 260 }}>
              {/* 🔥 FIX APLICADO AQUÍ TAMBIÉN: minWidth y minHeight */}
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <PieChart>
                  <Pie data={typeData} innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" nameKey="name">
                    {typeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--surface)', borderRadius: 8 }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Block>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}>{t.dashboard?.title || 'Órdenes'} ({filtered.length})</h3>
          {isMobile && <button className="btn btn-outline btn-sm" onClick={() => setIsFiltersOpen(!isFiltersOpen)}>{t.dashboard?.filters || 'Filtros'}</button>}
        </div>

        {isFiltersOpen && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, background: 'var(--bg-body)', padding: 12, borderRadius: 12 }}>
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
            
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={(t.common?.search || 'Buscar') + "..."} className="filter-search" style={{ flex: '1 1 150px' }} />
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" onClick={handleExportCsv}>{t.common?.csv || 'CSV'}</button>
              <button className="btn btn-outline" onClick={handleExportXlsx}>{t.common?.xlsx || 'XLSX'}</button>
              <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>+ {t.dashboard?.createWorkOrder || 'Crear'}</button>
            </div>
          </div>
        )}

        {isLoading ? <div style={{ padding: 40, textAlign: 'center' }}>{t.common?.loading || 'Cargando...'}</div> : (
          <>
            <TicketTable tickets={paginatedTickets} onSelect={id => setSelectedTicket(tickets.find(tk => tk.id === id) || null)} />
            {filtered.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{t.common?.page || 'Pág'} {currentPage} / {Math.ceil(filtered.length / 10) || 1}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>{t.common?.prev || 'Anterior'}</button>
                  <button className="btn btn-outline" onClick={() => setCurrentPage(p => Math.min(Math.ceil(filtered.length / 10), p + 1))} disabled={currentPage === Math.ceil(filtered.length / 10)}>{t.common?.next || 'Siguiente'}</button>
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
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ status: s })
            });
            if(!response.ok) throw new Error("Error actualizando");
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
            if(!response.ok) throw new Error("Error borrando");
            loadData();
            setSelectedTicket(null);
          } catch(error) {
            showToast(t.common?.error || "Error al eliminar");
            throw error;
          }
        }}
      />
    </div>
  )
}