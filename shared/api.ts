// DTOs de la API (ARQUITECTURA 5).
import type { ConsoleName } from './rules'

export type ResultName = 'skip' | 'miss' | 'game' | 'hit'
/**
 * Pista de un fallo (DEC-50), calculada en el servidor y enviada siempre. `order` describe el juego de la cancion
 * BUSCADA respecto al de la elegida (`earlier` = la buscada es de un juego anterior); null si es el mismo juego.
 */
export interface AttemptHint {
  console: { label: ConsoleName; match: boolean } | null
  order: 'earlier' | 'later' | null
}
export interface SolutionView { id: string; title: string; games: Array<{ id: string; name: string }>; youtubeId: string }
export interface GameView {
  token: string; mode: 'daily' | 'unlimited'; date?: string; status: 'playing' | 'won' | 'lost'
  attempt: number; maxAttempts: 6; clipSeconds: number[]; results: ResultName[]; guesses: string[]
  /** Alineado con `results`: null en skip y en acierto. */
  hints: Array<AttemptHint | null>
  clipUrl?: string; solution?: SolutionView
}
export interface PublicCatalog {
  version: number
  games: Array<{ id: string; name: string }>
  songs: Array<{ id: string; title: string; games: string[] }>
}
export type CreateGameBody = { mode: 'daily' } | { mode: 'unlimited'; games: string[] }
