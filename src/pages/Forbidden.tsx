import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { getTranslations } from '../utils/i18n'

const Forbidden: React.FC = () => {
  const navigate = useNavigate()
  const { setUser, lang } = useAppContext()
  
  // 🔥 BLINDAJE: Conectamos el diccionario de idiomas para evitar el hardcodeo
  const t = useMemo(() => getTranslations(lang), [lang])

  const handleGoMenu = () => {
    navigate('/menu', { replace: true })
  }

  const handleGoLogin = () => {
    setUser(null)
    navigate('/login', { replace: true })
  }

  return (
    // 🔥 FIX MÓVIL: Cambiamos min-h-screen por min-h-[100dvh] y movimos el bg a clases de Tailwind
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[var(--bg)]">
      <div
        className="login-card shadow-soft"
        style={{
          maxWidth: 560,
          width: 'calc(100% - 32px)',
          textAlign: 'center',
        }}
      >
        {/* 🔥 ACCESIBILIDAD: aria-hidden="true" para que el lector de pantalla no lea el emoji redundante */}
        <div className="login-icon" style={{ fontSize: 44 }} aria-hidden="true">
          🚫
        </div>
        <div className="login-title" style={{ marginTop: 8 }}>
          {t.common?.forbiddenTitle || '403 - No Autorizado'}
        </div>
        <div className="login-sub" style={{ marginTop: 8 }}>
          {t.common?.forbiddenMessage || 'Tu usuario no tiene permiso para acceder a esta ruta.'}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
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