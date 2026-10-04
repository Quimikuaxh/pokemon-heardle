import { test as base, expect } from './test.ts'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { E2E_DIR } from './env.ts'

const CATALOG_DIR = join(E2E_DIR, '..', 'scripts', 'catalog')
const TSX = join(CATALOG_DIR, 'node_modules', '.bin', 'tsx')
export const ADMIN_UI_DIST = join(CATALOG_DIR, 'admin-ui', 'dist')

export interface AdminHandle {
  url: string
  port: number
  token: string
  /** Directorio de datos TEMPORAL (copia del fixture); nunca scripts/catalog/data. */
  dataDir: string
  catalogFile: string
  readCatalog(): any
  writeCatalog(catalog: unknown): void
  catalogHash(): string
  exists(relative: string): boolean
}

/** Copia el fixture del admin a un directorio nuevo (opcionalmente transformando el catalogo) y arranca el servidor. */
export async function startAdmin(transform?: (catalog: any) => void): Promise<AdminHandle & { stop(): Promise<void> }> {
  const dataDir = mkdtempSync(join(tmpdir(), 'heardle-admin-e2e-'))
  cpSync(join(E2E_DIR, 'fixtures', 'admin'), dataDir, { recursive: true })
  const catalogFile = join(dataDir, 'catalog.json')
  if (transform) {
    const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'))
    transform(catalog)
    writeFileSync(catalogFile, JSON.stringify(catalog, null, 2))
  }
  const child: ChildProcess = spawn(TSX, [join(E2E_DIR, 'support', 'admin-launcher.ts'), dataDir, ADMIN_UI_DIST], {
    cwd: CATALOG_DIR,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const info = await new Promise<{ url: string; port: number; token: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('el admin no arranco en 20 s')), 20_000)
    child.once('exit', (code) => reject(new Error(`el admin termino antes de arrancar (codigo ${code})`)))
    createInterface({ input: child.stdout! }).once('line', (line) => {
      clearTimeout(timer)
      resolve(JSON.parse(line))
    })
  })
  return {
    ...info,
    dataDir,
    catalogFile,
    readCatalog: () => JSON.parse(readFileSync(catalogFile, 'utf8')),
    writeCatalog: (catalog) => writeFileSync(catalogFile, JSON.stringify(catalog, null, 2)),
    catalogHash: () => createHash('sha256').update(readFileSync(catalogFile)).digest('hex'),
    exists: (relative) => existsSync(join(dataDir, relative)),
    async stop() {
      child.removeAllListeners('exit')
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', () => resolve())))
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export const test = base.extend<{ admin: AdminHandle; adminOptions: { transform?: (catalog: any) => void } }>({
  adminOptions: [{}, { option: true }],
  admin: async ({ adminOptions }, use) => {
    const handle = await startAdmin(adminOptions.transform)
    await use(handle)
    await handle.stop()
  },
})
export { expect }
