// Tipos de catalog.json y su validador (lo usan backend y script de catalogo).
export interface Game { id: string; name: string }
export interface Song {
  id: string; title: string; games: string[]; clipKey: string; startSec: number
  enabled: boolean; reviewed: boolean; source: { youtubeId: string; videoTitle: string; durationSec?: number }
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
  })
  return gameIds
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

  if (!Array.isArray(song.games) || song.games.length === 0) {
    errors.push(`${label}: games debe ser un array no vacio`)
  } else {
    const seenGames = new Set<unknown>()
    for (const gameId of song.games) {
      if (typeof gameId !== 'string' || !gameIds.has(gameId)) {
        errors.push(`${label}: referencia a juego inexistente ${describeValue(gameId)}`)
      } else if (seenGames.has(gameId)) {
        errors.push(`${label}: juego repetido ${gameId}`)
      }
      seenGames.add(gameId)
    }
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
  const { durationSec } = source
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
