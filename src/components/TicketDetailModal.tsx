// @ts-nocheck
import React, { useMemo } from 'react'
import { WorkOrder } from '../types'
import { WO_STATUSES, WO_STATUS_LABEL, type WOStatus } from '../services/workOrders'
import { showToast } from './Toast'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

interface Props {
  ticket: WorkOrder | null
  onClose: () => void
  onUpdateStatus: (id: string, status: WorkOrder['status']) => void
  onDelete: (id: string) => Promise<void> | void
}

// ⚠️ FIX: antes solo existían 2 ramas (high / medium por defecto), así que 'low'
// y 'urgent' (el valor real más alto del enum prioridad_ot) caían ambos en
// "Media" sin distinguirse ni resaltar en rojo. Se cubre el enum completo.
const PRIORITY_LABEL_ES: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' }
const PRIORITY_LABEL_EN: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }

const TicketDetailModal: React.FC<Props> = ({ ticket, onClose, onUpdateStatus, onDelete }) => {
  const { lang } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  if (!ticket) return null

  const statusOrder = WO_STATUSES || ['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue']

  // 🔥 BLINDAJE: Normalizamos el estado por si el backend lo envía en mayúsculas
  const currentStatus = String(ticket.status || 'pending').toLowerCase() as WOStatus

  // Si el estado no existe en la lista, asumimos 0 para que no rompa el array
  const rawIndex = statusOrder.indexOf(currentStatus)
  const currentIndex = rawIndex >= 0 ? rawIndex : 0

  const advance = () => {
    const next = Math.min(statusOrder.length - 1, currentIndex + 1)
    const nextStatus = statusOrder[next]
    onUpdateStatus(ticket.id, nextStatus as WorkOrder['status'])
  }

  const exportPdf = () => {
    const w = window.open('', '_blank')
    if (!w) return

    // 🔥 MEJORA: Un reporte de impresión mucho más limpio y corporativo que un simple JSON
    // Nota: este HTML vive en una ventana aparte sin acceso al index.css de la app,
    // por eso usa valores fijos en vez de var() — es la única excepción permitida.
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 40px; color: #333;">
        <h1 style="border-bottom: 2px solid #2563eb; padding-bottom: 10px;">Orden de Trabajo: ${ticket.id}</h1>
        <h2>${ticket.title || 'Sin Título'}</h2>
        <table style="width: 100%; text-align: left; margin-top: 20px; border-collapse: collapse;">
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Máquina:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${ticket.machineName || ticket.machineId || 'N/A'}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Técnico:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${ticket.createdBy || 'Operador'}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Prioridad:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${(ticket.priority || '').toUpperCase()}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Estado:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${(t.statuses?.[currentStatus] || WO_STATUS_LABEL?.[currentStatus] || currentStatus).toUpperCase()}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Fecha:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${new Date(ticket.createdAt || Date.now()).toLocaleString()}</td></tr>
        </table>
        <h3 style="margin-top: 30px;">Descripción:</h3>
        <p style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">${ticket.description || 'Sin descripción'}</p>
        <div style="margin-top: 50px; font-size: 12px; color: #64748b;">Reporte generado automáticamente por plataforma BARB.</div>
      </div>
    `
    w.document.write(html)
    w.document.close()

    // Pequeño timeout para asegurar que el navegador renderice el HTML antes de lanzar la ventana de impresión
    setTimeout(() => {
      w.print()
    }, 200)
  }

  const closeTicket = () => onUpdateStatus(ticket.id, 'completed')

  const handleDelete = async () => {
    const confirmed = window.confirm(`¿Eliminar la OT ${ticket.id}?`)
    if (!confirmed) return

    try {
      await onDelete(ticket.id)
      onClose()
      showToast('🗑️ OT eliminada correctamente')
    } catch (error) {
      console.error('Error deleting work order from modal', error)
      showToast('❌ No se pudo eliminar la OT')
    }
  }

  // Traducciones seguras — cubre las 4 prioridades reales (low/medium/high/urgent)
  const priorityKey = String(ticket.priority || 'medium').toLowerCase()
  const priorityLabels = lang === 'en' ? PRIORITY_LABEL_EN : PRIORITY_LABEL_ES
  const priorityLabel = t.common?.[priorityKey] || priorityLabels[priorityKey] || priorityLabels.medium

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box modal-box--wide">
        <div className="modal-header">
          <div>
            <div className="ot-detail-num">{ticket.id}</div>
            <h2 className="ot-detail-modal-title">{ticket.title || 'Sin Título'}</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t.common?.close || 'Cerrar'}>✕</button>
        </div>

        <div className="modal-body modal-body--compact">
          <div className="ot-timeline-strip">
            {statusOrder.map((s, i) => {
              const done = i < currentIndex
              const active = s === currentStatus
              const isLast = i === statusOrder.length - 1

              // Intentamos buscar la etiqueta en el i18n, si no, en el array estático, si no, usamos el string.
              const label = t.statuses?.[s] || WO_STATUS_LABEL?.[s] || s

              return (
                <div key={s} className="ots-step">
                  {!isLast && <div className={`ots-line ${done || active ? 'done' : ''}`} />}
                  <div className={`ots-dot ${done ? 'done' : active ? 'active' : ''}`} />
                  <div className="ots-label">{label}</div>
                </div>
              )
            })}
          </div>

          <div className="ot-detail-grid">
            <div className="ot-detail-field">
              <div className="ot-detail-label">{t.dashboard?.machine || 'Máquina'}</div>
              {/* Priorizamos el nombre real de la máquina, si no, mostramos el ID */}
              <div className="ot-detail-val">{ticket.machineName || ticket.machineId || 'N/A'}</div>
            </div>
            <div className="ot-detail-field">
              <div className="ot-detail-label">{t.common?.technician || 'Técnico'}</div>
              <div className="ot-detail-val">{ticket.createdBy || 'Operador'}</div>
            </div>
            <div className="ot-detail-field">
              <div className="ot-detail-label">{t.common?.status || 'Estado'}</div>
              <div className="ot-detail-val">
                <span className={`ot-badge ${currentStatus}`}>
                  {t.statuses?.[currentStatus] || WO_STATUS_LABEL?.[currentStatus] || currentStatus}
                </span>
              </div>
            </div>
            <div className="ot-detail-field">
              <div className="ot-detail-label">{t.common?.priority || 'Prioridad'}</div>
              <div className={`ot-detail-val ot-priority ot-priority--${priorityKey}`}>
                {priorityLabel}
              </div>
            </div>
          </div>

          <div className="ot-detail-description">
            <strong>{t.common?.description || 'Descripción'}:</strong> {ticket.description || 'Sin detalles adicionales.'}
          </div>

          <div className="ot-detail-actions">
            <button className="btn btn-outline btn-sm" onClick={onClose}>
              {t.common?.close || 'Cerrar'}
            </button>
            <button className="btn btn-sm btn-blue" onClick={exportPdf}>
              📄 {lang === 'en' ? 'Export PDF' : 'Exportar PDF'}
            </button>
            <button
              className="btn btn-sm btn-outline"
              disabled={currentIndex === statusOrder.length - 1}
              onClick={() => { advance(); showToast(`OT Avanzada →`); }}
            >
              {lang === 'en' ? 'Advance Status →' : 'Avanzar estado →'}
            </button>
            <button
              className="btn btn-sm btn-outline btn-danger ml-auto"
              onClick={() => { void handleDelete() }}
            >
              {lang === 'en' ? 'Delete OT' : 'Eliminar OT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TicketDetailModal