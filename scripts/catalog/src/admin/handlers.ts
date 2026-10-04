import { join } from 'node:path'
import type { Catalog, Song } from '../../../../shared/catalog'
import { tooShort, validateCatalog } from '../../../../shared/catalog'
import { CatalogFileError } from '../catalogStore'
import type { CatalogStore } from '../catalogStore'
import { findSourceFile } from '../duration'
import { slugify, uniqueId } from '../ids'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface AdminContext {
  store: CatalogStore
  workDir: string
}

export const contextFor = (dataDir: string, store: CatalogStore): AdminContext => ({ store, workDir: join(dataDir, 'work') })

const MAX_TITLE_LENGTH = 200
const MAX_GAME_NAME_LENGTH = 100
const MAX_GAME_ID_BASE = 40
const SONG_PATCH_KEYS = new Set(['title', 'games', 'enabled', 'reviewed'])

const validation = (message: string) => new HttpError(400, 'VALIDATION_ERROR', message)
const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} no existe.`)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Nombre comparable: sin acentos, minusculas y espacios colapsados. */
const comparableName = (name: string) =>
  name.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Los errores del fichero llegan sin rutas; cualquier otro error inesperado se oculta. */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error
  if (error instanceof CatalogFileError) return new HttpError(500, 'CATALOG_UNREADABLE', error.message)
  return new HttpError(500, 'INTERNAL_ERROR', 'Error interno del admin.')
}

export interface AdminSong extends Song {
  durationSec?: number
  tooShort: boolean
  hasSource: boolean
  errors: string[]
}

function adminSong(song: Song, catalogErrors: string[], workDir: string): AdminSong {
  const durationSec = typeof song.source?.durationSec === 'number' ? song.source.durationSec : undefined
  const startSec = typeof song.startSec === 'number' ? song.startSec : 0
  const youtubeId = typeof song.source?.youtubeId === 'string' ? song.source.youtubeId : ''
  return {
    ...song,
    ...(durationSec === undefined ? {} : { durationSec }),
    tooShort: tooShort(durationSec, startSec),
    hasSource: youtubeId !== '' && findSourceFile(workDir, youtubeId) !== undefined,
    errors: catalogErrors.filter((error) => error.startsWith(`${song.id}:`) || error === `id de cancion duplicado: ${song.id}`),
  }
}

function errorsOf(catalog: Catalog): string[] {
  const result = validateCatalog(catalog)
  return result.ok ? [] : result.errors
}

export async function getCatalogView(ctx: AdminContext) {
  const { catalog, errors } = await ctx.store.readTolerant()
  const songs: Song[] = Array.isArray(catalog.songs) ? catalog.songs : []
  const games: Array<{ id: string; name: string }> = Array.isArray(catalog.games) ? catalog.games : []
  return {
    games: games.map((game) => ({
      id: game.id,
      name: game.name,
      songCount: songs.filter((song) => Array.isArray(song.games) && song.games.includes(game.id)).length,
    })),
    songs: songs.map((song) => adminSong(song, errors, ctx.workDir)),
  }
}

interface SongPatch {
  title?: string
  games?: string[]
  enabled?: boolean
  reviewed?: boolean
}

function parseSongPatch(body: unknown): SongPatch {
  if (!isRecord(body)) throw validation('El cuerpo debe ser un objeto JSON.')
  const keys = Object.keys(body)
  const unknown = keys.filter((key) => !SONG_PATCH_KEYS.has(key))
  if (unknown.length > 0) throw validation(`Campos no editables: ${unknown.join(', ')}.`)
  if (keys.length === 0) throw validation('No hay ningun campo que cambiar.')

  const patch: SongPatch = {}
  if ('title' in body) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (title === '' || title.length > MAX_TITLE_LENGTH) throw validation(`El titulo debe tener entre 1 y ${MAX_TITLE_LENGTH} caracteres.`)
    patch.title = title
  }
  if ('games' in body) {
    const games = body.games
    if (!Array.isArray(games) || games.length === 0 || !games.every((id) => typeof id === 'string')) {
      throw validation('La cancion necesita al menos un juego (lista de ids).')
    }
    if (new Set(games).size !== games.length) throw validation('La lista de juegos tiene ids repetidos.')
    patch.games = games as string[]
  }
  for (const flag of ['enabled', 'reviewed'] as const) {
    if (flag in body) {
      if (typeof body[flag] !== 'boolean') throw validation(`${flag} debe ser true o false.`)
      patch[flag] = body[flag] as boolean
    }
  }
  return patch
}

export async function patchSong(ctx: AdminContext, songId: string, body: unknown) {
  const patch = parseSongPatch(body)
  const next: Catalog = await ctx.store.update((catalog: Catalog) => {
    const song = catalog.songs.find((candidate) => candidate.id === songId)
    if (!song) throw notFound('La cancion')
    if (patch.games) {
      const known = new Set(catalog.games.map((game) => game.id))
      const missing = patch.games.filter((id) => !known.has(id))
      if (missing.length > 0) throw validation(`Juegos inexistentes: ${missing.join(', ')}.`)
    }
    if (patch.enabled === true) {
      if (tooShort(song.source?.durationSec, song.startSec)) {
        throw new HttpError(409, 'TOO_SHORT', 'La cancion es demasiado corta (dura menos de 16 s): no se puede activar.')
      }
      if ((patch.games ?? song.games).length === 0) throw validation('No se puede activar una cancion sin juegos.')
    }
    if (patch.title !== undefined) song.title = patch.title
    if (patch.games) song.games = patch.games
    if (patch.enabled !== undefined) song.enabled = patch.enabled
    if (patch.reviewed !== undefined) song.reviewed = patch.reviewed
  })
  const updated = next.songs.find((candidate) => candidate.id === songId)!
  return adminSong(updated, errorsOf(next), ctx.workDir)
}

function parseGameName(body: unknown): string {
  if (!isRecord(body)) throw validation('El cuerpo debe ser un objeto JSON.')
  const extra = Object.keys(body).filter((key) => key !== 'name')
  if (extra.length > 0) throw validation(`Campos no editables: ${extra.join(', ')}.`)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name === '' || name.length > MAX_GAME_NAME_LENGTH) throw validation(`El nombre debe tener entre 1 y ${MAX_GAME_NAME_LENGTH} caracteres.`)
  return name
}

export async function createGame(ctx: AdminContext, body: unknown) {
  const name = parseGameName(body)
  let created!: { id: string; name: string }
  await ctx.store.update((catalog: Catalog) => {
    if (catalog.games.some((game) => comparableName(game.name) === comparableName(name))) {
      throw validation('Ya existe un juego con ese nombre.')
    }
    const id = uniqueId(slugify(name).slice(0, MAX_GAME_ID_BASE), new Set(catalog.games.map((game) => game.id)))
    created = { id, name }
    catalog.games.push(created)
  })
  return created
}

export async function renameGame(ctx: AdminContext, gameId: string, body: unknown) {
  const name = parseGameName(body)
  await ctx.store.update((catalog: Catalog) => {
    const game = catalog.games.find((candidate) => candidate.id === gameId)
    if (!game) throw notFound('El juego')
    if (catalog.games.some((other) => other !== game && comparableName(other.name) === comparableName(name))) {
      throw validation('Ya existe otro juego con ese nombre.')
    }
    game.name = name
  })
  return { id: gameId, name }
}

/** Fuente completa de una cancion: se busca por id en el catalogo, nunca con rutas del cliente. */
export async function findAudio(ctx: AdminContext, songId: string): Promise<string> {
  const { catalog } = await ctx.store.readTolerant()
  const song: Song | undefined = Array.isArray(catalog.songs) ? catalog.songs.find((candidate: Song) => candidate.id === songId) : undefined
  const file = typeof song?.source?.youtubeId === 'string' ? findSourceFile(ctx.workDir, song.source.youtubeId) : undefined
  if (!file) throw notFound('El audio de la cancion')
  return file
}
