import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { createCatalogStore } from '../catalogStore'
import { contextFor, createGame, findAudio, getCatalogView, HttpError, patchSong, renameGame, toHttpError } from './handlers'
import type { AdminContext } from './handlers'
import { parseRange } from './range'

export interface AdminServerOptions {
  dataDir: string
  /** Carpeta con index.html y assets (admin-ui/dist). */
  uiDir?: string
  port?: number
  /** Solo para tests: token fijo. Por defecto aleatorio por arranque. */
  token?: string
}

export interface AdminServer {
  readonly port: number
  readonly url: string
  readonly token: string
  address(): { address: string; port: number; family: string }
  close(): Promise<void>
}

const LOOPBACK = '127.0.0.1'
const MAX_BODY_BYTES = 16 * 1024
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

const AUDIO_TYPES: Record<string, string> = {
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
}

const digest = (value: string) => createHash('sha256').update(value).digest()

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  })
  res.end(text)
}

const sendError = (res: ServerResponse, status: number, code: string, message: string, extraHeaders?: Record<string, string>) =>
  sendJson(res, status, { error: { code, message } }, extraHeaders)

type JsonBody = { ok: true; value: unknown } | { ok: false }

function readJsonBody(req: IncomingMessage, res: ServerResponse): Promise<JsonBody> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = []
    let size = 0
    let rejected = false
    req.on('data', (chunk: Buffer) => {
      if (rejected) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        rejected = true
        chunks.length = 0
        sendError(res, 413, 'VALIDATION_ERROR', 'El cuerpo supera los 16 KB.', { Connection: 'close' })
        resolveBody({ ok: false })
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (rejected) return
      try {
        resolveBody({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
      } catch {
        sendError(res, 400, 'VALIDATION_ERROR', 'El cuerpo no es JSON valido.')
        resolveBody({ ok: false })
      }
    })
    req.on('error', () => resolveBody({ ok: false }))
  })
}

async function serveAudio(req: IncomingMessage, res: ServerResponse, file: string) {
  const { size } = await stat(file)
  const range = parseRange(req.headers.range, size)
  const type = AUDIO_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

  if (range.kind === 'unsatisfiable') {
    res.writeHead(416, { ...base, 'Content-Range': `bytes */${size}`, 'Content-Length': 0 })
    res.end()
    return
  }
  const [start, end] = range.kind === 'partial' ? [range.start, range.end] : [0, size - 1]
  if (size === 0) {
    res.writeHead(200, { ...base, 'Content-Length': 0 })
    res.end()
    return
  }
  const headers: Record<string, string | number> = { ...base, 'Content-Length': end - start + 1 }
  if (range.kind === 'partial') headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  res.writeHead(range.kind === 'partial' ? 206 : 200, headers)
  const stream = createReadStream(file, { start, end })
  // Si el navegador corta la conexion, se libera el fichero; no es un error.
  res.on('close', () => stream.destroy())
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

async function serveStatic(uiDir: string | undefined, rawPath: string, res: ServerResponse) {
  if (!uiDir) return sendError(res, 503, 'UI_MISSING', 'Falta la UI: ejecuta "npm run cli -- admin" (compila admin-ui/dist).')
  let relative: string
  try {
    relative = decodeURIComponent(rawPath)
  } catch {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Ruta no valida.')
  }
  if (relative.includes('\0') || relative.includes('\\') || relative.split('/').includes('..')) {
    return sendError(res, 403, 'FORBIDDEN', 'Ruta no permitida.')
  }
  const root = resolve(uiDir)
  const target = resolve(join(root, relative === '/' ? 'index.html' : relative))
  if (target !== root && !target.startsWith(root + sep)) return sendError(res, 403, 'FORBIDDEN', 'Ruta no permitida.')
  try {
    const body = await readFile(target)
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(body)
  } catch {
    if (relative === '/') {
      sendError(res, 503, 'UI_MISSING', 'No existe admin-ui/dist: ejecuta "npm run cli -- admin" para compilar la UI.')
    } else {
      sendError(res, 404, 'NOT_FOUND', 'Recurso no encontrado.')
    }
  }
}

function segmentsOf(rawPath: string): string[] | null {
  try {
    return rawPath.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }
}

export async function startAdminServer(options: AdminServerOptions): Promise<AdminServer> {
  const token = options.token ?? randomBytes(32).toString('hex')
  const expectedTokenDigest = digest(token)
  const store = createCatalogStore({ file: join(options.dataDir, 'catalog.json') })
  const ctx: AdminContext = contextFor(options.dataDir, store)
  let allowedHosts = new Set<string>()

  const hasValidToken = (candidate: string | string[] | undefined) =>
    typeof candidate === 'string' && timingSafeEqual(digest(candidate), expectedTokenDigest)

  async function route(req: IncomingMessage, res: ServerResponse) {
    const method = req.method ?? 'GET'
    const rawPath = (req.url ?? '/').split('?')[0]

    // Defensa ante DNS rebinding: solo se atiende con el Host de loopback y el puerto real.
    const host = req.headers.host
    const hostHeaderCount = req.rawHeaders.filter((name, index) => index % 2 === 0 && name.toLowerCase() === 'host').length
    if (hostHeaderCount !== 1 || typeof host !== 'string' || !allowedHosts.has(host.toLowerCase())) {
      return sendError(res, 403, 'FORBIDDEN', 'Host no permitido.')
    }
    // Una web cualquiera no conoce el token: ninguna mutacion pasa sin el.
    if (MUTATING_METHODS.has(method) && !hasValidToken(req.headers['x-admin-token'])) {
      return sendError(res, 403, 'FORBIDDEN', 'Falta el token de sesion del admin.')
    }

    if (!rawPath.startsWith('/api/')) {
      if (method !== 'GET') return sendError(res, 404, 'NOT_FOUND', 'Recurso no encontrado.')
      return serveStatic(options.uiDir, rawPath, res)
    }

    const segments = segmentsOf(rawPath.slice('/api'.length))
    if (!segments) return sendError(res, 404, 'NOT_FOUND', 'Recurso no encontrado.')
    const [resource, id, action] = segments

    if (method === 'GET' && segments.length === 1 && resource === 'session') return sendJson(res, 200, { token })
    if (method === 'GET' && segments.length === 1 && resource === 'catalog') return sendJson(res, 200, await getCatalogView(ctx))
    if (method === 'GET' && segments.length === 3 && resource === 'songs' && action === 'audio') {
      return serveAudio(req, res, await findAudio(ctx, id))
    }

    const isMutation =
      (method === 'PATCH' && segments.length === 2 && (resource === 'songs' || resource === 'games')) ||
      (method === 'POST' && segments.length === 1 && resource === 'games')
    if (!isMutation) return sendError(res, 404, 'NOT_FOUND', 'Recurso no encontrado.')

    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
      return sendError(res, 415, 'VALIDATION_ERROR', 'El Content-Type debe ser application/json.')
    }
    const body = await readJsonBody(req, res)
    if (!body.ok) return
    if (resource === 'songs') return sendJson(res, 200, await patchSong(ctx, id, body.value))
    if (method === 'POST') return sendJson(res, 201, await createGame(ctx, body.value))
    return sendJson(res, 200, await renameGame(ctx, id, body.value))
  }

  const server: Server = createServer((req, res) => {
    route(req, res).catch((error) => {
      const failure = toHttpError(error)
      if (res.headersSent) res.destroy()
      else sendError(res, failure.status, failure.code, failure.message)
    })
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      rejectListen(
        error.code === 'EADDRINUSE'
          ? new Error(`El puerto ${options.port} esta ocupado (EADDRINUSE). Usa --port con otro puerto.`)
          : error,
      )
    })
    server.listen(options.port ?? 0, LOOPBACK, resolveListen)
  })

  const address = server.address() as { address: string; port: number; family: string }
  allowedHosts = new Set([`${LOOPBACK}:${address.port}`, `localhost:${address.port}`])

  let closing: Promise<void> | undefined
  return {
    port: address.port,
    url: `http://${LOOPBACK}:${address.port}`,
    token,
    address: () => address,
    close() {
      closing ??= (async () => {
        const closed = new Promise<void>((done) => server.close(() => done()))
        server.closeIdleConnections()
        await closed
        await store.idle()
      })()
      return closing
    },
  }
}

export { HttpError }
