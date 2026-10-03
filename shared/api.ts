// DTOs de la API (ARQUITECTURA 5).
export type ResultName = 'skip' | 'miss' | 'game' | 'hit'
export interface SolutionView { id: string; title: string; games: Array<{ id: string; name: string }> }
export interface GameView {
  token: string; mode: 'daily' | 'unlimited'; date?: string; status: 'playing' | 'won' | 'lost'
  attempt: number; maxAttempts: 6; clipSeconds: number[]; results: ResultName[]; guesses: string[]
  clipUrl?: string; solution?: SolutionView
}
export interface PublicCatalog {
  version: number
  games: Array<{ id: string; name: string }>
  songs: Array<{ id: string; title: string; games: string[] }>
}
export type CreateGameBody = { mode: 'daily' } | { mode: 'unlimited'; games: string[] }
