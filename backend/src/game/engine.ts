import { randomBytes } from 'node:crypto'
import type { GameView, ResultName } from '../../../shared/api'
import type { Song } from '../../../shared/catalog'
import { addDays, madridDate } from '../../../shared/date'
import { CLIP_SECONDS, MAX_ATTEMPTS } from '../../../shared/rules'
import type { CatalogIndex } from '../catalog'
import { errors } from '../http/errors'
import type { ResultSymbol, TokenPayload } from './token'

const UNLIMITED_TTL_SEC = 24 * 60 * 60
const DAILY_GRACE_SEC = 6 * 60 * 60
const MADRID_UTC_OFFSETS_MS = [2 * 3_600_000, 3_600_000] // CEST, CET

const RESULT_NAMES: Record<ResultSymbol, ResultName> = { S: 'skip', M: 'miss', G: 'game', H: 'hit' }

/** Primer instante del dia siguiente a `date` en Madrid (el dia dura 23, 24 o 25 h). */
function endOfMadridDayMs(date: string): number {
  const nextDay = addDays(date, 1)
  const [year, month, day] = nextDay.split('-').map(Number)
  const utcMidnight = Date.UTC(year, month - 1, day)
  for (const offset of MADRID_UTC_OFFSETS_MS) {
    const candidate = utcMidnight - offset
    if (madridDate(candidate) === nextDay && madridDate(candidate - 1000) === date) return candidate
  }
  return utcMidnight - MADRID_UTC_OFFSETS_MS[1]
}

export function createPayload(options: {
  mode: 'daily' | 'unlimited'
  target: Song
  date?: string
  nowMs: number
}): TokenPayload {
  const iat = Math.floor(options.nowMs / 1000)
  const base = { v: 1 as const, n: randomBytes(8).toString('hex'), k: options.target.clipKey, r: [], q: [], iat }
  if (options.mode === 'daily') {
    if (!options.date) throw new Error('El modo diario necesita fecha')
    return {
      ...base,
      m: 'd',
      d: options.date,
      exp: Math.floor(endOfMadridDayMs(options.date) / 1000) + DAILY_GRACE_SEC,
    }
  }
  return { ...base, m: 'u', exp: iat + UNLIMITED_TTL_SEC }
}

export function deriveStatus(payload: TokenPayload): 'playing' | 'won' | 'lost' {
  if (payload.r[payload.r.length - 1] === 'H') return 'won'
  return payload.r.length >= MAX_ATTEMPTS ? 'lost' : 'playing'
}

export function applySkip(payload: TokenPayload): TokenPayload {
  if (deriveStatus(payload) !== 'playing') throw errors.gameOver()
  return { ...payload, r: [...payload.r, 'S'] }
}

/**
 * Prioridad de errores: GAME_OVER > UNKNOWN_SONG > ALREADY_GUESSED.
 * No muta `payload`; un rechazo no cambia ningun estado.
 */
export function applyGuess(
  payload: TokenPayload,
  songId: string,
  index: CatalogIndex,
): { payload: TokenPayload; result: 'H' | 'G' | 'M' } {
  if (deriveStatus(payload) !== 'playing') throw errors.gameOver()
  const chosen = index.songById(songId)
  if (!chosen) throw errors.unknownSong()
  if (payload.q.includes(chosen.clipKey)) throw errors.alreadyGuessed()

  const target = index.songByClipKey(payload.k)
  if (!target) throw errors.tokenInvalid()
  const result = chosen.clipKey === target.clipKey ? 'H' : sharesGame(chosen, target) ? 'G' : 'M'
  return {
    payload: { ...payload, r: [...payload.r, result], q: [...payload.q, chosen.clipKey] },
    result,
  }
}

function sharesGame(a: Song, b: Song): boolean {
  return a.games.some((gameId) => b.games.includes(gameId))
}

export function buildGameView(
  payload: TokenPayload,
  index: CatalogIndex,
  extras: { token: string; clipUrl?: string },
): GameView {
  const status = deriveStatus(payload)
  const guesses = payload.q.map((clipKey) => index.songByClipKey(clipKey)?.id).filter((id): id is string => !!id)
  const view: GameView = {
    token: extras.token,
    mode: payload.m === 'd' ? 'daily' : 'unlimited',
    status,
    attempt: payload.r.length,
    maxAttempts: MAX_ATTEMPTS as 6,
    clipSeconds: [...CLIP_SECONDS],
    results: payload.r.map((symbol) => RESULT_NAMES[symbol]),
    guesses,
  }
  if (payload.m === 'd') view.date = payload.d
  if (status === 'playing' && extras.clipUrl) view.clipUrl = extras.clipUrl
  if (status !== 'playing') {
    const target = index.songByClipKey(payload.k)
    if (target) {
      view.solution = {
        id: target.id,
        title: target.title,
        games: target.games.map((gameId) => ({ id: gameId, name: index.gameById(gameId)?.name ?? gameId })),
        // Solo en la solucion revelada: el cliente nunca lo recibe antes de terminar (DEC-41).
        youtubeId: target.source.youtubeId,
      }
    }
  }
  return view
}
