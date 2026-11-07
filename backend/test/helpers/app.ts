import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { rmSync } from 'node:fs'
import { createApp } from '../../src/app'
import { createNodeServer } from '../../src/node/server'
import { loadConfig } from '../../src/config'
import { FsClipStore } from '../../src/storage/FsClipStore'
import { catalogR, writeStore, T, type CatalogFixture } from './fixtures'

import { SECRET_A, SECRET_B, DAILY_SEED } from './secrets'
export { SECRET_A, SECRET_B, DAILY_SEED }

/** Limites altos para que los tests de flujo no choquen con el rate-limit (los tests de RL los bajan). */
export function testEnv(storageDir: string, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    PORT: '0',
    ALLOWED_ORIGIN: 'http://localhost:5173',
    GAME_TOKEN_SECRET: SECRET_A,
    DAILY_SEED,
    STORAGE_DRIVER: 'fs',
    STORAGE_DIR: storageDir,
    CLIP_TICKET_TTL_SEC: '60',
    TRUST_PROXY: '1',
    RATE_LIMIT_GLOBAL: '100000',
    RATE_LIMIT_CREATE_GAME: '100000',
    RATE_LIMIT_ACTION: '100000',
    RATE_LIMIT_CLIPS: '100000',
    RATE_LIMIT_PER_GAME: '100000',
    ...overrides,
  }
}

export interface Res {
  status: number
  headers: Headers
  text: string
  json: any
  raw: Buffer
}

export interface TestApp {
  baseUrl: string
  clock: { now: number }
  catalog: CatalogFixture
  dir: string
  config: ReturnType<typeof loadConfig>
  call(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Res>
  get(path: string, headers?: Record<string, string>): Promise<Res>
  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<Res>
  createDaily(headers?: Record<string, string>): Promise<Res>
  createUnlimited(games: string[], headers?: Record<string, string>): Promise<Res>
  state(token: string, headers?: Record<string, string>): Promise<Res>
  guess(token: string, songId: string, headers?: Record<string, string>): Promise<Res>
  skip(token: string, headers?: Record<string, string>): Promise<Res>
  clip(clipUrl: string, headers?: Record<string, string>): Promise<Res>
  ready(): Promise<void>
  close(): Promise<void>
}

export interface StartOptions {
  catalog?: any
  env?: Record<string, string>
  nowMs?: number
  randomInt?: (max: number) => number
  schedule?: (fn: () => void, delayMs: number) => void
  wrapStore?: (store: FsClipStore) => any
  skipCatalogWait?: boolean
}

const cleanup: Array<() => Promise<void>> = []

export async function closeAllTestApps() {
  while (cleanup.length) await cleanup.pop()!()
}

export async function startTestApp(opts: StartOptions = {}): Promise<TestApp> {
  const catalog: any = opts.catalog ?? catalogR()
  const dir = writeStore(catalog, catalog.songs)
  const config = loadConfig(testEnv(dir, opts.env))
  const clock = { now: opts.nowMs ?? T.JUL_01_NOON }
  const fsStore = new FsClipStore(dir)
  const store = opts.wrapStore ? opts.wrapStore(fsStore) : fsStore
  const app = createApp({
    config,
    store,
    now: () => clock.now,
    randomInt: opts.randomInt,
    schedule: opts.schedule,
  })
  if (!opts.skipCatalogWait) await app.catalogReady
  const server: Server = await new Promise((resolve) => {
    const s = createNodeServer(app.handle, config.trustProxy).listen(0, '127.0.0.1', () => resolve(s))
  })
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
    const init: RequestInit = { method, headers: { ...headers } }
    if (body !== undefined) {
      ;(init.headers as Record<string, string>)['content-type'] ??= 'application/json'
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
    const r = await fetch(baseUrl + path, init)
    const raw = Buffer.from(await r.arrayBuffer())
    const text = raw.toString('utf8')
    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
    return { status: r.status, headers: r.headers, text, json, raw }
  }

  const api: TestApp = {
    baseUrl,
    clock,
    catalog,
    dir,
    config,
    call,
    get: (p, h) => call('GET', p, undefined, h),
    post: (p, b, h) => call('POST', p, b, h),
    createDaily: (h) => call('POST', '/api/games', { mode: 'daily' }, h),
    createUnlimited: (games, h) => call('POST', '/api/games', { mode: 'unlimited', games }, h),
    state: (token, h) => call('POST', '/api/games/state', { token }, h),
    guess: (token, songId, h) => call('POST', '/api/games/guess', { token, songId }, h),
    skip: (token, h) => call('POST', '/api/games/skip', { token }, h),
    clip: (clipUrl, h) => call('GET', clipUrl, undefined, h),
    ready: () => app.catalogReady,
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()))
      rmSync(dir, { recursive: true, force: true })
    },
  }
  cleanup.push(api.close)
  return api
}

/** Utilidad: codigo de error de una respuesta HTTP. */
export const codeOf = (r: Res): string | undefined => r.json?.error?.code
