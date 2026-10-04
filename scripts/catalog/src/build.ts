import type { Catalog, Song } from '../../../shared/catalog'

export type BuildManifest = Record<string, { startSec: number; source: string }>

/**
 * Canciones activas cuyo audio hay que (re)generar: sin entrada en el manifest, con otro startSec/fuente o sin
 * el fichero nuevo `<clipKey>.mp3` (un layout antiguo `<clipKey>/<n>.mp3` cuenta como no compilado, DEC-44).
 */
export function songsToBuild(
  catalog: Catalog,
  manifest: BuildManifest,
  sourceFingerprint: (song: Song) => string,
  hasClip: (song: Song) => boolean,
): Song[] {
  return catalog.songs.filter((song) => {
    if (!song.enabled) return false
    const built = manifest[song.clipKey]
    return !hasClip(song) || !built || built.startSec !== song.startSec || built.source !== sourceFingerprint(song)
  })
}
