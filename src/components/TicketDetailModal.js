import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { WO_STATUSES, WO_STATUS_LABEL } from '../services/workOrders';
import { showToast } from './Toast';
const TicketDetailModal = ({ ticket, onClose, onUpdateStatus, onDelete }) => {
    if (!ticket)
        return null;
    const statusOrder = WO_STATUSES;
    const currentIndex = statusOrder.indexOf(ticket.status);
    const advance = () => {
        const next = Math.min(statusOrder.length - 1, currentIndex + 1);
        const nextStatus = statusOrder[next];
        onUpdateStatus(ticket.id, nextStatus);
    };
    const exportPdf = () => {
        // simple print fallback — open new window with ticket details
        const w = window.open('', '_blank');
        if (!w)
            return;
        w.document.write(`<pre>${JSON.stringify(ticket, null, 2)}</pre>`);
        w.document.close();
        w.print();
    };
    const closeTicket = () => onUpdateStatus(ticket.id, 'closed');
    const handleDelete = async () => {
        const confirmed = window.confirm(`¿Eliminar la OT ${ticket.id}?`);
        if (!confirmed)
            return;
        try {
            await onDelete(ticket.id);
            onClose();
            showToast('🗑️ OT eliminada correctamente');
        }
        catch (error) {
            console.error('Error deleting work order from modal', error);
            showToast('❌ No se pudo eliminar la OT');
        }
    };
    return (_jsx("div", { className: "modal-overlay open", onClick: (e) => { if (e.target === e.currentTarget)
            onClose(); }, children: _jsxs("div", { className: "modal-box", style: { maxWidth: 640 }, children: [_jsxs("div", { className: "modal-header", children: [_jsxs("div", { children: [_jsx("div", { className: "ot-detail-num", children: ticket.id }), _jsx("h2", { style: { fontSize: 17 }, children: ticket.title })] }), _jsx("button", { className: "modal-close", onClick: onClose, children: "\u2715" })] }), _jsxs("div", { className: "modal-body", style: { padding: 20 }, children: [_jsx("div", { className: "ot-timeline-strip", children: statusOrder.map((s, i) => {
                                const done = i < currentIndex;
                                const active = s === ticket.status;
                                const isLast = i === statusOrder.length - 1;
                                return (_jsxs("div", { className: "ots-step", children: [!isLast && _jsx("div", { className: `ots-line ${done || active ? 'done' : ''}` }), _jsx("div", { className: `ots-dot ${done ? 'done' : active ? 'active' : ''}` }), _jsx("div", { className: "ots-label", children: WO_STATUS_LABEL[s] })] }, s));
                            }) }), _jsxs("div", { className: "ot-detail-grid", children: [_jsxs("div", { className: "ot-detail-field", children: [_jsx("div", { className: "ot-detail-label", children: "M\u00E1quina" }), _jsx("div", { className: "ot-detail-val", children: ticket.machineId })] }), _jsxs("div", { className: "ot-detail-field", children: [_jsx("div", { className: "ot-detail-label", children: "T\u00E9cnico" }), _jsx("div", { className: "ot-detail-val", children: ticket.createdBy || 'operator' })] }), _jsxs("div", { className: "ot-detail-field", children: [_jsx("div", { className: "ot-detail-label", children: "Estado" }), _jsx("div", { className: "ot-detail-val", children: _jsx("span", { className: `ot-badge ${ticket.status}`, children: WO_STATUS_LABEL[ticket.status] }) })] }), _jsxs("div", { className: "ot-detail-field", children: [_jsx("div", { className: "ot-detail-label", children: "Prioridad" }), _jsx("div", { className: "ot-detail-val", style: { fontWeight: 600, color: ticket.priority === 'high' ? '#c0281e' : 'var(--amber)' }, children: ticket.priority === 'high' ? 'Alta' : 'Media' })] })] }), _jsxs("div", { style: { marginTop: 10, fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }, children: [_jsx("strong", { children: "Descripci\u00F3n:" }), " ", ticket.description] }), _jsxs("div", { style: { marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }, children: [_jsx("button", { className: "btn btn-outline btn-sm", onClick: onClose, children: "Cerrar" }), _jsx("button", { className: "btn btn-sm", style: { background: 'var(--accent)', color: '#fff' }, onClick: exportPdf, children: "\uD83D\uDCC4 Exportar PDF" }), _jsx("button", { className: "btn btn-sm btn-outline", disabled: currentIndex === statusOrder.length - 1, onClick: () => { advance(); showToast(`OT Avanzada →`); }, children: "Avanzar estado \u2192" }), _jsx("button", { className: "btn btn-sm btn-outline", style: { color: 'var(--red)', borderColor: 'var(--red)' }, onClick: () => { void handleDelete(); }, children: "Eliminar OT" })] })] })] }) }));
};
export default TicketDetailModal;
