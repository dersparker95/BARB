import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Spinner from '../components/Spinner'
import { useAppContext } from '../context/AppContext'
import { Role } from '../types'
import { getTranslations } from '../utils/i18n'

const Login: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { setUser, setLoading, loading, dark, setDark, lang, api } = useAppContext()
  const navigate = useNavigate()

  const t = useMemo(() => getTranslations(lang), [lang])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanUser = email.trim()
    const cleanPassword = password.trim()

    if (loading || !cleanUser || !cleanPassword) return

    if (cleanUser.length > 100 || cleanPassword.length > 100) {
      setError('Las credenciales exceden la longitud permitida.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const resp = await api.auth.login(cleanUser, cleanPassword)
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

      const destination = destByRole[String(resp.user.role).toLowerCase()] || '/menu'
      navigate(destination, { replace: true })
    } catch {
      setUser(null)
      setError(t.login?.incorrectCredentials || 'Credenciales incorrectas. Verifica tu usuario y contraseña.')
    } finally {
      setLoading(false)
    }
  }

  const isSubmitDisabled = loading || !email.trim() || !password.trim()
  const connectingText = t.common?.connecting || 'Conectando...'
  const hidePassText = t.login?.hidePassword || 'Ocultar contraseña'
  const showPassText = t.login?.showPassword || 'Mostrar contraseña'

  return (
    <div className="login-screen">
      <div className="login-theme-toggle">
        <button
          className="icon-btn"
          onClick={() => setDark(!dark)}
          title={t.login?.themeToggle || 'Cambiar tema'}
          aria-label={t.login?.themeToggle || 'Cambiar tema'}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>

      <main className="login-card">
        <div className="login-icon" aria-hidden="true">🏭</div>
        <h1 className="login-title">{t.login?.title || 'BARB Platform'}</h1>
        <div className="login-sub">{t.login?.subtitle || 'Inicia sesión para continuar'}</div>

        <form onSubmit={submit}>
          <div className="form-field">
            <label htmlFor="emailInput" className="sr-only">{t.login?.usernamePlaceholder || 'Usuario'}</label>
            <input
              id="emailInput"
              value={email}
              maxLength={100}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(null)
              }}
              className="form-input"
              placeholder={t.login?.usernamePlaceholder || 'Usuario o correo electrónico'}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-field">
            <div className="login-password-wrap">
              <label htmlFor="passwordInput" className="sr-only">{t.login?.passwordPlaceholder || 'Contraseña'}</label>
              <input
                id="passwordInput"
                value={password}
                maxLength={100}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
                type={showPassword ? 'text' : 'password'}
                className="form-input login-password-input"
                placeholder={t.login?.passwordPlaceholder || 'Contraseña'}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="login-password-toggle"
                title={showPassword ? hidePassText : showPassText}
                aria-label={showPassword ? hidePassText : showPassText}
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
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg login-submit-btn" disabled={isSubmitDisabled}>
            <span className="login-button-content">
              {loading ? <Spinner label={connectingText} /> : null}
              <span>{loading ? connectingText : (t.login?.loginButton || 'Ingresar')}</span>
            </span>
          </button>
        </form>
      </main>
    </div>
  )
}

export default Login