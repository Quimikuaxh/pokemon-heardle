import { validateCatalog } from '../../shared/catalog'
import { indexCatalog } from './catalog'
import type { CatalogIndex } from './catalog'
import type { Config } from './config'
import { createHandler } from './http/handler'
import type { ApiHandler } from './http/handler'
import { MemoryRateLimiter } from './http/rateLimit'
import type { RateLimiter } from './http/rateLimit'
import type { ClipStore } from './storage/ClipStore'

const CATALOG_RETRY_START_MS = 1_000
const CATALOG_RETRY_MAX_MS = 60_000

export interface AppDeps {
  config: Config
  store: ClipStore
  /** Por defecto, en memoria (Node). La Edge Function usa Postgres (DEC-57). */
  limiter?: RateLimiter
  now?: () => number
  randomInt?: (max: number) => number
  schedule?: (fn: () => void, delayMs: number) => void
}

export interface App {
  handle: ApiHandler
  /** Resuelve al cargar el catalogo; mientras no carga, reintenta con backoff via `schedule`. */
  catalogReady: Promise<void>
}

const defaultSchedule = (fn: () => void, delayMs: number) => {
  const timer = setTimeout(fn, delayMs) as unknown as { unref?: () => void }
  // Node: el reintento no mantiene vivo el proceso. Deno no tiene unref en el temporizador.
  timer.unref?.()
}

export function createApp(deps: AppDeps): App {
  const { config, store } = deps
  const now = deps.now ?? Date.now
  const schedule = deps.schedule ?? defaultSchedule

  let index: CatalogIndex | null = null
  let retryDelayMs = CATALOG_RETRY_START_MS
  let markCatalogReady: () => void = () => {}
  const catalogReady = new Promise<void>((resolve) => {
    markCatalogReady = resolve
  })

  const loadCatalog = async (): Promise<void> => {
    try {
      const validation = validateCatalog(await store.getCatalog())
      if (!validation.ok) throw new Error(`Catalogo invalido: ${validation.errors.length} errores`)
      index = indexCatalog(validation.catalog)
      markCatalogReady()
    } catch (error) {
      if (config.nodeEnv !== 'test') console.error('No se pudo cargar el catalogo:', (error as Error).message)
      schedule(() => void loadCatalog(), retryDelayMs)
      retryDelayMs = Math.min(retryDelayMs * 2, CATALOG_RETRY_MAX_MS)
    }
  }
  void loadCatalog()

  const handle = createHandler({
    config,
    store,
    limiter: deps.limiter ?? new MemoryRateLimiter(now),
    now,
    randomInt: deps.randomInt,
    getIndex: () => index,
    catalogReady,
  })
  return { handle, catalogReady }
}
