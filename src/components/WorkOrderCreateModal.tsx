// @ts-nocheck

// =============================================================================
// IMPORTS
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { showToast } from './Toast'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

// =============================================================================
// TIPOS
// =============================================================================

// FIX: faltaba 'urgent' — es el valor máximo real del enum prioridad_ot en la
// BD (low/medium/high/urgent). Sin esto, nunca se podía crear una OT urgente
// desde este formulario.
type WorkOrderPriority = 'low' | 'medium' | 'high' | 'urgent'
type WorkOrderStatus = 'open' | 'in_progress' | 'done' | 'closed'

export type WorkOrderCreatePayload = {
  title: string
  disciplinaId: string
  machine: string
  tecnicoId: string
  priority: WorkOrderPriority
  status: WorkOrderStatus
  description: string
  photoFile?: File
}

type ApiDiscipline = { id: string; label: string }
type ApiMachine = { id: string; label: string; disciplinaId: string }
type ApiTechnician = { id: string; label: string }

interface WorkOrderCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (payload: WorkOrderCreatePayload) => Promise<void> | void
}

// =============================================================================
// CONSTANTES
// =============================================================================

const STORAGE_KEY = 'barb_form_cache'

const INITIAL_FORM: WorkOrderCreatePayload = {
  title: '',
  disciplinaId: '',
  machine: '',
  tecnicoId: '',
  priority: 'medium',
  status: 'open',
  description: '',
}

// =============================================================================
// UTILIDADES
// =============================================================================

function safeTrim(v: string) { return v.trim() }
function normalizeText(s: string) { return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') }

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], fileName, { type: blob.type })
}

// =============================================================================
// COMPONENTE PRINCIPAL: WORK ORDER CREATE MODAL
// =============================================================================

const WorkOrderCreateModal: React.FC<WorkOrderCreateModalProps> = ({ isOpen, onClose, onCreate }) => {
  const { lang, api } = useAppContext()
  const t = useMemo(() => getTranslations(lang), [lang])

  // ---------------------------------------------------------------------
  // Estados
  // ---------------------------------------------------------------------

  const [form, setForm] = useState<WorkOrderCreatePayload>({ ...INITIAL_FORM })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [disciplinas, setDisciplinas] = useState<ApiDiscipline[]>([])
  const [tecnicos, setTecnicos] = useState<ApiTechnician[]>([])
  const [machinesFiltradas, setMachinesFiltradas] = useState<ApiMachine[]>([])
  const [machines, setMachines] = useState<ApiMachine[]>([])

  const [machineQuery, setMachineQuery] = useState('')
  const [isMachineDropdownOpen, setIsMachineDropdownOpen] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const backdropDownOnBackdropRef = useRef(false)
  const selectedDisciplina = form.disciplinaId

  const machineFilteredByQuery = useMemo(() => {
    const q = normalizeText(machineQuery)
    if (!q) return machinesFiltradas
    return machinesFiltradas.filter(m => normalizeText(m.label).includes(q))
  }, [machineQuery, machinesFiltradas])

  // ---------------------------------------------------------------------
  // Efectos: catálogos, caché local, reseteo y filtrado
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    async function loadFromApi() {
      try {
        const [disciplinesRes, techniciansRes, machinesRes] = await Promise.all([
          api.disciplines(), api.technicians(), api.machines()
        ])

        if (cancelled) return

        setDisciplinas(Array.isArray(disciplinesRes) ? disciplinesRes.map((d: any) => ({ id: String(d.id ?? ''), label: String(d.name ?? d.label ?? '') })).filter(d => d.id && d.label) : [])
        setTecnicos(Array.isArray(techniciansRes) ? techniciansRes.map((t: any) => ({ id: String(t.id ?? ''), label: String(t.name ?? t.label ?? '') })).filter(t => t.id && t.label) : [])
        setMachines(Array.isArray(machinesRes) ? machinesRes.map((m: any) => ({ id: String(m.id ?? ''), label: String(m.name ?? m.label ?? ''), disciplinaId: String(m.disciplinaId ?? m.discipline_id ?? '') })).filter(m => m.id && m.label && m.disciplinaId) : [])
      } catch (e) {
        setFormError(t.common?.errorLoadingCatalogs || 'No se pudieron cargar los catálogos. Verifica la conexión.')
      }
    }
    void loadFromApi()
    return () => { cancelled = true }
  }, [isOpen, api, t.common])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    async function loadCache() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (!parsed?.form) return

        const { photoDataUrl, photoName, ...cachedRest } = parsed.form
        if (!cancelled) setForm(prev => ({ ...prev, ...cachedRest, photoFile: undefined }))

        if (photoDataUrl && photoName) {
          const file = await dataUrlToFile(photoDataUrl, photoName)
          if (!cancelled) {
            setForm(prev => ({ ...prev, photoFile: file }))
            setPhotoPreview(photoDataUrl)
          }
        }
      } catch (e) { console.error('Error leyendo caché', e) }
    }
    void loadCache()
    return () => { cancelled = true }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setSubmitting(false)
    setFormError('')
    setMachineQuery('')
    setIsMachineDropdownOpen(false)
    setPhotoPreview(null)
    if (!localStorage.getItem(STORAGE_KEY)) {
      setForm({ ...INITIAL_FORM, photoFile: undefined })
      setMachinesFiltradas([])
    }
  }, [isOpen])

  useEffect(() => {
    if (!form.disciplinaId) {
      setMachinesFiltradas([])
      setMachineQuery('')
      setForm(prev => ({ ...prev, machine: '' }))
      return
    }
    const filtered = machines.filter(m => String(m.disciplinaId) === String(form.disciplinaId))
    setMachinesFiltradas(filtered)
    if (form.machine && !filtered.some(m => m.id === form.machine)) {
      setForm(prev => ({ ...prev, machine: '' }))
    }
  }, [form.disciplinaId, machines, form.machine])

  useEffect(() => {
    if (!isOpen) return
    const write = async () => {
      try {
        let photoDataUrl, photoName
        if (form.photoFile) {
          photoDataUrl = await fileToDataUrl(form.photoFile)
          photoName = form.photoFile.name
        } else {
          photoDataUrl = photoPreview ?? undefined
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ form: { ...form, photoFile: undefined, photoDataUrl, photoName } }))
      } catch (e) { console.warn('No se pudo persistir la caché', e) }
    }
    void write()
  }, [isOpen, form, photoPreview])

  const showMachineDropdown = isMachineDropdownOpen && (machineFilteredByQuery.length > 0 || machineQuery.trim().length > 0)

  const canSubmit = safeTrim(form.title).length > 0 && safeTrim(form.description).length > 0 && !!form.disciplinaId && !!form.machine && !!form.tecnicoId

  // ---------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setFormError('')
    try {
      await onCreate({ ...form, title: safeTrim(form.title), description: safeTrim(form.description) })
      showToast(t.common?.success || 'Orden de Trabajo creada exitosamente', 'success')
      localStorage.removeItem(STORAGE_KEY)
      onClose()
    } catch (error) {
      setFormError(t.common?.error || 'No se pudo crear la OT. Inténtalo otra vez.')
      showToast('Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePhotoSelected = async (file: File | null) => {
    if (!file) return
    try {
      setForm(prev => ({ ...prev, photoFile: file }))
      setPhotoPreview(await fileToDataUrl(file))
      setFormError('')
    } catch (error) {
      setFormError('No se pudo leer la imagen seleccionada.')
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  if (!isOpen) return null

  return (
    <div className="modal-overlay open" onMouseDown={e => backdropDownOnBackdropRef.current = e.target === e.currentTarget} onMouseUp={e => { if (backdropDownOnBackdropRef.current && e.target === e.currentTarget) onClose(); backdropDownOnBackdropRef.current = false }} role="presentation">
      <div className="modal-box modal-box--form" role="dialog" aria-labelledby="modal-title">
        <div className="modal-header">
          <div>
            <h2 id="modal-title">{t.dashboard?.createWorkOrder || 'Crear OT'}</h2>
            <div className="modal-header-sub">{t.common?.fillDetails || 'Ingresa los detalles para generar y asignar la orden.'}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t.common?.close || 'Cerrar'}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="wo-form">
          <div className="modal-body modal-body--form">
            {formError && (
              <div className="form-error-banner" role="alert">
                {formError}
              </div>
            )}

            <div className="wo-form-grid">
              <div className="ot-detail-field">
                <div className="ot-detail-label">{t.common?.title || 'Título'}</div>
                <input className="form-input" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder={lang === 'en' ? "E.g. Motor D1 vibration inspection" : "Ej. Inspección de vibración motor D1"} required />
              </div>

              <div className="ot-detail-field">
                <div className="ot-detail-label">{lang === 'en' ? 'Discipline' : 'Disciplina'}</div>
                <select className="form-select" value={form.disciplinaId} onChange={e => setForm(prev => ({ ...prev, disciplinaId: e.target.value, machine: '' }))} required>
                  <option value="">{lang === 'en' ? 'Select a discipline' : 'Selecciona una disciplina'}</option>
                  {disciplinas.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>

              <div className="ot-detail-field ot-detail-field--relative">
                <div className="ot-detail-label">{t.common?.machine || 'Máquina'}</div>
                <input
                  className="form-input"
                  value={machineQuery}
                  onChange={e => { setMachineQuery(e.target.value); setIsMachineDropdownOpen(true) }}
                  placeholder={selectedDisciplina ? (t.common?.search || 'Buscar...') : (lang === 'en' ? 'Select a discipline first' : 'Selecciona una disciplina')}
                  disabled={!selectedDisciplina}
                  onFocus={() => { if (selectedDisciplina) setIsMachineDropdownOpen(true) }}
                  onClick={() => { if (selectedDisciplina) setIsMachineDropdownOpen(true) }}
                  required
                />
                {showMachineDropdown && (
                  <div className="wo-machine-dropdown">
                    {machineFilteredByQuery.length === 0 ? (
                      <div className="wo-machine-dropdown-empty">{lang === 'en' ? 'No results' : 'Sin resultados'}</div>
                    ) : (
                      machineFilteredByQuery.map(m => (
                        <button type="button" key={m.id} className="wo-machine-dropdown-item" onClick={() => { setForm(prev => ({ ...prev, machine: m.id })); setMachineQuery(m.label); setIsMachineDropdownOpen(false) }}>
                          {m.label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="ot-detail-field">
                <div className="ot-detail-label">{t.common?.technician || 'Técnico Asignado'}</div>
                <select className="form-select" value={form.tecnicoId} onChange={e => setForm(prev => ({ ...prev, tecnicoId: e.target.value }))} required>
                  <option value="">{lang === 'en' ? 'Select a technician' : 'Selecciona un técnico'}</option>
                  {tecnicos.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              <div className="ot-detail-field">
                <div className="ot-detail-label">{t.common?.priority || 'Prioridad'}</div>
                <select className="form-select" value={form.priority} onChange={e => setForm(prev => ({ ...prev, priority: e.target.value as WorkOrderPriority }))}>
                  <option value="low">{t.common?.low || 'Baja'}</option>
                  <option value="medium">{t.common?.medium || 'Media'}</option>
                  <option value="high">{t.common?.high || 'Alta'}</option>
                  <option value="urgent">{lang === 'en' ? 'Urgent' : 'Urgente'}</option>
                </select>
              </div>

              <div className="ot-detail-field">
                <div className="ot-detail-label">{t.common?.status || 'Estado Inicial'}</div>
                <select className="form-select" value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as WorkOrderStatus }))}>
                  <option value="open">{t.statuses?.open || 'Abierto'}</option>
                  <option value="in_progress">{t.statuses?.in_progress || 'En Progreso'}</option>
                  <option value="done">{t.statuses?.done || 'Hecho'}</option>
                  <option value="closed">{t.statuses?.closed || 'Cerrado'}</option>
                </select>
              </div>
            </div>

            <div className="wo-form-section">
              <div className="ot-detail-label wo-form-label">{t.common?.description || 'Descripción'}</div>
              <textarea className="report-textarea" rows={4} value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder={lang === 'en' ? "Describe the issue..." : "Describe la falla..."} required />
            </div>

            <div className="wo-form-section">
              <div className="ot-detail-label wo-form-label">{lang === 'en' ? 'Issue Photo (optional)' : 'Foto de la falla (opcional)'}</div>
              <div className="wo-photo-row">
                <label className="btn btn-outline">
                  📷 {lang === 'en' ? 'Attach' : 'Adjuntar'}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async e => await handlePhotoSelected(e.target.files?.[0] ?? null)} />
                </label>
                {photoPreview ? (
                  <div className="wo-photo-preview">
                    <img src={photoPreview} alt="Vista previa" />
                  </div>
                ) : <div className="wo-photo-empty">{lang === 'en' ? 'No photo' : 'Sin foto'}</div>}
              </div>
            </div>
          </div>

          <div className="modal-footer modal-footer--split">
            <div className="modal-footer-group">
              <button type="button" className="btn btn-outline" onClick={onClose}>{t.common?.cancel || 'Cancelar'}</button>
              <button type="button" className="btn" onClick={() => { setForm({ ...INITIAL_FORM, photoFile: undefined }); setMachineQuery(''); setPhotoPreview(null); localStorage.removeItem(STORAGE_KEY) }}>{lang === 'en' ? 'Clear' : 'Limpiar'}</button>
            </div>
            <button type="submit" className="btn btn-primary wo-submit-btn" disabled={submitting || !canSubmit}>
              {submitting ? (t.common?.loading || 'Guardando...') : (t.dashboard?.createWorkOrder || 'Crear OT')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default WorkOrderCreateModal