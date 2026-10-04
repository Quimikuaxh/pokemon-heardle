import { constants } from 'node:fs'
import { access, copyFile, open, readFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { validateCatalog } from '../../../shared/catalog'

export interface CatalogFs {
  readFile(path: string): Promise<string>
  /** Escribe el fichero completo y hace fsync antes de cerrar. */
  writeSynced(path: string, data: string | Buffer): Promise<void>
  rename(from: string, to: string): Promise<void>
  copyFile(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}

export interface CatalogStore {
  readonly file: string
  /** Lee el catalogo aunque no sea valido; `errors` son los del validador. Rechaza si no se puede leer o no es JSON. */
  readTolerant(): Promise<{ catalog: any; errors: string[] }>
  /** Lectura-modificacion-escritura atomica y en cola. El mutator puede mutar o devolver un catalogo nuevo. */
  update(mutator: (catalog: any) => unknown): Promise<any>
  /** Resuelve cuando la cola de escrituras esta vacia. */
  idle(): Promise<void>
}

export const nodeCatalogFs: CatalogFs = {
  readFile: (path) => readFile(path, 'utf8'),
  async writeSynced(path, data) {
    const handle = await open(path, 'w')
    try {
      await handle.writeFile(data)
      await handle.sync()
    } finally {
      await handle.close()
    }
  },
  rename,
  copyFile,
  unlink,
  exists: (path) => access(path, constants.F_OK).then(() => true, () => false),
}

/** El fichero del catalogo no se puede leer o no es JSON. El mensaje no incluye rutas. */
export class CatalogFileError extends Error {}

export function createCatalogStore(options: { file: string; fs?: CatalogFs }): CatalogStore {
  const { file } = options
  const fs = options.fs ?? nodeCatalogFs
  const backupFile = `${file}.bak`
  const tmpFile = join(dirname(file), `${basename(file)}.tmp-${process.pid}`)
  let backupDone = false
  let queue: Promise<unknown> = Promise.resolve()

  async function readCatalog(): Promise<any> {
    const name = basename(file)
    let text: string
    try {
      text = await fs.readFile(file)
    } catch (error) {
      throw new CatalogFileError(`No se puede leer ${name} (${(error as NodeJS.ErrnoException).code ?? 'error de lectura'}).`)
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new CatalogFileError(`${name} no es JSON valido; no se modifica. Corrigelo a mano o restaura ${name}.bak.`)
    }
  }

  async function writeAtomically(catalog: unknown): Promise<void> {
    // El respaldo se hace una vez por arranque y solo cuando ya hay algo que escribir.
    if (!backupDone) {
      await fs.copyFile(file, backupFile)
      backupDone = true
    }
    try {
      await fs.writeSynced(tmpFile, Buffer.from(JSON.stringify(catalog, null, 2) + '\n'))
      await fs.rename(tmpFile, file)
    } catch (error) {
      await fs.unlink(tmpFile).catch(() => {})
      throw error
    }
  }

  return {
    file,

    async readTolerant() {
      const catalog = await readCatalog()
      const validation = validateCatalog(catalog)
      return { catalog, errors: validation.ok ? [] : validation.errors }
    },

    update(mutator) {
      const job = queue.then(async () => {
        const current = await readCatalog()
        const next = (await mutator(current)) ?? current
        await writeAtomically(next)
        return next
      })
      queue = job.catch(() => {})
      return job
    },

    idle: async () => void (await queue),
  }
}
