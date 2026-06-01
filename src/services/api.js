async function callAPI(base, path, opts) {
    const url = base + path;
    const headers = { 'Content-Type': 'application/json', ...opts?.headers };
    const res = await fetch(url, { credentials: 'include', ...opts, headers });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || res.statusText);
    }
    const txt = await res.text();
    try {
        return JSON.parse(txt);
    }
    catch {
        return txt;
    }
}
export const createApiService = (apiBase = 'http://localhost:9000/api', lmBase = '/lm') => {
    return {
        auth: {
            login: async (email, password) => callAPI(apiBase, '/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            }),
            logout: async () => callAPI(apiBase, '/auth/logout', { method: 'POST' }),
        },
        health: async () => callAPI(apiBase, '/health', { method: 'GET' }),
        disciplines: async (plantId) => callAPI(apiBase, `/disciplines${plantId ? `?plantId=${encodeURIComponent(plantId)}` : ''}`, {
            method: 'GET',
        }),
        plants: async () => callAPI(apiBase, '/plants', { method: 'GET' }),
        machines: async () => callAPI(apiBase, '/machines', { method: 'GET' }),
        technicians: async () => callAPI(apiBase, '/technicians', { method: 'GET' }),
        // AGREGA ESTE BLOQUE DE CHAT:
        chat: {
            documents: async (payload) => callAPI(apiBase, '/chat/documents', { method: 'POST', body: JSON.stringify(payload) }),
            debug: async (payload) => callAPI(apiBase, '/chat/debug', { method: 'POST', body: JSON.stringify(payload) }),
        },
        // HASTA AQUÍ
        debug: {
            startSession: async (payload) => callAPI(apiBase, '/debug/sessions', { method: 'POST', body: JSON.stringify(payload) }),
        },
        reports: {
            send: async (payload) => callAPI(apiBase, '/reports/debug', { method: 'POST', body: JSON.stringify(payload) }),
            upload: async (payload) => callAPI(apiBase, '/reports/upload', { method: 'POST', body: JSON.stringify(payload) }),
        },
        user: {
            savePreferences: async (payload) => callAPI(apiBase, '/user/preferences', { method: 'PUT', body: JSON.stringify(payload) }),
        },
        lmBase,
    };
};
export default createApiService;
