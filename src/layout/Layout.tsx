import React from 'react'
import { Outlet } from 'react-router-dom'
import TopBar from '../components/TopBar'
import Toast from '../components/Toast'

const Layout: React.FC = () => {
  return (
    <div className="app-shell">
      <TopBar />

      {/* 🔥 ACCESIBILIDAD: Cambiamos el div por <main> para que la estructura sea semántica */}
      <main className="app-main">
        <Outlet />
      </main>

      <Toast />
    </div>
  )
}

export default Layout