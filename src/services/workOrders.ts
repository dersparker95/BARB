import { WorkOrder } from '../types'

// =============================================================================
// CONSTANTES DE ESTADO
// =============================================================================
//
// Define los estados válidos de una orden de trabajo, alineados con el enum
// real de PostgreSQL (estado_ot), y sus etiquetas visuales de respaldo.
//

// Refleja el enum estado_ot de la base de datos. Un desalineamiento aquí
// provoca fallos silenciosos: el PUT /status rechaza valores inexistentes
// en la BD, y computeMTTR() deja de contabilizar órdenes cerradas.
export const WO_STATUSES = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue'] as const
export type WOStatus = typeof WO_STATUSES[number]

// Fallback de etiquetas; la UI utiliza preferentemente t.statuses del i18n.
export const WO_STATUS_LABEL: Record<WOStatus, string> = {
  'pending': 'Pendiente',
  'assigned': 'Asignada',
  'in_progress': 'En Progreso',
  'completed': 'Completada',
  'cancelled': 'Cancelada',
  'overdue': 'Vencida'
}

// =============================================================================
// MODELOS
// =============================================================================
//
// Estructuras tipadas utilizadas por las utilidades de órdenes de trabajo.
//

export interface MachineHistoryEvent {
  id: string
  type: string
  date: string
  title: string
  summary: string
  actor: string
}

// =============================================================================
// MÉTRICAS
// =============================================================================
//
// Calcula indicadores derivados del conjunto de órdenes de trabajo.
//

/**
 * Calcula el tiempo medio de reparación (MTTR) en minutos, considerando
 * únicamente las órdenes en estado terminal real de la base de datos.
 *
 * Args:
 *     tickets:
 *         Conjunto de órdenes de trabajo a evaluar.
 *
 * Returns:
 *     MTTR en minutos, redondeado a un decimal, o 0 si no hay datos válidos.
 */
export function computeMTTR(tickets: WorkOrder[]): number {
  if (!Array.isArray(tickets) || tickets.length === 0) return 0

  const durations: number[] = tickets
    // 'completed' es el único estado terminal real; 'closed'/'done' no existen
    // como valores de estado_ot.
    .filter(t => {
      const s = String(t.status || '').toLowerCase()
      return s === 'completed' && t.closedAt && t.createdAt
    })
    .map(t => (new Date(t.closedAt!).getTime() - new Date(t.createdAt!).getTime()) / 60000)
    .filter(d => d > 0)

  if (durations.length === 0) return 0
  const sum = durations.reduce((a, b) => a + b, 0)
  return Math.round((sum / durations.length) * 10) / 10
}

// =============================================================================
// FILTRADO Y BÚSQUEDA
// =============================================================================
//
// Provee las utilidades de filtrado utilizadas por la tabla del dashboard.
//

/**
 * Filtra órdenes de trabajo según estado, máquina y texto de búsqueda libre.
 *
 * Args:
 *     tickets:
 *         Conjunto de órdenes de trabajo a filtrar.
 *     q:
 *         Criterios de filtrado: status, machineId y/o search.
 *
 * Returns:
 *     Subconjunto de órdenes que cumple con los criterios indicados.
 */
export function filterTickets(
  tickets: WorkOrder[], 
  q: { status?: string; machineId?: string; search?: string }
): WorkOrder[] {
  if (!Array.isArray(tickets)) return []

  return tickets.filter(t => {
    const currentStatus = String(t.status || '').toLowerCase()
    const filterStatus = String(q.status || '').toLowerCase()

    if (q.status && q.status !== 'all' && currentStatus !== filterStatus) return false

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

// =============================================================================
// HISTORIAL DE MÁQUINA
// =============================================================================
//
// Reconstruye el historial de eventos asociado a una máquina a partir de
// sus órdenes de trabajo.
//

/**
 * Construye el historial de eventos de una máquina a partir de sus órdenes
 * de trabajo asociadas, ordenado de más reciente a más antiguo.
 *
 * Args:
 *     tickets:
 *         Conjunto de órdenes de trabajo disponibles.
 *     machineId:
 *         Identificador de la máquina a consultar.
 *
 * Returns:
 *     Lista de eventos tipados, ordenada cronológicamente en forma descendente.
 */
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
      // Recurre a la fecha actual solo si no existe fecha de cierre ni de creación.
      date: t.closedAt || t.createdAt || new Date().toISOString(), 
      title: t.title || 'OT', 
      // Si no hay creador registrado, se deja vacío para que la UI aplique su
      // propia traducción por defecto (por ejemplo, t.common.system).
      actor: t.createdBy || (t as any).technician || '', 
      summary: t.description || `[Status: ${t.status || 'Unknown'}]`
    })
  })

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  
  return events
}

export default { WO_STATUSES, WO_STATUS_LABEL, computeMTTR, filterTickets, getMachineHistory }
