import React, { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import SettingsModal from './SettingsModal'
import { showToast } from './Toast'
import { getTranslations, normalizeLang } from '../utils/i18n'

const TopBar: React.FC = () => {
  const { user, setUser, dark, setDark, lang, setLang, apiBase, setLoading } = useAppContext()
  const navigate = useNavigate()
  const location = useLocation()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const translations = useMemo(() => getTranslations(lang), [lang])

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      document.body.dataset.theme = 'dark'
    } else {
      document.documentElement.classList.remove('dark')
      document.body.dataset.theme = 'light'
    }
  }, [dark])

  const handleLogout = async () => {
    setLoading(true)
    try {
      const safeApiBase = apiBase || 'http://localhost:9000/api'
      const response = await fetch(`${safeApiBase.replace(/\/$/, '')}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error('Fallo al cerrar sesión en el servidor')
    } catch (error) {
      // Fallback local: registramos el error silenciosamente pero forzamos el deslogueo en el cliente
      console.warn("Logout warning:", error)
    } finally {
      setUser(null)
      setLoading(false)
      navigate('/login')
    }
  }

  const toggleTheme = () => setDark(!dark)

  const handleLanguageChange = (value: string) => {
    const newLang = normalizeLang(value)
    setLang(newLang)
    showToast(translations.settings?.languageUpdated || 'Idioma actualizado')
  }

  const path = location.pathname
  
  // 🔥 BLINDAJE: Optional chaining y valores de respaldo (Fallbacks)
  let title = translations.topbar?.maintenance || 'Mantenimiento'
  let showBack = true
  let backPath: string | number = '/menu'

  if (path.includes('/menu')) {
    showBack = false
    title = translations.topbar?.mainMenu || 'Menú Principal'
  } else if (path.includes('/dashboard')) {
    title = translations.menu?.dashboardTitle || 'Dashboard'
  } else if (path.includes('/docchat')) {
    title = translations.topbar?.documentChat || 'Asistente IA'
  } else if (path.includes('/debug')) {
    title = translations.topbar?.machineDebug || 'Diagnóstico de Equipo'
    backPath = '/topology'
  } else if (path.includes('/topology')) {
    title = translations.topbar?.plantTopology || 'Topología de Planta'
  } else if (path.includes('/memory')) {
    title = translations.topbar?.machineMemory || 'Memoria de Máquina'
    backPath = -1
  } else if (path.includes('/report')) {
    title = translations.topbar?.debugReport || 'Reporte de Diagnóstico'
    backPath = '/debug'
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        {showBack && (
          <button 
            className="back-btn" 
            onClick={() => (typeof backPath === 'string' ? navigate(backPath) : navigate(-1))}
            aria-label={translations.common?.back || 'Volver'}
          >
            ‹
          </button>
        )}
        <div className="topbar-logo">
          <span className="logo-mark">BARB</span>
        </div>
        <span className="topbar-title">{title}</span>
      </div>

      <div className="topbar-right">
        <label className="sr-only" htmlFor="language-select">{translations.common?.language || 'Idioma'}</label>
        <select
          id="language-select"
          className="topbar-select"
          // 🔥 NORMALIZACIÓN: Aseguramos que siempre empate con "es" o "en"
          value={normalizeLang(lang)}
          onChange={event => handleLanguageChange(event.target.value)}
          aria-label={translations.common?.language || 'Idioma'}
          title={translations.common?.language || 'Idioma'}
        >
          <option value="es">ES</option>
          <option value="en">EN</option>
        </select>

        <button className="icon-btn" onClick={toggleTheme} title={translations.common?.theme || 'Tema'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>

        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title={translations.common?.settings || 'Configuración'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {user && (
          <button className="icon-btn" onClick={handleLogout} title={translations.topbar?.logout || 'Cerrar sesión'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        )}
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default TopBar