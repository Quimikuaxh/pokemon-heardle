// Proceso hijo de los E2E del admin: arranca el servidor REAL del admin (scripts/catalog/src/admin/server.ts)
// contra el directorio de datos que se le pasa (siempre uno temporal) y avisa por stdout con una linea JSON.
import { startAdminServer } from '../../scripts/catalog/src/admin/server.ts'

const [dataDir, uiDir] = process.argv.slice(2)
if (!dataDir || !uiDir) throw new Error('uso: admin-launcher <dataDir> <uiDir>')
const server = await startAdminServer({ dataDir, uiDir, port: 0 })
console.log(JSON.stringify({ url: server.url, port: server.port, token: server.token }))
const stop = () => void server.close().then(() => process.exit(0))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
