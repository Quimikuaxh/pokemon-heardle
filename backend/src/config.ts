export interface RateLimitConfig {
  global: number
  createGame: number
  action: number
  clips: number
  perGame: number
}

export interface Config {
  port: number
  nodeEnv: string
  allowedOrigin: string
  gameTokenSecret: string
  dailySeed: string
  /** fs: local, e2e y tests; supabase: Edge Function (DEC-57). */
  storageDriver: 'fs' | 'supabase'
  storageDir: string
  storageBucket?: string
  /** Driver `supabase` (Edge Function, DEC-57): API REST de Storage y PostgREST con la clave service_role. */
  supabaseUrl?: string
  supabaseServiceRoleKey?: string
  rateLimitStore: 'memory' | 'postgres'
  /** Cuanto espera una peticion a que cargue el catalogo antes de responder 503 (0 = no espera). */
  catalogWaitMs: number
  clipTicketTtlSec: number
  clipCacheMb: number
  trustProxy: number
  rateLimit: RateLimitConfig
}

type Env = Record<string, string | undefined>

const MIN_SECRET_BYTES = 32

function readInt(env: Env, name: string, fallback: number, min = 0): number {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) throw new Error(`${name} debe ser un entero >= ${min}`)
  return value
}

function requireValue(env: Env, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`Falta la variable de entorno ${name}`)
  return value
}

// Los mensajes de error nombran la variable, nunca su valor.
export function loadConfig(env: Env): Config {
  const gameTokenSecret = requireValue(env, 'GAME_TOKEN_SECRET')
  if (Buffer.from(gameTokenSecret, 'base64').length < MIN_SECRET_BYTES) {
    throw new Error(`GAME_TOKEN_SECRET debe tener al menos ${MIN_SECRET_BYTES} bytes en base64`)
  }
  const dailySeed = requireValue(env, 'DAILY_SEED')

  const storageDriver = env.STORAGE_DRIVER ?? 'fs'
  if (storageDriver !== 'fs' && storageDriver !== 'supabase') {
    throw new Error('STORAGE_DRIVER debe ser "fs" o "supabase"')
  }
  const rateLimitStore = env.RATE_LIMIT_STORE || 'memory'
  if (rateLimitStore !== 'memory' && rateLimitStore !== 'postgres') {
    throw new Error('RATE_LIMIT_STORE debe ser "memory" o "postgres"')
  }
  if (storageDriver === 'supabase' || rateLimitStore === 'postgres') {
    for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) requireValue(env, name)
  }
  if (storageDriver === 'supabase') requireValue(env, 'STORAGE_BUCKET')

  return {
    port: readInt(env, 'PORT', 3002),
    nodeEnv: env.NODE_ENV ?? 'development',
    allowedOrigin: env.ALLOWED_ORIGIN || 'http://localhost:5173',
    gameTokenSecret,
    dailySeed,
    storageDriver,
    storageDir: env.STORAGE_DIR || '../scripts/catalog/data/out',
    storageBucket: env.STORAGE_BUCKET,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    rateLimitStore,
    catalogWaitMs: readInt(env, 'CATALOG_WAIT_MS', 0),
    clipTicketTtlSec: readInt(env, 'CLIP_TICKET_TTL_SEC', 60),
    clipCacheMb: readInt(env, 'CLIP_CACHE_MB', 32),
    trustProxy: readInt(env, 'TRUST_PROXY', 1),
    rateLimit: {
      global: readInt(env, 'RATE_LIMIT_GLOBAL', 120, 1),
      createGame: readInt(env, 'RATE_LIMIT_CREATE_GAME', 20, 1),
      action: readInt(env, 'RATE_LIMIT_ACTION', 40, 1),
      clips: readInt(env, 'RATE_LIMIT_CLIPS', 30, 1),
      perGame: readInt(env, 'RATE_LIMIT_PER_GAME', 12, 1),
    },
  }
}
