import React from 'react'
import { WorkOrder } from '../types'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

interface TicketTableProps {
  tickets: WorkOrder[]
  onSelect: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-800 text-slate-300 border-slate-700',
  assigned: 'bg-blue-900/50 text-blue-300 border-blue-800',
  in_progress: 'bg-amber-900/50 text-amber-300 border-amber-800',
  completed: 'bg-emerald-900/50 text-emerald-300 border-emerald-800',
  cancelled: 'bg-red-900/50 text-red-300 border-red-800',
  overdue: 'bg-rose-900/50 text-rose-300 border-rose-800'
}

const TicketTable: React.FC<TicketTableProps> = ({ tickets, onSelect }) => {
  const { lang } = useAppContext()
  const t = getTranslations(lang)

  if (!tickets.length) {
    return <div className="p-8 text-center text-slate-500 text-sm">{t.dashboard.noData}</div>
  }

  return (
    // FIX MOBILE: Contenedor con overflowX permite scroll horizontal interno
    <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--ink3)' }}>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>ID OT</th>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.common.title.toUpperCase()} / {t.common.machine.toUpperCase()}</th>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>{lang === 'en' ? 'TECH' : 'TÉCNICO'}</th>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>{lang === 'en' ? 'DURATION' : 'DURACIÓN'}</th>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.common.status.toUpperCase()}</th>
            <th style={{ padding: '12px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>{lang === 'en' ? 'ACTION' : 'ACCIONES'}</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map(ticket => {
            const statusKey = ticket.status?.toLowerCase() || 'pending'
            const badgeClass = STATUS_COLORS[statusKey] || STATUS_COLORS.pending
            const label = t.statuses[statusKey as keyof typeof t.statuses] || statusKey

            return (
              <tr key={ticket.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} className="hover:bg-slate-800/20 transition-colors" onClick={() => onSelect(ticket.id)}>
                <td style={{ padding: '16px', color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>{ticket.id}</td>
                <td style={{ padding: '16px', minWidth: '220px' }}>
                  <div style={{ color: 'var(--ink1)', fontWeight: 600 }}>{ticket.title}</div>
                  <div style={{ color: 'var(--ink3)', fontSize: '11px', marginTop: '4px' }}>{(ticket as any).machineName || `Máquina ${(ticket as any).machineId}`}</div>
                </td>
                <td style={{ padding: '16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{ticket.createdBy}</td>
                <td style={{ padding: '16px', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>
                  <span className={(ticket as any).durationReal > 45 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {(ticket as any).durationReal}m
                  </span>
                </td>
                <td style={{ padding: '16px', whiteSpace: 'nowrap' }}>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeClass}`}>
                    {label}
                  </span>
                </td>
                <td style={{ padding: '16px', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '11px' }} onClick={(e) => { e.stopPropagation(); onSelect(ticket.id); }}>
                    {lang === 'en' ? 'View' : 'Ver'}
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