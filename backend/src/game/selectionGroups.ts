import type { Song } from '../../../shared/catalog'

/** Lo unico que la seleccion necesita de un juego. */
export interface GroupedGame {
  id: string
  selectionGroup?: string
}

export interface SelectionGroup {
  id: string
  songs: Song[]
}

const compareById = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Grupo de seleccion de un juego (DEC-54): `selectionGroup` si apunta a un juego que existe; si no, el propio id. */
export function effectiveGroupId(game: GroupedGame, gameIds: ReadonlySet<string>): string {
  return game.selectionGroup !== undefined && gameIds.has(game.selectionGroup) ? game.selectionGroup : game.id
}

/**
 * Grupos de seleccion con alguna cancion activa, ordenados por id del grupo (no por su posicion en `games`: insertar un
 * juego en su sitio no debe cambiar la cancion del dia, DEC-09), y con las canciones activas de todos sus juegos ordenadas por id. `onlyGames` limita a los juegos
 * filtrados (modo libre): el grupo cuenta como uno aunque solo aporte las canciones de uno de sus juegos.
 */
export function buildSelectionGroups(songs: readonly Song[], games: readonly GroupedGame[], onlyGames?: ReadonlySet<string>): SelectionGroup[] {
  const gameIds = new Set(games.map((game) => game.id))
  const groupOfGame = new Map(games.map((game) => [game.id, effectiveGroupId(game, gameIds)] as const))
  const groups = new Map<string, Song[]>()
  for (const game of games) {
    const groupId = groupOfGame.get(game.id)!
    if (!groups.has(groupId)) groups.set(groupId, [])
  }
  for (const song of songs) {
    if (!song.enabled) continue
    const gameId = song.games[0]
    const groupId = groupOfGame.get(gameId)
    if (groupId === undefined || (onlyGames && !onlyGames.has(gameId))) continue
    groups.get(groupId)!.push(song)
  }
  return [...groups]
    .filter(([, groupSongs]) => groupSongs.length > 0)
    .map(([id, groupSongs]) => ({ id, songs: groupSongs.sort(compareById) }))
    .sort(compareById)
}
