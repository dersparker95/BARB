import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'

const Forbidden: React.FC = () => {
  const navigate = useNavigate()
  const { setUser } = useAppContext()

  const handleGoMenu = () => {
    navigate('/menu', { replace: true })
  }

  const handleGoLogin = () => {
    setUser(null)
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div
        className="login-card"
        style={{
          maxWidth: 560,
          width: 'calc(100% - 32px)',
          textAlign: 'center',
        }}
      >
        <div className="login-icon" style={{ fontSize: 44 }}>
          🚫
        </div>
        <div className="login-title" style={{ marginTop: 8 }}>
          403 - No Autorizado
        </div>
        <div className="login-sub" style={{ marginTop: 8 }}>
          Tu usuario no tiene permiso para acceder a esta ruta.
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleGoMenu} type="button">
            Volver al menú
          </button>
          <button className="btn btn-outline" onClick={handleGoLogin} type="button">
            Ir al Login
          </button>
        </div>
      </div>
    </div>
  )
}

export default Forbidden
