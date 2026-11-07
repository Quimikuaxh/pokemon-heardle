// Tipos de catalog.json y su validador (lo usan backend y script de catalogo).
import { CONSOLES, SERIES } from './rules'
import type { ConsoleName, Series } from './rules'
export interface Game {
  id: string
  name: string
  /** Consolas del juego (varias en Legends: Z-A); en orden canonico. Opcional aqui, `validate` del script la exige. */
  consoles?: ConsoleName[]
  /** Juego "cabeza" del grupo de seleccion (DEC-54). Ausente: el juego es su propio grupo. */
  selectionGroup?: string
  /** Serie (DEC-60). Ausente: `main`. */
  series?: Series
}

/** Serie efectiva de un juego (DEC-60): sin `series`, la principal. */
export const seriesOf = (game: { series?: Series }): Series => game.series ?? 'main'
export interface Song {
  id: string; title: string; games: string[]; clipKey: string
  /** Segundo de la fuente donde empieza el clip. Automatico (silencio inicial, DEC-47) salvo `startSecManual`. */
  startSec: number
  /** true: startSec lo fijo una persona y la medicion automatica nunca lo toca. */
  startSecManual?: boolean
  enabled: boolean; reviewed: boolean
  source: { youtubeId: string; videoTitle: string; durationSec?: number; leadingSilenceSec?: number }
}
export interface Catalog { version: 1; generatedAt: string; games: Game[]; songs: Song[] }
export type ValidationResult = { ok: true; catalog: Catalog } | { ok: false; errors: string[] }
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const SLUG_PATTERN = /^[a-z0-9-]+$/
// Los ids de juego admiten mayusculas: los fixtures de tests los usan (A, B, ...) y se envian tal cual en el filtro.
const GAME_ID_PATTERN = /^[A-Za-z0-9-]+$/
const CLIP_KEY_PATTERN = /^[0-9a-f]{16}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const describeValue = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function validateGames(rawGames: unknown, errors: string[]): Set<string> {
  const gameIds = new Set<string>()
  if (!Array.isArray(rawGames)) {
    errors.push('games debe ser un array')
    return gameIds
  }
  rawGames.forEach((game, index) => {
    if (!isRecord(game)) {
      errors.push(`games[${index}] debe ser un objeto`)
      return
    }
    const { id, name } = game
    if (typeof id !== 'string' || !GAME_ID_PATTERN.test(id)) {
      errors.push(`games[${index}].id invalido: ${describeValue(id)} (se espera [A-Za-z0-9-]+)`)
    } else if (gameIds.has(id)) {
      errors.push(`id de juego duplicado: ${id}`)
    } else {
      gameIds.add(id)
    }
    if (typeof name !== 'string' || name.trim() === '') {
      errors.push(`games[${index}].name debe ser un texto no vacio (juego ${describeValue(id)})`)
    }
    if (game.consoles !== undefined) validateConsoles(game.consoles, describeValue(id), errors)
    if (game.series !== undefined && !(SERIES as readonly unknown[]).includes(game.series)) {
      errors.push(`juego ${describeValue(id)}: series debe ser ${SERIES.join(' o ')} (recibido ${describeValue(game.series)})`)
    }
  })
  validateSelectionGroups(rawGames, gameIds, errors)
  return gameIds
}

function validateConsoles(consoles: unknown, gameLabel: string, errors: string[]): void {
  const known: readonly string[] = CONSOLES
  if (!Array.isArray(consoles) || consoles.length === 0 || !consoles.every((name) => typeof name === 'string' && known.includes(name))) {
    errors.push(`juego ${gameLabel}: consoles debe ser una lista no vacia con valores de ${CONSOLES.join(', ')} (recibido ${describeValue(consoles)})`)
    return
  }
  if (new Set(consoles).size !== consoles.length) {
    errors.push(`juego ${gameLabel}: consoles tiene valores repetidos (${describeValue(consoles)})`)
    return
  }
  const positions = consoles.map((name) => known.indexOf(name as string))
  if (positions.some((position, index) => index > 0 && position < positions[index - 1])) {
    errors.push(`juego ${gameLabel}: consoles debe ir en orden canonico (${CONSOLES.join(', ')}), recibido ${describeValue(consoles)}`)
  }
}

/** selectionGroup: id de un juego "cabeza" (cuyo propio grupo es el mismo): sin cadenas ni ciclos (DEC-54). */
function validateSelectionGroups(rawGames: unknown[], gameIds: Set<string>, errors: string[]): void {
  const groupOf = new Map<string, string>()
  const seriesById = new Map<string, unknown>()
  for (const game of rawGames) {
    if (!isRecord(game) || typeof game.id !== 'string') continue
    groupOf.set(game.id, typeof game.selectionGroup === 'string' ? game.selectionGroup : game.id)
    if (game.series !== undefined) seriesById.set(game.id, game.series)
  }
  for (const game of rawGames) {
    if (!isRecord(game) || typeof game.id !== 'string' || game.selectionGroup === undefined) continue
    const { id, selectionGroup } = game
    if (typeof selectionGroup !== 'string' || !GAME_ID_PATTERN.test(selectionGroup)) {
      errors.push(`juego ${id}: selectionGroup debe ser un id de juego (recibido ${describeValue(selectionGroup)})`)
    } else if (!gameIds.has(selectionGroup)) {
      errors.push(`juego ${id}: selectionGroup apunta a un juego inexistente (${selectionGroup})`)
    } else if (groupOf.get(selectionGroup) !== selectionGroup) {
      errors.push(`juego ${id}: selectionGroup ${selectionGroup} no es un juego cabeza de grupo (ya pertenece a ${groupOf.get(selectionGroup)}); no se permiten cadenas`)
    } else if ((seriesById.get(id) ?? 'main') !== (seriesById.get(selectionGroup) ?? 'main')) {
      // Cada diario elige grupos de una sola serie (DEC-60): un grupo no puede mezclar series.
      errors.push(`juego ${id}: selectionGroup ${selectionGroup} es de otra serie; un grupo no puede mezclar principal y spin-off`)
    }
  }
}

function validateSong(
  song: unknown,
  index: number,
  gameIds: Set<string>,
  seenSongIds: Set<string>,
  seenClipKeys: Set<string>,
  errors: string[],
): void {
  if (!isRecord(song)) {
    errors.push(`songs[${index}] debe ser un objeto`)
    return
  }
  const label = typeof song.id === 'string' && song.id !== '' ? song.id : `songs[${index}]`

  if (typeof song.id !== 'string' || !SLUG_PATTERN.test(song.id)) {
    errors.push(`${label}: id invalido ${describeValue(song.id)} (se espera [a-z0-9-]+)`)
  } else if (seenSongIds.has(song.id)) {
    errors.push(`id de cancion duplicado: ${song.id}`)
  } else {
    seenSongIds.add(song.id)
  }

  if (typeof song.title !== 'string' || song.title.trim() === '') {
    errors.push(`${label}: title debe ser un texto no vacio`)
  }

  if (typeof song.clipKey !== 'string' || !CLIP_KEY_PATTERN.test(song.clipKey)) {
    errors.push(`${label}: clipKey invalido ${describeValue(song.clipKey)} (se esperan 16 hex en minuscula)`)
  } else if (seenClipKeys.has(song.clipKey)) {
    errors.push(`${label}: clipKey duplicado ${song.clipKey}`)
  } else {
    seenClipKeys.add(song.clipKey)
  }

  // Cada cancion pertenece a un solo juego (DEC-53); el formato sigue siendo un array.
  if (!Array.isArray(song.games) || song.games.length !== 1) {
    errors.push(`${label}: games debe tener exactamente un juego (recibido ${describeValue(song.games)})`)
  } else if (typeof song.games[0] !== 'string' || !gameIds.has(song.games[0])) {
    errors.push(`${label}: referencia a juego inexistente ${describeValue(song.games[0])}`)
  }

  if (typeof song.startSec !== 'number' || !Number.isFinite(song.startSec) || song.startSec < 0) {
    errors.push(`${label}: startSec debe ser un numero finito >= 0 (recibido ${describeValue(song.startSec)})`)
  }
  if (typeof song.enabled !== 'boolean') errors.push(`${label}: enabled debe ser booleano`)
  if (typeof song.reviewed !== 'boolean') errors.push(`${label}: reviewed debe ser booleano`)

  const source = song.source
  if (!isRecord(source) || typeof source.videoTitle !== 'string') {
    errors.push(`${label}: source debe tener youtubeId y videoTitle de tipo texto`)
    return
  }
  if (typeof source.youtubeId !== 'string' || !YOUTUBE_ID_PATTERN.test(source.youtubeId)) {
    errors.push(`${label}: source.youtubeId invalido ${describeValue(source.youtubeId)} (se esperan 11 caracteres [A-Za-z0-9_-])`)
  }
  const { durationSec, leadingSilenceSec } = source
  if (leadingSilenceSec !== undefined && (typeof leadingSilenceSec !== 'number' || !Number.isFinite(leadingSilenceSec) || leadingSilenceSec < 0)) {
    errors.push(`${label}: source.leadingSilenceSec debe ser un numero finito >= 0 (recibido ${describeValue(leadingSilenceSec)})`)
  }
  if (song.startSecManual !== undefined && typeof song.startSecManual !== 'boolean') {
    errors.push(`${label}: startSecManual debe ser booleano`)
  }
  if (durationSec !== undefined) {
    if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) {
      errors.push(`${label}: source.durationSec debe ser un numero finito > 0 (recibido ${describeValue(durationSec)})`)
    } else if (
      song.enabled === true &&
      typeof song.startSec === 'number' &&
      tooShort(durationSec, song.startSec)
    ) {
      errors.push(`${label}: esta activada pero es demasiado corta (${durationSec} s con startSec ${song.startSec})`)
    }
  }
}

export function validateCatalog(input: unknown): ValidationResult {
  if (!isRecord(input)) return { ok: false, errors: ['El catalogo debe ser un objeto'] }

  const errors: string[] = []
  if (input.version !== 1) errors.push(`version debe ser 1 (recibido ${describeValue(input.version)})`)
  if (typeof input.generatedAt !== 'string') errors.push('generatedAt debe ser un texto')

  const gameIds = validateGames(input.games, errors)

  if (!Array.isArray(input.songs)) {
    errors.push('songs debe ser un array')
  } else {
    const seenSongIds = new Set<string>()
    const seenClipKeys = new Set<string>()
    input.songs.forEach((song, index) =>
      validateSong(song, index, gameIds, seenSongIds, seenClipKeys, errors),
    )
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, catalog: input as unknown as Catalog }
}

const MIN_SOURCE_SECONDS_AFTER_START = 16 + 0.1

/**
 * Cancion demasiado corta (DEC-40): la fuente dura menos de `startSec + 16 s` mas un margen de 0,1 s
 * para el recorte y el loudnorm. Duracion desconocida no es corta. Se calcula siempre, nunca se persiste.
 */
export function tooShort(durationSec: number | undefined, startSec: number): boolean {
  return durationSec !== undefined && durationSec < startSec + MIN_SOURCE_SECONDS_AFTER_START
}
