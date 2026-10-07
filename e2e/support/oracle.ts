// Oraculo independiente: calcula expectativas a partir del catalogo sintetico y de la formula documentada
// (ARQUITECTURA 4 y DEC-09), sin importar codigo de produccion.
import { createHmac } from 'node:crypto'
import { R_SONGS } from '../fixtures/catalogs.ts'
import type { FixtureSong } from '../fixtures/catalogs.ts'
import { DAILY_SEED } from './env.ts'

import { R_CATALOG } from '../fixtures/catalogs.ts'

export const ENABLED_R = R_SONGS.filter((s) => s.enabled)
export const byId = (id: string) => R_SONGS.find((s) => s.id === id)!
export const byTitle = (title: string) => R_SONGS.find((s) => s.title === title)!

const madrid = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
export const madridToday = (at: number = Date.now()) => madrid.format(at)

export const GAMES_R = R_CATALOG.games
export const gameOf = (song: FixtureSong) => GAMES_R.find((g) => g.id === song.games[0])!
export const GAME_NAME: Record<string, string> = Object.fromEntries(GAMES_R.map((g) => [g.id, g.name]))
/** Nombre sin el prefijo "Pokemon " (asi sale en listas y en el historial). */
export const shortName = (name: string) => name.replace(/^Pok[eé]mon\s+/i, '')

/** Grupo de seleccion de un juego (DEC-54): `selectionGroup` o su propio id. */
const groupOfGame = (gameId: string) => GAMES_R.find((g) => g.id === gameId)!.selectionGroup ?? gameId

/**
 * Cancion del diario del catalogo R (DEC-09 v2, DEC-54), calculada aqui de forma independiente:
 * h = HMAC-SHA256(seed, "daily|v2|"+fecha); grupo = h[0..6) % nGrupos; cancion = h[6..12) % nCanciones del grupo.
 * Grupos con alguna cancion activa, por primera aparicion de alguno de sus juegos; canciones activas por id.
 */
export function dailyTargetR(date: string = madridToday()): FixtureSong {
  const groups: Array<{ id: string; songs: FixtureSong[] }> = []
  for (const game of GAMES_R) {
    const id = groupOfGame(game.id)
    const songs = ENABLED_R.filter((song) => groupOfGame(song.games[0]) === id)
    if (songs.length > 0 && !groups.some((g) => g.id === id)) {
      groups.push({ id, songs: songs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) })
    }
  }
  const mac = createHmac('sha256', DAILY_SEED).update(`daily|v2|${date}`).digest()
  const group = groups[mac.readUIntBE(0, 6) % groups.length]
  return group.songs[mac.readUIntBE(6, 6) % group.songs.length]
}

export type Outcome = 'hit' | 'game' | 'miss'
export function outcomeOf(target: FixtureSong, guess: FixtureSong): Outcome {
  if (target.id === guess.id) return 'hit'
  return guess.games[0] === target.games[0] ? 'game' : 'miss'
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

export const SOLO_C = byId('c-only-song-05') // unica cancion de Charlie: el filtro {Charlie} la fija como objetivo
export const ONLY_D = byId('d-only-song-06') // unica cancion de Delta: filtro {Delta}

export const gamesText = (s: FixtureSong) => s.games.map((g) => GAME_NAME[g]).join(' · ')

/** Cambia un caracter del medio del token para invalidar el cifrado autenticado. */
export function tamper(token: string): string {
  const i = Math.floor(token.length / 2)
  return token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1)
}
export const ONLY_E = byId('e-only-song-09') // Echo (grupo de Delta)
export const ONLY_F = byId('f-only-song-10') // Foxtrot: Switch
export const ONLY_G = byId('g-only-song-11') // Golf: Switch 2
export const ONLY_Z = byId('z-only-song-12') // Zeta: Switch y Switch 2

const CONSOLE_ORDER = ['GB', 'GBC', 'GBA', 'DS', '3DS', 'Switch', 'Switch 2']

export interface ExpectedHint {
  console: { label: string; match: boolean }
  order: 'earlier' | 'later' | null
}

/**
 * Pista esperada (DEC-50) de un fallo: `guess` = elegida, `target` = buscada.
 * Consola: coincide si comparten alguna; etiqueta = primera comun en orden canonico, o la primera de la elegida.
 * Fecha: posicion del juego de la buscada respecto al de la elegida en el orden de `games`.
 */
export function expectedHint(target: FixtureSong, guess: FixtureSong): ExpectedHint {
  const chosen = gameOf(guess)
  const searched = gameOf(target)
  const common = CONSOLE_ORDER.find((name) => chosen.consoles.includes(name) && searched.consoles.includes(name))
  const index = (song: FixtureSong) => GAMES_R.findIndex((g) => g.id === song.games[0])
  const [i, j] = [index(guess), index(target)]
  return {
    console: common ? { label: common, match: true } : { label: chosen.consoles[0], match: false },
    order: i === j ? null : j < i ? 'earlier' : 'later',
  }
}
