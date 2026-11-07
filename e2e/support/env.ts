import { cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const E2E_DIR = join(import.meta.dirname, '..')
export const DAILY_SEED = 'e2e-daily-seed-fixed-value'
export const GAME_TOKEN_SECRET = Buffer.alloc(32, 7).toString('base64')

export type Variant = 'R' | 'M' | 'RL' | 'X' | 'S'

/**
 * R: catalogo R, sin limites efectivos (varios workers comparten IP).
 * M: catalogo M (una sola cancion, diario determinista).
 * RL: catalogo R con limite de acciones bajo, solo para E2E-37.
 * X: catalogo M con el clip corrupto en el offset del intento 2, solo para E2E-78.
 */
export const VARIANTS: Record<Variant, { store: 'R' | 'M' | 'X' | 'S'; backendPort: number; frontendPort: number; env: Record<string, string> }> = {
  R: { store: 'R', backendPort: 3101, frontendPort: 5101, env: {} },
  M: { store: 'M', backendPort: 3102, frontendPort: 5102, env: {} },
  RL: { store: 'R', backendPort: 3103, frontendPort: 5103, env: { RATE_LIMIT_ACTION: '3' } },
  X: { store: 'X', backendPort: 3104, frontendPort: 5104, env: {} },
  // DEC-60: un juego principal y un spin-off.
  S: { store: 'S', backendPort: 3105, frontendPort: 5105, env: {} },
}

export const baseUrl = (variant: Variant) => `http://localhost:${VARIANTS[variant].frontendPort}`

/**
 * E2E-78 muta el clip del store X: el backend X lee una COPIA temporal y el fixture versionado no se toca.
 * La copia se crea al cargar la config en el proceso principal (antes de levantar los servidores); los workers,
 * que recargan este modulo, no la recrean para no pisarla en mitad de un test.
 */
export const X_STORE_COPY = join(tmpdir(), 'heardle-e2e-store-X')
if (process.env.TEST_WORKER_INDEX === undefined) {
  rmSync(X_STORE_COPY, { recursive: true, force: true })
  cpSync(join(E2E_DIR, 'fixtures', 'X'), X_STORE_COPY, { recursive: true })
}
