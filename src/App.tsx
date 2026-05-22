import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Menu from './pages/Menu'
import DocChat from './pages/DocChat'
import Debug from './pages/Debug'
import Topology from './pages/Topology'
import MachineMemory from './pages/MachineMemory'
import Report from './pages/Report'
import { useAppContext } from './context/AppContext'
import Toast from './components/Toast'

const ProtectedRoute = ({ children }: { children: React.ReactElement }) => {
  const { user } = useAppContext()
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="menu" element={<Menu />} />
          <Route path="docchat" element={<DocChat />} />
          <Route path="debug" element={<Debug />} />
          <Route path="topology" element={<Topology />} />
          <Route path="memory/:machineId" element={<MachineMemory />} />
          <Route path="report" element={<Report />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toast /> 
    </>
  )
}
