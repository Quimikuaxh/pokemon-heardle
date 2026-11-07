import type { PublicCatalog } from '../../../shared/api'
import type { Series } from '../../../shared/rules'

/** Catalogo reducido a unos juegos y sus canciones (buscador por modo, DEC-60). Con `null` devuelve el completo. */
export function scopeCatalog(catalog: PublicCatalog, gameIds: ReadonlySet<string> | null): PublicCatalog {
  if (!gameIds) return catalog
  return {
    ...catalog,
    games: catalog.games.filter((game) => gameIds.has(game.id)),
    songs: catalog.songs.filter((song) => song.games.some((id) => gameIds.has(id))),
  }
}

/** Ids de los juegos de una serie. */
export function gamesOfSeries(catalog: PublicCatalog, series: Series): Set<string> {
  return new Set(catalog.games.filter((game) => (game.series ?? 'main') === series).map((game) => game.id))
}

/** El catalogo tiene algun juego spin-off (solo entonces aparece el diario spin-off, DEC-60). */
export const hasSpinoffs = (catalog: PublicCatalog): boolean => catalog.games.some((game) => game.series === 'spinoff')
