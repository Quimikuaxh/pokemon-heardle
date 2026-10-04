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
