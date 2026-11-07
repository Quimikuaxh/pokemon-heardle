import { createHash } from 'node:crypto'
import { rateLimited } from './rateLimit'
import type { RateCheck, RateLimiter } from './rateLimit'

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

const RPC_TIMEOUT_MS = 3_000

/**
 * Rate-limit compartido por todas las instancias de la Edge Function (DEC-57): una llamada por peticion a
 * `public.heardle_rate_limit_hit` (supabase/migrations), que cuenta las comprobaciones en orden y devuelve
 * los segundos de espera de la primera que se pasa (0 si ninguna).
 * Las claves (IP, nonce) se guardan como hash: la tabla no conserva direcciones IP.
 * Si la base de datos falla, la peticion sigue: un fallo del contador no debe tumbar el juego.
 */
export class PostgresRateLimiter implements RateLimiter {
  private readonly rpcUrl: string
  private readonly fetchFn: FetchFn

  constructor(
    private readonly options: {
      url: string
      serviceRoleKey: string
      fetchFn?: FetchFn
      onError?: (error: unknown) => void
    },
  ) {
    this.rpcUrl = `${options.url.replace(/\/+$/, '')}/rest/v1/rpc/heardle_rate_limit_hit`
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
  }

  async check(checks: RateCheck[]): Promise<void> {
    const payload = checks.map(({ bucket, key, limit }) => ({ bucket, key: hashKey(key), limit }))
    let retryAfterSec: number
    try {
      const response = await this.fetchFn(this.rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.serviceRoleKey}`,
          apikey: this.options.serviceRoleKey,
        },
        body: JSON.stringify({ checks: payload }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`rate-limit RPC respondio ${response.status}`)
      retryAfterSec = Number(await response.json())
      if (!Number.isInteger(retryAfterSec) || retryAfterSec < 0) throw new Error('rate-limit RPC: respuesta no valida')
    } catch (error) {
      this.options.onError?.(error)
      return
    }
    if (retryAfterSec > 0) throw rateLimited(retryAfterSec)
  }
}

const hashKey = (key: string): string => createHash('sha256').update(key).digest('base64url').slice(0, 22)
