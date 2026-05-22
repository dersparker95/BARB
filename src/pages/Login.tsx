import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import createApiService from '../services/api'
import { User } from '../types'
import { getTranslations } from '../utils/i18n'

const Login: React.FC = () => {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'technician' | 'admin' | 'engineer' | 'supervisor'>('technician')
  const { setUser, apiBase, setLoading, dark, setDark, lang } = useAppContext()
  const navigate = useNavigate()

  const api = createApiService(apiBase)
  const t = useMemo(() => getTranslations(lang), [lang])

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      document.body.dataset.theme = 'dark'
    } else {
      document.documentElement.classList.remove('dark')
      document.body.dataset.theme = 'light'
    }
  }, [dark])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const resp = await api.auth.login(name || 'operator', password || '***', role)
      const usr: User = resp && resp.name
        ? { id: resp.id || String(Date.now()), name: resp.name, role: (resp.role as any) || role }
        : { id: String(Date.now()), name: name || 'Usuario', role }

      setUser(usr)
      const dest = role === 'admin' ? '/dashboard' : '/menu'
      navigate(dest)
    } catch (err) {
      const usr: User = { id: String(Date.now()), name: name || 'Usuario', role }
      setUser(usr)
      const dest = role === 'admin' ? '/dashboard' : '/menu'
      navigate(dest)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center relative" style={{ background: 'var(--bg)' }}>
      <div className="absolute right-6 top-6">
        <button
          className="icon-btn"
          onClick={() => setDark(!dark)}
          title={t.login.themeToggle}
          aria-label={t.login.themeToggle}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>

      <div className="login-card">
        <div className="login-icon">🏭</div>
        <div className="login-title dark:text-white">BARB</div>
        <div className="login-sub dark:text-gray-300">{t.login.subtitle}</div>

        <form onSubmit={submit}>
          <div className="form-field">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input dark:text-white"
              placeholder={t.login.usernamePlaceholder}
              autoComplete="username"
              aria-label={t.login.usernamePlaceholder}
            />
          </div>

          <div className="form-field">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="form-input"
              placeholder={t.login.passwordPlaceholder}
              autoComplete="current-password"
              aria-label={t.login.passwordPlaceholder}
            />
          </div>

          <div className="form-field">
            <label className="sr-only" htmlFor="role-select">
              {t.login.chooseRole}
            </label>
            <select
              id="role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="form-select dark:text-white"
              aria-label={t.login.chooseRole}
            >
              <option value="technician">{t.login.technician}</option>
              <option value="engineer">{t.login.engineer}</option>
              <option value="supervisor">{t.login.supervisor}</option>
              <option value="admin">{t.login.admin}</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full mt-4">
            {t.login.loginButton}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
