import { errors } from '../http/errors'
import { open, seal } from './sealedBox'

export const TOKEN_PADDED_BYTES = 384
const MAX_RESULTS = 6
const HEX16 = /^[0-9a-f]{16}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const RESULT_SYMBOLS = new Set(['S', 'M', 'G', 'H'])

export type ResultSymbol = 'S' | 'M' | 'G' | 'H'

export interface TokenPayload {
  v: 1
  n: string
  /** d: diario principal, s: diario spin-off (DEC-60), u: libre. */
  m: 'd' | 's' | 'u'
  d?: string
  k: string
  r: ResultSymbol[]
  q: string[]
  iat: number
  exp: number
}

export function encryptToken(payload: TokenPayload, secret: string): string {
  return seal(payload, secret, 'token', TOKEN_PADDED_BYTES)
}

function isValidShape(value: any): value is TokenPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  if (value.v !== 1) return false
  if (typeof value.n !== 'string' || !HEX16.test(value.n)) return false
  if (value.m !== 'd' && value.m !== 's' && value.m !== 'u') return false
  if ((value.m === 'd' || value.m === 's') && (typeof value.d !== 'string' || !DATE_PATTERN.test(value.d))) return false
  if (typeof value.k !== 'string' || !HEX16.test(value.k)) return false
  if (!Array.isArray(value.r) || value.r.length > MAX_RESULTS) return false
  if (!value.r.every((symbol: unknown) => typeof symbol === 'string' && RESULT_SYMBOLS.has(symbol))) return false
  if (!Array.isArray(value.q) || value.q.length > MAX_RESULTS) return false
  if (!value.q.every((key: unknown) => typeof key === 'string' && HEX16.test(key))) return false
  if (new Set(value.q).size !== value.q.length) return false
  if (value.q.length > value.r.length) return false
  return Number.isFinite(value.iat) && Number.isFinite(value.exp)
}

/** `exp` es exclusivo: en el segundo `exp` el token ya no vale. */
export function decryptToken(token: string, secret: string, nowMs: number): TokenPayload {
  const value = open(token, secret, 'token', TOKEN_PADDED_BYTES)
  if (!isValidShape(value) || nowMs >= value.exp * 1000) throw errors.tokenInvalid()
  return value
}
