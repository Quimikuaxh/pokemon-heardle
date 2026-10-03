import cors from 'cors'
import express from 'express'
import type { ErrorRequestHandler, Express } from 'express'
import { validateCatalog } from '../../shared/catalog'
import { indexCatalog } from './catalog'
import type { CatalogIndex } from './catalog'
import type { Config } from './config'
import { AppError, errors } from './http/errors'
import { createApiRouter } from './http/routes'
import type { ClipStore } from './storage/ClipStore'

const CATALOG_RETRY_START_MS = 1_000
const CATALOG_RETRY_MAX_MS = 60_000

export interface AppDeps {
  config: Config
  store: ClipStore
  now?: () => number
  randomInt?: (max: number) => number
  schedule?: (fn: () => void, delayMs: number) => void
}

const defaultSchedule = (fn: () => void, delayMs: number) => {
  setTimeout(fn, delayMs).unref()
}

export function createApp(deps: AppDeps): Express {
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

  const allowedOrigin = config.allowedOrigin.replace(/\/+$/, '')
  const app = express()
  app.locals.catalogReady = catalogReady
  app.disable('x-powered-by')
  app.set('etag', false)
  app.set('trust proxy', config.trustProxy === 0 ? false : config.trustProxy)

  app.use(
    cors({
      origin: (origin, callback) => callback(null, origin === allowedOrigin),
      methods: ['GET', 'POST'],
    }),
  )
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  // Los limitadores por IP van dentro del router, antes del analisis del cuerpo de cada ruta.
  app.use('/api', createApiRouter({ config, store, now, randomInt: deps.randomInt, getIndex: () => index }))

  app.use((_req, _res, next) => next(errors.notFound()))

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    let appError: AppError
    if (error instanceof AppError) {
      appError = error
    } else if (error?.type === 'entity.too.large') {
      appError = new AppError('VALIDATION_ERROR', 413, 'La peticion es demasiado grande.')
    } else if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
      // Errores de body-parser (JSON mal formado, charset no soportado...): culpa del cliente.
      appError = new AppError('VALIDATION_ERROR', error.status, 'El cuerpo de la peticion no es valido.')
    } else {
      if (config.nodeEnv !== 'test') console.error('Error no controlado:', error?.message)
      appError = new AppError('INTERNAL_ERROR', 500, 'Error interno del servidor.')
    }
    const retryAfterSec = (appError as AppError & { retryAfterSec?: number }).retryAfterSec
    if (retryAfterSec) {
      res.set('Retry-After', String(retryAfterSec))
      // Solo en el 429: el navegador necesita leer Retry-After entre origenes; el resto no expone cabeceras.
      if (req.headers.origin === allowedOrigin) res.set('Access-Control-Expose-Headers', 'Retry-After')
    }
    res.status(appError.status).json({ error: { code: appError.code, message: appError.message } })
  }
  app.use(errorHandler)

  return app
}
