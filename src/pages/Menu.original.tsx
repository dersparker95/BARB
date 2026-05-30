import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'
import { showToast } from '../components/Toast'

type UploadFormState = {
  title: string
  discipline: string
  notes: string
  file: File | null
}

const EMPTY_UPLOAD: UploadFormState = {
  title: '',
  discipline: 'all',
  notes: '',
  file: null,
}

const Menu: React.FC = () => {
  const { user, lang } = useAppContext()
  const navigate = useNavigate()
  const t = useMemo(() => getTranslations(lang), [lang])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState<UploadFormState>(EMPTY_UPLOAD)

  const copy = lang === 'es'
    ? {
        uploadTitle: 'Subida de documentos',
        uploadDescription: 'Carga manuales, fichas técnicas o procedimientos para el asistente documental.',
        uploadName: 'Nombre del documento',
        uploadDiscipline: 'Disciplina',
        uploadNotes: 'Notas internas',
        uploadFile: 'Archivo',
        uploadSubmit: 'Subir documento',
        uploadCancel: 'Cancelar',
        uploadHint: 'El archivo se guardará en el repositorio documental.',
        uploadSuccess: '📄 Documento preparado para subida',
      }
    : {
        uploadTitle: 'Document upload',
        uploadDescription: 'Upload manuals, technical sheets or procedures for the document assistant.',
        uploadName: 'Document name',
        uploadDiscipline: 'Discipline',
        uploadNotes: 'Internal notes',
        uploadFile: 'File',
        uploadSubmit: 'Upload document',
        uploadCancel: 'Cancel',
        uploadHint: 'The file will be stored in the document repository.',
        uploadSuccess: '📄 Document prepared for upload',
      }

  const openUpload = () => {
    setUploadForm(EMPTY_UPLOAD)
    setUploadOpen(true)
  }

  const handleUploadSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!uploadForm.title.trim()) {
      showToast(lang === 'es' ? '⚠️ Escribe un nombre para el documento' : '⚠️ Add a name for the document')
      return
    }

    if (!uploadForm.file) {
      showToast(lang === 'es' ? '⚠️ Selecciona un archivo' : '⚠️ Select a file')
      return
    }

    showToast(copy.uploadSuccess)
    setUploadOpen(false)
    setUploadForm(EMPTY_UPLOAD)
  }

  return (
    <div className="menu-body">
      <div className="page-title">{t.menu.title}</div>

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
        <div className="modal-overlay open" onClick={(event) => { if (event.target === event.currentTarget) setUploadOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>{copy.uploadTitle}</h2>
              <button className="modal-close" onClick={() => setUploadOpen(false)} aria-label={t.common.close}>✕</button>
            </div>

            <form onSubmit={handleUploadSubmit} className="modal-body" style={{ display: 'grid', gap: 14 }}>
              <p style={{ margin: 0, color: 'var(--ink2)', fontSize: 13, lineHeight: 1.6 }}>
                {copy.uploadDescription}
              </p>

              <label className="sr-only" htmlFor="upload-title">{copy.uploadName}</label>
              <input
                id="upload-title"
                className="form-input"
                value={uploadForm.title}
                onChange={(event) => setUploadForm(prev => ({ ...prev, title: event.target.value }))}
                placeholder={copy.uploadName}
                aria-label={copy.uploadName}
              />

              <label className="sr-only" htmlFor="upload-discipline">{copy.uploadDiscipline}</label>
              <select
                id="upload-discipline"
                className="form-select"
                value={uploadForm.discipline}
                onChange={(event) => setUploadForm(prev => ({ ...prev, discipline: event.target.value }))}
                aria-label={copy.uploadDiscipline}
              >
                <option value="all">{t.common.all}</option>
                <option value="electrical">Electrical</option>
                <option value="mechanical">Mechanical</option>
                <option value="hydraulic">Hydraulic</option>
                <option value="pneumatic">Pneumatic</option>
                <option value="automation">Automation</option>
              </select>

              <label className="sr-only" htmlFor="upload-notes">{copy.uploadNotes}</label>
              <textarea
                id="upload-notes"
                className="form-input"
                value={uploadForm.notes}
                onChange={(event) => setUploadForm(prev => ({ ...prev, notes: event.target.value }))}
                placeholder={copy.uploadNotes}
                aria-label={copy.uploadNotes}
                rows={4}
                style={{ resize: 'vertical', minHeight: 96 }}
              />

              <div style={{ display: 'grid', gap: 8 }}>
                <label htmlFor="upload-file" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>
                  {copy.uploadFile}
                </label>
                <input
                  id="upload-file"
                  type="file"
                  onChange={(event) => setUploadForm(prev => ({ ...prev, file: event.target.files?.[0] || null }))}
                  aria-label={copy.uploadFile}
                />
              </div>

              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{copy.uploadHint}</div>

              <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: 4 }}>
                <button className="btn btn-primary" type="submit">{copy.uploadSubmit}</button>
                <button className="btn btn-outline" type="button" onClick={() => setUploadOpen(false)}>
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
