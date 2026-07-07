// =============================================================================
// IMPORTS
// =============================================================================

import React, { useMemo, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getMachineHistory, MachineHistoryEvent } from '../services/workOrders'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'
import { createApiService } from '../services/api'
import { WorkOrder } from '../types'

// =============================================================================
// COMPONENTE PRINCIPAL: MACHINE MEMORY
// =============================================================================

const MachineMemory: React.FC = () => {
  const { machineId } = useParams<{ machineId: string }>()
  const { lang, apiBase } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])
  const mid = machineId || ''

  // ---------------------------------------------------------------------
  // Estados y carga de historial
  // ---------------------------------------------------------------------

  const [events, setEvents] = useState<MachineHistoryEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const fetchHistory = async () => {
      try {
        const api = createApiService(apiBase)
        const res = await api.workOrders.getAll()
        const rawTickets: any[] = Array.isArray(res) ? res : (res.data || [])

        // FIX: api.workOrders.getAll() devuelve las filas CRUDAS del backend
        // (snake_case: machine_id, estado, created_at, closed_at...). getMachineHistory()
        // espera el formato ya normalizado (camelCase: machineId, status, createdAt...),
        // el mismo que Dashboard.tsx genera con su propio mapApiWorkOrder(). Sin este
        // mapeo, el filtro por máquina nunca encontraba coincidencias (tMachine
        // siempre era '') y esta pantalla SIEMPRE mostraba "sin historial", para
        // cualquier máquina.
        const tickets: WorkOrder[] = rawTickets.map((o: any) => ({
          id: String(o.id ?? o.ot_id),
          title: o.title || o.numero_ot || `OT-${o.id}`,
          description: o.description || o.descripcion_problema || '',
          machineId: String(o.machine_id ?? o.maquina_id ?? o.machineId ?? o.maquinaId ?? ''),
          status: String(o.estado ?? o.status ?? 'pending').toLowerCase(),
          createdAt: o.created_at ?? o.fecha_creacion ?? new Date().toISOString(),
          closedAt: o.closed_at ?? o.fecha_cierre ?? null,
          createdBy: o.tecnico_nombre || o.creado_por || '',
        }))

        if (mounted) {
          setEvents(getMachineHistory(tickets, mid))
        }
      } catch (error) {
        console.error('Error fetching machine history:', error)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchHistory()
    return () => { mounted = false }
  }, [mid, apiBase])

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  if (loading) {
    return (
      <div className="dashboard-body mm-loading-wrap">
        <div className="mm-loading-text">{t.common?.loading || 'Cargando historial...'}</div>
      </div>
    )
  }

  return (
    <div className="dashboard-body">
      <div className="mm-container">
        {events.length === 0 ? (
          <div className="chat-empty">
            <h3>{t.machineMemory?.noHistoryTitle || 'No hay historial disponible'}</h3>
            <p>{t.machineMemory?.noHistoryDesc || 'No existen órdenes de trabajo ni reportes pasados para este equipo.'}</p>
          </div>
        ) : (
          <div className="mm-timeline">
            {events.map((ev, index) => {
              const formattedDate = new Date(ev.date).toLocaleString(lang === 'en' ? 'en-US' : 'es-CL', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })

              return (
                <div key={ev.id || index} className="mm-event">

                  <div className="mm-dot" aria-hidden="true" />

                  <div className="mm-date">{formattedDate}</div>

                  <div className="mm-event-title">
                    {ev.title || (t.common?.untitled || 'Sin Título')}
                  </div>

                  <div className="mm-event-summary">
                    {ev.summary || (t.common?.noDescription || 'Sin descripción')}
                  </div>

                  <div className="mm-event-actor">
                    {t.common?.operator || 'Operador'}:{' '}
                    <span className="mm-event-actor-name">{ev.actor || '—'}</span>
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default MachineMemory