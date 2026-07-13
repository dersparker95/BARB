// =============================================================================
// IMPORTS
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { showToast } from './Toast'
import { getTranslations, normalizeLang } from '../utils/i18n'

// =============================================================================
// COMPONENTE PRINCIPAL: SETTINGS MODAL
// =============================================================================

const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const {
    user,
    dark,
    lang,
    setDark,
    setLang,
    apiBase,
    setApiBase,
  } = useAppContext()

  const t = useMemo(() => getTranslations(lang), [lang])
  const [localApi, setLocalApi] = useState(apiBase)
  const [localLang, setLocalLang] = useState(normalizeLang(lang))

  // Bloquea el botón de prueba mientras la petición de health-check está en curso.
  const [isTesting, setIsTesting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLocalApi(apiBase)
    setLocalLang(normalizeLang(lang))
  }, [apiBase, lang, isOpen])

  if (!isOpen) return null

  // ---------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------

  const handleSave = () => {
    const nextApi = localApi.trim()

    if (nextApi) setApiBase(nextApi)
    setLang(localLang)

    showToast(t.settings?.savedLocally || 'Cambios guardados localmente')
    onClose()
  }

  const testConnections = async () => {
    setIsTesting(true)
    showToast(t.settings?.testingConnections || 'Probando conexiones...')

    let apiStatus = '❌ Offline'

    try {
      const apiRes = await fetch(`${localApi.replace(/\/$/, '')}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      })
      if (apiRes.ok) apiStatus = '✅ Online'
    } catch (e) {
      console.warn("API Test Failed", e)
    }

    setIsTesting(false)
    showToast(`API: ${apiStatus}`)
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  return (
    <div className="modal-overlay open" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-box">
        <div className="modal-header">
          <h2>{t.settings?.title || 'Configuración'}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={t.common?.close || 'Cerrar'}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <h3>{t.settings?.appearanceLanguage || 'Apariencia e Idioma'}</h3>
            <div className="settings-block">
              <div className="settings-row">
                <div>
                  <div className="sr-label">{t.settings?.darkTheme || 'Tema Oscuro'}</div>
                </div>
                <label className="toggle" aria-label={t.settings?.darkTheme || 'Tema Oscuro'}>
                  <input
                    type="checkbox"
                    checked={dark}
                    onChange={() => setDark(!dark)}
                    aria-label={t.settings?.darkTheme || 'Tema Oscuro'}
                  />
                  <span className="toggle-track" />
                  <span className="toggle-thumb" />
                </label>
              </div>

              <div className="settings-row">
                <div>
                  <div className="sr-label">{t.common?.language || 'Idioma'}</div>
                </div>
                <select
                  className="form-select form-select--compact"
                  value={localLang}
                  title={t.common?.language || 'Idioma'}
                  aria-label={t.common?.language || 'Idioma'}
                  onChange={(event) => setLocalLang(normalizeLang(event.target.value))}
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>{t.settings?.account || 'Cuenta'}</h3>
            <div className="settings-block">
              <div className="settings-row">
                <div>
                  <div className="sr-label">{t.common?.username || 'Usuario'}</div>
                  <div className="sr-sub">{user?.name || t.settings?.guest || 'Invitado'}</div>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="sr-label">{t.common?.role || 'Rol'}</div>
                  <div className="sr-sub capitalize">{user?.role || '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>{t.settings?.systemConnections || 'Conexiones de Sistema'}</h3>
            <div className="settings-block">
              <div className="settings-row">
                <div className="sr-label">{t.settings?.appVersion || 'Versión'}</div>
                <div className="settings-version">3.1.0 ({t.settings?.productionLabel || 'Producción'})</div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="sr-label">{t.settings?.fastApiEndpoint || 'Backend API'}</div>
                </div>
                <input
                  className="form-input form-input--compact"
                  value={localApi}
                  onChange={(event) => setLocalApi(event.target.value)}
                  title={t.settings?.fastApiEndpoint || 'Backend API'}
                  aria-label={t.settings?.fastApiEndpoint || 'Backend API'}
                  placeholder="http://localhost:9000/api"
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className="sr-label">{t.settings?.testConnections || 'Probar Red'}</div>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={testConnections}
                  disabled={isTesting}
                >
                  {isTesting ? (t.settings?.testingShort || 'Ping...') : (t.settings?.testConnections || 'Test')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={handleSave}>{t.settings?.saveChanges || 'Guardar'}</button>
          <button className="btn btn-outline" onClick={onClose}>
            {t.common?.cancel || 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal