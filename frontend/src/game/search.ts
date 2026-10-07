import type { PublicCatalog } from '../../../shared/api'
import { matchesAllWords, normalizeText } from '../../../shared/search'

export interface SearchResult {
  id: string
  title: string
  games: Array<{ id: string; name: string }>
}

/**
 * Busca sobre TODO el catalogo (DEC-17): cada palabra debe aparecer en el titulo o en el nombre
 * de alguno de sus juegos ("ruby battle"). Texto literal, sin regex.
 */
export function searchSongs(catalog: PublicCatalog, query: string): SearchResult[] {
  if (!normalizeText(query)) return []
  const gameNames = new Map(catalog.games.map((game) => [game.id, game.name]))
  const results: SearchResult[] = []
  for (const song of catalog.songs) {
    const games = song.games.map((id) => ({ id, name: gameNames.get(id) ?? id }))
    if (matchesAllWords(query, [song.title, ...games.map((game) => game.name)])) results.push({ id: song.id, title: song.title, games })
  }
  return results
}

export interface CatalogSearch {
  games: Array<{ id: string; name: string }>
  songs: SearchResult[]
}

/**
 * Busqueda del combobox (DEC-49): grupo Juegos (nombre cumple todas las palabras, orden de catalog.games) y grupo
 * Canciones. Con burbuja de juego solo salen canciones de ese juego, y con texto vacio todas las suyas.
 */
export function searchCatalog(catalog: PublicCatalog, query: string, gameId: string | null): CatalogSearch {
  const hasText = normalizeText(query) !== ''
  if (!hasText && gameId === null) return { games: [], songs: [] }
  const games = hasText ? catalog.games.filter((game) => matchesAllWords(query, [game.name])).map(({ id, name }) => ({ id, name })) : []
  const songs = hasText ? searchSongs(catalog, query) : allSongs(catalog)
  return { games, songs: gameId === null ? songs : songs.filter((song) => song.games.some((game) => game.id === gameId)) }
}

function allSongs(catalog: PublicCatalog): SearchResult[] {
  const gameNames = new Map(catalog.games.map((game) => [game.id, game.name]))
  return catalog.songs.map((song) => ({
    id: song.id,
    title: song.title,
    games: song.games.map((id) => ({ id, name: gameNames.get(id) ?? id })),
  }))
}
