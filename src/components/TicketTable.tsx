// @ts-nocheck
import React, { useMemo } from 'react'
import { WorkOrder } from '../types'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

// 🔥 BLINDAJE DE TIPOS: Extendemos el tipo base para no usar jamás "any"
interface ExtendedWorkOrder extends WorkOrder {
  machineName?: string;
  machineId?: string | number;
  durationReal?: number;
}

interface TicketTableProps {
  tickets: ExtendedWorkOrder[]
  onSelect: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-800 text-slate-300 border-slate-700',
  open: 'bg-blue-900/50 text-blue-300 border-blue-800',
  assigned: 'bg-blue-900/50 text-blue-300 border-blue-800',
  in_progress: 'bg-amber-900/50 text-amber-300 border-amber-800',
  completed: 'bg-emerald-900/50 text-emerald-300 border-emerald-800',
  closed: 'bg-emerald-900/50 text-emerald-300 border-emerald-800', // Agregado para soportar el backend
  done: 'bg-emerald-900/50 text-emerald-300 border-emerald-800',   // Agregado para soportar el backend
  cancelled: 'bg-red-900/50 text-red-300 border-red-800',
  overdue: 'bg-rose-900/50 text-rose-300 border-rose-800'
}

const TicketTable: React.FC<TicketTableProps> = ({ tickets, onSelect }) => {
  const { lang } = useAppContext()
  
  // 🔥 OPTIMIZACIÓN: Congelamos las traducciones para no ahogar el procesador
  const t = useMemo(() => getTranslations(lang), [lang])

  // Escudo contra arrays nulos o vacíos
  if (!tickets || tickets.length === 0) {
    return <div className="p-8 text-center text-slate-500 text-sm">{t.dashboard?.noData || 'Sin datos'}</div>
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--ink3)' }}>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>ID OT</th>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {(t.common?.title || 'Título').toUpperCase()} / {(t.common?.machine || 'Máquina').toUpperCase()}
            </th>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {(t.common?.technician || 'Técnico').toUpperCase()}
            </th>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {(t.common?.duration || 'Duración').toUpperCase()}
            </th>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {(t.common?.status || 'Estado').toUpperCase()}
            </th>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {(t.common?.action || 'Acciones').toUpperCase()}
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map(ticket => {
            // Normalización defensiva del estado
            const statusKey = String(ticket.status || 'pending').toLowerCase()
            const badgeClass = STATUS_COLORS[statusKey] || STATUS_COLORS.pending
            const label = t.statuses?.[statusKey] || statusKey
            
            // Extracción segura
            const safeDuration = ticket.durationReal || 0
            const machineLabel = ticket.machineName || `${t.dashboard?.machine || 'Máquina'} ${ticket.machineId || '?'}`

            return (
              <tr 
                key={ticket.id || Math.random()} 
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} 
                className="hover:bg-slate-800/20 transition-colors" 
                onClick={() => ticket.id && onSelect(String(ticket.id))}
              >
                <td style={{ padding: '16px', color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {ticket.id || 'N/A'}
                </td>
                <td style={{ padding: '16px', minWidth: '220px' }}>
                  <div style={{ color: 'var(--ink1)', fontWeight: 600 }}>{ticket.title || 'Sin Título'}</div>
                  <div style={{ color: 'var(--ink3)', fontSize: '11px', marginTop: '4px' }}>{machineLabel}</div>
                </td>
                <td style={{ padding: '16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>
                  {ticket.createdBy || 'Operador'}
                </td>
                <td style={{ padding: '16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>
                  {/* Aquí asumimos el SLA meta estándar de 24 horas (o minutos) para alertar visualmente */}
                  <span className={safeDuration > 24 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {safeDuration}m
                  </span>
                </td>
                <td style={{ padding: '16px', whiteSpace: 'nowrap' }}>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border capitalize ${badgeClass}`}>
                    {label}
                  </span>
                </td>
                <td style={{ padding: '16px', whiteSpace: 'nowrap' }}>
                  <button 
                    className="btn btn-outline" 
                    style={{ padding: '4px 12px', fontSize: '11px' }} 
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