import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // shared/ vive fuera de frontend/ y se importa por ruta relativa.
    fs: { allow: ['..'] },
    // Permite compartir el servidor de desarrollo con ngrok (ver DESARROLLO.md).
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app'],
    proxy: { '/api': 'http://localhost:3002' },
  },
})
