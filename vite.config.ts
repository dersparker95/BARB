import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// =============================================================================
// CONFIGURACIÓN
// =============================================================================
//
// Constantes y ajustes base utilizados por la configuración de Vite.
//

// Timeout extendido para soportar respuestas largas del backend y del
// motor RAG a través del proxy de desarrollo.
const PROXY_TIMEOUT = 30 * 60 * 1000

// =============================================================================
// SERVIDOR DE DESARROLLO
// =============================================================================
//
// Define el host, puerto y el proxy hacia el backend central y hacia
// LM Studio durante el desarrollo local.
//

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_'],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        secure: false,
        ws: true,
        timeout: PROXY_TIMEOUT,
        proxyTimeout: PROXY_TIMEOUT,
      },
      '/lm': {
        target: 'http://host.docker.internal:1234',
        changeOrigin: true,
        secure: false,
        ws: true,
        timeout: PROXY_TIMEOUT,
        proxyTimeout: PROXY_TIMEOUT,
      },
    },
  },

  // ===========================================================================
  // BUILD DE PRODUCCIÓN
  // ===========================================================================
  //
  // Configura el particionado de chunks para optimizar los tiempos de carga
  // inicial, separando las dependencias más pesadas en bundles propios.
  //
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'vendor-charts';
            if (id.includes('xlsx')) return 'vendor-excel';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('react/') || id.includes('react-dom/')) return 'vendor-react';
            return 'vendor-core'; 
          }
        }
      }
    }
  }
})
