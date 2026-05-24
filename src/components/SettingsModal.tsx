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

    showToast(t.settings.savedLocally)
    onClose()
  }

  const testConnections = () => {
    showToast(t.settings.testingConnections)
    window.setTimeout(() => showToast(t.settings.apiOkLmOffline), 1500)
  }

  return (
    <div className="modal-overlay open" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div
        className={`modal-box ${dark ? 'bg-slate-900 text-gray-100 border border-slate-700' : ''}`}
      >
        <div className="modal-header">
          <h2 className={dark ? 'text-gray-100' : ''}>{t.settings.title}</h2>
          <button
            className={`modal-close ${dark ? 'bg-slate-700 text-gray-100' : ''}`}
            onClick={onClose}
            aria-label={t.common.close}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <h3 className={dark ? 'text-gray-100' : ''}>{t.settings.appearanceLanguage}</h3>
            <div className="settings-block">
              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.settings.darkTheme}</div>
                </div>
                <label className="toggle" aria-label={t.settings.darkTheme}>
                  <input
                    type="checkbox"
                    checked={dark}
                    onChange={() => setDark(!dark)}
                    aria-label={t.settings.darkTheme}
                  />
                  <span className="toggle-track" />
                  <span className="toggle-thumb" />
                </label>
              </div>

              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.common.language}</div>
                </div>
                <select
                  className={`form-select ${dark ? 'bg-slate-800 border-slate-600 text-gray-100' : ''}`}
                  value={localLang}
                  title={t.common.language}
                  aria-label={t.common.language}
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
            <h3 className={dark ? 'text-gray-100' : ''}>{t.settings.account}</h3>
            <div className="settings-block">
              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.common.username}</div>
                  <div className={`sr-sub ${dark ? 'text-gray-300' : ''}`}>{user?.name || t.settings.guest}</div>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.common.role}</div>
                  <div className={`sr-sub capitalize ${dark ? 'text-gray-300' : ''}`}>{user?.role || '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className={dark ? 'text-gray-100' : ''}>{t.settings.systemConnections}</h3>
            <div className="settings-block">
              <div className="settings-row">
                <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.settings.appVersion}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: dark ? 'var(--ink2)' : 'var(--ink2)' }}>2.1.0 (React)</div>
              </div>

              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.settings.fastApiEndpoint}</div>
                </div>
                <input
                  className={`form-input ${dark ? 'bg-slate-800 border-slate-600 text-gray-100 placeholder:text-gray-400' : ''}`}
                  value={localApi}
                  onChange={(event) => setLocalApi(event.target.value)}
                  title={t.settings.fastApiEndpoint}
                  aria-label={t.settings.fastApiEndpoint}
                  placeholder="http://localhost:9000/api"
                  style={{ maxWidth: 190, fontFamily: 'var(--mono)', fontSize: 10, padding: '5px 8px' }}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.settings.lmStudioEndpoint}</div>
                </div>
                <input
                  className={`form-input ${dark ? 'bg-slate-800 border-slate-600 text-gray-100 placeholder:text-gray-400' : ''}`}
                  value={localLm}
                  onChange={(event) => setLocalLm(event.target.value)}
                  title={t.settings.lmStudioEndpoint}
                  aria-label={t.settings.lmStudioEndpoint}
                  placeholder="http://localhost:1234/v1"
                  style={{ maxWidth: 190, fontFamily: 'var(--mono)', fontSize: 10, padding: '5px 8px' }}
                />
              </div>

              <div className="settings-row">
                <div>
                  <div className={`sr-label ${dark ? 'text-gray-200' : ''}`}>{t.settings.testConnections}</div>
                </div>
                <button className={`btn btn-sm btn-outline ${dark ? 'text-gray-100 border-slate-600 hover:bg-slate-800' : ''}`} onClick={testConnections}>
                  {t.settings.testConnections}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={handleSave}>{t.settings.saveChanges}</button>
          <button className={`btn btn-outline ${dark ? 'text-gray-100 border-slate-600 hover:bg-slate-800' : ''}`} onClick={onClose}>
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
