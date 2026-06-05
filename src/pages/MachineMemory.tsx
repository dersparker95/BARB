import React, { useMemo, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getMachineHistory, MachineHistoryEvent } from '../services/workOrders'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'
import { createApiService } from '../services/api'
import { WorkOrder } from '../types'

const MachineMemory: React.FC = () => {
  const { machineId } = useParams<{ machineId: string }>()
  const { lang, apiBase } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])
  const mid = machineId || ''

  const [events, setEvents] = useState<MachineHistoryEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const fetchHistory = async () => {
      try {
        const api = createApiService(apiBase)
        const res = await api.workOrders.getAll()
        const tickets: WorkOrder[] = Array.isArray(res) ? res : (res.data || [])
        
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

  if (loading) {
    return (
      <div className="dashboard-body flex items-center justify-center">
        <div className="text-[var(--ink3)]">{t.common?.loading || 'Cargando historial...'}</div>
      </div>
    )
  }

  return (
    <div className="dashboard-body">
      <div className="space-y-6 max-w-3xl">
        {events.length === 0 ? (
          <div className="chat-empty">
            <h3>{t.machineMemory?.noHistoryTitle || 'No hay historial disponible'}</h3>
            <p>{t.machineMemory?.noHistoryDesc || 'No existen órdenes de trabajo ni reportes pasados para este equipo.'}</p>
          </div>
        ) : (
          <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: '24px', marginLeft: '12px' }}>
            {events.map((ev, index) => {
              const formattedDate = new Date(ev.date).toLocaleString(lang === 'en' ? 'en-US' : 'es-CL', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })

              return (
                <div key={ev.id || index} className="mb-8 relative hover:opacity-90 transition-opacity">
                  <div 
                    className="absolute top-0 w-3.5 h-3.5 rounded-full" 
                    style={{ left: '-31px', background: 'var(--blue)', border: '2px solid var(--surface)' }} 
                  />
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink3)' }}>
                    {formattedDate}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', marginTop: '4px' }}>
                    {ev.title || (t.common?.untitled || 'Sin Título')}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--ink2)', marginTop: '4px', lineHeight: 1.6 }}>
                    {ev.summary || (t.common?.noDescription || 'Sin descripción')}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '8px' }}>
                    {t.common?.operator || 'Operador'}: <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{ev.actor || '—'}</span>
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