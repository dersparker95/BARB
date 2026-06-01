import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createApiService } from '../services/api';
import { showToast } from './Toast';
const api = createApiService('http://localhost:9000/api');
const STORAGE_KEY = 'barb_form_cache';
const INITIAL_FORM = {
    title: '',
    disciplinaId: '',
    machine: '',
    tecnicoId: '',
    priority: 'Medium',
    status: 'Open',
    description: '',
};
function safeTrim(v) {
    return v.trim();
}
function normalizeText(s) {
    return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
async function fileToDataUrl(file) {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
    });
}
async function dataUrlToFile(dataUrl, fileName) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type });
}
const WorkOrderCreateModal = ({ isOpen, onClose, onCreate }) => {
    const [form, setForm] = useState({ ...INITIAL_FORM });
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [disciplinas, setDisciplinas] = useState([]);
    const [tecnicos, setTecnicos] = useState([]);
    const [machinesFiltradas, setMachinesFiltradas] = useState([]);
    const [machines, setMachines] = useState([]);
    const [machineQuery, setMachineQuery] = useState('');
    const [isMachineDropdownOpen, setIsMachineDropdownOpen] = useState(false);
    const [photoPreview, setPhotoPreview] = useState(null);
    const backdropDownOnBackdropRef = useRef(false);
    const selectedDisciplina = form.disciplinaId;
    const machineFilteredByQuery = useMemo(() => {
        const q = normalizeText(machineQuery);
        if (!q)
            return machinesFiltradas;
        return machinesFiltradas.filter(m => normalizeText(m.label).includes(q));
    }, [machineQuery, machinesFiltradas]);
    // Cargar catálogos (disciplinas / técnicos + máquinas por mocks)
    useEffect(() => {
        if (!isOpen)
            return;
        let cancelled = false;
        async function loadFromApi() {
            try {
                const disciplinesRes = await api.disciplines();
                const techniciansRes = await api.technicians();
                const machinesRes = await api.machines();
                const parsedDisciplinas = Array.isArray(disciplinesRes)
                    ? disciplinesRes.map((d) => ({
                        id: String(d.id ?? ''),
                        label: String(d.name ?? d.label ?? ''),
                    }))
                    : [];
                const parsedTecnicos = Array.isArray(techniciansRes)
                    ? techniciansRes.map((t) => ({
                        id: String(t.id ?? ''),
                        label: String(t.name ?? t.label ?? ''),
                    }))
                    : [];
                const parsedMachines = Array.isArray(machinesRes)
                    ? machinesRes.map((m) => ({
                        id: String(m.id ?? ''),
                        label: String(m.name ?? m.label ?? ''),
                        disciplinaId: String(m.discipline_id ?? ''),
                    }))
                    : [];
                if (cancelled)
                    return;
                setDisciplinas(parsedDisciplinas.filter(d => d.id && d.label));
                setTecnicos(parsedTecnicos.filter(t => t.id && t.label));
                setMachines(parsedMachines.filter(m => m.id && m.label && m.disciplinaId));
            }
            catch (e) {
                console.error('Error cargando catálogos', e);
                setFormError('No se pudieron cargar los catálogos. Verifica que el backend esté disponible.');
                showToast('❌ No se pudieron cargar los catálogos (disciplinas/máquinas/técnicos)');
            }
        }
        void loadFromApi();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);
    // Cargar caché local
    useEffect(() => {
        if (!isOpen)
            return;
        let cancelled = false;
        async function loadCache() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw)
                    return;
                const parsed = JSON.parse(raw);
                if (!parsed?.form)
                    return;
                const cached = parsed.form;
                const nextBase = {
                    title: String(cached.title ?? ''),
                    disciplinaId: String(cached.disciplinaId ?? ''),
                    machine: String(cached.machine ?? ''),
                    tecnicoId: String(cached.tecnicoId ?? ''),
                    priority: cached.priority ?? 'Medium',
                    status: cached.status ?? 'Open',
                    description: String(cached.description ?? ''),
                };
                if (!cancelled) {
                    setForm(prev => ({ ...prev, ...nextBase, photoFile: undefined }));
                }
                if (cached.photoDataUrl && cached.photoName) {
                    const file = await dataUrlToFile(String(cached.photoDataUrl), String(cached.photoName));
                    if (!cancelled) {
                        setForm(prev => ({ ...prev, photoFile: file }));
                        setPhotoPreview(String(cached.photoDataUrl));
                    }
                }
            }
            catch (e) {
                console.error('Error leyendo caché', e);
            }
        }
        void loadCache();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);
    // Reset simple al abrir
    useEffect(() => {
        if (!isOpen)
            return;
        setSubmitting(false);
        setFormError('');
        setMachineQuery('');
        setIsMachineDropdownOpen(false);
        setPhotoPreview(null);
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            setForm({ ...INITIAL_FORM, photoFile: undefined });
            setMachinesFiltradas([]);
        }
    }, [isOpen]);
    // Filtrado cascada Disciplina -> Máquinas
    useEffect(() => {
        const disciplinaId = form.disciplinaId;
        if (!disciplinaId) {
            setMachinesFiltradas([]);
            setMachineQuery('');
            setForm(prev => ({ ...prev, machine: '' }));
            return;
        }
        const filtered = machines.filter(m => m.disciplinaId === disciplinaId);
        setMachinesFiltradas(filtered);
        if (form.machine && !filtered.some(m => m.id === form.machine)) {
            setForm(prev => ({ ...prev, machine: '' }));
        }
    }, [form.disciplinaId, machines, form.machine]);
    // Persistencia local
    useEffect(() => {
        if (!isOpen)
            return;
        const write = async () => {
            try {
                let photoDataUrl;
                let photoName;
                if (form.photoFile) {
                    photoDataUrl = await fileToDataUrl(form.photoFile);
                    photoName = form.photoFile.name;
                }
                else {
                    photoDataUrl = photoPreview ?? undefined;
                    photoName = undefined;
                }
                const payload = {
                    title: form.title,
                    disciplinaId: form.disciplinaId,
                    machine: form.machine,
                    tecnicoId: form.tecnicoId,
                    priority: form.priority,
                    status: form.status,
                    description: form.description,
                    photoDataUrl,
                    photoName,
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ form: payload }));
            }
            catch (e) {
                console.warn('No se pudo persistir la caché', e);
            }
        };
        void write();
    }, [
        isOpen,
        form.title,
        form.disciplinaId,
        form.machine,
        form.tecnicoId,
        form.priority,
        form.status,
        form.description,
        form.photoFile,
        photoPreview,
    ]);
    const showMachineDropdown = isMachineDropdownOpen && (machineFilteredByQuery.length > 0 || machineQuery.trim().length >= 0);
    const onPickMachine = (m) => {
        setForm(prev => ({ ...prev, machine: m.id }));
        setMachineQuery(m.label);
        setIsMachineDropdownOpen(false);
    };
    const canSubmit = safeTrim(form.title).length > 0 &&
        safeTrim(form.description).length > 0 &&
        !!form.disciplinaId &&
        !!form.machine &&
        !!form.tecnicoId;
    const handleSubmit = async (event) => {
        event.preventDefault();
        const title = safeTrim(form.title);
        const description = safeTrim(form.description);
        if (!title) {
            setFormError('Agrega un título para la OT.');
            showToast('⚠️ Agrega un título para la OT');
            return;
        }
        if (!description) {
            setFormError('Agrega los detalles para generar y asignar la orden.');
            showToast('⚠️ Agrega los detalles para generar y asignar la orden.');
            return;
        }
        setSubmitting(true);
        setFormError('');
        try {
            await onCreate({ ...form, title, description });
            localStorage.removeItem(STORAGE_KEY);
            onClose();
        }
        catch (error) {
            console.error('Error creating work order', error);
            setFormError('No se pudo crear la OT. Revisa la conexión con el backend e inténtalo otra vez.');
        }
        finally {
            setSubmitting(false);
        }
    };
    const handleOverlayMouseDown = (e) => {
        backdropDownOnBackdropRef.current = e.target === e.currentTarget;
    };
    const handleOverlayMouseUp = (e) => {
        const isBackdropClick = e.target === e.currentTarget;
        if (backdropDownOnBackdropRef.current && isBackdropClick)
            onClose();
        backdropDownOnBackdropRef.current = false;
    };
    const handlePhotoSelected = async (file) => {
        if (!file)
            return;
        try {
            setForm(prev => ({ ...prev, photoFile: file }));
            const dataUrl = await fileToDataUrl(file);
            setPhotoPreview(dataUrl);
            setFormError('');
        }
        catch (error) {
            console.error('Error procesando la foto', error);
            setFormError('No se pudo leer la imagen seleccionada.');
            showToast('❌ No se pudo leer la imagen seleccionada');
        }
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "modal-overlay open", onMouseDown: handleOverlayMouseDown, onMouseUp: handleOverlayMouseUp, role: "presentation", children: _jsxs("div", { className: "modal-box w-full max-w-lg p-2 sm:p-0 flex flex-col max-h-[92vh]", style: { maxWidth: 780 }, role: "dialog", "aria-modal": "true", children: [_jsxs("div", { className: "modal-header shrink-0", children: [_jsxs("div", { children: [_jsx("h2", { children: "Crear OT" }), _jsx("div", { style: { marginTop: 4, fontSize: 12, color: 'var(--ink3)' }, children: "Ingresa los detalles para generar y asignar la orden." })] }), _jsx("button", { type: "button", className: "modal-close", onClick: onClose, "aria-label": "Cerrar", children: "\u2715" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "flex flex-col min-h-0", children: [_jsxs("div", { className: "modal-body flex-1 overflow-y-auto", children: [formError ? (_jsx("div", { className: "mb-4 rounded-xl border border-red-700 bg-red-950/70 px-4 py-3 text-sm text-red-100", children: formError })) : null, _jsxs("div", { className: "ot-detail-grid grid grid-cols-1 sm:grid-cols-2", children: [_jsxs("div", { className: "ot-detail-field", children: [_jsx("div", { className: "ot-detail-label", children: "T\u00EDtulo" }), _jsx("input", { className: "form-input min-h-[48px] py-3", value: form.title, onChange: event => setForm(prev => ({ ...prev, title: event.target.value })), placeholder: "Ej. Inspecci\u00F3n de vibraci\u00F3n motor D1" })] }), _jsxs("div", { className: "ot-detail-field", children: [_jsx("div", { className: "ot-detail-label", children: "Disciplina" }), _jsxs("select", { className: "form-select min-h-[48px] py-3", value: form.disciplinaId, onChange: event => setForm(prev => ({ ...prev, disciplinaId: event.target.value, machine: '' })), "aria-label": "Seleccionar disciplina", children: [_jsx("option", { value: "", children: "Selecciona una disciplina" }), disciplinas.map(d => (_jsx("option", { value: d.id, children: d.label }, d.id)))] })] }), _jsxs("div", { className: "ot-detail-field", style: { position: 'relative' }, children: [_jsx("div", { className: "ot-detail-label", children: "M\u00E1quina" }), _jsx("input", { className: "form-input min-h-[48px] py-3", value: machineQuery, onChange: e => {
                                                        setMachineQuery(e.target.value);
                                                        setIsMachineDropdownOpen(true);
                                                    }, placeholder: selectedDisciplina ? 'Escribe para buscar una máquina...' : 'Selecciona una disciplina primero', disabled: !selectedDisciplina, onFocus: () => {
                                                        if (!selectedDisciplina)
                                                            return;
                                                        // Requisito 2: al abrir con focus/click, mostrar TODAS las máquinas de la disciplina aunque input esté vacío
                                                        setIsMachineDropdownOpen(true);
                                                        if (machineQuery === '') {
                                                            // mantiene máquinaQuery vacío para mostrar todas (machineFilteredByQuery -> todas si q vacío)
                                                        }
                                                    }, onClick: () => {
                                                        if (!selectedDisciplina)
                                                            return;
                                                        setIsMachineDropdownOpen(true);
                                                    }, "aria-label": "Buscar m\u00E1quina" }), showMachineDropdown && (_jsx("div", { className: "absolute left-0 right-0 z-50 mt-1 bg-white shadow-lg border border-gray-200 rounded-md", style: { maxHeight: 320, overflow: 'auto' }, role: "listbox", "aria-label": "Resultados de m\u00E1quinas", children: machineFilteredByQuery.length === 0 ? (_jsx("div", { className: "px-3 py-4 text-xs text-[var(--ink3)]", children: "Sin resultados" })) : (machineFilteredByQuery.map(m => (_jsx("button", { type: "button", role: "option", className: "w-full text-left px-3 py-3 min-h-[48px] hover:bg-[rgba(0,0,0,0.04)] border-b border-[rgba(0,0,0,0.06)]", onClick: () => onPickMachine(m), children: m.label }, m.id)))) }))] }), _jsxs("div", { className: "ot-detail-field", children: [_jsx("div", { className: "ot-detail-label", children: "T\u00E9cnico Asignado" }), _jsxs("select", { className: "form-select min-h-[48px] py-3", value: form.tecnicoId, onChange: event => setForm(prev => ({ ...prev, tecnicoId: event.target.value })), "aria-label": "Seleccionar t\u00E9cnico", children: [_jsx("option", { value: "", children: "Selecciona un t\u00E9cnico" }), tecnicos.map(t => (_jsx("option", { value: t.id, children: t.label }, t.id)))] })] }), _jsxs("div", { className: "ot-detail-field", children: [_jsx("div", { className: "ot-detail-label", children: "Prioridad" }), _jsxs("select", { className: "form-select min-h-[48px] py-3", value: form.priority, onChange: event => setForm(prev => ({ ...prev, priority: event.target.value })), "aria-label": "Seleccionar prioridad", children: [_jsx("option", { value: "Low", children: "Low" }), _jsx("option", { value: "Medium", children: "Medium" }), _jsx("option", { value: "High", children: "High" })] })] }), _jsxs("div", { className: "ot-detail-field", children: [_jsx("div", { className: "ot-detail-label", children: "Estado inicial" }), _jsxs("select", { className: "form-select min-h-[48px] py-3", value: form.status, onChange: event => setForm(prev => ({ ...prev, status: event.target.value })), "aria-label": "Seleccionar estado inicial", children: [_jsx("option", { value: "Open", children: "Open" }), _jsx("option", { value: "In Progress", children: "In Progress" }), _jsx("option", { value: "Done", children: "Done" }), _jsx("option", { value: "Closed", children: "Closed" })] })] })] }), _jsxs("div", { className: "mt-4 sm:mt-0", children: [_jsx("div", { className: "ot-detail-label", style: { marginBottom: 6 }, children: "Descripci\u00F3n" }), _jsx("textarea", { className: "report-textarea min-h-[48px] py-3", rows: 5, value: form.description, onChange: event => setForm(prev => ({ ...prev, description: event.target.value })), placeholder: "Describe la falla, hallazgo o trabajo preventivo..." })] }), _jsxs("div", { style: { marginTop: 14 }, children: [_jsx("div", { className: "ot-detail-label", style: { marginBottom: 6 }, children: "Foto de la falla (opcional)" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("label", { className: "btn btn-outline min-h-[48px] py-3 cursor-pointer inline-flex items-center", children: ["\uD83D\uDCF7 Capturar / Adjuntar", _jsx("input", { type: "file", accept: "image/*", capture: "environment", className: "hidden", onChange: async (e) => {
                                                                const file = e.target.files?.[0] ?? null;
                                                                await handlePhotoSelected(file);
                                                            } })] }), photoPreview ? (_jsx("div", { className: "w-16 h-16 border border-black rounded-lg overflow-hidden shadow-[4px_4px_0_0_rgba(0,0,0,0.1)]", children: _jsx("img", { src: photoPreview, alt: "Vista previa de la foto", className: "w-full h-full object-cover" }) })) : (_jsx("div", { className: "text-xs text-[var(--ink3)]", children: "Sin foto" }))] })] })] }), _jsx("div", { className: "modal-footer shrink-0", children: _jsxs("div", { className: "flex w-full gap-2 flex-col-reverse sm:flex-row", children: [_jsx("button", { type: "button", className: "btn btn-outline min-h-[48px] py-3", onClick: onClose, children: "Cancelar" }), _jsx("button", { type: "button", className: "btn min-h-[48px] py-3", onClick: () => {
                                            setForm({ ...INITIAL_FORM, photoFile: undefined });
                                            setMachineQuery('');
                                            setIsMachineDropdownOpen(false);
                                            setPhotoPreview(null);
                                            setMachinesFiltradas([]);
                                            localStorage.removeItem(STORAGE_KEY);
                                        }, children: "Limpiar Formulario" }), _jsx("button", { type: "submit", className: "btn btn-primary min-h-[48px] py-3 sm:ml-auto", disabled: submitting || !canSubmit, children: submitting ? (_jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx("span", { className: "animate-spin", children: "\u27F3" }), " Guardando..."] })) : ('Crear OT') })] }) })] })] }) }));
};
export default WorkOrderCreateModal;
