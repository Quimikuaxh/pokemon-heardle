import type { NextFunction, Request, Response } from 'express'
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
      const retryAfterSec = Math.max(1, Math.ceil((window.startedAt + WINDOW_MS - now) / 1000))
      throw Object.assign(errors.rateLimited(), { retryAfterSec })
    }
  }

  private purgeExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.startedAt + WINDOW_MS > now) break
      this.windows.delete(key)
    }
  }
}

export function ipRateLimit(limiter: FixedWindowLimiter) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      limiter.hit(req.ip ?? 'unknown')
      next()
    } catch (error) {
      next(error)
    }
  }
}
