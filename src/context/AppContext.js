import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import createApiService from '../services/api';
const AUTH_STORAGE_KEY = 'barb.auth';
const safeParseJson = (txt) => {
    if (!txt)
        return null;
    try {
        return JSON.parse(txt);
    }
    catch {
        return null;
    }
};
const readStoredString = (key, fallback) => {
    if (typeof window === 'undefined')
        return fallback;
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
};
const readStoredBoolean = (key, fallback) => {
    if (typeof window === 'undefined')
        return fallback;
    const value = window.localStorage.getItem(key);
    if (value === null)
        return fallback;
    return value === 'true';
};
const readStoredAuth = () => {
    if (typeof window === 'undefined')
        return null;
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = safeParseJson(raw);
    if (!parsed || typeof parsed !== 'object') {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
    }
    const obj = parsed;
    const isValidRole = obj.user?.role === 'gerente' || obj.user?.role === 'admin' || obj.user?.role === 'tecnico';
    const isValidUser = Boolean(obj.user?.id && obj.user?.name && isValidRole);
    const isValidToken = typeof obj.token === 'string' && obj.token.trim().length > 0;
    const isValidSavedAt = typeof obj.savedAt === 'number' && Number.isFinite(obj.savedAt);
    if (!isValidUser || !isValidToken || !isValidSavedAt) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
    }
    return obj;
};
const AppContext = createContext(undefined);
// === ESTADO POR DEFECTO UNIFICADO ===
const defaultState = {
    currentScreen: 'login',
    dark: false,
    lang: 'es',
    discipline: null,
    docMachine: 'all',
    plant: 'plant1',
    selectedMachine: null,
    sessionId: null,
    sessionStart: null,
    docMessages: [],
    // Estado rescatado de Benja para las pantallas de máquinas:
    debugMessagesByMachine: {},
    user: null,
    apiBase: (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE ?? '/api'),
    lmBase: (import.meta.env.VITE_LM_STUDIO_URL ?? import.meta.env.VITE_LM_BASE ?? '/lm'),
    loading: false,
};
export const AppProvider = ({ children }) => {
    const [currentScreen, setCurrentScreen] = useState(() => readStoredString('barb.currentScreen', defaultState.currentScreen) ?? defaultState.currentScreen);
    const [dark, setDark] = useState(() => readStoredBoolean('barb.dark', defaultState.dark));
    const [lang, setLang] = useState(() => readStoredString('barb.lang', defaultState.lang) ?? defaultState.lang);
    const [discipline, setDiscipline] = useState(() => readStoredString('barb.discipline', defaultState.discipline));
    const [docMachine, setDocMachine] = useState(() => readStoredString('barb.docMachine', defaultState.docMachine) ?? defaultState.docMachine);
    const [plant, setPlant] = useState(() => readStoredString('barb.plant', defaultState.plant) ?? defaultState.plant);
    const [selectedMachine, setSelectedMachine] = useState(() => readStoredString('barb.selectedMachine', defaultState.selectedMachine));
    const [sessionId, setSessionId] = useState(defaultState.sessionId);
    const [sessionStart, setSessionStart] = useState(defaultState.sessionStart);
    const [docMessages, setDocMessages] = useState(defaultState.docMessages);
    // Estado de mensajes por máquina rescatado de Benja
    const [debugMessagesByMachine, setDebugMessagesByMachine] = useState(defaultState.debugMessagesByMachine);
    // Autenticación segura de tu HEAD
    const [user, setUser] = useState(() => {
        const stored = readStoredAuth();
        if (!stored)
            return defaultState.user;
        return {
            id: stored.user.id,
            name: stored.user.name,
            role: stored.user.role,
            token: stored.token,
        };
    });
    const [apiBase, setApiBase] = useState(defaultState.apiBase);
    const [lmBase, setLmBase] = useState(defaultState.lmBase);
    const [loading, setLoading] = useState(defaultState.loading);
    const pushDocMessage = useCallback((m) => setDocMessages(prev => [...prev, m]), []);
    // Funciones adaptadas para soportar el formato de Benja
    const getDebugMessages = useCallback((machineId) => {
        if (!machineId)
            return [];
        return debugMessagesByMachine[machineId] ?? [];
    }, [debugMessagesByMachine]);
    const pushDebugMessage = useCallback((machineId, m) => {
        if (!machineId)
            return;
        setDebugMessagesByMachine(prev => {
            const current = prev[machineId] ?? [];
            return { ...prev, [machineId]: [...current, m] };
        });
    }, []);
    const authService = useMemo(() => createApiService(apiBase, lmBase), [apiBase, lmBase]);
    const persistAuth = useCallback((next) => {
        if (typeof window === 'undefined')
            return;
        if (!next || !next.token) {
            window.localStorage.removeItem(AUTH_STORAGE_KEY);
            return;
        }
        const payload = {
            user: { id: next.id, name: next.name, role: next.role },
            token: next.token,
            savedAt: Date.now(),
        };
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
    }, []);
    useEffect(() => {
        persistAuth(user);
    }, [user, persistAuth]);
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        window.localStorage.setItem('barb.currentScreen', currentScreen);
    }, [currentScreen]);
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        window.localStorage.setItem('barb.dark', String(dark));
    }, [dark]);
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        window.localStorage.setItem('barb.lang', lang);
    }, [lang]);
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        if (discipline)
            window.localStorage.setItem('barb.discipline', discipline);
        else
            window.localStorage.removeItem('barb.discipline');
    }, [discipline]);
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        window.localStorage.setItem('barb.docMachine', docMachine);
    }, [docMachine]);
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        window.localStorage.setItem('barb.plant', plant);
    }, [plant]);
    useEffect(() => {
        if (typeof window === 'undefined')
            return;
        if (selectedMachine)
            window.localStorage.setItem('barb.selectedMachine', selectedMachine);
        else
            window.localStorage.removeItem('barb.selectedMachine');
    }, [selectedMachine]);
    const logout = useCallback(async () => {
        setLoading(true);
        try {
            await authService.auth.logout();
        }
        catch {
            // Logout local incluso si falla backend
        }
        finally {
            setUser(null);
            setLoading(false);
        }
    }, [authService]);
    const login = useCallback(async (params) => {
        setLoading(true);
        try {
            const resp = await authService.auth.login(params.email, params.password);
            const nextUser = {
                id: String(resp.user?.id ?? Date.now()),
                name: resp.user?.name ?? params.email,
                role: resp.user?.role ?? 'tecnico',
                token: String(resp.token ?? 'session-token-valid'),
            };
            setUser(nextUser);
            return nextUser;
        }
        finally {
            setLoading(false);
        }
    }, [authService]);
    const value = {
        currentScreen,
        dark,
        lang,
        discipline,
        docMachine,
        plant,
        selectedMachine,
        sessionId,
        sessionStart,
        docMessages,
        debugMessagesByMachine,
        getDebugMessages,
        user,
        apiBase,
        lmBase,
        loading,
        setCurrentScreen,
        setDark,
        setLang,
        setDiscipline,
        setDocMachine,
        setPlant,
        setSelectedMachine,
        setSessionId,
        setSessionStart,
        pushDocMessage,
        pushDebugMessage,
        setUser,
        setApiBase,
        setLmBase,
        setLoading,
    };
    value.login = login;
    value.logout = logout;
    return _jsx(AppContext.Provider, { value: value, children: children });
};
export const useAppContext = () => {
    const ctx = useContext(AppContext);
    if (!ctx)
        throw new Error('useAppContext must be used within AppProvider');
    return ctx;
};
