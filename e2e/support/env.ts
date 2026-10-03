import { join } from 'node:path'

export const E2E_DIR = join(import.meta.dirname, '..')
export const DAILY_SEED = 'e2e-daily-seed-fixed-value'
export const GAME_TOKEN_SECRET = Buffer.alloc(32, 7).toString('base64')

export type Variant = 'R' | 'M' | 'RL'

/**
 * R: catalogo R, sin limites efectivos (varios workers comparten IP).
 * M: catalogo M (una sola cancion, diario determinista).
 * RL: catalogo R con limite de acciones bajo, solo para E2E-37.
 */
export const VARIANTS: Record<Variant, { store: 'R' | 'M'; backendPort: number; frontendPort: number; env: Record<string, string> }> = {
  R: { store: 'R', backendPort: 3101, frontendPort: 5101, env: {} },
  M: { store: 'M', backendPort: 3102, frontendPort: 5102, env: {} },
  RL: { store: 'R', backendPort: 3103, frontendPort: 5103, env: { RATE_LIMIT_ACTION: '3' } },
}

export const baseUrl = (variant: Variant) => `http://localhost:${VARIANTS[variant].frontendPort}`
