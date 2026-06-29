import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

const Forbidden: React.FC = () => {
  const navigate = useNavigate()
  const { setUser, lang } = useAppContext()

  const t = useMemo(() => getTranslations(lang), [lang])

  const handleGoMenu = () => {
    navigate('/menu', { replace: true })
  }

  const handleGoLogin = () => {
    setUser(null)
    navigate('/login', { replace: true })
  }

  return (
    // ✅ CORREGIDO: Tailwind arbitrario → clases BEM del DS
    <div className="forbidden-root">
      <div className="login-card shadow-soft forbidden-card">

        {/* ✅ CORREGIDO: emoji 🚫 → SVG accesible; fontSize inline → clase BEM */}
        <div className="forbidden-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>

        <h1 className="login-title forbidden-title">
          {t.common?.forbiddenTitle || '403 — No Autorizado'}
        </h1>

        <p className="login-sub forbidden-sub">
          {t.common?.forbiddenMessage || 'Tu usuario no tiene permiso para acceder a esta ruta.'}
        </p>

        {/* ✅ CORREGIDO: div con inline styles → .forbidden-actions */}
        <div className="forbidden-actions">
          <button className="btn btn-primary" onClick={handleGoMenu} type="button">
            {t.common?.backToMenu || 'Volver al menú'}
          </button>
          <button className="btn btn-outline" onClick={handleGoLogin} type="button">
            {t.common?.goToLogin || 'Ir al Login'}
          </button>
        </div>

      </div>
    </div>
  )
}

export default Forbidden