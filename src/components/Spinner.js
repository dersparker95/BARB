import { jsx as _jsx } from "react/jsx-runtime";
const Spinner = ({ label = 'Cargando…', className = '' }) => {
    return (_jsx("span", { className: `spinner ${className}`.trim(), role: "status", "aria-live": "polite", "aria-label": label, children: _jsx("span", { className: "sr-only", children: label }) }));
};
export default Spinner;
