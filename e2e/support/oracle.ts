// Oraculo independiente: calcula expectativas a partir del catalogo sintetico y de la formula documentada
// (ARQUITECTURA 4 y DEC-09), sin importar codigo de produccion.
import { createHmac } from 'node:crypto'
import { R_SONGS } from '../fixtures/catalogs.ts'
import type { FixtureSong } from '../fixtures/catalogs.ts'
import { DAILY_SEED } from './env.ts'

export const ENABLED_R = R_SONGS.filter((s) => s.enabled)
export const byId = (id: string) => R_SONGS.find((s) => s.id === id)!
export const byTitle = (title: string) => R_SONGS.find((s) => s.title === title)!

const madrid = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
export const madridToday = (at: number = Date.now()) => madrid.format(at)

/** Cancion del diario del catalogo R: HMAC-SHA256(seed, "daily|v1|"+fecha) sobre las habilitadas ordenadas por id. */
export function dailyTargetR(date: string = madridToday()): FixtureSong {
  const sorted = [...ENABLED_R].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const mac = createHmac('sha256', DAILY_SEED).update(`daily|v1|${date}`).digest()
  return sorted[mac.readUIntBE(0, 6) % sorted.length]
}

export type Outcome = 'hit' | 'game' | 'miss'
export function outcomeOf(target: FixtureSong, guess: FixtureSong): Outcome {
  if (target.id === guess.id) return 'hit'
  return guess.games.some((g) => target.games.includes(g)) ? 'game' : 'miss'
}

export const LABEL: Record<Outcome | 'skip', string> = {
  hit: 'Acertada',
  game: 'Juego acertado',
  miss: 'Juego incorrecto',
  skip: 'Saltado',
}
export const EMOJI: Record<Outcome | 'skip', string> = { hit: '🟩', game: '🟨', miss: '🟥', skip: '⬛' }

/** Canciones habilitadas distintas de la objetivo, en orden estable. */
export const nonTargets = (target: FixtureSong) => ENABLED_R.filter((s) => s.id !== target.id)

export const MULTI = byId('ab-multi-game-song-017') // juegos A y C: filtro {C} la fija como objetivo
export const ONLY_D = byId('d-only-song-06') // filtro {D} la fija como objetivo

export const GAME_NAME: Record<string, string> = {
  A: 'Pokemon Game Alpha',
  B: 'Pokemon Game Bravo',
  C: 'Pokemon Game Charlie',
  D: 'Pokemon Game Delta',
}
export const gamesText = (s: FixtureSong) => s.games.map((g) => GAME_NAME[g]).join(' · ')

/** Cambia un caracter del medio del token para invalidar el cifrado autenticado. */
export function tamper(token: string): string {
  const i = Math.floor(token.length / 2)
  return token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1)
}
