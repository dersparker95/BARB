import React, { useEffect, useMemo, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { showToast } from './Toast'
import { getTranslations, normalizeLang } from '../utils/i18n'

const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const {
    user,
    dark,
    lang,
    setDark,
    setLang,
    apiBase,
    lmBase,
    setApiBase,
    setLmBase,
  } = useAppContext()

  const t = useMemo(() => getTranslations(lang), [lang])
  const [localApi, setLocalApi] = useState(apiBase)
  const [localLm, setLocalLm] = useState(lmBase)
  const [localLang, setLocalLang] = useState(normalizeLang(lang))
  
  // Estado para bloquear el botón mientras se hace el ping real al servidor
  const [isTesting, setIsTesting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLocalApi(apiBase)
    setLocalLm(lmBase)
    setLocalLang(normalizeLang(lang))
  }, [apiBase, lang, lmBase, isOpen])

  if (!isOpen) return null

  const handleSave = () => {
    const nextApi = localApi.trim()
    const nextLm = localLm.trim()

    if (nextApi) setApiBase(nextApi)
    if (nextLm) setLmBase(nextLm)
    setLang(localLang)

    showToast(t.settings?.savedLocally || 'Cambios guardados localmente')
    onClose()
  }

  // 🔥 ADIÓS HARDCODEO: Ahora sí hacemos un ping real a FastAPI y a LM Studio
  const testConnections = async () => {
    setIsTesting(true)
    showToast(t.settings?.testingConnections || 'Probando conexiones...')
    
    let apiStatus = '❌ Offline'
    let lmStatus = '❌ Offline'

    try {
      // 1. Probamos tu FastAPI
      const apiRes = await fetch(`${localApi.replace(/\/$/, '')}/health`, { 
        method: 'GET', 
        signal: AbortSignal.timeout(3000) 
      })
      if (apiRes.ok) apiStatus = '✅ Online'
    } catch (e) {
      console.warn("API Test Failed", e)
    }

    try {
      // 2. Probamos LM Studio (Tiene un endpoint estándar /models)
      const lmRes = await fetch(`${localLm.replace(/\/$/, '')}/models`, { 
        method: 'GET', 
        signal: AbortSignal.timeout(3000) 
      })
      if (lmRes.ok) lmStatus = '✅ Online'
    } catch (e) {
      console.warn("LM Studio Test Failed", e)
    }

    setIsTesting(false)
    showToast(`API: ${apiStatus} | IA Local: ${lmStatus}`)
  }

  return (
    <div className="modal-overlay open" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div
        className={`modal-box ${dark ? 'bg-slate-900 text-gray-100 border border-slate-700' : ''}`}
      >
        <div className="modal-header">
          <h2 className={dark ? 'text-gray-100' : ''}>{t.settings?.title || 'Configuración'}</h2>
          <button
            className={`modal-close ${dark ? 'bg-slate-700 text-gray-100' : ''}`}
            onClick={onClose}
            aria-label={t.common?.close || 'Cerrar'}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <h3 className={dark ? 'text-gray-100' : ''}>{t.settings?.appearanceLanguage || 'Apariencia e Idioma'}</h3>
            <div className="settings-block">
              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.settings?.darkTheme || 'Tema Oscuro'}</div>
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
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.common?.language || 'Idioma'}</div>
                </div>
                <select
                  className={`form-select ${dark ? 'bg-slate-800 border-slate-600 text-gray-100' : ''}`}
                  value={localLang}
                  title={t.common?.language || 'Idioma'}
                  aria-label={t.common?.language || 'Idioma'}
                  style={{ maxWidth: 150 }}
                  onChange={(event) => setLocalLang(normalizeLang(event.target.value))}
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className={dark ? 'text-gray-100' : ''}>{t.settings?.account || 'Cuenta'}</h3>
            <div className="settings-block">
              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.common?.username || 'Usuario'}</div>
                  <div className={`sr-sub ${dark ? 'text-gray-300' : ''}`}>{user?.name || t.settings?.guest || 'Invitado'}</div>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.common?.role || 'Rol'}</div>
                  <div className={`sr-sub capitalize ${dark ? 'text-gray-300' : ''}`}>{user?.role || '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className={dark ? 'text-gray-100' : ''}>{t.settings?.systemConnections || 'Conexiones de Sistema'}</h3>
            <div className="settings-block">
              <div className="settings-row">
                <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.settings?.appVersion || 'Versión'}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: dark ? 'var(--ink2)' : 'var(--ink2)' }}>3.1.0 (Producción)</div>
              </div>

              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.settings?.fastApiEndpoint || 'Backend API'}</div>
                </div>
                <input
                  className={`form-input ${dark ? 'bg-slate-800 border-slate-600 text-gray-100 placeholder:text-gray-400' : ''}`}
                  value={localApi}
                  onChange={(event) => setLocalApi(event.target.value)}
                  title={t.settings?.fastApiEndpoint || 'Backend API'}
                  aria-label={t.settings?.fastApiEndpoint || 'Backend API'}
                  placeholder="http://localhost:9000/api"
                  style={{ maxWidth: 190, fontFamily: 'var(--mono)', fontSize: 10, padding: '5px 8px' }}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.settings?.lmStudioEndpoint || 'Cerebro IA'}</div>
                </div>
                <input
                  className={`form-input ${dark ? 'bg-slate-800 border-slate-600 text-gray-100 placeholder:text-gray-400' : ''}`}
                  value={localLm}
                  onChange={(event) => setLocalLm(event.target.value)}
                  title={t.settings?.lmStudioEndpoint || 'Cerebro IA'}
                  aria-label={t.settings?.lmStudioEndpoint || 'Cerebro IA'}
                  placeholder="http://localhost:1234/v1"
                  style={{ maxWidth: 190, fontFamily: 'var(--mono)', fontSize: 10, padding: '5px 8px' }}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.settings?.testConnections || 'Probar Red'}</div>
                </div>
                <button 
                  className={`btn btn-sm btn-outline ${dark ? 'text-gray-100 border-slate-600 hover:bg-slate-800' : ''}`} 
                  onClick={testConnections}
                  disabled={isTesting}
                >
                  {isTesting ? 'Ping...' : (t.settings?.testConnections || 'Test')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={handleSave}>{t.settings?.saveChanges || 'Guardar'}</button>
          <button className={`btn btn-outline ${dark ? 'text-gray-100 border-slate-600 hover:bg-slate-800' : ''}`} onClick={onClose}>
            {t.common?.cancel || 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal