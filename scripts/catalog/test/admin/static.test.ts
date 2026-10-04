// AD-STA-*: estaticos de admin-ui/dist y sesion.
import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { startFixture, makeUiDir } from '../helpers/admin'
import { tmp } from '../helpers/data'

describe('AD-STA estaticos', () => {
  it('AD-STA-01 GET / sirve index.html', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/')
    expect([r.status, String(r.headers['content-type']).startsWith('text/html'), r.text]).toEqual([200, true, expect.stringContaining('<title>admin-ui</title>')])
  })

  it('AD-STA-01 /assets/* con Content-Type correcto', async () => {
    const f = await startFixture()
    const js = await f.req('GET', '/assets/app.js')
    const css = await f.req('GET', '/assets/style.css')
    expect([js.status, String(js.headers['content-type']), css.status, String(css.headers['content-type'])]).toEqual([
      200,
      expect.stringMatching(/javascript/),
      200,
      expect.stringMatching(/text\/css/),
    ])
    expect(js.text).toBe('console.log("admin")')
  })

  it('AD-STA-01 el HTML no incrusta el token (se obtiene por /api/session)', async () => {
    const f = await startFixture()
    expect((await f.req('GET', '/')).text).not.toContain(f.token)
  })

  for (const path of ['/assets/../../sentinel-ui.txt', '/%2e%2e/sentinel-ui.txt', '/assets/%2e%2e%2f%2e%2e%2fsentinel-ui.txt', '/assets/..%5C..%5Csentinel-ui.txt', '//etc/passwd', '/etc/passwd', '/assets/%00.js']) {
    it(`AD-STA-02 path traversal (${path}) -> 403/404 sin leer el centinela`, async () => {
      const f = await startFixture()
      writeFileSync(join(dirname(f.uiDir), 'sentinel-ui.txt'), 'CENTINELA-UI')
      const r = await f.req('GET', path)
      expect([400, 403, 404]).toContain(r.status)
      expect(r.text).not.toContain('CENTINELA-UI')
      expect(r.text).not.toContain('root:')
    })
  }

  for (const path of ['/catalog.json', '/work/LLLLLLLLLL1.webm', '/data/catalog.json', '/catalog.json.bak', '/work/', '/..%2Fcatalog.json']) {
    it(`AD-STA-03 data/ nunca se sirve como estatico (${path}) -> 404`, async () => {
      const f = await startFixture()
      const r = await f.req('GET', path)
      expect([403, 404]).toContain(r.status)
      expect(r.text).not.toContain('rse-littleroot-town')
    })
  }

  it('AD-STA-04 dist ausente: mensaje claro (menciona admin-ui/build) y el servidor sigue vivo', async () => {
    const f = await startFixture({ uiDir: join(tmp(), 'no-existe') })
    const r = await f.req('GET', '/')
    expect([404, 500, 503]).toContain(r.status)
    expect(r.text).toMatch(/admin-ui|build|dist/i)
    expect((await f.req('GET', '/api/session')).status).toBe(200)
  })

  it('AD-STA-05 ruta de UI desconocida: 404 o index.html (SPA)', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/foo')
    expect(r.status === 404 || (r.status === 200 && r.text.includes('admin-ui'))).toBe(true)
  })

  it('AD-STA-05 las rutas /api/* desconocidas son siempre 404 JSON NOT_FOUND', async () => {
    const f = await startFixture()
    for (const path of ['/api/nada', '/api/songs', '/api/games/x/y']) {
      const r = await f.req('GET', path)
      expect([r.status, r.json?.error?.code]).toEqual([404, 'NOT_FOUND'])
    }
  })

  it('sanidad: makeUiDir crea index.html y assets', () => {
    expect(makeUiDir()).toBeTruthy()
  })
})
