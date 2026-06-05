import React from 'react'
import { Outlet } from 'react-router-dom'
import TopBar from '../components/TopBar'
import Toast from '../components/Toast'

const Layout: React.FC = () => {
  return (
    // 🔥 FIX MÓVIL: Cambiamos h-screen por h-[100dvh] (Dynamic Viewport Height).
    // Esto asegura que la app nunca se esconda detrás de la barra de navegación del celular.
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-[var(--bg-body)] text-[var(--ink)] transition-colors duration-200">
      <TopBar />
      
      {/* 🔥 ACCESIBILIDAD: Cambiamos el div por <main> para que la estructura sea semántica */}
      <main className="flex-1 flex overflow-hidden relative">
        <Outlet />
      </main>
      
      <Toast />
    </div>
  )
}

export default Layout