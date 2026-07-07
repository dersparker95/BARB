import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './context/AppContext'
import './index.css'

// =============================================================================
// PUNTO DE ENTRADA
// =============================================================================
//
// Inicializa el árbol de React sobre el contenedor raíz del DOM y monta
// los proveedores globales de la aplicación.
//

const container = document.getElementById('root')

if (!container) {
  throw new Error(
    "Error Fatal: No se encontró el contenedor principal 'root' en el DOM. La plataforma no puede inicializarse."
  )
}

const root = createRoot(container)

root.render(
  <React.StrictMode>
    {/* El Router envuelve al contexto para permitir el uso de hooks de
        navegación globales dentro de AppProvider si se requiere. */}
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
)
