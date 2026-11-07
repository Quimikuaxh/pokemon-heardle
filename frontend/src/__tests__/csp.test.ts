import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// GitHub Pages no admite cabeceras propias: la CSP del embed va en una <meta> de index.html (DEC-41, DEC-57).
const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8')
const cspValues = (): string[] =>
  [...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/gi)].map((match) => match[1])

describe('frontend/index.html (CSP del embed, AR 8)', () => {
  it('FE-CSP-01 una sola CSP con valor exactamente "frame-src https://www.youtube-nocookie.com"', () => {
    expect(cspValues()).toEqual(['frame-src https://www.youtube-nocookie.com'])
  })

  it('FE-CSP-01 la <meta> va en el <head>, antes del script de la app (se aplica a toda la pagina)', () => {
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('http-equiv="Content-Security-Policy"')
  })

  for (const directive of ['default-src', 'script-src', 'connect-src', 'media-src', 'img-src', 'style-src']) {
    it(`FE-CSP-02 la CSP no incluye ${directive} (bloquearia la API, los blobs de audio o Vite)`, () => {
      expect(cspValues().length).toBeGreaterThan(0)
      for (const value of cspValues()) expect(value).not.toContain(directive)
    })
  }
})
