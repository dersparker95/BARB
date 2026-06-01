import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import SettingsModal from './SettingsModal';
import { showToast } from './Toast';
import { getTranslations, normalizeLang } from '../utils/i18n';
const TopBar = () => {
    const { user, setUser, dark, setDark, lang, setLang, apiBase, setLoading } = useAppContext();
    const navigate = useNavigate();
    const location = useLocation();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const translations = useMemo(() => getTranslations(lang), [lang]);
    // Sincronizar el estado oscuro de React con el DOM (para Tailwind y CSS nativo)
    useEffect(() => {
        if (dark) {
            document.documentElement.classList.add('dark');
            document.body.dataset.theme = 'dark';
        }
        else {
            document.documentElement.classList.remove('dark');
            document.body.dataset.theme = 'light';
        }
    }, [dark]);
    const handleLogout = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${apiBase.replace(/\/$/, '')}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!response.ok) {
                throw new Error(await response.text().catch(() => response.statusText));
            }
        }
        catch (_) {
            // Logout local incluso si el backend no está disponible
        }
        finally {
            setUser(null);
            setLoading(false);
            navigate('/login');
        }
    };
    const toggleTheme = () => setDark(!dark);
    const handleLanguageChange = (value) => {
        const nextLang = normalizeLang(value);
        setLang(nextLang);
        showToast(translations.settings.languageUpdated);
    };
    const path = location.pathname;
    let title = translations.topbar.maintenance;
    let showBack = true;
    let backPath = '/menu';
    let badge = null;
    let showStatus = false;
    if (path.includes('/menu')) {
        showBack = false;
        title = translations.topbar.mainMenu;
        showStatus = true;
    }
    else if (path.includes('/dashboard')) {
        title = translations.menu.dashboardTitle;
        showStatus = true;
        badge = (_jsx("span", { style: { fontSize: '10px', background: 'var(--purple-bg)', color: 'var(--purple)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--mono)', fontWeight: 600, marginLeft: '8px' }, children: translations.topbar.admin }));
    }
    else if (path.includes('/docchat')) {
        title = translations.topbar.documentChat;
    }
    else if (path.includes('/debug')) {
        title = translations.topbar.machineDebug;
        backPath = '/topology';
    }
    else if (path.includes('/topology')) {
        title = translations.topbar.plantTopology;
    }
    else if (path.includes('/memory')) {
        title = translations.topbar.machineMemory;
        backPath = -1;
    }
    else if (path.includes('/report')) {
        title = translations.topbar.debugReport;
        backPath = '/debug';
    }
    return (_jsxs("div", { className: "topbar", children: [_jsxs("div", { className: "topbar-left", children: [showBack && (_jsx("button", { className: "back-btn", onClick: () => (typeof backPath === 'string' ? navigate(backPath) : navigate(-1)), children: "\u2039" })), _jsx("div", { className: "topbar-logo", children: _jsx("span", { className: "logo-mark", children: "BARB" }) }), _jsx("span", { className: "topbar-title", children: title }), badge] }), _jsxs("div", { className: "topbar-right", children: [showStatus && (_jsxs("div", { className: "status-badge", title: translations.topbar.apiOnline, children: [_jsx("div", { className: "status-dot online" }), _jsx("span", { children: translations.topbar.apiOnline })] })), _jsx("label", { className: "sr-only", htmlFor: "language-select", children: translations.common.language }), _jsxs("select", { id: "language-select", className: "topbar-select", value: lang, onChange: event => handleLanguageChange(event.target.value), "aria-label": translations.common.language, title: translations.common.language, children: [_jsx("option", { value: "es", children: "ES" }), _jsx("option", { value: "en", children: "EN" })] }), _jsx("button", { className: "icon-btn", onClick: toggleTheme, title: translations.common.theme, children: _jsx("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" }) }) }), _jsx("button", { className: "icon-btn", onClick: () => setSettingsOpen(true), title: translations.common.settings, children: _jsxs("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "3" }), _jsx("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })] }) }), user && (_jsx("button", { className: "icon-btn", onClick: handleLogout, title: translations.topbar.logout, children: _jsxs("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }), _jsx("polyline", { points: "16 17 21 12 16 7" }), _jsx("line", { x1: "21", y1: "12", x2: "9", y2: "12" })] }) }))] }), _jsx(SettingsModal, { isOpen: settingsOpen, onClose: () => setSettingsOpen(false) })] }));
};
export default TopBar;
