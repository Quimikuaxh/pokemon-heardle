import { describe, it, expect, afterEach } from 'vitest'
import { startTestApp, closeAllTestApps, codeOf } from '../helpers/app'
import { makeClip, OFFSETS } from '../helpers/fixtures'

afterEach(closeAllTestApps)

const C_KEY = '6666666666666666'

async function gameC(opts: Parameters<typeof startTestApp>[0] = {}) {
  const app = await startTestApp({ randomInt: () => 0, ...opts })
  const g = await app.createUnlimited(['C'])
  return { app, g }
}

describe('GET /api/clips/:ticket', () => {
  it('BE-HDR-01 Content-Type audio/mpeg y Content-Length real', async () => {
    const { app, g } = await gameC()
    const r = await app.clip(g.json.clipUrl)
    expect([r.status, r.headers.get('content-type'), r.headers.get('content-length')]).toEqual([200, 'audio/mpeg', String(OFFSETS[0])])
    expect(r.raw.length).toBe(OFFSETS[0])
  })

  it('BE-HDR-01 Cache-Control no-store, private', async () => {
    const { app, g } = await gameC()
    const cc = (await app.clip(g.json.clipUrl)).headers.get('cache-control') ?? ''
    expect(cc).toContain('no-store')
    expect(cc).toContain('private')
  })

  it('BE-HDR-01 X-Content-Type-Options nosniff', async () => {
    const { app, g } = await gameC()
    expect((await app.clip(g.json.clipUrl)).headers.get('x-content-type-options')).toBe('nosniff')
  })

  for (const h of ['etag', 'last-modified', 'content-disposition', 'accept-ranges']) {
    it(`BE-HDR-02 /clips no envia ${h}`, async () => {
      const { app, g } = await gameC()
      expect((await app.clip(g.json.clipUrl)).headers.get(h)).toBeNull()
    })
  }

  it('BE-HDR-06 Range en /clips: 200 completo, sin 206', async () => {
    const { app, g } = await gameC()
    const r = await app.clip(g.json.clipUrl, { Range: 'bytes=0-99' })
    expect([r.status, r.raw.length, r.raw.equals(makeClip(C_KEY).subarray(0, OFFSETS[0]))]).toEqual([200, OFFSETS[0], true])
  })

  it('BE-HDR-06 If-None-Match en /clips: 200 con el prefijo completo, sin 304', async () => {
    const { app, g } = await gameC()
    const r = await app.clip(g.json.clipUrl, { 'If-None-Match': '*' })
    expect([r.status, r.raw.length]).toEqual([200, OFFSETS[0]])
  })

  it('BE-HDR-07 segunda peticion al mismo ticket -> 410 CLIP_TICKET_USED', async () => {
    const { app, g } = await gameC()
    await app.clip(g.json.clipUrl)
    const r = await app.clip(g.json.clipUrl)
    expect([r.status, codeOf(r)]).toEqual([410, 'CLIP_TICKET_USED'])
  })

  it('BE-TKT-03 ticket caducado (TTL 60 s) -> 410', async () => {
    const { app, g } = await gameC()
    app.clock.now += 61_000
    expect((await app.clip(g.json.clipUrl)).status).toBe(410)
  })

  it('BE-TKT-05 CLIP_TICKET_TTL_SEC=5 se respeta', async () => {
    const { app, g } = await gameC({ env: { CLIP_TICKET_TTL_SEC: '5' } })
    app.clock.now += 6_000
    expect((await app.clip(g.json.clipUrl)).status).toBe(410)
  })

  it('BE-HDR-08 ticket invalido -> 404 CLIP_TICKET_INVALID', async () => {
    const { app } = await gameC()
    const r = await app.clip('/api/clips/' + 'A'.repeat(500))
    expect([r.status, codeOf(r)]).toEqual([404, 'CLIP_TICKET_INVALID'])
  })

  it('BE-HDR-08 ticket basura corto -> 404 CLIP_TICKET_INVALID', async () => {
    const { app } = await gameC()
    expect(codeOf(await app.clip('/api/clips/abc'))).toBe('CLIP_TICKET_INVALID')
  })

  it('BE-TKT-01 un token de partida usado como ticket -> 404 CLIP_TICKET_INVALID', async () => {
    const { app, g } = await gameC()
    expect(codeOf(await app.clip('/api/clips/' + g.json.token))).toBe('CLIP_TICKET_INVALID')
  })

  it('BE-HDR-10 el cuerpo es exactamente fichero.subarray(0, offset) y no hay ID3 ni Xing/Info', async () => {
    const { app, g } = await gameC()
    const r = await app.clip(g.json.clipUrl)
    expect(r.raw.equals(makeClip(C_KEY).subarray(0, OFFSETS[0]))).toBe(true)
    expect(r.raw.subarray(0, 3).toString('latin1')).not.toBe('ID3')
    expect(r.raw.includes(Buffer.from('Xing'))).toBe(false)
    expect(r.raw.includes(Buffer.from('Info'))).toBe(false)
  })

  it('BE-HDR-11 y BE-TKT-11 el intento N sirve exactamente CLIP_BYTE_OFFSETS[N] bytes (16.300 ... 256.626)', async () => {
    const { app, g } = await gameC()
    let view = g.json
    const sizes: number[] = []
    for (let n = 0; n < 6; n++) {
      const r = await app.clip(view.clipUrl)
      sizes.push(r.raw.length)
      expect(r.headers.get('content-length'), `intento ${n}`).toBe(String(OFFSETS[n]))
      if (n < 5) view = (await app.skip(view.token)).json
    }
    expect(sizes).toEqual(OFFSETS)
  })

  it('BE-HDR-11 cada offset servido cae en una cabecera de trama (FF FB) del fichero', async () => {
    const { app, g } = await gameC()
    let view = g.json
    for (let n = 0; n < 5; n++) {
      const full = makeClip(C_KEY)
      expect([full[OFFSETS[n]], full[OFFSETS[n] + 1]], `offset ${n}`).toEqual([0xff, 0xfb])
      expect((await app.clip(view.clipUrl)).raw.length).toBe(OFFSETS[n])
      view = (await app.skip(view.token)).json
    }
  })

  it('BE-TKT-09 con 2 resultados el ticket emitido es del intento 3 (a=2): prefijo de 64.365 bytes', async () => {
    const { app, g } = await gameC()
    const s1 = await app.skip(g.json.token)
    const s2 = await app.skip(s1.json.token)
    expect((await app.clip(s2.json.clipUrl)).raw.length).toBe(OFFSETS[2])
  })

  it('BE-TKT-10 no hay clipUrl en partida terminada (ganada)', async () => {
    const { app, g } = await gameC()
    const w = await app.guess(g.json.token, 'c-only-song-05')
    expect(w.json.clipUrl).toBeUndefined()
  })

  it('BE-HDR-12 fallo del almacen -> 502 STORAGE_ERROR sin detalles internos', async () => {
    const { app, g } = await gameC({
      wrapStore: (inner: any) => ({
        getCatalog: () => inner.getCatalog(),
        getClip: async () => {
          throw new Error('secret-internal-path /var/data/bucket')
        },
      }),
    })
    const r = await app.clip(g.json.clipUrl)
    expect([r.status, codeOf(r), r.text.includes('secret-internal-path')]).toEqual([502, 'STORAGE_ERROR', false])
  })

  it('BE-HDR-12 el ticket NO se consume: tras recuperarse el almacen el mismo ticket funciona (200 con el prefijo)', async () => {
    let failing = true
    const { app, g } = await gameC({
      wrapStore: (inner: any) => ({
        getCatalog: () => inner.getCatalog(),
        getClip: async (k: string) => {
          if (failing) throw new Error('bucket caido')
          return inner.getClip(k)
        },
      }),
    })
    expect((await app.clip(g.json.clipUrl)).status).toBe(502)
    failing = false
    const retry = await app.clip(g.json.clipUrl)
    expect([retry.status, retry.raw.length]).toEqual([200, OFFSETS[0]])
  })

  it('BE-HDR-12 formato invalido del clip (tamano distinto) tambien es 502 STORAGE_ERROR sin consumir el ticket', async () => {
    let broken = true
    const { app, g } = await gameC({
      wrapStore: (inner: any) => ({
        getCatalog: () => inner.getCatalog(),
        getClip: async (k: string) => {
          const good = await inner.getClip(k)
          return broken ? good.subarray(0, good.length - 1) : good
        },
      }),
    })
    const bad = await app.clip(g.json.clipUrl)
    expect([bad.status, codeOf(bad)]).toEqual([502, 'STORAGE_ERROR'])
    broken = false
    expect((await app.clip(g.json.clipUrl)).status).toBe(200)
  })
})

describe('Cabeceras globales', () => {
  it('BE-HDR-03 ninguna ruta lleva ETag', async () => {
    const { app, g } = await gameC()
    const rs = [
      await app.get('/api/health'),
      await app.get('/api/catalog'),
      await app.createDaily(),
      await app.state(g.json.token),
      await app.guess(g.json.token, 'a-one-song-01'),
      await app.skip(g.json.token),
      await app.get('/api/no-existe'),
      await app.post('/api/games', { mode: 'x' }),
      await app.post('/api/games/state', 'no json'),
    ]
    expect(rs.map((r) => r.headers.get('etag'))).toEqual(rs.map(() => null))
  })

  it('BE-HDR-04 sin X-Powered-By', async () => {
    const { app } = await gameC()
    expect((await app.get('/api/health')).headers.get('x-powered-by')).toBeNull()
  })

  it('BE-HDR-05 Cache-Control no-store en las respuestas JSON de /games/*', async () => {
    const { app, g } = await gameC()
    const rs = [await app.createDaily(), await app.state(g.json.token), await app.guess(g.json.token, 'a-one-song-01'), await app.skip(g.json.token)]
    for (const r of rs) expect(r.headers.get('cache-control') ?? '').toContain('no-store')
  })

  it('BE-HDR-05 tambien en errores 409 (ALREADY_GUESSED y GAME_OVER)', async () => {
    const { app, g } = await gameC()
    const m = await app.guess(g.json.token, 'a-one-song-01')
    const dup = await app.guess(m.json.token, 'a-one-song-01')
    const won = await app.guess(m.json.token, 'c-only-song-05')
    const over = await app.skip(won.json.token)
    expect([dup.status, over.status]).toEqual([409, 409])
    expect(dup.headers.get('cache-control') ?? '').toContain('no-store')
    expect(over.headers.get('cache-control') ?? '').toContain('no-store')
  })

  it('BE-HDR-09 CORS: el origen permitido recibe Access-Control-Allow-Origin', async () => {
    const { app } = await gameC()
    const r = await app.get('/api/health', { Origin: 'http://localhost:5173' })
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  it('BE-HDR-09 CORS: un origen ajeno no recibe Access-Control-Allow-Origin', async () => {
    const { app } = await gameC()
    const r = await app.get('/api/health', { Origin: 'https://evil.example' })
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('BE-HDR-09 CORS: sin Access-Control-Expose-Headers', async () => {
    const { app } = await gameC()
    const r = await app.get('/api/health', { Origin: 'http://localhost:5173' })
    expect(r.headers.get('access-control-expose-headers')).toBeNull()
  })

  it('BE-HDR-13 cuerpo > 4 KB -> 413 o 400 con error JSON y el servidor sigue vivo', async () => {
    const { app } = await gameC()
    const r = await app.post('/api/games/state', { token: 'x'.repeat(6000) })
    expect([400, 413]).toContain(r.status)
    expect(typeof r.json?.error?.code).toBe('string')
    expect((await app.get('/api/health')).status).toBe(200)
  })

  it('BE-HDR-14 ruta inexistente -> 404 JSON con formato de error, sin stack', async () => {
    const { app } = await gameC()
    const r = await app.get('/api/no-existe')
    expect([r.status, typeof r.json?.error?.code, /\bat .*\(|node_modules/.test(r.text)]).toEqual([404, 'string', false])
  })

  it('BE-HDR-14 metodo no permitido (GET /games/guess) -> 404 o 405 con error JSON', async () => {
    const { app } = await gameC()
    const r = await app.get('/api/games/guess')
    expect([404, 405]).toContain(r.status)
    expect(typeof r.json?.error?.code).toBe('string')
  })
})

describe('/clips', () => {
  it('un sufijo en la URL del ticket no permite descargar el clip dos veces', async () => {
    const { app, g } = await gameC()
    expect((await app.clip(g.json.clipUrl)).status).toBe(200)
    for (const s of ['A', '_', '-']) expect((await app.clip(g.json.clipUrl + s)).status).toBe(404)
    expect((await app.clip(g.json.clipUrl)).status).toBe(410)
  })

  it('HEAD responde 405 y no consume el ticket', async () => {
    const { app, g } = await gameC()
    const head = await app.call('HEAD', g.json.clipUrl)
    expect(head.status).toBe(405)
    expect((await app.clip(g.json.clipUrl)).status).toBe(200)
  })
})

describe('CORS', () => {
  it('el 429 expone Retry-After al origen permitido; las respuestas normales no exponen nada', async () => {
    const { app } = await gameC({ env: { RATE_LIMIT_CREATE_GAME: '1' } })
    const origin = { Origin: 'http://localhost:5173' }
    const ok = await app.get('/api/health', origin)
    expect(ok.headers.get('access-control-expose-headers')).toBeNull()
    await app.createDaily(origin)
    const limited = await app.createDaily(origin)
    expect([limited.status, limited.headers.get('access-control-expose-headers')]).toEqual([429, 'Retry-After'])
  })

  it('ALLOWED_ORIGIN con barra final sigue funcionando', async () => {
    const { app } = await gameC({ env: { ALLOWED_ORIGIN: 'http://localhost:5173/' } })
    const r = await app.get('/api/health', { Origin: 'http://localhost:5173' })
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })
})
