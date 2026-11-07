import { selectUnlimited } from '../catalog'
import type { CatalogIndex } from '../catalog'
import type { Config } from '../config'
import { selectDaily } from '../game/daily'
import { applyGuess, applySkip, buildGameView, createPayload, deriveStatus } from '../game/engine'
import { TicketService } from '../game/tickets'
import { decryptToken, encryptToken } from '../game/token'
import type { TokenPayload } from '../game/token'
import { madridDate } from '../../../shared/date'
import { CLIP_BYTE_OFFSETS } from '../../../shared/rules'
import type { ClipStore } from '../storage/ClipStore'
import { isValidClipFile } from '../storage/clipFormat'
import { AppError, errors } from './errors'
import type { RateCheck, RateLimiter } from './rateLimit'
import { parseCreateGame, parseGuess, parseToken } from './validate'

export const MAX_BODY_BYTES = 4 * 1024

export interface HandlerDeps {
  config: Config
  store: ClipStore
  limiter: RateLimiter
  now: () => number
  randomInt?: (max: number) => number
  /** Catalogo ya cargado, o null mientras se carga. */
  getIndex: () => CatalogIndex | null
  /** Espera a que el catalogo este cargado (lo usa una peticion que llega antes, hasta `config.catalogWaitMs`). */
  catalogReady: Promise<void>
}

/** Manejador HTTP con Request/Response estandar: lo sirven Node (`node/server.ts`) y la Edge Function (`edge/main.ts`), DEC-57. */
export type ApiHandler = (request: Request, clientIp: string) => Promise<Response>

type Route = (request: Request, ip: string, param?: string) => Promise<Response>

const JSON_TYPE = 'application/json; charset=utf-8'

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': JSON_TYPE, ...headers } })

/** Lectura del cuerpo JSON con las mismas reglas que tenia `express.json({ limit: '4kb' })`. */
async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) throw tooLarge()
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase()
  const [mediaType, ...params] = contentType.split(';').map((part) => part.trim())
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length > MAX_BODY_BYTES) throw tooLarge()
  // Sin Content-Type JSON el cuerpo se ignora y el validador lo rechaza (como hacia Express).
  if (mediaType !== 'application/json') return undefined
  const charset = params.find((param) => param.startsWith('charset='))?.slice('charset='.length).replace(/"/g, '')
  if (charset && charset !== 'utf-8' && charset !== 'utf8') {
    throw new AppError('VALIDATION_ERROR', 415, 'El cuerpo de la peticion no es valido.')
  }
  if (bytes.length === 0) return {}
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new AppError('VALIDATION_ERROR', 400, 'El cuerpo de la peticion no es valido.')
  }
  // Modo estricto de body-parser: solo objetos o arrays en la raiz.
  if (typeof value !== 'object' || value === null) {
    throw new AppError('VALIDATION_ERROR', 400, 'El cuerpo de la peticion no es valido.')
  }
  return value
}

const tooLarge = () => new AppError('VALIDATION_ERROR', 413, 'La peticion es demasiado grande.')

export function createHandler(deps: HandlerDeps): ApiHandler {
  const { config, store, limiter, now, randomInt, getIndex, catalogReady } = deps
  const tickets = new TicketService({ secret: config.gameTokenSecret, ttlSec: config.clipTicketTtlSec, now })
  const limits = config.rateLimit
  const allowedOrigin = config.allowedOrigin.replace(/\/+$/, '')

  const limitIp = (ip: string, ...buckets: Array<'global' | 'createGame' | 'action' | 'clips'>) =>
    limiter.check(buckets.map((bucket): RateCheck => ({ bucket, key: ip, limit: limits[bucket] })))

  const requireCatalog = async (): Promise<CatalogIndex> => {
    let index = getIndex()
    if (!index && config.catalogWaitMs > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([catalogReady, new Promise<void>((resolve) => (timer = setTimeout(resolve, config.catalogWaitMs)))])
      clearTimeout(timer)
      index = getIndex()
    }
    if (!index) throw errors.catalogUnavailable()
    return index
  }

  const issueView = (payload: TokenPayload, index: CatalogIndex) => {
    const token = encryptToken(payload, config.gameTokenSecret)
    const isPlaying = deriveStatus(payload) === 'playing'
    const clipUrl = isPlaying
      ? `/api/clips/${tickets.issue({ clipKey: payload.k, attempt: payload.r.length, nonce: payload.n })}`
      : undefined
    return jsonResponse(200, buildGameView(payload, index, { token, clipUrl }))
  }

  // Abre el token y comprueba que la partida sigue siendo coherente con el catalogo actual.
  const openGame = async (token: string, index: CatalogIndex): Promise<TokenPayload> => {
    const payload = decryptToken(token, config.gameTokenSecret, now())
    const referencedKeys = [payload.k, ...payload.q]
    if (referencedKeys.some((clipKey) => !index.songByClipKey(clipKey))) throw errors.tokenInvalid()
    await limiter.check([{ bucket: 'perGame', key: payload.n, limit: limits.perGame }])
    return payload
  }

  const health: Route = async () => {
    await requireCatalog()
    return jsonResponse(200, { ok: true, catalog: true })
  }

  const catalog: Route = async () => jsonResponse(200, (await requireCatalog()).publicCatalog())

  const createGame: Route = async (request, ip) => {
    await limitIp(ip, 'createGame')
    const body = await readJson(request)
    const index = await requireCatalog()
    const parsed = parseCreateGame(body)
    let payload: TokenPayload
    if (parsed.mode === 'daily') {
      const date = madridDate(now())
      const target = selectDaily(index.enabledSongs, index.games, config.dailySeed, date)
      payload = createPayload({ mode: 'daily', target, date, nowMs: now() })
    } else {
      const target = selectUnlimited(index, parsed.games, randomInt)
      payload = createPayload({ mode: 'unlimited', target, nowMs: now() })
    }
    return issueView(payload, index)
  }

  const state: Route = async (request) => {
    const body = await readJson(request)
    const index = await requireCatalog()
    return issueView(await openGame(parseToken(body), index), index)
  }

  const guess: Route = async (request, ip) => {
    await limitIp(ip, 'action')
    const body = await readJson(request)
    const index = await requireCatalog()
    const { token, songId } = parseGuess(body)
    const payload = await openGame(token, index)
    return issueView(applyGuess(payload, songId, index).payload, index)
  }

  const skip: Route = async (request, ip) => {
    await limitIp(ip, 'action')
    const body = await readJson(request)
    const index = await requireCatalog()
    return issueView(applySkip(await openGame(parseToken(body), index)), index)
  }

  const clip: Route = async (_request, ip, ticket = '') => {
    await limitIp(ip, 'clips')
    const { clipKey, attempt } = tickets.redeem(ticket)
    let bytes: Buffer
    try {
      const file = await store.getClip(clipKey)
      if (!isValidClipFile(file)) {
        // Una lectura invalida no debe quedar en la cache: la proxima peticion vuelve a leer del almacen.
        store.evict?.(clipKey)
        throw new Error('formato de clip invalido')
      }
      bytes = file.subarray(0, CLIP_BYTE_OFFSETS[attempt])
    } catch {
      // El fallo es nuestro (almacen o fichero mal formado), no del cliente: el ticket sigue valido (DEC-22).
      tickets.release(ticket)
      throw errors.storage()
    }
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  // HEAD no debe canjear el ticket.
  const clipHead: Route = async () =>
    jsonResponse(405, { error: { code: 'NOT_FOUND', message: 'Metodo no permitido.' } }, { Allow: 'GET' })

  const routes: Partial<Record<string, Route>> = {
    'GET /api/health': health,
    'GET /api/catalog': catalog,
    'POST /api/games': createGame,
    'POST /api/games/state': state,
    'POST /api/games/guess': guess,
    'POST /api/games/skip': skip,
  }

  const route = (method: string, path: string): { fn: Route; param?: string } | undefined => {
    // HEAD de una ruta GET la sirve el GET sin cuerpo (lo recorta quien envia la respuesta).
    const asGet = method === 'HEAD' ? 'GET' : method
    const clipMatch = /^\/api\/clips\/([^/]+)$/.exec(path)
    if (clipMatch) {
      let param: string
      try {
        param = decodeURIComponent(clipMatch[1])
      } catch {
        return undefined
      }
      if (method === 'HEAD') return { fn: clipHead }
      return asGet === 'GET' ? { fn: clip, param } : undefined
    }
    const fn = routes[`${asGet} ${path}`]
    return fn ? { fn } : undefined
  }

  const corsHeaders = (request: Request): Record<string, string> => {
    const origin = request.headers.get('origin')
    return origin === allowedOrigin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' }
  }

  const errorResponse = (error: unknown, request: Request): Response => {
    let appError: AppError
    if (error instanceof AppError) {
      appError = error
    } else {
      if (config.nodeEnv !== 'test') console.error('Error no controlado:', (error as Error)?.message)
      appError = new AppError('INTERNAL_ERROR', 500, 'Error interno del servidor.')
    }
    const headers: Record<string, string> = {}
    const retryAfterSec = (appError as AppError & { retryAfterSec?: number }).retryAfterSec
    if (retryAfterSec) {
      headers['Retry-After'] = String(retryAfterSec)
      // Solo en el 429: el navegador necesita leer Retry-After entre origenes; el resto no expone cabeceras.
      if (request.headers.get('origin') === allowedOrigin) headers['Access-Control-Expose-Headers'] = 'Retry-After'
    }
    return jsonResponse(appError.status, { error: { code: appError.code, message: appError.message } }, headers)
  }

  return async (request, clientIp) => {
    const path = new URL(request.url).pathname
    const cors = corsHeaders(request)

    if (request.method === 'OPTIONS') {
      const headers: Record<string, string> = { ...cors, 'Cache-Control': 'no-store' }
      if (cors['Access-Control-Allow-Origin']) {
        headers['Access-Control-Allow-Methods'] = 'GET,POST'
        const requested = request.headers.get('access-control-request-headers')
        if (requested) headers['Access-Control-Allow-Headers'] = requested
      }
      return new Response(null, { status: 204, headers })
    }

    let response: Response
    try {
      const isApi = path === '/api' || path.startsWith('/api/')
      // Los limitadores por IP van antes de leer el cuerpo de cada ruta (DEC-13).
      if (isApi) await limitIp(clientIp, 'global')
      const match = isApi ? route(request.method, path) : undefined
      if (!match) throw errors.notFound()
      response = await match.fn(request, clientIp, match.param)
    } catch (error) {
      response = errorResponse(error, request)
    }
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value)
    if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-store')
    return response
  }
}
