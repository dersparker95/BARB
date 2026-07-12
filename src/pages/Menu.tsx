// @ts-nocheck

// =============================================================================
// IMPORTS
// =============================================================================

import React, { useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { getTranslations, normalizeLang } from '../utils/i18n'
import { showToast } from '../components/Toast'

// =============================================================================
// TIPOS
// =============================================================================

interface UploadFormState {
  title: string
  // discipline_id / maquina_id reales (como string, por el <select>), no los
  // slugs inventados que había antes ('electrical', 'pump_e4', etc.) — esos
  // no correspondían a ninguna fila real de las tablas disciplina/maquina,
  // así que el filtrado de RAG por equipo nunca podría haber funcionado.
  discipline: string
  machine: string
  notes: string
  file: File | null
}

type CatalogOption = { id: number; name: string }
type MachineCatalogOption = { id: number; name: string; discipline_id: number | null }

// =============================================================================
// CONSTANTES
// =============================================================================

const EMPTY_UPLOAD: UploadFormState = {
  title: '',
  discipline: '',
  machine: '',
  notes: '',
  file: null,
}

// Solo PDF y DOCX se indexan en el vectorial hoy (ver upload_document en el
// backend) — los demás formatos que antes se aceptaban acá (.doc viejo,
// .txt, .md, .xls/.xlsx, imágenes) se guardarían pero nunca se indexarían,
// así que se sacan del selector para no prometer algo que no pasa.
const ACCEPTED_FILE_TYPES = '.pdf,.docx'

// =============================================================================
// UTILIDADES
// =============================================================================

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// =============================================================================
// COMPONENTE PRINCIPAL: MENU
// =============================================================================

const Menu: React.FC = () => {
  const { user, lang, api } = useAppContext()
  const navigate = useNavigate()

  const t = useMemo(() => getTranslations(lang), [lang])
  const nLang = normalizeLang(lang)

  // ---------------------------------------------------------------------
  // Estados del formulario de subida de documentos
  // ---------------------------------------------------------------------

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState<UploadFormState>(EMPTY_UPLOAD)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Catálogos reales de disciplina/máquina (antes eran listas hardcodeadas
  // con slugs que no correspondían a ninguna fila real en la base de datos).
  const [disciplines, setDisciplines] = useState<CatalogOption[]>([])
  const [machines, setMachines] = useState<MachineCatalogOption[]>([])

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ---------------------------------------------------------------------
  // Carga de catálogos (solo si el usuario puede subir documentos, ya que
  // el formulario de subida está detrás de user?.role === 'admin')
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (user?.role !== 'admin') return
    let cancelled = false

    const loadCatalogs = async () => {
      try {
        const [disciplinesData, machinesData] = await Promise.all([
          api.disciplines(),
          api.machines(),
        ])
        if (cancelled) return
        setDisciplines((disciplinesData || []).map((d: any) => ({ id: d.id, name: d.name })))
        setMachines((machinesData || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          discipline_id: m.discipline_id ?? null,
        })))
      } catch (error) {
        console.error('Error cargando catálogos de disciplina/máquina:', error)
      }
    }

    loadCatalogs()
    return () => { cancelled = true }
  }, [user?.role, api])

  // ---------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------

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
  const machineOptions = useMemo(() => {
    if (!uploadForm.discipline) return []
    const disciplineId = Number(uploadForm.discipline)
    return machines
      .filter(m => m.discipline_id === disciplineId)
      .map(m => ({ value: String(m.id), label: m.name }))
  }, [machines, uploadForm.discipline])

  useEffect(() => {
    if (!uploadForm.discipline) {
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
    if (uploadForm.discipline && !uploadForm.machine) {
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

      // Usa el endpoint de api.chat.documents, que ya adjunta el token Bearer,
      // en vez de un fetch manual.
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

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  return (
    <div className="menu-body">
      <div className="page-title">{t.menu?.title || 'Menú Principal'}</div>

      <div className="menu-grid">
        <button className="menu-card" onClick={() => navigate('/docchat')}>
          <div className="menu-card-icon blue">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" aria-hidden="true">
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
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" aria-hidden="true">
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

        <button className="menu-card" onClick={() => navigate('/session-history')}>
          <div className="menu-card-icon blue">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 16 14" />
            </svg>
          </div>
          <div className="menu-card-text">
            <h3>{t.menu?.sessionHistoryTitle || 'Historial de Sesiones'}</h3>
            <p>{t.menu?.sessionHistoryDescription || 'Revisa conversaciones y diagnósticos anteriores'}</p>
          </div>
        </button>

        {user?.role === 'admin' && (
          <>
            <button className="menu-card menu-card--purple" onClick={() => navigate('/dashboard')}>
              <div className="menu-card-icon purple">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </div>
              <div className="menu-card-text">
                <h3>
                  {t.menu?.dashboardTitle || 'Dashboard'}{' '}
                  <span className="menu-card-badge">{t.menu?.adminBadge || 'ADMIN'}</span>
                </h3>
                <p>{t.menu?.dashboardDescription || 'Métricas y reportes'}</p>
              </div>
            </button>

            <button className="menu-card menu-card--blue" onClick={openUpload}>
              <div className="menu-card-icon blue">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" aria-hidden="true">
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
          </>
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

            <form onSubmit={handleUploadSubmit} className="modal-body upload-form">
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
                  onChange={event => setUploadForm(prev => ({ ...prev, discipline: event.target.value, machine: '' }))}
                  aria-label={t.common?.discipline || 'Disciplina'}
                  disabled={isUploading}
                >
                  <option value="">{t.common?.all || 'General'}</option>
                  {disciplines.map(d => (
                    <option key={d.id} value={String(d.id)}>{d.name}</option>
                  ))}
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
                  disabled={isUploading || !uploadForm.discipline}
                >
                  <option value="">
                    {!uploadForm.discipline
                      ? (nLang === 'en' ? 'Select a discipline first' : 'Selecciona primero una disciplina')
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
                  className="form-input form-input--resizable"
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
                      <div className="upload-dropzone-icon" aria-hidden="true">⤴</div>
                      <div className="upload-dropzone-title">{nLang === 'en' ? 'Drag and drop' : 'Arrastra tu archivo aquí'}</div>
                      <div className="upload-dropzone-hint">{nLang === 'en' ? 'or click to select' : 'o haz clic para seleccionar'}</div>
                    </div>
                  ) : (
                    <div className="upload-file-row">
                      <div className="upload-file-info">
                        <div className="upload-file-icon" aria-hidden="true">📎</div>
                        <div className="upload-file-meta">
                          <div className="upload-file-name">{uploadForm.file.name}</div>
                          <div className="upload-file-size">{formatFileSize(uploadForm.file.size)}</div>
                        </div>
                      </div>

                      <div className="upload-file-actions">
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
                <div role="alert" className="form-error-banner">
                  {uploadError}
                </div>
              )}

              <div className="upload-hint">
                {isUploading ? (t.common?.processing || 'Preparando...') : (t.menu?.uploadHint || 'El archivo se guardará seguro.')}
              </div>

              <div className="modal-footer modal-footer--plain">
                <button className="btn btn-primary" type="submit" disabled={isUploading || !canSubmit}>
                  {isUploading ? (
                    <span className="btn-loading-content">
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