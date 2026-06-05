import { WorkOrder } from '../types'

// 🔥 BLINDAJE: Estados normalizados EXACTAMENTE como los espera el frontend y tu API
export const WO_STATUSES = ['open', 'in_progress', 'done', 'closed'] as const
export type WOStatus = typeof WO_STATUSES[number]

// Fallback de etiquetas (Aunque en la UI ahora usamos t.statuses del i18n)
export const WO_STATUS_LABEL: Record<WOStatus, string> = {
  'open': 'Abierta',
  'in_progress': 'En Progreso',
  'done': 'Realizada',
  'closed': 'Cerrada'
}

// Interfaz estricta para evitar el uso de 'any'
export interface MachineHistoryEvent {
  id: string
  type: string
  date: string
  title: string
  summary: string
  actor: string
}

// 2. Cálculo de MTTR (Tiempo Medio de Reparación) seguro
export function computeMTTR(tickets: WorkOrder[]): number {
  if (!Array.isArray(tickets) || tickets.length === 0) return 0

  const durations: number[] = tickets
    // Normalizamos el estado para la comprobación
    .filter(t => {
      const s = String(t.status || '').toLowerCase()
      return (s === 'closed' || s === 'done') && t.closedAt && t.createdAt
    })
    .map(t => (new Date(t.closedAt!).getTime() - new Date(t.createdAt!).getTime()) / 60000)
    .filter(d => d > 0)

  if (durations.length === 0) return 0
  const sum = durations.reduce((a, b) => a + b, 0)
  return Math.round((sum / durations.length) * 10) / 10
}

// 3. Filtro de Búsqueda Dinámico para la tabla del Dashboard
export function filterTickets(
  tickets: WorkOrder[], 
  q: { status?: string; machineId?: string; search?: string }
): WorkOrder[] {
  if (!Array.isArray(tickets)) return []

  return tickets.filter(t => {
    // Normalizamos los strings para la comparación
    const currentStatus = String(t.status || '').toLowerCase()
    const filterStatus = String(q.status || '').toLowerCase()

    if (q.status && q.status !== 'all' && currentStatus !== filterStatus) return false
    
    // Extracción segura del ID de máquina
    const tMachine = String((t as any).machineId || (t as any).machine || '')
    if (q.machineId && q.machineId !== 'all' && tMachine !== String(q.machineId)) return false
    
    if (q.search) {
      const s = q.search.toLowerCase()
      const title = String(t.title || '').toLowerCase()
      const desc = String(t.description || '').toLowerCase()
      const id = String(t.id || '').toLowerCase()
      
      if (!title.includes(s) && !desc.includes(s) && !id.includes(s)) {
        return false
      }
    }
    return true
  })
}

// 4. Historial de Máquina 100% Real y Tipado
export function getMachineHistory(tickets: WorkOrder[], machineId: string | number): MachineHistoryEvent[] {
  if (!Array.isArray(tickets)) return []

  const machineTickets = tickets.filter(t => {
    const tMachine = String((t as any).machineId || (t as any).machine || '')
    return tMachine === String(machineId)
  });

  const events: MachineHistoryEvent[] = []
  
  machineTickets.forEach(t => {
    events.push({ 
      id: String(t.id), 
      type: 'workorder', 
      // Fallback a fecha actual solo si no existe ninguna de las dos
      date: t.closedAt || t.createdAt || new Date().toISOString(), 
      title: t.title || 'OT', 
      // Si no hay creador, dejamos string vacío para que el componente UI aplique su propia traducción (ej. t.common.system)
      actor: t.createdBy || (t as any).technician || '', 
      summary: t.description || `[Status: ${t.status || 'Unknown'}]`
    })
  })

  // Ordenar de más reciente a más antiguo
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  
  return events
}

export default { WO_STATUSES, WO_STATUS_LABEL, computeMTTR, filterTickets, getMachineHistory }