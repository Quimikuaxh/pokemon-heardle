import { createHmac } from 'node:crypto'
import type { Song } from '../../../shared/catalog'
import { buildSelectionGroups } from './selectionGroups'
import type { GroupedGame } from './selectionGroups'

/**
 * Cancion del dia comun a todos (DEC-09 v2, DEC-54): HMAC(seed, "daily|v2|"+fecha); los bytes 0-5 eligen un grupo de
 * seleccion (todos equiprobables) y los bytes 6-11 una cancion del grupo.
 */
export function selectDaily(songs: readonly Song[], games: readonly GroupedGame[], seed: string, date: string): Song {
  const groups = buildSelectionGroups(songs, games)
  if (groups.length === 0) throw new Error('No hay canciones habilitadas para el diario')
  const mac = createHmac('sha256', seed).update(`daily|v2|${date}`).digest()
  const group = groups[mac.readUIntBE(0, 6) % groups.length]
  return group.songs[mac.readUIntBE(6, 6) % group.songs.length]
}
