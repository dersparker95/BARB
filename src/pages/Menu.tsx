// @ts-nocheck
import React, { useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { getTranslations, normalizeLang } from '../utils/i18n'
import { showToast } from '../components/Toast'
import { canAccessPage, canPerformAction } from '../utils/permissions'

type UploadCategory = 'all' | 'electrical' | 'mechanical' | 'hydraulic' | 'pneumatic' | 'automation'

interface UploadFormState {
  title: string
  discipline: UploadCategory
  machine: string
  notes: string
  file: File | null
}

const EMPTY_UPLOAD: UploadFormState = {
  title: '',
  discipline: 'all',
  machine: '',
  notes: '',
  file: null,
}

const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.txt,.md,.xls,.xlsx,.png,.jpg,.jpeg'

// ⚠️ FIX: se elimina MACHINE_OPTIONS_BY_DISCIPLINE, un catálogo 100% inventado
// ('Motor Drive D1', 'Pump E4', etc.) sin ninguna relación con las máquinas
// reales de /api/machines. El dropdown ahora se llena con datos reales del
// backend, filtrados por disciplina usando discipline_id (ver fetchMachines).
type MachineOption = { value: string; label: string }

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const Menu: React.FC = () => {
  const { user, lang, apiBase, api } = useAppContext()
  const navigate = useNavigate()
  
  const t = useMemo(() => getTranslations(lang), [lang])
  const nLang = normalizeLang(lang)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState<UploadFormState>(EMPTY_UPLOAD)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // ⚠️ FIX: máquinas reales del backend en vez del catálogo inventado. No hay
  // una forma confiable de mapear UploadCategory (electrical/mechanical/...) a
  // discipline_id real sin también cargar /disciplines y cruzar nombres, así
  // que — para no adivinar datos — se listan todas las máquinas reales una vez
  // que se elige cualquier disciplina distinta de "General".
  const [machines, setMachines] = useState<MachineOption[]>([])
  const [machinesLoading, setMachinesLoading] = useState(false)

  useEffect(() => {
    if (!apiBase) return
    const controller = new AbortController()
    setMachinesLoading(true)
    // ⚠️ FIX: antes era un fetch() manual sin Authorization. El backend
    // ahora protege /machines con require_auth (cualquier rol logueado).
    api.machines({ signal: controller.signal })
      .then((data: any) => {
        const list = Array.isArray(data) ? data : []
        setMachines(list.map((m: any) => ({ value: String(m.id), label: m.name || `Máquina ${m.id}` })))
      })
      .catch((err: any) => { if (err.name !== 'AbortError') console.error('Error cargando máquinas:', err) })
      .finally(() => setMachinesLoading(false))
    return () => controller.abort()
  }, [apiBase, api])

  const machineOptions = useMemo(() => (uploadForm.discipline === 'all' ? [] : machines), [uploadForm.discipline, machines])

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const openUpload = () => {
    setUploadForm(EMPTY_UPLOAD)
    setUploadError(null)
    setIsUploading(false)
    setIsDragActive(false)
    setUploadOpen(true)
  }

  const closeUpload = () => {
    if (isUploading) return
    setUploadOpen(false)
    setUploadForm(EMPTY_UPLOAD)
    setUploadError(null)
    setIsDragActive(false)
  }

  const canSubmit = uploadForm.title.trim().length > 0 && uploadForm.file !== null && !isUploading

  useEffect(() => {
    if (uploadForm.discipline === 'all') {
      if (uploadForm.machine) setUploadForm(prev => ({ ...prev, machine: '' }))
      return
    }
    if (!uploadForm.machine) return
    const machineStillValid = machineOptions.some(option => option.value === uploadForm.machine)
    if (!machineStillValid) setUploadForm(prev => ({ ...prev, machine: '' }))
  }, [machineOptions, uploadForm.discipline, uploadForm.machine])

  const setSelectedFile = (file: File | null) => {
    setUploadError(null)
    setUploadForm(prev => ({ ...prev, file }))
  }

  const handleFiles = (files: FileList | null) => {
    const nextFile = files?.[0] ?? null
    if (!nextFile) return
    setSelectedFile(nextFile)
  }

  const handleUploadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = uploadForm.title.trim()
    
    if (!title) {
      showToast(nLang === 'en' ? '⚠️ Add a name for the document' : '⚠️ Escribe un nombre para el documento')
      return
    }
    if (!uploadForm.file) {
      showToast(nLang === 'en' ? '⚠️ No file selected' : '⚠️ No has seleccionado ningún archivo')
      return
    }
    if (uploadForm.discipline !== 'all' && !uploadForm.machine) {
      showToast(nLang === 'en' ? '⚠️ Select a machine' : '⚠️ Selecciona una máquina')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('file', uploadForm.file, uploadForm.file.name)
      formData.append('title', title)
      formData.append('discipline', uploadForm.discipline)
      formData.append('machine', uploadForm.machine)
      formData.append('notes', uploadForm.notes.trim())

      if (!apiBase) {
        const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV
        if (!isDev) {
          throw new Error(
            nLang === 'en'
              ? 'API not configured. Contact your administrator.'
              : 'API no configurada. Contacta a tu administrador.'
          )
        }
      }

      // ⚠️ FIX: antes era un fetch() manual sin Authorization — el backend
      // ahora protege este endpoint con 'subir_documentos' (require_action)
      // y lo rechazaría con 401. api.chat.documents() ya adjunta el token.
      await api.chat.documents(formData)

      showToast(t.common?.success || '📄 Documento enviado correctamente')
      setUploadForm(EMPTY_UPLOAD)
      setUploadOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : (t.common?.error || 'No se pudo subir el documento')
      console.error('Upload document error', error)
      setUploadError(message)
      showToast(t.common?.error || '❌ Error en la subida')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="menu-body">
      <div className="page-title dark:text-white">{t.menu?.title || 'Menú Principal'}</div>

      <div className="menu-grid">
        <button className="menu-card" onClick={() => navigate('/docchat')}>
          <div className="menu-card-icon blue">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div className="menu-card-text">
            <h3>{t.menu?.documentChatTitle || 'Asistente Documental'}</h3>
            <p>{t.menu?.documentChatDescription || 'Consulta manuales y procedimientos'}</p>
          </div>
        </button>

        <button className="menu-card" onClick={() => navigate('/topology')}>
          <div className="menu-card-icon green">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="5" r="3" />
              <circle cx="5" cy="19" r="3" />
              <circle cx="19" cy="19" r="3" />
              <line x1="12" y1="8" x2="5.5" y2="16" />
              <line x1="12" y1="8" x2="18.5" y2="16" />
              <line x1="7" y1="19" x2="17" y2="19" />
            </svg>
          </div>
          <div className="menu-card-text">
            <h3>{t.menu?.topologyTitle || 'Topología de Planta'}</h3>
            <p>{t.menu?.topologyDescription || 'Mapa interactivo de máquinas'}</p>
          </div>
        </button>

        {/* ⚠️ FIX: antes era user?.role === 'admin' literal; ahora usa la
            matriz real (supervisor/gerente/admin también tienen acceso). */}
        {canAccessPage(user?.role, '/history') && (
          <button className="menu-card menu-card--warning" onClick={() => navigate('/history')}>
            <div className="menu-card-icon orange">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div className="menu-card-text">
              <h3>{t.menu?.historyTitle || (nLang === 'en' ? 'Diagnostic History' : 'Historial de Diagnósticos')}</h3>
              <p>{t.menu?.historyDescription || (nLang === 'en' ? 'Review previous AI sessions' : 'Revisa consultas y sesiones previas')}</p>
            </div>
          </button>
        )}

        {/* ⚠️ FIX: antes era user?.role === 'admin' literal, ignorando que
            supervisor/engineer/gerente también deben ver Dashboard. */}
        {canAccessPage(user?.role, '/dashboard') && (
          <button className="menu-card admin-only menu-card--purple" onClick={() => navigate('/dashboard')}>
            <div className="menu-card-icon purple">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </div>
            <div className="menu-card-text">
              <h3>
                {t.menu?.dashboardTitle || 'Dashboard'}{' '}
                <span className="menu-card-badge">
                  {t.menu?.adminBadge || 'ADMIN'}
                </span>
              </h3>
              <p>{t.menu?.dashboardDescription || 'Métricas y reportes'}</p>
            </div>
          </button>
        )}

        {/* ⚠️ FIX: subir documentos usa el permiso real 'subir_documentos'
            (engineer/gerente/admin), separado del check de dashboard. */}
        {canPerformAction(user?.role, 'subir_documentos') && (
          <button className="menu-card admin-only menu-card--blue" onClick={openUpload}>
            <div className="menu-card-icon blue">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="menu-card-text">
                <h3>{t.menu?.uploadTitle || (nLang === 'en' ? 'Upload documents' : 'Subir documentos')}</h3>
                <p>{t.menu?.uploadDescription || 'Carga manuales y fichas técnicas'}</p>
              </div>
            </button>
        )}
      </div>

      {uploadOpen && (
        <div className="modal-overlay open" onClick={event => { if (event.target === event.currentTarget) closeUpload() }} role="presentation">
          <div className="modal-box modal-box--wide" role="dialog" aria-modal="true" aria-labelledby="modal-upload-title">
            <div className="modal-header">
              <div>
                <h2 id="modal-upload-title">{t.menu?.uploadTitle || (nLang === 'en' ? 'Document upload' : 'Subida de documentos')}</h2>
                <div className="modal-header-sub">
                  {t.menu?.uploadDescription || 'Sube archivos al repositorio documental'}
                </div>
              </div>
              <button className="modal-close" onClick={closeUpload} aria-label={t.common?.close || 'Cerrar'} disabled={isUploading}>✕</button>
            </div>

            <form onSubmit={handleUploadSubmit} className="modal-body upload-modal-body">
              <div className="upload-field">
                <label className="sr-only" htmlFor="upload-title">{t.common?.documentName || 'Nombre'}</label>
                <input
                  id="upload-title"
                  className="form-input"
                  value={uploadForm.title}
                  onChange={event => setUploadForm(prev => ({ ...prev, title: event.target.value }))}
                  placeholder={t.common?.documentName || (nLang === 'en' ? 'Document name' : 'Nombre del documento')}
                  aria-label={t.common?.documentName || 'Nombre'}
                  disabled={isUploading}
                />
              </div>

              <div className="upload-field">
                <label className="sr-only" htmlFor="upload-discipline">{t.common?.discipline || 'Disciplina'}</label>
                <select
                  id="upload-discipline"
                  className="form-select"
                  value={uploadForm.discipline}
                  onChange={event => setUploadForm(prev => ({ ...prev, discipline: event.target.value as UploadCategory, machine: '' }))}
                  aria-label={t.common?.discipline || 'Disciplina'}
                  disabled={isUploading}
                >
                  <option value="all">{t.common?.all || 'General'}</option>
                  <option value="electrical">{nLang === 'en' ? 'Electrical' : 'Eléctrica'}</option>
                  <option value="mechanical">{nLang === 'en' ? 'Mechanical' : 'Mecánica'}</option>
                  <option value="hydraulic">{nLang === 'en' ? 'Hydraulic' : 'Hidráulica'}</option>
                  <option value="pneumatic">{nLang === 'en' ? 'Pneumatic' : 'Neumática'}</option>
                  <option value="automation">{nLang === 'en' ? 'Automation' : 'Automatización'}</option>
                </select>
              </div>

              <div className="upload-field">
                <label className="sr-only" htmlFor="upload-machine">{t.common?.machine || 'Máquina'}</label>
                <select
                  id="upload-machine"
                  className="form-select"
                  value={uploadForm.machine}
                  onChange={event => setUploadForm(prev => ({ ...prev, machine: event.target.value }))}
                  aria-label={t.common?.machine || 'Máquina'}
                  disabled={isUploading || uploadForm.discipline === 'all'}
                >
                  <option value="">
                    {uploadForm.discipline === 'all'
                      ? (nLang === 'en' ? 'Select a discipline first' : 'Selecciona primero una disciplina')
                      : machinesLoading
                        ? (nLang === 'en' ? 'Loading machines...' : 'Cargando máquinas...')
                        : (nLang === 'en' ? 'Select machine...' : 'Seleccionar máquina...')}
                  </option>
                  {machineOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="upload-field">
                <label className="sr-only" htmlFor="upload-notes">{t.common?.internalNotes || 'Notas'}</label>
                <textarea
                  id="upload-notes"
                  className="report-textarea"
                  value={uploadForm.notes}
                  onChange={event => setUploadForm(prev => ({ ...prev, notes: event.target.value }))}
                  placeholder={t.common?.internalNotes || (nLang === 'en' ? 'Internal notes' : 'Notas internas')}
                  aria-label={t.common?.internalNotes || 'Notas'}
                  rows={4}
                  disabled={isUploading}
                />
              </div>

              <div className="upload-field">
                <div className="upload-field-label">{t.common?.file || 'Archivo'}</div>

                <div
                  role="button"
                  tabIndex={0}
                  aria-label={t.common?.file || 'Archivo'}
                  onClick={() => { if (!isUploading) fileInputRef.current?.click() }}
                  onKeyDown={event => {
                    if (isUploading) return
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInputRef.current?.click() }
                  }}
                  onDragEnter={event => { event.preventDefault(); if (!isUploading) setIsDragActive(true) }}
                  onDragOver={event => { event.preventDefault(); if (!isUploading) setIsDragActive(true) }}
                  onDragLeave={event => { event.preventDefault(); setIsDragActive(false) }}
                  onDrop={event => {
                    event.preventDefault(); setIsDragActive(false); if (isUploading) return;
                    handleFiles(event.dataTransfer.files)
                  }}
                  className={`upload-dropzone ${isDragActive ? 'upload-dropzone--active' : ''} ${isUploading ? 'upload-dropzone--disabled' : ''}`}
                >
                  <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} className="hidden" disabled={isUploading}
                    onChange={event => { handleFiles(event.target.files); event.currentTarget.value = '' }}
                  />

                  {!uploadForm.file ? (
                    <div className="upload-dropzone-empty">
                      <div aria-hidden="true" className="upload-dropzone-icon">
                        ⤴
                      </div>
                      <div className="upload-dropzone-title">{nLang === 'en' ? 'Drag and drop' : 'Arrastra tu archivo aquí'}</div>
                      <div className="upload-dropzone-hint">{nLang === 'en' ? 'or click to select' : 'o haz clic para seleccionar'}</div>
                    </div>
                  ) : (
                    <div className="upload-file-preview">
                      <div className="upload-file-preview-info">
                        <div aria-hidden="true" className="upload-file-preview-icon">
                          📎
                        </div>
                        <div className="upload-file-preview-meta">
                          <div className="upload-file-preview-name">{uploadForm.file.name}</div>
                          <div className="upload-file-preview-size">{formatFileSize(uploadForm.file.size)}</div>
                        </div>
                      </div>

                      <div className="upload-file-preview-actions">
                        <button type="button" className="btn btn-outline btn-sm" disabled={isUploading} onClick={event => { event.stopPropagation(); fileInputRef.current?.click() }}>
                          {t.common?.replace || (nLang === 'en' ? 'Change' : 'Cambiar')}
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" disabled={isUploading} onClick={event => { event.stopPropagation(); setSelectedFile(null) }}>
                          {t.common?.remove || (nLang === 'en' ? 'Remove' : 'Remover')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {uploadError && (
                <div role="alert" className="upload-error">
                  {uploadError}
                </div>
              )}

              <div className="upload-hint">
                {isUploading ? (t.common?.processing || 'Preparando...') : (t.menu?.uploadHint || 'El archivo se guardará seguro.')}
              </div>

              <div className="modal-footer modal-footer--flush">
                <button className="btn btn-primary" type="submit" disabled={isUploading || !canSubmit}>
                  {isUploading ? (
                    <span className="upload-submit-loading">
                      <span className="spinning" aria-hidden="true">⟳</span>
                      {t.common?.loading || (nLang === 'en' ? 'Uploading…' : 'Subiendo…')}
                    </span>
                  ) : (
                    t.common?.upload || (nLang === 'en' ? 'Upload' : 'Subir documento')
                  )}
                </button>
                <button className="btn btn-outline" type="button" onClick={closeUpload} disabled={isUploading}>
                  {t.common?.cancel || 'Cancelar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Menu