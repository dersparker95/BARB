import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Menu from './pages/Menu';
import DocChat from './pages/DocChat';
import Debug from './pages/Debug';
import Topology from './pages/Topology';
import MachineMemory from './pages/MachineMemory';
import Report from './pages/Report';
import Forbidden from './pages/Forbidden';
import { useAppContext } from './context/AppContext';
// Rescatado de la rama de Benja:
import Toast from './components/Toast';
function hasRolePermission(userRole, allowedRoles) {
    if (!userRole)
        return false;
    return allowedRoles.includes(userRole);
}
// Guard genérico por rol. Si no hay sesión -> /login
// Si hay sesión pero no corresponde -> /403
const RoleGuard = ({ allowedRoles, children }) => {
    const { user } = useAppContext();
    const location = useLocation();
    if (!user) {
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: location.pathname } });
    }
    if (!hasRolePermission(user.role, allowedRoles)) {
        return _jsx(Navigate, { to: "/403", replace: true });
    }
    return children;
};
const routeRoles = (path) => {
    if (path.startsWith('/dashboard'))
        return ['gerente', 'admin'];
    if (path.startsWith('/menu'))
        return ['tecnico', 'gerente', 'admin'];
    if (path.startsWith('/docchat'))
        return ['tecnico', 'gerente', 'admin'];
    if (path.startsWith('/topology'))
        return ['tecnico', 'gerente', 'admin'];
    if (path.startsWith('/memory/'))
        return ['tecnico', 'gerente', 'admin'];
    if (path.startsWith('/debug'))
        return ['tecnico', 'gerente', 'admin'];
    if (path.startsWith('/report'))
        return ['gerente', 'admin'];
    return ['tecnico', 'gerente', 'admin'];
};
const ProtectedLayout = ({ children }) => {
    const { user } = useAppContext();
    const location = useLocation();
    if (!user)
        return _jsx(Navigate, { to: "/login", replace: true });
    const isTecnico = user.role === 'tecnico';
    const pathname = location.pathname;
    if (isTecnico) {
        const blockedPath = pathname.startsWith('/dashboard') ||
            pathname.startsWith('/upload') ||
            pathname.startsWith('/reports/upload');
        if (blockedPath) {
            return _jsx(Navigate, { to: "/403", replace: true });
        }
    }
    return children;
};
const RootRedirect = () => _jsx(Navigate, { to: "/login", replace: true });
export default function App() {
    return (_jsxs(_Fragment, { children: [_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(RootRedirect, {}) }), _jsx(Route, { path: "/login", element: _jsx(Login, {}) }), _jsx(Route, { path: "/403", element: _jsx(Forbidden, {}) }), _jsxs(Route, { element: _jsx(ProtectedLayout, { children: _jsx(Layout, {}) }), children: [_jsx(Route, { path: "/dashboard", element: _jsx(RoleGuard, { allowedRoles: routeRoles('/dashboard'), children: _jsx(Dashboard, {}) }) }), _jsx(Route, { path: "/menu", element: _jsx(RoleGuard, { allowedRoles: routeRoles('/menu'), children: _jsx(Menu, {}) }) }), _jsx(Route, { path: "/docchat", element: _jsx(RoleGuard, { allowedRoles: routeRoles('/docchat'), children: _jsx(DocChat, {}) }) }), _jsx(Route, { path: "/debug", element: _jsx(RoleGuard, { allowedRoles: routeRoles('/debug'), children: _jsx(Debug, {}) }) }), _jsx(Route, { path: "/topology", element: _jsx(RoleGuard, { allowedRoles: routeRoles('/topology'), children: _jsx(Topology, {}) }) }), _jsx(Route, { path: "/memory/:machineId", element: _jsx(RoleGuard, { allowedRoles: routeRoles('/memory/'), children: _jsx(MachineMemory, {}) }) }), _jsx(Route, { path: "/report", element: _jsx(RoleGuard, { allowedRoles: routeRoles('/report'), children: _jsx(Report, {}) }) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/login", replace: true }) })] }), _jsx(Toast, {})] }));
}
