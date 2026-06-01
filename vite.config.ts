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
})
