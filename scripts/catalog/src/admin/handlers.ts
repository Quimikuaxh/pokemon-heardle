import { join } from 'node:path'
import type { Catalog, Game, Song } from '../../../../shared/catalog'
import { tooShort, validateCatalog } from '../../../../shared/catalog'
import { CONSOLES } from '../../../../shared/rules'
import type { ConsoleName } from '../../../../shared/rules'
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
const GAME_ID_FORMAT = /^[A-Za-z0-9-]+$/
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
  const games: Game[] = Array.isArray(catalog.games) ? catalog.games : []
  const gameIds = new Set(games.map((game) => game.id))
  return {
    games: games.map((game) => ({
      id: game.id,
      name: game.name,
      consoles: Array.isArray(game.consoles) ? game.consoles : [],
      // Grupo efectivo (DEC-54): una referencia a un juego que no existe cuenta como grupo propio.
      selectionGroup: typeof game.selectionGroup === 'string' && gameIds.has(game.selectionGroup) ? game.selectionGroup : game.id,
      missingConsoles:
        !(Array.isArray(game.consoles) && game.consoles.length > 0) &&
        songs.some((song) => song.enabled && Array.isArray(song.games) && song.games.includes(game.id)),
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
    if (!Array.isArray(games) || games.length !== 1 || typeof games[0] !== 'string') {
      throw validation('La cancion pertenece a exactamente un juego (lista con un solo id).')
    }
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
  return checkedGameName(body.name)
}

function checkedGameName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
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

interface GamePatch {
  name?: string
  consoles?: ConsoleName[]
  /** null: quitar el grupo (el juego vuelve a su propio grupo). */
  selectionGroup?: string | null
}

const GAME_PATCH_KEYS = new Set(['name', 'consoles', 'selectionGroup'])

function parseGamePatch(body: unknown): GamePatch {
  if (!isRecord(body)) throw validation('El cuerpo debe ser un objeto JSON.')
  const unknown = Object.keys(body).filter((key) => !GAME_PATCH_KEYS.has(key))
  if (unknown.length > 0) throw validation(`Campos no editables: ${unknown.join(', ')}.`)
  const patch: GamePatch = {}
  if ('name' in body) patch.name = checkedGameName(body.name)
  if ('consoles' in body) {
    const consoles = body.consoles
    const isKnown = (value: unknown): value is ConsoleName => (CONSOLES as readonly unknown[]).includes(value)
    if (!Array.isArray(consoles) || consoles.length === 0 || !consoles.every(isKnown)) {
      throw validation(`consoles debe ser una lista no vacia de: ${CONSOLES.join(', ')}.`)
    }
    if (new Set(consoles).size !== consoles.length) throw validation('consoles tiene valores repetidos.')
    patch.consoles = CONSOLES.filter((name) => consoles.includes(name))
  }
  if ('selectionGroup' in body) {
    const group = body.selectionGroup
    if (group !== null && (typeof group !== 'string' || !GAME_ID_FORMAT.test(group))) {
      throw validation('selectionGroup debe ser el id de un juego o null.')
    }
    patch.selectionGroup = group
  }
  if (Object.keys(patch).length === 0) throw validation('No hay ningun campo que cambiar.')
  return patch
}

/** Aplica el grupo comprobando DEC-54: el destino debe ser cabeza (su grupo es el suyo) y quien lo cambia no puede serlo de otros. */
function applySelectionGroup(catalog: Catalog, game: Game, group: string | null) {
  if (group === null || group === game.id) {
    delete game.selectionGroup
    return
  }
  const target = catalog.games.find((candidate) => candidate.id === group)
  if (!target) throw validation(`El grupo ${group} no es un juego del catalogo.`)
  if (target.selectionGroup !== undefined && target.selectionGroup !== target.id) {
    throw validation(`El juego ${group} ya pertenece al grupo ${target.selectionGroup}: no se admiten cadenas.`)
  }
  const members = catalog.games.filter((other) => other !== game && other.selectionGroup === game.id)
  if (members.length > 0) {
    throw validation(`El juego ${game.id} es cabeza del grupo de ${members.map((member) => member.id).join(', ')}: quitales el grupo antes.`)
  }
  game.selectionGroup = group
}

export async function patchGame(ctx: AdminContext, gameId: string, body: unknown) {
  const patch = parseGamePatch(body)
  let result!: { id: string; name: string; consoles: ConsoleName[] | undefined; selectionGroup: string }
  await ctx.store.update((catalog: Catalog) => {
    const game = catalog.games.find((candidate) => candidate.id === gameId)
    if (!game) throw notFound('El juego')
    if (patch.name !== undefined) {
      const name = patch.name
      if (catalog.games.some((other) => other !== game && comparableName(other.name) === comparableName(name))) {
        throw validation('Ya existe otro juego con ese nombre.')
      }
      game.name = name
    }
    if (patch.consoles) game.consoles = patch.consoles
    if (patch.selectionGroup !== undefined) applySelectionGroup(catalog, game, patch.selectionGroup)
    result = { id: game.id, name: game.name, consoles: game.consoles, selectionGroup: game.selectionGroup ?? game.id }
  })
  return result
}

/** Fuente completa de una cancion: se busca por id en el catalogo, nunca con rutas del cliente. */
export async function findAudio(ctx: AdminContext, songId: string): Promise<string> {
  const { catalog } = await ctx.store.readTolerant()
  const song: Song | undefined = Array.isArray(catalog.songs) ? catalog.songs.find((candidate: Song) => candidate.id === songId) : undefined
  const file = typeof song?.source?.youtubeId === 'string' ? findSourceFile(ctx.workDir, song.source.youtubeId) : undefined
  if (!file) throw notFound('El audio de la cancion')
  return file
}
