import 'dotenv/config'
import { createApp } from './app'
import { createNodeServer } from './node/server'
import { loadConfig } from './config'
import { CachedClipStore } from './storage/CachedClipStore'
import { FsClipStore } from './storage/FsClipStore'
import { LruCache } from './storage/LruCache'

// Servidor Node: desarrollo local y e2e, con el catalogo y los clips en disco. Produccion es la Edge Function (DEC-57).
const config = loadConfig(process.env)

if (config.storageDriver !== 'fs' || config.rateLimitStore !== 'memory') {
  throw new Error('El servidor Node solo admite STORAGE_DRIVER=fs y RATE_LIMIT_STORE=memory; supabase/postgres son de la Edge Function')
}

const store = new CachedClipStore(new FsClipStore(config.storageDir), new LruCache(config.clipCacheMb * 1024 * 1024))

const app = createApp({ config, store })
createNodeServer(app.handle, config.trustProxy).listen(config.port, () => {
  console.log(`pokemon-heardle backend escuchando en el puerto ${config.port}`)
})
