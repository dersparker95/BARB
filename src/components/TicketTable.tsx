// @ts-nocheck

// =============================================================================
// IMPORTS
// =============================================================================

import React, { useMemo } from 'react'
import { WorkOrder } from '../types'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

// =============================================================================
// TIPOS
// =============================================================================

// Extiende el tipo base para no depender de "any" en los campos que llegan
// enriquecidos desde el backend (nombre de máquina, duración real, etc.).
interface ExtendedWorkOrder extends WorkOrder {
  machineName?: string;
  machineId?: string | number;
  durationReal?: number;
}

interface TicketTableProps {
  tickets: ExtendedWorkOrder[]
  onSelect: (id: string) => void
}

// =============================================================================
// COMPONENTE PRINCIPAL: TICKET TABLE
// =============================================================================

const TicketTable: React.FC<TicketTableProps> = ({ tickets, onSelect }) => {
  const { lang } = useAppContext()

  // Memoiza las traducciones para no recalcularlas en cada render.
  const t = useMemo(() => getTranslations(lang), [lang])

  // Escudo contra arrays nulos o vacíos
  if (!tickets || tickets.length === 0) {
    return <div className="ot-table-empty">{t.dashboard?.noData || 'Sin datos'}</div>
  }

  return (
    <div className="ot-table-wrap">
      <table className="ot-table">
        <thead>
          <tr>
            <th>ID OT</th>
            <th>{(t.common?.title || 'Título').toUpperCase()} / {(t.common?.machine || 'Máquina').toUpperCase()}</th>
            <th>{(t.common?.technician || 'Técnico').toUpperCase()}</th>
            <th>{(t.common?.duration || 'Duración').toUpperCase()}</th>
            <th>{(t.common?.status || 'Estado').toUpperCase()}</th>
            <th>{(t.common?.action || 'Acciones').toUpperCase()}</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map(ticket => {
            // Normalización defensiva del estado
            const statusKey = String(ticket.status || 'pending').toLowerCase()
            const label = t.statuses?.[statusKey] || statusKey

            const safeDuration = ticket.durationReal || 0
            const machineLabel = ticket.machineName || `${t.dashboard?.machine || 'Máquina'} ${ticket.machineId || '?'}`

            // El umbral de 24 (horas o minutos según la unidad de negocio) es el SLA
            // estándar usado para alertar visualmente cuando se excede.
            const durationVariant = safeDuration > 24 ? 'slow' : 'fast'

            return (
              <tr
                key={ticket.id || Math.random()}
                onClick={() => ticket.id && onSelect(String(ticket.id))}
              >
                <td className="ot-table-id">{ticket.id || 'N/A'}</td>
                <td className="ot-table-title-cell">
                  <div className="ot-table-title">{ticket.title || 'Sin Título'}</div>
                  <div className="ot-table-subtitle">{machineLabel}</div>
                </td>
                <td>{ticket.createdBy || 'Operador'}</td>
                <td>
                  <span className={`ot-dur ${durationVariant}`}>{safeDuration}m</span>
                </td>
                <td>
                  <span className={`ot-badge ${statusKey}`}>{label}</span>
                </td>
                <td>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (ticket.id) onSelect(String(ticket.id))
                    }}
                  >
                    {t.common?.view || 'Ver'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default TicketTable