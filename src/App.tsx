import React, { Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

// =============================================================================
// CARGA INMEDIATA
// =============================================================================
//
// Componentes esenciales requeridos antes de resolver cualquier ruta.
//

import Layout from './layout/Layout'
import Login from './pages/Login'
import Forbidden from './pages/Forbidden'
import { useAppContext } from './context/AppContext'
import { canAccessPage, AppPage } from './utils/permissions'

// =============================================================================
// CARGA DIFERIDA
// =============================================================================
//
// Páginas cargadas de forma perezosa para reducir el consumo inicial de
// red y memoria.
//

const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const Menu = React.lazy(() => import('./pages/Menu'))
const DocChat = React.lazy(() => import('./pages/DocChat'))
const Debug = React.lazy(() => import('./pages/Debug'))
const Topology = React.lazy(() => import('./pages/Topology'))
const MachineMemory = React.lazy(() => import('./pages/MachineMemory'))
const Report = React.lazy(() => import('./pages/Report'))
const SessionHistory = React.lazy(() => import('./pages/SessionHistory'))

// =============================================================================
// SEGURIDAD
// =============================================================================
//
// Define el guardia de acceso por rol utilizado en todas las rutas
// protegidas de la aplicación.
//

type GuardProps = {
  page: AppPage
  children: React.ReactElement
}

/**
 * Protege una ruta verificando sesión activa y permiso de acceso del rol
 * del usuario, delegando la validación en permissions.ts (espejo de
 * permisos.py en el backend). Agregar una página o rol nuevo solo requiere
 * modificar esa fuente de verdad, no este componente.
 *
 * Args:
 *     page:
 *         Página a proteger.
 *     children:
 *         Elemento a renderizar si el acceso es válido.
 *
 * Returns:
 *     El contenido protegido, o una redirección a /login o /403.
 */
const RoleGuard: React.FC<GuardProps> = ({ page, children }) => {
  const { user } = useAppContext()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!canAccessPage(user.role, page)) {
    return <Navigate to="/403" replace />
  }

  return children
}

const RootRedirect: React.FC = () => <Navigate to="/login" replace />

// Spinner de carga bilingüe, independiente del sistema de traducciones.
const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', width: '100%', color: 'var(--ink3)', background: 'var(--bg-body)' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <span className="animate-spin" style={{ fontSize: '24px' }}>⚙️</span>
      <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
        Loading / Cargando...
      </span>
    </div>
  </div>
)

// =============================================================================
// ENDPOINTS — ENRUTAMIENTO PRINCIPAL
// =============================================================================
//
// Define el árbol de rutas de la aplicación y el layout que envuelve las
// rutas protegidas.
//

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/403" element={<Forbidden />} />

        <Route element={<Layout />}>
          <Route
            path="/dashboard"
            element={
              <RoleGuard page="/dashboard">
                <Dashboard />
              </RoleGuard>
            }
          />
          <Route
            path="/menu"
            element={
              <RoleGuard page="/menu">
                <Menu />
              </RoleGuard>
            }
          />
          <Route
            path="/docchat"
            element={
              <RoleGuard page="/docchat">
                <DocChat />
              </RoleGuard>
            }
          />
          <Route
            path="/debug"
            element={
              <RoleGuard page="/debug">
                <Debug />
              </RoleGuard>
            }
          />
          <Route
            path="/topology"
            element={
              <RoleGuard page="/topology">
                <Topology />
              </RoleGuard>
            }
          />
          <Route
            path="/memory/:machineId"
            element={
              <RoleGuard page="/memory">
                <MachineMemory />
              </RoleGuard>
            }
          />
          <Route
            path="/report"
            element={
              <RoleGuard page="/report">
                <Report />
              </RoleGuard>
            }
          />
          <Route
            path="/history"
            element={
              <RoleGuard page="/history">
                <SessionHistory />
              </RoleGuard>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}
