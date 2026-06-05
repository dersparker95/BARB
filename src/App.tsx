import React, { Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

// ⚡ CARGA INMEDIATA (Solo lo esencial)
import Layout from './layout/Layout'
import Login from './pages/Login'
import Forbidden from './pages/Forbidden'
import { useAppContext } from './context/AppContext'
import type { Role } from './types'

// 🦥 CARGA PEREZOSA (Lazy Loading para optimizar la RAM y la red)
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const Menu = React.lazy(() => import('./pages/Menu'))
const DocChat = React.lazy(() => import('./pages/DocChat'))
const Debug = React.lazy(() => import('./pages/Debug'))
const Topology = React.lazy(() => import('./pages/Topology'))
const MachineMemory = React.lazy(() => import('./pages/MachineMemory'))
const Report = React.lazy(() => import('./pages/Report'))

type GuardProps = {
  allowedRoles: Role[]
  children: React.ReactElement
}

// 🛡️ GUARDIA ÚNICO DE SEGURIDAD: Simplificado y centralizado
const RoleGuard: React.FC<GuardProps> = ({ allowedRoles, children }) => {
  const { user } = useAppContext()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/403" replace />
  }

  return children
}

// 🔥 MAPEO COMPLETO DE ROLES: Incluyendo engineer y supervisor
const routeRoles = (path: string): Role[] => {
  const managementRoles: Role[] = ['gerente', 'admin', 'engineer', 'supervisor']
  const allRoles: Role[] = ['tecnico', 'operador', 'gerente', 'admin', 'engineer', 'supervisor']

  if (path.startsWith('/dashboard')) return managementRoles
  if (path.startsWith('/report')) return managementRoles
  
  // El resto de módulos operativos son accesibles por toda la planta
  return allRoles
}

const RootRedirect: React.FC = () => <Navigate to="/login" replace />

// Spinner bilingüe e independiente
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

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/403" element={<Forbidden />} />

        {/* 🔥 ARQUITECTURA LIMPIA V6: El Layout envuelve nativamente las rutas hijas */}
        <Route element={<Layout />}>
          <Route
            path="/dashboard"
            element={
              <RoleGuard allowedRoles={routeRoles('/dashboard')}>
                <Dashboard />
              </RoleGuard>
            }
          />
          <Route
            path="/menu"
            element={
              <RoleGuard allowedRoles={routeRoles('/menu')}>
                <Menu />
              </RoleGuard>
            }
          />
          <Route
            path="/docchat"
            element={
              <RoleGuard allowedRoles={routeRoles('/docchat')}>
                <DocChat />
              </RoleGuard>
            }
          />
          <Route
            path="/debug"
            element={
              <RoleGuard allowedRoles={routeRoles('/debug')}>
                <Debug />
              </RoleGuard>
            }
          />
          <Route
            path="/topology"
            element={
              <RoleGuard allowedRoles={routeRoles('/topology')}>
                <Topology />
              </RoleGuard>
            }
          />
          <Route
            path="/memory/:machineId"
            element={
              <RoleGuard allowedRoles={routeRoles('/memory/')}>
                <MachineMemory />
              </RoleGuard>
            }
          />
          <Route
            path="/report"
            element={
              <RoleGuard allowedRoles={routeRoles('/report')}>
                <Report />
              </RoleGuard>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
    // 🗑️ ELIMINADO: <Toast /> (Ya está renderizado dentro de <Layout />)
  )
}