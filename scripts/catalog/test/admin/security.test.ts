import { tmp } from '../helpers/data'
// AD-SRV-*: seguridad del servidor local del admin (DEC-36). Todo con --data-dir temporal.
import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join, dirname } from 'node:path'
import { startAdminServer } from '../../src/admin/server'
import { adminCatalog, adminSources, makeUiDir, rawRequest, request, startFixture } from '../helpers/admin'
import { catalogText, makeDataDir } from '../helpers/data'

describe('AD-SRV seguridad', () => {
  it('AD-SRV-01 solo escucha en 127.0.0.1 (ni 0.0.0.0 ni ::)', async () => {
    const f = await startFixture()
    const addr = f.server.address()
    expect(addr.address).toBe('127.0.0.1')
    expect(['0.0.0.0', '::']).not.toContain(addr.address)
  })

  it('AD-SRV-01 la URL que expone usa 127.0.0.1 y el puerto real', async () => {
    const f = await startFixture()
    expect(f.server.url).toBe(`http://127.0.0.1:${f.port}`)
  })

  for (const host of ['127.0.0.1', 'localhost']) {
    for (const path of ['/api/session', '/api/catalog']) {
      it(`AD-SRV-02 Host ${host}:<puerto> permitido en ${path}`, async () => {
        const f = await startFixture()
        expect((await f.req('GET', path, { host: `${host}:${f.port}` })).status).toBe(200)
      })
    }
  }

  const hostCases = (port: number): Array<[string, string]> => [
    ['evil.com', 'evil.com'],
    ['evil.com:<puerto>', `evil.com:${port}`],
    ['127.0.0.1.evil.com', '127.0.0.1.evil.com'],
    ['127.0.0.1.evil.com:<puerto>', `127.0.0.1.evil.com:${port}`],
    ['localhost.evil.com:<puerto>', `localhost.evil.com:${port}`],
    ['127.0.0.1:otro puerto', `127.0.0.1:${port === 65000 ? 65001 : 65000}`],
    ['[::1]:<puerto>', `[::1]:${port}`],
    ['0.0.0.0:<puerto>', `0.0.0.0:${port}`],
    ['sin puerto', '127.0.0.1'],
  ]

  const routes: Array<[string, string]> = [
    ['GET', '/'],
    ['GET', '/assets/app.js'],
    ['GET', '/api/session'],
    ['GET', '/api/catalog'],
    ['GET', '/api/songs/rse-littleroot-town/audio'],
  ]

  for (const [label, _h] of hostCases(1)) {
    it(`AD-SRV-03 Host ajeno (${label}) -> 403 FORBIDDEN en todas las rutas y sin leer ni escribir datos`, async () => {
      const f = await startFixture()
      const before = catalogText(f.dataDir)
      const host = hostCases(f.port).find(([l]) => l === label)![1]
      for (const [method, path] of routes) {
        const r = await f.req(method, path, { host })
        expect([method, path, r.status]).toEqual([method, path, 403])
      }
      const m = await request(f.port, 'PATCH', '/api/songs/rse-oldale-town', {
        host,
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': f.token },
        body: JSON.stringify({ title: 'hack' }),
      })
      expect(m.status).toBe(403)
      expect(catalogText(f.dataDir)).toBe(before)
      expect(existsSync(join(f.dataDir, 'catalog.json.bak'))).toBe(false)
    })
  }

  it('AD-SRV-03 el cuerpo del 403 es { error: { code: "FORBIDDEN" } } y no revela el token', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/api/session', { host: 'evil.com' })
    expect(r.json.error.code).toBe('FORBIDDEN')
    expect(r.text).not.toContain(f.token)
  })

  it('AD-SRV-03 Host vacio -> 403', async () => {
    const f = await startFixture()
    const r = await rawRequest(f.port, 'GET /api/session HTTP/1.1\r\nHost: \r\nConnection: close\r\n\r\n')
    expect([400, 403]).toContain(r.status)
    expect(r.text).not.toContain(f.token)
  })

  it('AD-SRV-03 Host ausente (HTTP/1.0) -> 403 y no se entrega el token', async () => {
    const f = await startFixture()
    const r = await rawRequest(f.port, 'GET /api/session HTTP/1.0\r\n\r\n')
    expect(r.status).toBe(403)
    expect(r.text).not.toContain(f.token)
  })

  it('AD-SRV-03 Host duplicado (uno valido y uno ajeno, en ambos ordenes) no entrega el token', async () => {
    const f = await startFixture()
    const good = `127.0.0.1:${f.port}`
    for (const [a, b] of [[good, 'evil.com'], ['evil.com', good]]) {
      const r = await rawRequest(f.port, `GET /api/session HTTP/1.1\r\nHost: ${a}\r\nHost: ${b}\r\nConnection: close\r\n\r\n`)
      expect([400, 403]).toContain(r.status)
      expect(r.text).not.toContain(f.token)
    }
  })

  it('AD-SRV-04 /api/session devuelve { token } aleatorio de al menos 128 bits', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/api/session')
    expect(Object.keys(r.json)).toEqual(['token'])
    expect(typeof r.json.token).toBe('string')
    expect(Buffer.from(r.json.token, /^[0-9a-f]+$/i.test(r.json.token) ? 'hex' : 'base64url').length).toBeGreaterThanOrEqual(16)
  })

  it('AD-SRV-04 dos arranques dan tokens distintos y el token es estable dentro de un arranque', async () => {
    const a = await startFixture()
    const b = await startFixture()
    expect(a.token).not.toBe(b.token)
    expect((await a.req('GET', '/api/session')).json.token).toBe(a.token)
  })

  it('AD-SRV-05 /api/session no emite cabeceras CORS', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/api/session', { headers: { Origin: 'http://evil.com' } })
    expect(r.headers['access-control-allow-origin']).toBeUndefined()
    expect(r.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('AD-SRV-05 un OPTIONS preflight con Origin ajeno no concede permiso', async () => {
    const f = await startFixture()
    const r = await f.req('OPTIONS', '/api/songs/rse-oldale-town', {
      headers: { Origin: 'http://evil.com', 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'x-admin-token,content-type' },
    })
    expect(r.headers['access-control-allow-origin']).toBeUndefined()
    expect(r.headers['access-control-allow-headers']).toBeUndefined()
  })

  const mutations: Array<[string, string, unknown]> = [
    ['PATCH', '/api/songs/rse-oldale-town', { title: 'Hackeado' }],
    ['POST', '/api/games', { name: 'Juego Hack' }],
    ['PATCH', '/api/games/rse', { name: 'Renombrado Hack' }],
  ]
  const badTokens = (good: string): Array<[string, string | undefined]> => [
    ['sin cabecera', undefined],
    ['vacio', ''],
    ['de otro arranque', 'a'.repeat(good.length)],
    ['prefijo del correcto', good.slice(0, Math.floor(good.length / 2))],
    ['correcto en mayusculas', good === good.toUpperCase() ? good.toLowerCase() : good.toUpperCase()],
    ['correcto con relleno', good + 'x'],
  ]

  for (const [method, path, body] of mutations) {
    for (const [label] of badTokens('x'.repeat(32))) {
      it(`AD-SRV-06 ${method} ${path} con token ${label} -> 403 sin cambios en disco`, async () => {
        const f = await startFixture()
        const before = catalogText(f.dataDir)
        const token = badTokens(f.token).find(([l]) => l === label)![1]
        const r = await request(f.port, method, path, {
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
          body: JSON.stringify(body),
        })
        expect([r.status, r.json?.error?.code]).toEqual([403, 'FORBIDDEN'])
        expect(catalogText(f.dataDir)).toBe(before)
        expect(existsSync(join(f.dataDir, 'catalog.json.bak'))).toBe(false)
      })
    }
  }

  it('AD-SRV-07 Origin ajeno sin token valido -> 403', async () => {
    const f = await startFixture()
    const r = await request(f.port, 'PATCH', '/api/songs/rse-oldale-town', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.com' },
      body: JSON.stringify({ title: 'x' }),
    })
    expect(r.status).toBe(403)
  })

  it('AD-SRV-07 con token correcto y sin Origin -> 200', async () => {
    const f = await startFixture()
    expect((await f.mutate('PATCH', '/api/songs/rse-oldale-town', { title: 'Nuevo' })).status).toBe(200)
  })

  it('AD-SRV-08 el token se compara en tiempo constante (timingSafeEqual) y no con ===', () => {
    const dir = join(__dirname, '..', '..', 'src', 'admin')
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.ts')) : []
    const code = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
    expect(code).toMatch(/timingSafeEqual/)
    expect(code).not.toMatch(/===\s*(this\.)?(options\.)?token\b|\btoken\s*===/)
  })

  for (const [label, contentType] of [
    ['text/plain', 'text/plain'],
    ['application/x-www-form-urlencoded', 'application/x-www-form-urlencoded'],
    ['ausente', undefined],
    ['multipart/form-data', 'multipart/form-data; boundary=x'],
  ] as Array<[string, string | undefined]>) {
    it(`AD-SRV-09 mutacion con Content-Type ${label} -> 4xx sin cambios`, async () => {
      const f = await startFixture()
      const before = catalogText(f.dataDir)
      const r = await request(f.port, 'PATCH', '/api/songs/rse-oldale-town', {
        headers: { 'X-Admin-Token': f.token, 'Content-Type': contentType },
        body: JSON.stringify({ title: 'Cross-site' }),
      })
      expect(r.status).toBeGreaterThanOrEqual(400)
      expect(r.status).toBeLessThan(500)
      expect(catalogText(f.dataDir)).toBe(before)
    })
  }

  it('AD-SRV-10 cuerpo > 16 KB -> 413 o 400 VALIDATION_ERROR, el servidor sigue vivo y sin cambios', async () => {
    const f = await startFixture()
    const before = catalogText(f.dataDir)
    const r = await f.mutate('PATCH', '/api/songs/rse-oldale-town', { title: 'x'.repeat(20 * 1024) })
    expect([400, 413]).toContain(r.status)
    expect((await f.req('GET', '/api/session')).status).toBe(200)
    expect(catalogText(f.dataDir)).toBe(before)
  })

  it('AD-SRV-10 JSON malformado -> 400 VALIDATION_ERROR sin cambios', async () => {
    const f = await startFixture()
    const before = catalogText(f.dataDir)
    const r = await f.mutate('PATCH', '/api/songs/rse-oldale-town', '{"title": ')
    expect([r.status, r.json.error.code]).toEqual([400, 'VALIDATION_ERROR'])
    expect(catalogText(f.dataDir)).toBe(before)
  })

  for (const [method, path] of [
    ['DELETE', '/api/songs/rse-oldale-town'],
    ['PUT', '/api/songs/rse-oldale-town'],
    ['POST', '/api/songs/rse-oldale-town'],
    ['GET', '/api/nada'],
    ['PATCH', '/api/session'],
  ]) {
    it(`AD-SRV-11 ${method} ${path} -> 404/405 sin efecto en disco`, async () => {
      const f = await startFixture()
      const before = catalogText(f.dataDir)
      const r = await f.mutate(method, path, {})
      expect([404, 405]).toContain(r.status)
      expect(catalogText(f.dataDir)).toBe(before)
    })
  }

  it('AD-SRV-12 los errores no incluyen rutas absolutas del sistema ni stack', async () => {
    const f = await startFixture()
    writeFileSync(join(f.dataDir, 'catalog.json'), '{corrupto')
    const responses = [
      await f.req('GET', '/api/catalog'),
      await f.mutate('PATCH', '/api/songs/x', { title: 'a' }),
      await f.mutate('PATCH', '/api/songs/x', '{mal'),
      await f.req('GET', '/api/songs/x/audio'),
    ]
    for (const r of responses) {
      expect(r.text).not.toContain(f.dataDir)
      expect(r.text).not.toContain(dirname(f.dataDir))
      expect(r.text).not.toMatch(/node_modules|\bat .*\(|\.ts:\d+/)
    }
  })

  it('AD-SRV-13 --data-dir se respeta: .bak y .tmp solo aparecen dentro del temporal y el directorio padre no cambia', async () => {
    // Padre propio: el tmp del sistema lo modifican a la vez otros ficheros de test
    const f = await startFixture({ parent: tmp('heardle-parent-') })
    const parent = dirname(f.dataDir)
    const before = readdirSync(parent).sort()
    await f.mutate('PATCH', '/api/songs/rse-oldale-town', { title: 'x' })
    await f.mutate('POST', '/api/games', { name: 'Nuevo' })
    await f.req('GET', '/api/songs/rse-littleroot-town/audio')
    expect(readdirSync(parent).sort()).toEqual(before)
    expect(readdirSync(f.dataDir).sort()).toEqual(['catalog.json', 'catalog.json.bak', 'work'])
  })

  it('AD-SRV-14 close() libera el puerto: despues no se puede conectar', async () => {
    const f = await startFixture()
    await f.server.close()
    await expect(
      new Promise((resolve, reject) => {
        const s = net.connect(f.port, '127.0.0.1', () => resolve('conectado'))
        s.on('error', reject)
      }),
    ).rejects.toBeDefined()
  })

  it('AD-SRV-14 close() dos veces no falla', async () => {
    const f = await startFixture()
    await f.server.close()
    await expect(f.server.close()).resolves.toBeUndefined()
  })

  it('AD-SRV-14 puerto ocupado -> error claro', async () => {
    const f = await startFixture()
    await expect(startAdminServer({ dataDir: makeDataDir({ catalog: adminCatalog() }), uiDir: makeUiDir(), port: f.port })).rejects.toThrow(/puerto|port|EADDRINUSE|ocupado/i)
  })

  it('AD-SRV-14 close() espera a una mutacion en vuelo: el catalogo queda valido y sin .tmp', async () => {
    const f = await startFixture()
    const pending = f.mutate('PATCH', '/api/songs/rse-oldale-town', { title: 'En vuelo' }).catch(() => undefined)
    await f.server.close()
    await pending
    const files = readdirSync(f.dataDir)
    expect(files.filter((x) => x.includes('.tmp-'))).toEqual([])
    expect(() => JSON.parse(catalogText(f.dataDir))).not.toThrow()
  })
})
