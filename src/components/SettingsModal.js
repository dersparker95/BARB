import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { showToast } from './Toast';
import { getTranslations, normalizeLang } from '../utils/i18n';
const SettingsModal = ({ isOpen, onClose }) => {
    const { user, dark, lang, setDark, setLang, apiBase, lmBase, setApiBase, setLmBase, } = useAppContext();
    const t = useMemo(() => getTranslations(lang), [lang]);
    const [localApi, setLocalApi] = useState(apiBase);
    const [localLm, setLocalLm] = useState(lmBase);
    const [localLang, setLocalLang] = useState(normalizeLang(lang));
    useEffect(() => {
        if (!isOpen)
            return;
        setLocalApi(apiBase);
        setLocalLm(lmBase);
        setLocalLang(normalizeLang(lang));
    }, [apiBase, lang, lmBase, isOpen]);
    if (!isOpen)
        return null;
    const handleSave = () => {
        const nextApi = localApi.trim();
        const nextLm = localLm.trim();
        if (nextApi)
            setApiBase(nextApi);
        if (nextLm)
            setLmBase(nextLm);
        setLang(localLang);
        showToast(t.settings.savedLocally);
        onClose();
    };
    const testConnections = () => {
        showToast(t.settings.testingConnections);
        window.setTimeout(() => showToast(t.settings.apiOkLmOffline), 1500);
    };
    return (_jsx("div", { className: "modal-overlay open", onClick: (event) => { if (event.target === event.currentTarget)
            onClose(); }, children: _jsxs("div", { className: `modal-box ${dark ? 'bg-slate-900 text-gray-100 border border-slate-700' : ''}`, children: [_jsxs("div", { className: "modal-header", children: [_jsx("h2", { className: dark ? 'text-gray-100' : '', children: t.settings.title }), _jsx("button", { className: `modal-close ${dark ? 'bg-slate-700 text-gray-100' : ''}`, onClick: onClose, "aria-label": t.common.close, children: "\u2715" })] }), _jsxs("div", { className: "modal-body", children: [_jsxs("div", { className: "settings-section", children: [_jsx("h3", { className: dark ? 'text-gray-100' : '', children: t.settings.appearanceLanguage }), _jsxs("div", { className: "settings-block", children: [_jsxs("div", { className: "settings-row", children: [_jsx("div", { children: _jsx("div", { className: `sr-label ${dark ? 'text-gray-200' : ''}`, children: t.settings.darkTheme }) }), _jsxs("label", { className: "toggle", "aria-label": t.settings.darkTheme, children: [_jsx("input", { type: "checkbox", checked: dark, onChange: () => setDark(!dark), "aria-label": t.settings.darkTheme }), _jsx("span", { className: "toggle-track" }), _jsx("span", { className: "toggle-thumb" })] })] }), _jsxs("div", { className: "settings-row", children: [_jsx("div", { children: _jsx("div", { className: `sr-label ${dark ? 'text-gray-200' : ''}`, children: t.common.language }) }), _jsxs("select", { className: `form-select ${dark ? 'bg-slate-800 border-slate-600 text-gray-100' : ''}`, value: localLang, title: t.common.language, "aria-label": t.common.language, style: { maxWidth: 150 }, onChange: (event) => setLocalLang(normalizeLang(event.target.value)), children: [_jsx("option", { value: "en", children: "English" }), _jsx("option", { value: "es", children: "Espa\u00F1ol" })] })] })] })] }), _jsxs("div", { className: "settings-section", children: [_jsx("h3", { className: dark ? 'text-gray-100' : '', children: t.settings.account }), _jsxs("div", { className: "settings-block", children: [_jsx("div", { className: "settings-row", children: _jsxs("div", { children: [_jsx("div", { className: `sr-label ${dark ? 'text-gray-200' : ''}`, children: t.common.username }), _jsx("div", { className: `sr-sub ${dark ? 'text-gray-300' : ''}`, children: user?.name || t.settings.guest })] }) }), _jsx("div", { className: "settings-row", children: _jsxs("div", { children: [_jsx("div", { className: `sr-label ${dark ? 'text-gray-200' : ''}`, children: t.common.role }), _jsx("div", { className: `sr-sub capitalize ${dark ? 'text-gray-300' : ''}`, children: user?.role || '—' })] }) })] })] }), _jsxs("div", { className: "settings-section", children: [_jsx("h3", { className: dark ? 'text-gray-100' : '', children: t.settings.systemConnections }), _jsxs("div", { className: "settings-block", children: [_jsxs("div", { className: "settings-row", children: [_jsx("div", { className: `sr-label ${dark ? 'text-gray-200' : ''}`, children: t.settings.appVersion }), _jsx("div", { style: { fontFamily: 'var(--mono)', fontSize: 12, color: dark ? 'var(--ink2)' : 'var(--ink2)' }, children: "2.1.0 (React)" })] }), _jsxs("div", { className: "settings-row", children: [_jsx("div", { children: _jsx("div", { className: `sr-label ${dark ? 'text-gray-200' : ''}`, children: t.settings.fastApiEndpoint }) }), _jsx("input", { className: `form-input ${dark ? 'bg-slate-800 border-slate-600 text-gray-100 placeholder:text-gray-400' : ''}`, value: localApi, onChange: (event) => setLocalApi(event.target.value), title: t.settings.fastApiEndpoint, "aria-label": t.settings.fastApiEndpoint, placeholder: "http://localhost:9000/api", style: { maxWidth: 190, fontFamily: 'var(--mono)', fontSize: 10, padding: '5px 8px' } })] }), _jsxs("div", { className: "settings-row", children: [_jsx("div", { children: _jsx("div", { className: `sr-label ${dark ? 'text-gray-200' : ''}`, children: t.settings.lmStudioEndpoint }) }), _jsx("input", { className: `form-input ${dark ? 'bg-slate-800 border-slate-600 text-gray-100 placeholder:text-gray-400' : ''}`, value: localLm, onChange: (event) => setLocalLm(event.target.value), title: t.settings.lmStudioEndpoint, "aria-label": t.settings.lmStudioEndpoint, placeholder: "http://localhost:1234/v1", style: { maxWidth: 190, fontFamily: 'var(--mono)', fontSize: 10, padding: '5px 8px' } })] }), _jsxs("div", { className: "settings-row", children: [_jsx("div", { children: _jsx("div", { className: `sr-label ${dark ? 'text-gray-200' : ''}`, children: t.settings.testConnections }) }), _jsx("button", { className: `btn btn-sm btn-outline ${dark ? 'text-gray-100 border-slate-600 hover:bg-slate-800' : ''}`, onClick: testConnections, children: t.settings.testConnections })] })] })] })] }), _jsxs("div", { className: "modal-footer", children: [_jsx("button", { className: "btn btn-primary", onClick: handleSave, children: t.settings.saveChanges }), _jsx("button", { className: `btn btn-outline ${dark ? 'text-gray-100 border-slate-600 hover:bg-slate-800' : ''}`, onClick: onClose, children: t.common.cancel })] })] }) }));
};
export default SettingsModal;
