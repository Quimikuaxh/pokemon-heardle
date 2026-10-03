import { randomInt as cryptoRandomInt } from 'node:crypto'
import type { Catalog, Song } from '../../../shared/catalog'
import type { PublicCatalog } from '../../../shared/api'
import { errors } from '../http/errors'

export interface CatalogIndex {
  /** Canciones habilitadas, ordenadas por id. */
  enabledSongs: Song[]
  /** Solo resuelve canciones habilitadas: una retirada o deshabilitada es "desconocida". */
  songById(id: string): Song | undefined
  songByClipKey(clipKey: string): Song | undefined
  gameById(id: string): { id: string; name: string } | undefined
  publicCatalog(): PublicCatalog
}

const compareById = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function indexCatalog(catalog: Catalog): CatalogIndex {
  const enabledSongs = catalog.songs.filter((song) => song.enabled).sort(compareById)
  const songsById = new Map(enabledSongs.map((song) => [song.id, song]))
  const songsByClipKey = new Map(enabledSongs.map((song) => [song.clipKey, song]))
  const gamesById = new Map(catalog.games.map((game) => [game.id, game]))

  const publicCatalog: PublicCatalog = {
    version: catalog.version,
    games: catalog.games
      .filter((game) => enabledSongs.some((song) => song.games.includes(game.id)))
      .map((game) => ({ id: game.id, name: game.name })),
    songs: enabledSongs.map((song) => ({ id: song.id, title: song.title, games: [...song.games] })),
  }

  return {
    enabledSongs,
    songById: (id) => songsById.get(id),
    songByClipKey: (clipKey) => songsByClipKey.get(clipKey),
    gameById: (id) => gamesById.get(id),
    publicCatalog: () => publicCatalog,
  }
}

/** Pool del modo ilimitado: canciones habilitadas con algun juego del filtro, sin duplicados, ordenadas por id. */
export function buildPool(index: CatalogIndex, gameIds: string[]): Song[] {
  if (gameIds.length === 0) throw errors.emptyFilter()
  if (gameIds.some((gameId) => !index.gameById(gameId))) throw errors.unknownGame()
  const wanted = new Set(gameIds)
  const pool = index.enabledSongs.filter((song) => song.games.some((gameId) => wanted.has(gameId)))
  if (pool.length === 0) throw errors.emptyFilter()
  return pool
}

export function pickRandom<T>(pool: T[], randomInt: (max: number) => number = cryptoRandomInt): T {
  return pool[randomInt(pool.length)]
}
