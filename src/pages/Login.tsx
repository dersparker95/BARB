import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Spinner from '../components/Spinner'
import { useAppContext } from '../context/AppContext'
import createApiService from '../services/api'
import { Role } from '../types'
import { getTranslations } from '../utils/i18n'

const Login: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(false)

  const { setUser, apiBase, setLoading, loading, dark, setDark, lang } = useAppContext()
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

    if (loading || !email || !password) return

    setLoading(true)
    setError(false)

    try {
      const resp = await api.auth.login(email, password)
      if (!resp?.user) throw new Error('Respuesta de login inválida')

      const destByRole: Record<string, string> = {
        tecnico: '/menu',
        gerente: '/dashboard',
        admin: '/dashboard',
        engineer: '/dashboard',
        supervisor: '/dashboard',
      }

      setUser({
        id: String(resp.user.id),
        name: resp.user.name,
        role: resp.user.role as Role,
        token: resp.token,
      })

      navigate(destByRole[resp.user.role] || '/menu', { replace: true })
    } catch {
      setUser(null)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const isSubmitDisabled = loading || !email || !password

  return (
    <div className="login-screen">
      <div className="login-theme-toggle">
        <button
          className="icon-btn"
          onClick={() => setDark(!dark)}
          title={t.login.themeToggle}
          aria-label={t.login.themeToggle}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>

      <div className="login-card">
        <div className="login-icon">🏭</div>
        <div className="login-title">{t.login.title}</div>
        <div className="login-sub">{t.login.subtitle}</div>

        <form onSubmit={submit}>
          <div className="form-field">
            <input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(false)
              }}
              className="form-input"
              placeholder={t.login.usernamePlaceholder}
              autoComplete="username"
            />
          </div>

          <div className="form-field">
            <div className="login-password-wrap">
              <input
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(false)
                }}
                type={showPassword ? 'text' : 'password'}
                className="form-input login-password-input"
                placeholder={t.login.passwordPlaceholder}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="login-password-toggle"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.69-1.64 1.83-3.19 3.26-4.46" />
                    <path d="M10.58 10.58A2 2 0 1 0 13.42 13.42" />
                    <path d="M6.12 6.12A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8-1.02 2.44-2.82 4.64-5.06 6.12" />
                    <path d="M1 1l22 22" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
              {t.login.incorrectCredentials}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg" disabled={isSubmitDisabled}>
            <span className="login-button-content">
              {loading ? <Spinner label="Conectando..." /> : null}
              <span>{loading ? 'Conectando...' : t.login.loginButton}</span>
            </span>
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
