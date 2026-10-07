import express, { Router } from 'express'
import type { Request, RequestHandler, Response } from 'express'
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
import { errors } from './errors'
import { FixedWindowLimiter, ipRateLimit } from './rateLimit'
import { parseCreateGame, parseGuess, parseToken } from './validate'

export interface RouteDeps {
  config: Config
  store: ClipStore
  now: () => number
  randomInt?: (max: number) => number
  getIndex: () => CatalogIndex | null
}

export function createApiRouter(deps: RouteDeps): Router {
  const { config, store, now, randomInt, getIndex } = deps
  const router = Router()
  const tickets = new TicketService({ secret: config.gameTokenSecret, ttlSec: config.clipTicketTtlSec, now })

  const globalLimiter = new FixedWindowLimiter(config.rateLimit.global, now)
  const createGameLimiter = new FixedWindowLimiter(config.rateLimit.createGame, now)
  const actionLimiter = new FixedWindowLimiter(config.rateLimit.action, now)
  const clipsLimiter = new FixedWindowLimiter(config.rateLimit.clips, now)
  const perGameLimiter = new FixedWindowLimiter(config.rateLimit.perGame, now)

  const requireCatalog = (): CatalogIndex => {
    const index = getIndex()
    if (!index) throw errors.catalogUnavailable()
    return index
  }

  const issueView = (payload: TokenPayload, index: CatalogIndex) => {
    const token = encryptToken(payload, config.gameTokenSecret)
    const isPlaying = deriveStatus(payload) === 'playing'
    const clipUrl = isPlaying
      ? `/api/clips/${tickets.issue({ clipKey: payload.k, attempt: payload.r.length, nonce: payload.n })}`
      : undefined
    return buildGameView(payload, index, { token, clipUrl })
  }

  // Abre el token y comprueba que la partida sigue siendo coherente con el catalogo actual.
  const openGame = (token: string, index: CatalogIndex): TokenPayload => {
    const payload = decryptToken(token, config.gameTokenSecret, now())
    const referencedKeys = [payload.k, ...payload.q]
    if (referencedKeys.some((clipKey) => !index.songByClipKey(clipKey))) throw errors.tokenInvalid()
    perGameLimiter.hit(payload.n)
    return payload
  }

  const jsonBody = express.json({ limit: '4kb' })

  const handle =
    (fn: (req: Request, res: Response) => Promise<void> | void): RequestHandler =>
    async (req, res, next) => {
      try {
        await fn(req, res)
      } catch (error) {
        next(error)
      }
    }

  router.use(ipRateLimit(globalLimiter))

  router.get(
    '/health',
    handle((_req, res) => {
      requireCatalog()
      res.json({ ok: true, catalog: true })
    }),
  )

  router.get(
    '/catalog',
    handle((_req, res) => {
      res.json(requireCatalog().publicCatalog())
    }),
  )

  router.post(
    '/games',
    ipRateLimit(createGameLimiter),
    jsonBody,
    handle((req, res) => {
      const index = requireCatalog()
      const request = parseCreateGame(req.body)
      let payload: TokenPayload
      if (request.mode === 'daily') {
        const date = madridDate(now())
        const target = selectDaily(index.enabledSongs, index.games, config.dailySeed, date)
        payload = createPayload({ mode: 'daily', target, date, nowMs: now() })
      } else {
        const target = selectUnlimited(index, request.games, randomInt)
        payload = createPayload({ mode: 'unlimited', target, nowMs: now() })
      }
      res.json(issueView(payload, index))
    }),
  )

  router.post(
    '/games/state',
    jsonBody,
    handle((req, res) => {
      const index = requireCatalog()
      const payload = openGame(parseToken(req.body), index)
      res.json(issueView(payload, index))
    }),
  )

  router.post(
    '/games/guess',
    ipRateLimit(actionLimiter),
    jsonBody,
    handle((req, res) => {
      const index = requireCatalog()
      const { token, songId } = parseGuess(req.body)
      const payload = openGame(token, index)
      res.json(issueView(applyGuess(payload, songId, index).payload, index))
    }),
  )

  router.post(
    '/games/skip',
    ipRateLimit(actionLimiter),
    jsonBody,
    handle((req, res) => {
      const index = requireCatalog()
      const payload = openGame(parseToken(req.body), index)
      res.json(issueView(applySkip(payload), index))
    }),
  )

  // HEAD no debe canjear el ticket: Express lo enrutaria al GET.
  router.head('/clips/:ticket', (_req, res) => {
    res.status(405).set('Allow', 'GET').end()
  })

  router.get(
    '/clips/:ticket',
    ipRateLimit(clipsLimiter),
    handle(async (req, res) => {
      const ticket = String(req.params.ticket)
      const { clipKey, attempt } = tickets.redeem(ticket)
      let clip: Buffer
      try {
        const file = await store.getClip(clipKey)
        if (!isValidClipFile(file)) {
          // Una lectura invalida no debe quedar en la cache: la proxima peticion vuelve a leer del almacen.
          store.evict?.(clipKey)
          throw new Error('formato de clip invalido')
        }
        clip = file.subarray(0, CLIP_BYTE_OFFSETS[attempt])
      } catch {
        // El fallo es nuestro (almacen o fichero mal formado), no del cliente: el ticket sigue valido (DEC-22).
        tickets.release(ticket)
        throw errors.storage()
      }
      res
        .status(200)
        .set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(clip.length),
          'Cache-Control': 'no-store, private',
          'X-Content-Type-Options': 'nosniff',
        })
        .end(clip)
    }),
  )

  return router
}
