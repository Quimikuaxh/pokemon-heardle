/**
 * Entrada de la Edge Function `heardle` (Deno, DEC-57). Se empaqueta con esbuild (`npm run build:edge`)
 * en supabase/functions/heardle/index.js. La URL publica es <SUPABASE_URL>/functions/v1/heardle/api/...
 */
import { createApp } from '../app'
import { loadConfig } from '../config'
import { PostgresRateLimiter } from '../http/postgresRateLimiter'
import { CachedClipStore } from '../storage/CachedClipStore'
import { LruCache } from '../storage/LruCache'
import { SupabaseClipStore } from '../storage/SupabaseClipStore'

declare const Deno: {
  env: { toObject(): Record<string, string> }
  serve(handler: (request: Request, info: { remoteAddr: { hostname: string } }) => Promise<Response>): unknown
}

const FUNCTION_PREFIX = /^\/heardle(?=\/|$)/

/**
 * Los secretos de las Edge Functions son de todo el proyecto (compartido con daily-pwt): los de esta funcion
 * llevan el prefijo HEARDLE_ (HEARDLE_GAME_TOKEN_SECRET -> GAME_TOKEN_SECRET) para no chocar con los de otra.
 * Solo SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, que pone Supabase, se leen sin prefijo.
 */
function edgeEnv(all: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = { SUPABASE_URL: all.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: all.SUPABASE_SERVICE_ROLE_KEY }
  for (const [name, value] of Object.entries(all)) {
    if (name.startsWith('HEARDLE_')) env[name.slice('HEARDLE_'.length)] = value
  }
  return env
}

const config = loadConfig({
  NODE_ENV: 'production',
  STORAGE_DRIVER: 'supabase',
  RATE_LIMIT_STORE: 'postgres',
  STORAGE_BUCKET: 'heardle-audio',
  CATALOG_WAIT_MS: '8000',
  ...edgeEnv(Deno.env.toObject()),
})

const store = new CachedClipStore(
  new SupabaseClipStore({ url: config.supabaseUrl!, serviceRoleKey: config.supabaseServiceRoleKey!, bucket: config.storageBucket! }),
  new LruCache(config.clipCacheMb * 1024 * 1024),
)
const limiter = new PostgresRateLimiter({
  url: config.supabaseUrl!,
  serviceRoleKey: config.supabaseServiceRoleKey!,
  onError: (error) => console.error('Rate-limit no disponible:', (error as Error).message),
})
const app = createApp({ config, store, limiter })

/**
 * IP del cliente: la pone el proxy de Supabase. Se toma la primera de X-Forwarded-For
 * (el proxy de Supabase la reescribe: comprobado el 2026-11-07, ver DEC-57); sin cabecera, la del socket.
 */
function clientIp(request: Request, fallback: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || fallback
}

Deno.serve(async (request, info) => {
  const url = new URL(request.url)
  url.pathname = url.pathname.replace(FUNCTION_PREFIX, '') || '/'
  return app.handle(new Request(url, request), clientIp(request, info.remoteAddr.hostname))
})
