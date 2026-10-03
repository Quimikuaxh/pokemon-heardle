import type { PublicCatalog } from '../../../shared/api'

export interface SearchResult {
  id: string
  title: string
  games: Array<{ id: string; name: string }>
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim()

/** Busca por titulo o nombre de juego sobre TODO el catalogo (DEC-17). Texto literal, sin regex. */
export function searchSongs(catalog: PublicCatalog, query: string): SearchResult[] {
  const needle = normalize(query)
  if (!needle) return []
  const gameNames = new Map(catalog.games.map((game) => [game.id, game.name]))
  const results: SearchResult[] = []
  for (const song of catalog.songs) {
    const games = song.games.map((id) => ({ id, name: gameNames.get(id) ?? id }))
    const matches =
      normalize(song.title).includes(needle) || games.some((game) => normalize(game.name).includes(needle))
    if (matches) results.push({ id: song.id, title: song.title, games })
  }
  return results
}
