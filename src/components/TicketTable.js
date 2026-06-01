import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { WO_STATUS_LABEL } from '../services/workOrders';
const durClass = (min) => {
    if (min == null)
        return '';
    if (min <= 35)
        return 'fast';
    if (min <= 60)
        return 'medium';
    return 'slow';
};
const formatDuration = (createdAt, closedAt) => {
    if (!createdAt)
        return '—';
    const end = closedAt ? new Date(closedAt).getTime() : Date.now();
    const mins = Math.round((end - new Date(createdAt).getTime()) / 60000);
    if (mins < 60)
        return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};
const TicketTable = ({ tickets, onSelect }) => {
    return (_jsx("div", { className: "ot-table-wrap", children: _jsxs("table", { className: "ot-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "N\u00B0 OT" }), _jsx("th", { children: "M\u00E1quina" }), _jsx("th", { children: "Problema" }), _jsx("th", { children: "T\u00E9cnico" }), _jsx("th", { children: "Inicio" }), _jsx("th", { children: "Cierre" }), _jsx("th", { children: "Duraci\u00F3n" }), _jsx("th", { children: "Estado" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: tickets.map(t => (_jsxs("tr", { onClick: () => onSelect && onSelect(t.id), style: { cursor: 'pointer' }, children: [_jsx("td", { children: _jsx("span", { className: "ot-num", children: t.id }) }), _jsxs("td", { children: [_jsx("span", { className: "ot-machine", children: t.title }), _jsx("br", {}), _jsx("span", { style: { fontSize: '10px', color: 'var(--ink3)', fontFamily: 'var(--mono)' }, children: t.machineId || '—' })] }), _jsx("td", { children: t.description?.slice(0, 30) || '—' }), _jsx("td", { children: _jsx("span", { className: "ot-tech", children: t.createdBy || 'operator' }) }), _jsx("td", { children: _jsx("span", { className: "ot-ts", children: t.createdAt ? new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }) }), _jsx("td", { children: _jsx("span", { className: "ot-ts", children: t.closedAt ? new Date(t.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }) }), _jsx("td", { children: _jsx("span", { className: `ot-dur ${durClass(t.closedAt ? Math.round((new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / 60000) : null)}`, children: formatDuration(t.createdAt, t.closedAt) }) }), _jsx("td", { children: _jsxs("span", { className: `ot-badge ${t.status}`, children: [t.status === 'in_progress' && _jsx("span", { className: "ot-live-dot" }), WO_STATUS_LABEL[t.status]] }) }), _jsx("td", { children: _jsx("button", { onClick: (e) => { e.stopPropagation(); onSelect && onSelect(t.id); }, className: "btn btn-sm btn-outline", style: { fontSize: '10px', padding: '4px 8px' }, children: "Ver" }) })] }, t.id))) })] }) }));
};
export default TicketTable;
