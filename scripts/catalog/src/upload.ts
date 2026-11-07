import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { Catalog } from '../../../shared/catalog'
import { clipOutputPath } from './ffmpegArgs'

export interface ObjectStore {
  list(prefix: string): Promise<Map<string, { md5: string }>>
  put(key: string, body: Buffer): Promise<void>
  delete(key: string): Promise<void>
}

const CLIPS_PREFIX = 'clips/'
const remoteClipKey = (clipKey: string) => `${CLIPS_PREFIX}${clipKey}.mp3`
const CATALOG_KEY = 'catalog/catalog.json'

const md5Of = (body: Buffer) => createHash('md5').update(body).digest('hex')

/**
 * Valida, sube solo los clips nuevos o cambiados (por md5: con CBR el tamano es siempre igual) y por
 * ultimo catalog.json, de modo que el catalogo nunca apunta a clips sin subir. Con `prune`, borra
 * despues los clips remotos que ya no pertenecen a ninguna cancion activa. Nunca toca data/work/.
 * OJO: la API conserva el catalogo viejo en memoria hasta que se vuelve a desplegar, asi que `prune` debe
 * ejecutarse DESPUES (si no, puede servir clips ya borrados -> STORAGE_ERROR).
 * Con `clipsOnly` sube solo los clips: sirve para adelantar la parte lenta cuando el catalogo nuevo necesita
 * antes una API nueva (DEC-60). Los clips nuevos no los lee nadie hasta que llega su catalogo.
 */
export async function runUpload(options: {
  catalog: Catalog
  outDir: string
  store: ObjectStore
  validate: () => Promise<{ ok: boolean; errors: string[] }>
  prune?: boolean
  clipsOnly?: boolean
}): Promise<{ uploaded: string[]; deleted: string[] }> {
  // Sin el catalogo nuevo, borrar clips dejaria al catalogo publicado apuntando a clips que ya no estan.
  if (options.clipsOnly && options.prune) throw new Error('--clips-only y --prune no se pueden usar juntos.')
  const validation = await options.validate()
  if (!validation.ok) {
    throw new Error(`La validacion ha fallado, no se sube nada:\n${validation.errors.join('\n')}`)
  }

  const remote = await options.store.list(CLIPS_PREFIX)
  const uploaded: string[] = []
  const wantedKeys = new Set<string>()

  for (const song of options.catalog.songs.filter((candidate) => candidate.enabled)) {
    const key = remoteClipKey(song.clipKey)
    wantedKeys.add(key)
    const localFile = clipOutputPath(options.outDir, song.clipKey)
    if (!existsSync(localFile)) throw new Error(`Falta el clip local ${key}; ejecuta build`)
    const body = readFileSync(localFile)
    if (remote.get(key)?.md5 === md5Of(body)) continue
    await options.store.put(key, body)
    uploaded.push(key)
  }

  if (options.clipsOnly) return { uploaded, deleted: [] }

  await options.store.put(CATALOG_KEY, Buffer.from(JSON.stringify(options.catalog)))
  uploaded.push(CATALOG_KEY)

  const deleted: string[] = []
  if (options.prune) {
    for (const key of remote.keys()) {
      if (!key.startsWith(CLIPS_PREFIX) || wantedKeys.has(key)) continue
      await options.store.delete(key)
      deleted.push(key)
    }
  }
  return { uploaded, deleted }
}
