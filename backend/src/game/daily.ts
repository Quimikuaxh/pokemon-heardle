import { createHmac } from 'node:crypto'
import type { Song } from '../../../shared/catalog'
import { seriesOf } from '../../../shared/catalog'
import type { Series } from '../../../shared/rules'
import { errors } from '../http/errors'
import { buildSelectionGroups } from './selectionGroups'
import type { GroupedGame } from './selectionGroups'

/**
 * Etiqueta del HMAC por serie (DEC-60). La principal conserva la de siempre (DEC-09 v2): anadir spin-offs al catalogo
 * no cambia su cancion del dia.
 */
const DAILY_LABEL: Record<Series, string> = { main: 'daily|v2|', spinoff: 'daily-spinoff|v1|' }

/**
 * Cancion del dia comun a todos (DEC-09 v2, DEC-54, DEC-60): solo entre los juegos de la serie pedida;
 * HMAC(seed, etiqueta+fecha); los bytes 0-5 eligen un grupo de seleccion (todos equiprobables) y los bytes 6-11
 * una cancion del grupo. Sin canciones de esa serie, EMPTY_FILTER.
 */
export function selectDaily(songs: readonly Song[], games: readonly GroupedGame[], seed: string, date: string, series: Series = 'main'): Song {
  const groups = buildSelectionGroups(songs, games.filter((game) => seriesOf(game) === series))
  if (groups.length === 0) throw errors.emptyFilter()
  const mac = createHmac('sha256', seed).update(`${DAILY_LABEL[series]}${date}`).digest()
  const group = groups[mac.readUIntBE(0, 6) % groups.length]
  return group.songs[mac.readUIntBE(6, 6) % group.songs.length]
}
