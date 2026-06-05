import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PROXY_TIMEOUT = 30 * 60 * 1000

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
  // 🔥 Mantenemos solo el Chunk Splitting (que es lo que realmente importa para que cargue rápido)
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