import { matchesAllWords, normalizeText } from '../../../../shared/search'

export interface FilterableSong {
  title: string
  games: string[]
  enabled: boolean
  reviewed: boolean
  tooShort: boolean
  errors: string[]
  source: { videoTitle: string }
}

export interface SongFilters {
  gameId?: string | null
  enabled?: 'all' | 'enabled' | 'disabled'
  reviewed?: 'all' | 'reviewed' | 'pending'
  onlyTooShort?: boolean
  onlyErrors?: boolean
  text?: string
}

/**
 * Filtros combinados con AND sobre el catalogo del admin. Texto: cada palabra debe aparecer en el
 * titulo, el titulo del video o el nombre de alguno de sus juegos (misma regla que el juego).
 */
export function filterSongs<S extends FilterableSong>(
  catalog: { games: Array<{ id: string; name: string }>; songs: S[] },
  filters: SongFilters,
): S[] {
  const text = filters.text ?? ''
  const hasText = normalizeText(text) !== ''
  const gameNames = new Map(catalog.games.map((game) => [game.id, game.name]))
  return catalog.songs.filter((song) => {
    if (filters.gameId && !song.games.includes(filters.gameId)) return false
    if (filters.enabled === 'enabled' && !song.enabled) return false
    if (filters.enabled === 'disabled' && song.enabled) return false
    if (filters.reviewed === 'reviewed' && !song.reviewed) return false
    if (filters.reviewed === 'pending' && song.reviewed) return false
    if (filters.onlyTooShort && !song.tooShort) return false
    if (filters.onlyErrors && song.errors.length === 0) return false
    if (!hasText) return true
    return matchesAllWords(text, [song.title, song.source.videoTitle, ...song.games.map((id) => gameNames.get(id) ?? '')])
  })
}
