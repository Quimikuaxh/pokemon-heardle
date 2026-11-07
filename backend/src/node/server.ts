import { createServer } from 'node:http'
import type { IncomingMessage, Server } from 'node:http'
import type { ApiHandler } from '../http/handler'
import { MAX_BODY_BYTES } from '../http/handler'

/**
 * IP del cliente con la misma regla que `trust proxy = N` de Express: se confia en los N saltos mas cercanos
 * de X-Forwarded-For (0 = solo la direccion del socket).
 */
export function clientIp(req: IncomingMessage, trustProxy: number): string {
  const socket = req.socket.remoteAddress ?? 'unknown'
  if (trustProxy <= 0) return socket
  const header = req.headers['x-forwarded-for']
  const forwarded = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const chain = [socket, ...forwarded.reverse()]
  return chain[Math.min(trustProxy, chain.length - 1)]
}

/** Lee el cuerpo hasta un byte mas del limite: basta para que el manejador responda 413 sin guardar el resto. */
function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let done = false
    req.on('data', (chunk: Buffer) => {
      if (done) return
      chunks.push(chunk)
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        done = true
        resolve(Buffer.concat(chunks).subarray(0, MAX_BODY_BYTES + 1))
      }
    })
    req.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks))
    })
    req.on('error', reject)
  })
}

/** Servidor Node para el manejador estandar: desarrollo local y e2e (DEC-57). */
export function createNodeServer(handle: ApiHandler, trustProxy: number): Server {
  return createServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET'
      const headers = new Headers()
      for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined) continue
        for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item)
      }
      const hasBody = method !== 'GET' && method !== 'HEAD'
      const body = hasBody ? await readBody(req) : undefined
      if (body) headers.delete('content-length')
      const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
        method,
        headers,
        body: body && body.length > 0 ? new Uint8Array(body) : undefined,
      })
      const response = await handle(request, clientIp(req, trustProxy))
      const out = Buffer.from(await response.arrayBuffer())
      const outHeaders: Record<string, string> = {}
      response.headers.forEach((value, name) => (outHeaders[name] = value))
      if (!outHeaders['content-length']) outHeaders['content-length'] = String(out.length)
      res.writeHead(response.status, outHeaders)
      res.end(method === 'HEAD' ? undefined : out)
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' } }))
    }
  })
}
