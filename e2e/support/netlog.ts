import type { Page, Request as PwRequest, Response as PwResponse } from '@playwright/test'

export interface LoggedResponse {
  url: string
  path: string
  status: number
  headers: Record<string, string>
  body: Buffer | null
}

/** Registra peticiones y respuestas (cuerpo incluido) de una pagina. Activar antes de navegar. */
export class NetLog {
  requests: Array<{ method: string; path: string; body: string | null }> = []
  responses: LoggedResponse[] = []
  private pending: Promise<void>[] = []
  /** Bytes de los clips tal como los recibe la pagina (path -> bytes). */
  private clipBytes = new Map<string, Buffer>()

  constructor(page: Page) {
    // Playwright devuelve cuerpo vacio para las respuestas de audio descargadas con fetch (Chromium): se
    // capturan los bytes dentro de la pagina con fetch().clone() y se reenvian por un binding que sobrevive a recargas.
    void page.exposeFunction('__reportClip', (path: string, b64: string) => {
      this.clipBytes.set(path, Buffer.from(b64, 'base64'))
    })
    void page.addInitScript(() => {
      const original = window.fetch.bind(window)
      window.fetch = async (...args: Parameters<typeof fetch>) => {
        const response = await original(...args)
        const input = args[0]
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
        if (url.includes('/api/clips/')) {
          void response
            .clone()
            .arrayBuffer()
            .then((buffer) => {
              let binary = ''
              const bytes = new Uint8Array(buffer)
              for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
              ;(window as any).__reportClip(new URL(url, location.href).pathname, btoa(binary))
            })
        }
        return response
      }
    })
    page.on('request', (req: PwRequest) => {
      this.requests.push({ method: req.method(), path: new URL(req.url()).pathname, body: req.postData() })
    })
    page.on('response', (res: PwResponse) => {
      this.pending.push(
        (async () => {
          let body: Buffer | null = null
          try {
            body = await res.body()
          } catch {
            body = null
          }
          this.responses.push({
            url: res.url(),
            path: new URL(res.url()).pathname,
            status: res.status(),
            headers: res.headers(),
            body,
          })
        })(),
      )
    })
  }

  async settle() {
    await Promise.all(this.pending)
    this.pending = []
    // Espera a que la pagina haya reportado los bytes de cada clip recibido.
    const deadline = Date.now() + 3000
    const missing = () => this.responses.filter((r) => r.path.startsWith('/api/clips/') && r.status === 200 && !this.clipBytes.has(r.path))
    while (missing().length > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
    for (const res of this.responses) if (this.clipBytes.has(res.path)) res.body = this.clipBytes.get(res.path)!
  }

  clear() {
    this.requests = []
    this.responses = []
  }

  posts(path: string, predicate?: (body: any) => boolean) {
    return this.requests.filter((r) => {
      if (r.method !== 'POST' || r.path !== path) return false
      return predicate ? predicate(r.body ? JSON.parse(r.body) : null) : true
    })
  }

  count(method: string, path: string) {
    return this.requests.filter((r) => r.method === method && r.path === path).length
  }

  clips() {
    return this.responses.filter((r) => r.path.startsWith('/api/clips/'))
  }
}
