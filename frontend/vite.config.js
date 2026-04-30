import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    cssMinify: 'esbuild',
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://backend:3001',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://backend:3001',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://backend:3001',
        ws: true,
        changeOrigin: true,
      }
    }
  }
})