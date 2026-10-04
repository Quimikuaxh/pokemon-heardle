import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const vercel = JSON.parse(readFileSync(join(__dirname, '..', '..', 'vercel.json'), 'utf8'))
const cspHeaders = (): string[] =>
  (vercel.headers ?? []).flatMap((rule: any) => (rule.headers ?? []).filter((h: any) => String(h.key).toLowerCase() === 'content-security-policy').map((h: any) => String(h.value)))

describe('frontend/vercel.json (CSP del embed, AR 8)', () => {
  it('FE-CSP-01 conserva el rewrite a index.html', () => {
    expect(vercel.rewrites.some((r: any) => r.destination === '/index.html')).toBe(true)
  })

  it('FE-CSP-01 incluye Content-Security-Policy con valor exactamente "frame-src https://www.youtube-nocookie.com"', () => {
    expect(cspHeaders()).toEqual(['frame-src https://www.youtube-nocookie.com'])
  })

  it('FE-CSP-01 la cabecera se aplica a todas las rutas', () => {
    const rule = (vercel.headers ?? []).find((r: any) => (r.headers ?? []).some((h: any) => String(h.key).toLowerCase() === 'content-security-policy'))
    expect(rule?.source).toMatch(/\(\.\*\)|\*\*|^\/\(/)
  })

  for (const directive of ['default-src', 'script-src', 'connect-src', 'media-src', 'img-src', 'style-src']) {
    it(`FE-CSP-02 la CSP no incluye ${directive} (bloquearia la API, los blobs de audio o Vite)`, () => {
      expect(cspHeaders().length).toBeGreaterThan(0)
      for (const value of cspHeaders()) expect(value).not.toContain(directive)
    })
  }
})
