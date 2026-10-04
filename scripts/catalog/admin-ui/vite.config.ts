import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Desarrollo de la UI: `npm run dev` con proxy /api -> servidor del admin (DEC-38).
// changeOrigin hace que el Host llegue como 127.0.0.1:<puerto> y pase la comprobacion de DEC-36.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:5180', changeOrigin: true } },
  },
})
