// Config de Vite solo para E2E: reutiliza la del frontend y cambia puerto, cache y destino del proxy de /api,
// para levantar varios frontends contra backends distintos sin tocar frontend/vite.config.ts.
import base from '../frontend/vite.config.ts'

const frontendDir = new URL('../frontend/', import.meta.url).pathname
const backendPort = process.env.E2E_BACKEND_PORT
const frontendPort = Number(process.env.E2E_FRONTEND_PORT)
if (!backendPort || !frontendPort) throw new Error('Faltan E2E_BACKEND_PORT / E2E_FRONTEND_PORT')

export default {
  ...base,
  root: frontendDir,
  cacheDir: new URL(`./.vite-cache-${frontendPort}/`, import.meta.url).pathname,
  server: {
    ...base.server,
    port: frontendPort,
    strictPort: true,
    proxy: { '/api': `http://localhost:${backendPort}` },
  },
}
