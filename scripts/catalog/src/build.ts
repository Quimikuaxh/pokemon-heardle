import type { Catalog, Song } from '../../../shared/catalog'

export type BuildManifest = Record<string, { startSec: number; source: string }>

/** Canciones activas cuyo audio hay que (re)generar: sin entrada en el manifest o con otro startSec/fuente. */
export function songsToBuild(
  catalog: Catalog,
  manifest: BuildManifest,
  sourceFingerprint: (song: Song) => string,
): Song[] {
  return catalog.songs.filter((song) => {
    if (!song.enabled) return false
    const built = manifest[song.clipKey]
    return !built || built.startSec !== song.startSec || built.source !== sourceFingerprint(song)
  })
}
