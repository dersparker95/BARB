import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { getTranslations, normalizeLang } from '../utils/i18n'
import { showToast } from '../components/Toast'

type UploadCategory = 'all' | 'electrical' | 'mechanical' | 'hydraulic' | 'pneumatic' | 'automation'

interface UploadFormState {
  title: string
  discipline: UploadCategory
  machine: string
  notes: string
  file: File | null
}

interface UploadCopy {
  uploadTitle: string
  uploadDescription: string
  uploadName: string
  uploadDiscipline: string
  uploadMachine: string
  uploadNotes: string
  uploadFile: string
  uploadSubmit: string
  uploadCancel: string
  uploadHint: string
  uploadSuccess: string
  uploadError: string
  uploadDragTitle: string
  uploadDragHint: string
  uploadReplace: string
  uploadRemove: string
  uploadPreparing: string
}

const EMPTY_UPLOAD: UploadFormState = {
  title: '',
  discipline: 'all',
  machine: '',
  notes: '',
  file: null,
}

const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.txt,.md,.xls,.xlsx,.png,.jpg,.jpeg'

type MachineOption = { value: string; label: string }

const MACHINE_OPTIONS_BY_DISCIPLINE: Record<Exclude<UploadCategory, 'all'>, MachineOption[]> = {
  electrical: [
    { value: 'motor_drive_d1', label: 'Motor Drive D1' },
    { value: 'mcc_01', label: 'MCC-01' },
    { value: 'tablero_fuerza_a', label: 'Tablero de Fuerza A' },
  ],
  mechanical: [
    { value: 'pump_e4', label: 'Pump E4' },
    { value: 'chancador_primario', label: 'Chancador Primario' },
    { value: 'harnero_vibratorio', label: 'Harnero Vibratorio' },
  ],
  hydraulic: [
    { value: 'pump_e4', label: 'Pump E4' },
    { value: 'unidad_hidraulica_h1', label: 'Unidad Hidráulica H1' },
  ],
  pneumatic: [
    { value: 'compresor_p1', label: 'Compresor Principal P1' },
    { value: 'linea_aire_a1', label: 'Línea de Aire A1' },
  ],
  automation: [
    { value: 'plc_linea_1', label: 'PLC Línea 1' },
    { value: 'hmi_central', label: 'HMI Central' },
  ],
}

const getMachineOptions = (discipline: UploadCategory): MachineOption[] => {
  if (discipline === 'all') return []
  return MACHINE_OPTIONS_BY_DISCIPLINE[discipline]
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const getUploadCopy = (lang: string): UploadCopy =>
  lang === 'es'
    ? {
        uploadTitle: 'Subida de documentos',
        uploadDescription: 'Carga manuales, fichas técnicas o procedimientos para el asistente documental.',
        uploadName: 'Nombre del documento',
        uploadDiscipline: 'Disciplina',
        uploadMachine: 'Máquina',
        uploadNotes: 'Notas internas',
        uploadFile: 'Archivo',
        uploadSubmit: 'Subir documento',
        uploadCancel: 'Cancelar',
        uploadHint: 'El archivo se guardará en el repositorio documental.',
        uploadSuccess: '📄 Documento enviado correctamente',
        uploadError: '❌ No se pudo subir el documento',
        uploadDragTitle: 'Arrastra y suelta tu archivo aquí',
        uploadDragHint: 'o haz clic para seleccionar un archivo',
        uploadReplace: 'Cambiar archivo',
        uploadRemove: 'Remover archivo',
        uploadPreparing: 'Preparando subida…',
      }
    : {
        uploadTitle: 'Document upload',
        uploadDescription: 'Upload manuals, technical sheets or procedures for the document assistant.',
        uploadName: 'Document name',
        uploadDiscipline: 'Discipline',
        uploadMachine: 'Machine',
        uploadNotes: 'Internal notes',
        uploadFile: 'File',
        uploadSubmit: 'Upload document',
        uploadCancel: 'Cancel',
        uploadHint: 'The file will be stored in the document repository.',
        uploadSuccess: '📄 Document uploaded successfully',
        uploadError: '❌ Could not upload the document',
        uploadDragTitle: 'Drag and drop your file here',
        uploadDragHint: 'or click to select a file',
        uploadReplace: 'Change file',
        uploadRemove: 'Remove file',
        uploadPreparing: 'Preparing upload…',
      }

const Menu: React.FC = () => {
  const { user, lang, apiBase } = useAppContext()
  const navigate = useNavigate()
  const t = useMemo(() => getTranslations(lang), [lang])
  const copy = useMemo(() => getUploadCopy(lang), [lang])

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState<UploadFormState>(EMPTY_UPLOAD)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

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

  const machineOptions = useMemo(() => getMachineOptions(uploadForm.discipline), [uploadForm.discipline])

  useEffect(() => {
    if (uploadForm.discipline === 'all') {
      if (uploadForm.machine) {
        setUploadForm(prev => ({ ...prev, machine: '' }))
      }
      return
    }

    if (!uploadForm.machine) return
    const machineStillValid = machineOptions.some(option => option.value === uploadForm.machine)
    if (!machineStillValid) {
      setUploadForm(prev => ({ ...prev, machine: '' }))
    }
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
      showToast(lang === 'es' ? '⚠️ Escribe un nombre para el documento' : '⚠️ Add a name for the document')
      return
    }

    if (!uploadForm.file) {
      showToast(lang === 'es' ? '⚠️ No has seleccionado ningún archivo' : '⚠️ No file selected')
      return
    }

    if (uploadForm.discipline !== 'all' && !uploadForm.machine) {
      showToast(lang === 'es' ? '⚠️ Selecciona una máquina' : '⚠️ Select a machine')
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

      const response = await fetch(`${apiBase.replace(/\/$/, '')}/documents/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(await response.text().catch(() => response.statusText))
      }

      showToast(copy.uploadSuccess)
      setUploadForm(EMPTY_UPLOAD)
      setUploadOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.uploadError
      console.error('Upload document error', error)
      setUploadError(message)
      showToast(copy.uploadError)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="menu-body">
      <div className="page-title dark:text-white">{t.menu.title}</div>

      <div className="menu-grid">
        <button className="menu-card" onClick={() => navigate('/docchat')}>
          <div className="menu-card-icon blue">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a5fa8" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div className="menu-card-text">
            <h3>{t.menu.documentChatTitle}</h3>
            <p>{t.menu.documentChatDescription}</p>
          </div>
        </button>

        <button className="menu-card" onClick={() => navigate('/topology')}>
          <div className="menu-card-icon green">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a7a50" strokeWidth="2">
              <circle cx="12" cy="5" r="3" />
              <circle cx="5" cy="19" r="3" />
              <circle cx="19" cy="19" r="3" />
              <line x1="12" y1="8" x2="5.5" y2="16" />
              <line x1="12" y1="8" x2="18.5" y2="16" />
              <line x1="7" y1="19" x2="17" y2="19" />
            </svg>
          </div>
          <div className="menu-card-text">
            <h3>{t.menu.topologyTitle}</h3>
            <p>{t.menu.topologyDescription}</p>
          </div>
        </button>

        {user?.role === 'admin' && (
          <>
            <button
              className="menu-card admin-only"
              onClick={() => navigate('/dashboard')}
              style={{ borderColor: 'rgba(94,61,179,0.3)' }}
            >
              <div className="menu-card-icon purple">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5e3db3" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </div>
              <div className="menu-card-text">
                <h3>
                  {t.menu.dashboardTitle}{' '}
                  <span
                    style={{
                      fontSize: '10px',
                      background: 'var(--purple-bg)',
                      color: 'var(--purple)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 600,
                      marginLeft: '4px',
                    }}
                  >
                    {t.menu.adminBadge}
                  </span>
                </h3>
                <p>{t.menu.dashboardDescription}</p>
              </div>
            </button>

            <button className="menu-card admin-only" onClick={openUpload} style={{ borderColor: 'rgba(26,95,168,0.22)' }}>
              <div className="menu-card-icon blue">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a5fa8" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="menu-card-text">
                <h3>{lang === 'es' ? 'Subir documentos' : 'Upload documents'}</h3>
                <p>{copy.uploadDescription}</p>
              </div>
            </button>
          </>
        )}
      </div>

      {uploadOpen && (
        <div
          className="modal-overlay open"
          onClick={event => {
            if (event.target === event.currentTarget) closeUpload()
          }}
          role="presentation"
        >
          <div className="modal-box" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <div>
                <h2>{copy.uploadTitle}</h2>
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink3)' }}>{copy.uploadDescription}</div>
              </div>
              <button className="modal-close" onClick={closeUpload} aria-label={t.common.close} disabled={isUploading}>
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="modal-body" style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="sr-only" htmlFor="upload-title">
                  {copy.uploadName}
                </label>
                <input
                  id="upload-title"
                  className="form-input"
                  value={uploadForm.title}
                  onChange={event => setUploadForm(prev => ({ ...prev, title: event.target.value }))}
                  placeholder={copy.uploadName}
                  aria-label={copy.uploadName}
                  disabled={isUploading}
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label className="sr-only" htmlFor="upload-discipline">
                  {copy.uploadDiscipline}
                </label>
                <select
                  id="upload-discipline"
                  className="form-select"
                  value={uploadForm.discipline}
                  onChange={event =>
                    setUploadForm(prev => ({
                      ...prev,
                      discipline: event.target.value as UploadCategory,
                      machine: '',
                    }))
                  }
                  aria-label={copy.uploadDiscipline}
                  disabled={isUploading}
                >
                  <option value="all">{t.common.all}</option>
                  <option value="electrical">Electrical</option>
                  <option value="mechanical">Mechanical</option>
                  <option value="hydraulic">Hydraulic</option>
                  <option value="pneumatic">Pneumatic</option>
                  <option value="automation">Automation</option>
                </select>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label className="sr-only" htmlFor="upload-machine">
                  {copy.uploadMachine}
                </label>
                <select
                  id="upload-machine"
                  className="form-select"
                  value={uploadForm.machine}
                  onChange={event => setUploadForm(prev => ({ ...prev, machine: event.target.value }))}
                  aria-label={copy.uploadMachine}
                  disabled={isUploading || uploadForm.discipline === 'all'}
                >
                  <option value="">{uploadForm.discipline === 'all' ? (lang === 'es' ? 'Selecciona primero una disciplina' : 'Select a discipline first') : `${lang === 'es' ? 'Seleccionar' : 'Select'} ${copy.uploadMachine.toLowerCase()}...`}</option>
                  {machineOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label className="sr-only" htmlFor="upload-notes">
                  {copy.uploadNotes}
                </label>
                <textarea
                  id="upload-notes"
                  className="form-input"
                  value={uploadForm.notes}
                  onChange={event => setUploadForm(prev => ({ ...prev, notes: event.target.value }))}
                  placeholder={copy.uploadNotes}
                  aria-label={copy.uploadNotes}
                  rows={4}
                  style={{ resize: 'vertical', minHeight: 96 }}
                  disabled={isUploading}
                />
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>{copy.uploadFile}</div>

                <div
                  role="button"
                  tabIndex={0}
                  aria-label={copy.uploadFile}
                  onClick={() => {
                    if (!isUploading) fileInputRef.current?.click()
                  }}
                  onKeyDown={event => {
                    if (isUploading) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      fileInputRef.current?.click()
                    }
                  }}
                  onDragEnter={event => {
                    event.preventDefault()
                    if (!isUploading) setIsDragActive(true)
                  }}
                  onDragOver={event => {
                    event.preventDefault()
                    if (!isUploading) setIsDragActive(true)
                  }}
                  onDragLeave={event => {
                    event.preventDefault()
                    setIsDragActive(false)
                  }}
                  onDrop={event => {
                    event.preventDefault()
                    setIsDragActive(false)
                    if (isUploading) return
                    handleFiles(event.dataTransfer.files)
                  }}
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: 16,
                    padding: 16,
                    minHeight: 148,
                    background: isDragActive ? 'var(--blue-bg)' : 'var(--surface)',
                    boxShadow: isDragActive ? '0 0 0 2px rgba(26,95,168,0.12) inset' : 'none',
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    transition: 'background 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    className="hidden"
                    disabled={isUploading}
                    onChange={event => {
                      handleFiles(event.target.files)
                      event.currentTarget.value = ''
                    }}
                  />

                  {!uploadForm.file ? (
                    <div style={{ textAlign: 'center', display: 'grid', gap: 8, justifyItems: 'center' }}>
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 999,
                          border: '2px solid var(--blue)',
                          background: 'white',
                          display: 'grid',
                          placeItems: 'center',
                          color: 'var(--blue)',
                          fontSize: 22,
                          boxShadow: '4px 4px 0 0 rgba(0,0,0,0.08)',
                        }}
                        aria-hidden="true"
                      >
                        ⤴
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{copy.uploadDragTitle}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{copy.uploadDragHint}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{copy.uploadHint}</div>
                    </div>
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                        <div
                          aria-hidden="true"
                          style={{
                            width: 54,
                            height: 54,
                            borderRadius: 14,
                            border: '2px solid var(--ink)',
                            background: 'white',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 22,
                            boxShadow: '5px 5px 0 0 rgba(0,0,0,0.1)',
                            flexShrink: 0,
                          }}
                        >
                          📎
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              color: 'var(--ink)',
                              lineHeight: 1.3,
                              wordBreak: 'break-word',
                            }}
                          >
                            {uploadForm.file.name}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink3)' }}>
                            {formatFileSize(uploadForm.file.size)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={event => {
                            event.stopPropagation()
                            fileInputRef.current?.click()
                          }}
                          disabled={isUploading}
                        >
                          {copy.uploadReplace}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={event => {
                            event.stopPropagation()
                            setSelectedFile(null)
                          }}
                          disabled={isUploading}
                        >
                          {copy.uploadRemove}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {uploadError && (
                <div
                  role="alert"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(239,68,68,0.35)',
                    background: 'rgba(239,68,68,0.08)',
                    color: '#b91c1c',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {uploadError}
                </div>
              )}

              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                {isUploading ? copy.uploadPreparing : copy.uploadHint}
              </div>

              <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: 4 }}>
                <button className="btn btn-primary" type="submit" disabled={isUploading || !canSubmit}>
                  {isUploading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className="animate-spin" aria-hidden="true">
                        ⟳
                      </span>
                      {lang === 'es' ? 'Subiendo…' : 'Uploading…'}
                    </span>
                  ) : (
                    copy.uploadSubmit
                  )}
                </button>
                <button className="btn btn-outline" type="button" onClick={closeUpload} disabled={isUploading}>
                  {copy.uploadCancel}
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
