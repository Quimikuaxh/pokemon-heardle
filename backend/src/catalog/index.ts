import { randomInt as cryptoRandomInt } from 'node:crypto'
import type { Catalog, Game, Song } from '../../../shared/catalog'
import type { PublicCatalog } from '../../../shared/api'
import { buildSelectionGroups, effectiveGroupId } from '../game/selectionGroups'
import type { SelectionGroup } from '../game/selectionGroups'
import { errors } from '../http/errors'

export interface CatalogIndex {
  /** Canciones habilitadas, ordenadas por id. */
  enabledSongs: Song[]
  /** Solo resuelve canciones habilitadas: una retirada o deshabilitada es "desconocida". */
  songById(id: string): Song | undefined
  songByClipKey(clipKey: string): Song | undefined
  gameById(id: string): Game | undefined
  /** Juegos en el orden de catalog.json (el de salida, DEC-48). */
  games: Game[]
  gamesById: ReadonlyMap<string, Game>
  /** Grupo de seleccion efectivo del juego (DEC-54). */
  groupOf(gameId: string): string
  publicCatalog(): PublicCatalog
}

const compareById = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function indexCatalog(catalog: Catalog): CatalogIndex {
  const enabledSongs = catalog.songs.filter((song) => song.enabled).sort(compareById)
  const songsById = new Map(enabledSongs.map((song) => [song.id, song]))
  const songsByClipKey = new Map(enabledSongs.map((song) => [song.clipKey, song]))
  const gamesById = new Map(catalog.games.map((game) => [game.id, game]))
  const gameIds = new Set(catalog.games.map((game) => game.id))

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
    games: catalog.games,
    gamesById,
    groupOf: (gameId) => {
      const game = gamesById.get(gameId)
      return game ? effectiveGroupId(game, gameIds) : gameId
    },
    publicCatalog: () => publicCatalog,
  }
}

/** Grupos de seleccion del modo libre: los que tienen algun juego filtrado con canciones activas (DEC-54). */
export function buildGroups(index: CatalogIndex, gameIds: string[]): SelectionGroup[] {
  if (gameIds.length === 0) throw errors.emptyFilter()
  if (gameIds.some((gameId) => !index.gameById(gameId))) throw errors.unknownGame()
  const groups = buildSelectionGroups(index.enabledSongs, index.games, new Set(gameIds))
  if (groups.length === 0) throw errors.emptyFilter()
  return groups
}

/** Modo libre en dos pasos: grupo equiprobable (randomInt(nGrupos)) y despues cancion uniforme del grupo (randomInt(nCanciones)). */
export function selectUnlimited(index: CatalogIndex, gameIds: string[], randomInt: (max: number) => number = cryptoRandomInt): Song {
  const groups = buildGroups(index, gameIds)
  const group = groups[randomInt(groups.length)]
  return group.songs[randomInt(group.songs.length)]
}
