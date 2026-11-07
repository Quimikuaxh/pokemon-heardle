import { errors } from './errors'

const WINDOW_MS = 60_000

interface Window {
  startedAt: number
  hits: number
}

/**
 * Ventana fija de 60 s en memoria con reloj inyectable (los tests mueven el tiempo).
 * Sin Redis: una sola instancia y perder contadores al reiniciar es aceptable (DEC-13).
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>()

  constructor(
    private readonly limit: number,
    private readonly now: () => number,
  ) {}

  /** Cuenta un golpe para `key`; lanza RATE_LIMITED con los segundos de espera si se supera el limite. */
  hit(key: string): void {
    const now = this.now()
    this.purgeExpired(now)
    let window = this.windows.get(key)
    if (!window) {
      window = { startedAt: now, hits: 0 }
      this.windows.set(key, window)
    }
    window.hits += 1
    if (window.hits > this.limit) {
      throw rateLimited(Math.max(1, Math.ceil((window.startedAt + WINDOW_MS - now) / 1000)))
    }
  }

  private purgeExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.startedAt + WINDOW_MS > now) break
      this.windows.delete(key)
    }
  }
}

export const rateLimited = (retryAfterSec: number) => Object.assign(errors.rateLimited(), { retryAfterSec })

/** Contador con nombre (global, createGame, action, clips, perGame) y la clave contada (IP o nonce de la partida). */
export interface RateCheck {
  bucket: string
  key: string
  limit: number
}

/**
 * Cuenta las comprobaciones en orden y lanza RATE_LIMITED en la primera que supera su limite
 * (las anteriores ya quedan contadas, como cuando eran middlewares encadenados).
 */
export interface RateLimiter {
  check(checks: RateCheck[]): Promise<void>
}

/** Rate-limit en memoria: Node (desarrollo, e2e, Render). */
export class MemoryRateLimiter implements RateLimiter {
  private readonly limiters = new Map<string, FixedWindowLimiter>()

  constructor(private readonly now: () => number) {}

  async check(checks: RateCheck[]): Promise<void> {
    for (const { bucket, key, limit } of checks) {
      const id = `${bucket}:${limit}`
      let limiter = this.limiters.get(id)
      if (!limiter) {
        limiter = new FixedWindowLimiter(limit, this.now)
        this.limiters.set(id, limiter)
      }
      limiter.hit(key)
    }
  }
}
