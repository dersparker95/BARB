import { WorkOrder } from '../types'

export const WO_STATUSES = ['open', 'in_progress', 'done', 'closed'] as const
export type WOStatus = typeof WO_STATUSES[number]

export const WO_STATUS_LABEL: Record<WOStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  closed: 'Closed'
}

export function seedDemoTickets(): WorkOrder[] {
  return [
    { id: 'OT-2026-001', title: 'Mantenimiento preventivo', description: 'Mantenimiento preventivo trimestral en Chancador Primario.', machineId: '1', status: 'closed', priority: 'low', createdAt: '2026-05-10T08:00:00Z', closedAt: '2026-05-10T10:30:00Z', createdBy: 'Tecnico 2' },
    { id: 'OT-2026-002', title: 'Pérdida de presión', description: 'Pérdida de presión en Bomba de Relaves.', machineId: '6', status: 'closed', priority: 'high', createdAt: '2026-05-11T14:15:00Z', closedAt: '2026-05-11T15:05:00Z', createdBy: 'Tecnico 2' },
    { id: 'OT-2026-003', title: 'Ruido anómalo', description: 'Ruido anómalo reportado en Harnero Vibratorio.', machineId: '3', status: 'open', priority: 'medium', createdAt: '2026-05-17T09:00:00Z', createdBy: 'Tecnico 3' },
    { id: 'OT-2026-004', title: 'Alerta de vibración', description: 'Alerta de vibración en motor del Chancador Secundario.', machineId: '2', status: 'in_progress', priority: 'high', createdAt: '2026-05-18T10:00:00Z', createdBy: 'Tecnico 3' },
    { id: 'OT-2026-005', title: 'Falla eléctrica', description: 'Falla eléctrica intermitente en Sala Eléctrica.', machineId: '4', status: 'closed', priority: 'medium', createdAt: '2026-05-12T11:00:00Z', closedAt: '2026-05-12T11:15:00Z', createdBy: 'Tecnico 2' },
    { id: 'OT-2026-006', title: 'Calibración de sensores', description: 'Calibración de sensores y purga de Compresor Principal.', machineId: '7', status: 'open', priority: 'medium', createdAt: '2026-05-01T08:00:00Z', createdBy: 'Tecnico 3' },
    { id: 'OT-2026-007', title: 'Fuga de fluido', description: 'Fuga de fluido en Bomba de Agua de Servicio.', machineId: '8', status: 'closed', priority: 'high', createdAt: '2026-05-15T16:00:00Z', closedAt: '2026-05-15T16:35:00Z', createdBy: 'Tecnico 2' },
    { id: 'OT-2026-008', title: 'Chequeo general', description: 'Chequeo general de limpieza interna en Centro de Control MCC.', machineId: '5', status: 'open', priority: 'low', createdAt: '2026-05-18T07:00:00Z', createdBy: 'Tecnico 2' },
    { id: 'OT-2026-009', title: 'Caída de presión', description: 'Caída de presión en Línea de Aire Instrumental.', machineId: '9', status: 'closed', priority: 'high', createdAt: '2026-05-14T02:00:00Z', closedAt: '2026-05-14T06:15:00Z', createdBy: 'Tecnico 3' },
    { id: 'OT-2026-010', title: 'Punto caliente térmico', description: 'Punto caliente térmico detectado en Tablero General de Fuerza.', machineId: '10', status: 'closed', priority: 'medium', createdAt: '2026-05-16T09:00:00Z', closedAt: '2026-05-16T10:15:00Z', createdBy: 'Tecnico 2' }
  ]
}

export function computeMTTR(tickets: WorkOrder[]): number {
  const durations: number[] = tickets
    .filter(t => t.closedAt && t.createdAt)
    .map(t => (new Date(t.closedAt!).getTime() - new Date(t.createdAt).getTime()) / 60000)
    .filter(d => d > 0)

  if (durations.length === 0) return 0
  const sum = durations.reduce((a, b) => a + b, 0)
  return Math.round((sum / durations.length) * 10) / 10
}

export function filterTickets(tickets: WorkOrder[], q: { status?: string; machineId?: string; search?: string }) {
  return tickets.filter(t => {
    if (q.status && q.status !== 'all' && t.status !== q.status) return false
    if (q.machineId && q.machineId !== 'all' && t.machineId !== q.machineId) return false
    if (q.search) {
      const s = q.search.toLowerCase()
      if (!((t.title || '').toLowerCase().includes(s) || (t.description || '').toLowerCase().includes(s) || (t.id || '').toLowerCase().includes(s))) return false
    }
    return true
  })
}

export function getMachineHistory(machineId: string) {
  const tickets = seedDemoTickets().filter(t => t.machineId === machineId && (t.closedAt || t.status === 'done' || t.status === 'closed'))
  const reports = [
    { reportId: `R-2026-${machineId}-01`, machineId, title: 'Inspección Rutinaria', summary: 'Chequeo visual sin novedades', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), createdBy: 'Tecnico 1' },
  ]
  const sessions = [
    { sessionId: `SES-${machineId}-111`, machineId, startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), endedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5 + 1000 * 60 * 30).toISOString(), technician: 'Tecnico 1', notes: 'Revisión de parámetros' },
  ]

  const events: Array<import('../types').HistoryEvent> = []
  tickets.forEach(t => events.push({ id: t.id, type: 'workorder', date: t.closedAt || t.createdAt, title: t.title, actor: t.createdBy, summary: t.description }))
  reports.forEach(r => events.push({ id: r.reportId, type: 'report', date: r.createdAt, title: r.title, actor: r.createdBy, summary: r.summary }))
  sessions.forEach(s => events.push({ id: s.sessionId, type: 'debug', date: s.startedAt, title: 'Debug session', actor: s.technician, summary: s.notes }))

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return events
}

export default { WO_STATUSES, WO_STATUS_LABEL, seedDemoTickets, computeMTTR, filterTickets }