/**
 * Utilidades de los tests del servidor del admin (AD-*). Servidor node:http REAL en 127.0.0.1:0 con --data-dir
 * temporal (nunca scripts/catalog/data). Peticiones con node:http / net para poder controlar la cabecera Host.
 */
import http from 'node:http'
import net from 'node:net'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { startAdminServer } from '../../src/admin/server'
import type { AdminServer } from '../../src/admin/server'
import { catalogOf, makeDataDir, song, tmp } from './data'

export interface Res {
  status: number
  headers: http.IncomingHttpHeaders
  buffer: Buffer
  text: string
  json: any
}

const servers: AdminServer[] = []
afterEach(async () => {
  while (servers.length) await servers.pop()!.close().catch(() => {})
})

/** Bytes deterministas y distinguibles (para comparar rangos). */
export function bytesOf(seed: string, size: number): Buffer {
  const out = Buffer.alloc(size)
  let off = 0
  let i = 0
  while (off < size) {
    const h = createHash('sha256').update(`${seed}:${i++}`).digest()
    off += h.copy(out, off, 0, Math.min(h.length, size - off))
  }
  return out
}

export const SOURCE_BYTES = 1024 * 1024
export const LONG_AUDIO = bytesOf('long', SOURCE_BYTES)

/** Catalogo base del admin: 5 canciones, 3 juegos (uno sin canciones). Contiene una cancion invalida (games: []). */
export function adminCatalog(): any {
  return catalogOf(
    [
      song({ id: 'rse-littleroot-town', title: 'Littleroot Town', games: ['rse'], clipKey: '1111111111111111', youtubeId: 'LLLLLLLLLL1', enabled: true, reviewed: true, durationSec: 183.42, videoTitle: 'Pokemon RSE - Littleroot Town' }),
      song({ id: 'rse-oldale-town', title: 'Oldale Town', games: ['rse'], clipKey: '2222222222222222', youtubeId: 'LLLLLLLLLL2', enabled: false, reviewed: false, durationSec: 120.5 }),
      song({ id: 'rse-badge', title: 'Obtained a Badge', games: ['rse'], clipKey: '3333333333333333', youtubeId: 'SSSSSSSSSS1', enabled: false, reviewed: true, durationSec: 7.4 }),
      song({ id: 'dp-twinleaf-town', title: 'Twinleaf Town', games: [], clipKey: '4444444444444444', youtubeId: 'DDDDDDDDDD1', enabled: false, reviewed: false }),
      song({ id: 'dp-dash', title: 'Dash Song', games: ['dp'], clipKey: '5555555555555555', youtubeId: '-BRQ_XVwg-M', enabled: true, reviewed: false, durationSec: 90 }),
    ],
    [
      { id: 'rse', name: 'Pokemon Ruby / Sapphire / Emerald' },
      { id: 'dp', name: 'Pokemon Diamond / Pearl' },
      { id: 'unused', name: 'Pokemon Unused' },
    ],
  )
}

/** Fuentes en work/: la larga pesa 1 MiB; no hay fuente para la de youtubeId DDDDDDDDDD1. */
export const adminSources = () => ({
  LLLLLLLLLL1: { ext: 'webm', bytes: LONG_AUDIO },
  LLLLLLLLLL2: { ext: 'm4a', bytes: bytesOf('oldale', 4096) },
  SSSSSSSSSS1: { ext: 'opus', bytes: bytesOf('badge', 2048) },
  '-BRQ_XVwg-M': { ext: 'webm', bytes: bytesOf('dash', 3000) },
})

export interface Fixture {
  server: AdminServer
  dataDir: string
  uiDir: string
  port: number
  token: string
  /** Peticion cruda con Host por defecto 127.0.0.1:<puerto>. */
  req(method: string, path: string, options?: ReqOptions): Promise<Res>
  /** Mutacion con token correcto y Content-Type JSON. */
  mutate(method: string, path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<Res>
}

export interface ReqOptions {
  headers?: Record<string, string | undefined>
  body?: string | Buffer
  host?: string | null
}

export function makeUiDir(): string {
  const ui = tmp('heardle-ui-')
  mkdirSync(join(ui, 'assets'), { recursive: true })
  writeFileSync(join(ui, 'index.html'), '<!doctype html><html><head><title>admin-ui</title></head><body><div id="root"></div></body></html>')
  writeFileSync(join(ui, 'assets', 'app.js'), 'console.log("admin")')
  writeFileSync(join(ui, 'assets', 'style.css'), 'body{color:red}')
  return ui
}

export function request(port: number, method: string, path: string, options: ReqOptions = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(options.headers ?? {})) if (v !== undefined) headers[k] = v
    if (options.host !== null) headers.Host = options.host ?? `127.0.0.1:${port}`
    if (options.body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(options.body))
    const r = http.request({ host: '127.0.0.1', port, method, path, headers, setHost: false }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const text = buffer.toString('utf8')
        let json: any
        try {
          json = JSON.parse(text)
        } catch {
          json = undefined
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, buffer, text, json })
      })
    })
    r.on('error', reject)
    if (options.body !== undefined) r.write(options.body)
    r.end()
  })
}

/** Texto HTTP crudo por un socket (Host duplicado, ausente, HTTP/1.0...). */
export function rawRequest(port: number, raw: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(raw))
    const chunks: Buffer[] = []
    socket.on('data', (c) => chunks.push(c))
    socket.on('error', reject)
    socket.on('close', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      resolve({ status: Number(/^HTTP\/1\.[01] (\d{3})/.exec(text)?.[1] ?? 0), text })
    })
    setTimeout(() => socket.destroy(), 3000).unref()
  })
}

export async function startFixture(options: { catalog?: any; sources?: Record<string, { ext?: string; bytes?: number | Buffer }>; ui?: boolean; uiDir?: string; token?: string; parent?: string } = {}): Promise<Fixture> {
  const dataDir = makeDataDir({ catalog: options.catalog === undefined ? adminCatalog() : options.catalog, sources: options.sources ?? adminSources(), parent: options.parent })
  const uiDir = options.uiDir ?? makeUiDir()
  const server = await startAdminServer({ dataDir, uiDir, port: 0, token: options.token })
  servers.push(server)
  const port = server.port
  const sessionToken = options.token ?? (await request(port, 'GET', '/api/session')).json?.token
  const fixture: Fixture = {
    server,
    dataDir,
    uiDir,
    port,
    token: sessionToken,
    req: (method, path, opts) => request(port, method, path, opts),
    mutate: (method, path, body, extra = {}) =>
      request(port, method, path, {
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': sessionToken, ...extra },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
  }
  return fixture
}
