import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Menu from './pages/Menu'
import DocChat from './pages/DocChat'
import Debug from './pages/Debug'
import Topology from './pages/Topology'
import MachineMemory from './pages/MachineMemory'
import Report from './pages/Report'
import Forbidden from './pages/Forbidden'
import { useAppContext } from './context/AppContext'
import type { Role } from './types'

type GuardProps = {
  allowedRoles: Role[]
  children: React.ReactElement
}

function hasRolePermission(userRole: Role | null, allowedRoles: Role[]): boolean {
  if (!userRole) return false
  return allowedRoles.includes(userRole)
}

// Guard genérico por rol. Si no hay sesión -> /login
// Si hay sesión pero no corresponde -> /403
const RoleGuard: React.FC<GuardProps> = ({ allowedRoles, children }) => {
  const { user } = useAppContext()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!hasRolePermission(user.role, allowedRoles)) {
    return <Navigate to="/403" replace />
  }

  return children
}

const routeRoles = (path: string): Role[] => {
  if (path.startsWith('/dashboard')) return ['gerente', 'admin']
  if (path.startsWith('/menu')) return ['tecnico', 'gerente', 'admin']
  if (path.startsWith('/docchat')) return ['tecnico', 'gerente', 'admin']
  if (path.startsWith('/topology')) return ['tecnico', 'gerente', 'admin']
  if (path.startsWith('/memory/')) return ['tecnico', 'gerente', 'admin']
  if (path.startsWith('/debug')) return ['tecnico', 'gerente', 'admin']
  if (path.startsWith('/report')) return ['gerente', 'admin']
  return ['tecnico', 'gerente', 'admin']
}

const ProtectedLayout: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user } = useAppContext()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace />

  const isTecnico = user.role === 'tecnico'
  const pathname = location.pathname

  if (isTecnico) {
    const blockedPath =
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/upload') ||
      pathname.startsWith('/reports/upload')

    if (blockedPath) {
      return <Navigate to="/403" replace />
    }
  }

  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/403" element={<Forbidden />} />

      <Route path="/" element={<ProtectedLayout children={<Layout />} />}>
        <Route index element={<Navigate to="dashboard" replace />} />

        <Route
          path="dashboard"
          element={
            <RoleGuard allowedRoles={routeRoles('/dashboard')}>
              <Dashboard />
            </RoleGuard>
          }
        />
        <Route
          path="menu"
          element={
            <RoleGuard allowedRoles={routeRoles('/menu')}>
              <Menu />
            </RoleGuard>
          }
        />
        <Route
          path="docchat"
          element={
            <RoleGuard allowedRoles={routeRoles('/docchat')}>
              <DocChat />
            </RoleGuard>
          }
        />
        <Route
          path="debug"
          element={
            <RoleGuard allowedRoles={routeRoles('/debug')}>
              <Debug />
            </RoleGuard>
          }
        />
        <Route
          path="topology"
          element={
            <RoleGuard allowedRoles={routeRoles('/topology')}>
              <Topology />
            </RoleGuard>
          }
        />
        <Route
          path="memory/:machineId"
          element={
            <RoleGuard allowedRoles={routeRoles('/memory/')}>
              <MachineMemory />
            </RoleGuard>
          }
        />
        <Route
          path="report"
          element={
            <RoleGuard allowedRoles={routeRoles('/report')}>
              <Report />
            </RoleGuard>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
