import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './context/AppContext'
import './index.css'

// 🔥 BLINDAJE: Validación estricta del contenedor principal
const container = document.getElementById('root')

if (!container) {
  throw new Error(
    "Error Fatal: No se encontró el contenedor principal 'root' en el DOM. La plataforma no puede inicializarse."
  )
}

const root = createRoot(container)

root.render(
  <React.StrictMode>
    {/* 🔥 ARQUITECTURA LIMPIA: El Router envuelve al Contexto para permitir 
        el uso de hooks de navegación globales dentro de AppProvider si se requiere. */}
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
)