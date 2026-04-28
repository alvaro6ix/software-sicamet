import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001',
        ws: true,
      }
    }
  }
})