// =============================================================================
// IMPORTS
// =============================================================================

import React from 'react'
import { Outlet } from 'react-router-dom'
import TopBar from '../components/TopBar'
import Toast from '../components/Toast'

// =============================================================================
// COMPONENTE PRINCIPAL: LAYOUT
// =============================================================================

const Layout: React.FC = () => {
  return (
    <div className="app-shell">
      <TopBar />

      {/* <main> en vez de <div> para que lectores de pantalla identifiquen el contenido principal. */}
      <main className="app-main">
        <Outlet />
      </main>

      <Toast />
    </div>
  )
}

export default Layout