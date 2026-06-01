import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Outlet } from 'react-router-dom';
import TopBar from '../components/TopBar';
import Toast from '../components/Toast';
const Layout = () => {
    return (_jsxs("div", { className: "flex flex-col h-screen overflow-hidden", children: [_jsx(TopBar, {}), _jsx("div", { className: "flex-1 flex overflow-hidden", children: _jsx(Outlet, {}) }), _jsx(Toast, {})] }));
};
export default Layout;
