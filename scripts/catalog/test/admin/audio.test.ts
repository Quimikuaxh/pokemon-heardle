// AD-AUD-*: GET /api/songs/:id/audio (fuente completa de data/work con Range).
import { describe, it, expect } from 'vitest'
import http from 'node:http'
import { mkdirSync, truncateSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { LONG_AUDIO, SOURCE_BYTES, adminCatalog, adminSources, bytesOf, makeUiDir, request, startFixture } from '../helpers/admin'
import { catalogOf, makeDataDir, song, tmp } from '../helpers/data'
import { startAdminServer } from '../../src/admin/server'

const AUDIO = '/api/songs/rse-littleroot-town/audio'
const N = SOURCE_BYTES

describe('AD-AUD audio de la fuente completa', () => {
  it('AD-AUD-01 sin Range: 200, Content-Length real, Accept-Ranges: bytes y bytes identicos al fichero', async () => {
    const f = await startFixture()
    const r = await f.req('GET', AUDIO)
    expect([r.status, r.headers['content-length'], r.headers['accept-ranges']]).toEqual([200, String(N), 'bytes'])
    expect(r.buffer.equals(LONG_AUDIO)).toBe(true)
  })

  for (const [id, ext] of [['rse-littleroot-town', 'webm'], ['rse-oldale-town', 'm4a'], ['rse-badge', 'opus']]) {
    it(`AD-AUD-01 Content-Type audio/* para .${ext}`, async () => {
      const f = await startFixture()
      expect(String((await f.req('GET', `/api/songs/${id}/audio`)).headers['content-type'])).toMatch(/^(audio|video)\//)
    })
  }

  it('AD-AUD-01 Content-Type audio/mpeg para .mp3', async () => {
    const f = await startFixture({
      catalog: catalogOf([song({ id: 'mp3-song', clipKey: '1111111111111111', youtubeId: 'MMMMMMMMMM1', durationSec: 90 })]),
      sources: { MMMMMMMMMM1: { ext: 'mp3', bytes: bytesOf('mp3', 500) } },
    })
    expect(String((await f.req('GET', '/api/songs/mp3-song/audio')).headers['content-type'])).toMatch(/audio\/mpeg/)
  })

  it('AD-AUD-02 Range: bytes=0- -> 206, Content-Range bytes 0-(N-1)/N y cuerpo completo', async () => {
    const f = await startFixture()
    const r = await f.req('GET', AUDIO, { headers: { Range: 'bytes=0-' } })
    expect([r.status, r.headers['content-range'], r.buffer.length]).toEqual([206, `bytes 0-${N - 1}/${N}`, N])
  })

  it('AD-AUD-03 bytes=100-199 -> 206, 100 bytes, Content-Range y contenido exactos', async () => {
    const f = await startFixture()
    const r = await f.req('GET', AUDIO, { headers: { Range: 'bytes=100-199' } })
    expect([r.status, r.headers['content-range'], r.headers['content-length']]).toEqual([206, `bytes 100-199/${N}`, '100'])
    expect(r.buffer.equals(LONG_AUDIO.subarray(100, 200))).toBe(true)
  })

  it('AD-AUD-04 bytes=a- abierto -> hasta el final', async () => {
    const f = await startFixture()
    const r = await f.req('GET', AUDIO, { headers: { Range: `bytes=${N - 50}-` } })
    expect([r.status, r.headers['content-range']]).toEqual([206, `bytes ${N - 50}-${N - 1}/${N}`])
    expect(r.buffer.equals(LONG_AUDIO.subarray(N - 50))).toBe(true)
  })

  it('AD-AUD-04 b mayor que el tamano se recorta a N-1', async () => {
    const f = await startFixture()
    const r = await f.req('GET', AUDIO, { headers: { Range: `bytes=${N - 10}-${N * 5}` } })
    expect([r.status, r.headers['content-range'], r.buffer.length]).toEqual([206, `bytes ${N - 10}-${N - 1}/${N}`, 10])
  })

  it('AD-AUD-05 sufijo bytes=-K -> ultimos K bytes', async () => {
    const f = await startFixture()
    const r = await f.req('GET', AUDIO, { headers: { Range: 'bytes=-500' } })
    expect([r.status, r.headers['content-range']]).toEqual([206, `bytes ${N - 500}-${N - 1}/${N}`])
    expect(r.buffer.equals(LONG_AUDIO.subarray(N - 500))).toBe(true)
  })

  it('AD-AUD-05 sufijo mayor que el fichero -> todo el fichero', async () => {
    const f = await startFixture()
    const r = await f.req('GET', AUDIO, { headers: { Range: `bytes=-${N * 3}` } })
    expect([r.status, r.headers['content-range'], r.buffer.length]).toEqual([206, `bytes 0-${N - 1}/${N}`, N])
  })

  for (const range of [`bytes=${N}-`, `bytes=${N + 10}-${N + 20}`, `bytes=${N * 10}-`]) {
    it(`AD-AUD-06 rango fuera del fichero (${range}) -> 416 con Content-Range bytes */N`, async () => {
      const f = await startFixture()
      const r = await f.req('GET', AUDIO, { headers: { Range: range } })
      expect([r.status, r.headers['content-range']]).toEqual([416, `bytes */${N}`])
    })
  }

  for (const range of ['bytes=5-1', 'bytes=abc', 'bytes=', 'items=0-1', 'bytes=0-1,5-6', 'bytes=-', 'bytes=--5', 'bytes=1-2-3', 'bytes=-0']) {
    it(`AD-AUD-07 rango invalido (${range}): 416 o 200 completo, sin caida ni lectura fuera de limites`, async () => {
      const f = await startFixture()
      const r = await f.req('GET', AUDIO, { headers: { Range: range } })
      expect([200, 416]).toContain(r.status)
      if (r.status === 200) expect(r.buffer.length).toBe(N)
      expect((await f.req('GET', '/api/session')).status).toBe(200)
    })
  }

  it('AD-AUD-08 fichero de 0 bytes: respuesta definida (200 vacio o 416) sin excepcion', async () => {
    const f = await startFixture({
      catalog: catalogOf([song({ id: 'vacia', clipKey: '1111111111111111', youtubeId: 'EEEEEEEEEE1', durationSec: 90 })]),
      sources: { EEEEEEEEEE1: { ext: 'webm', bytes: 0 } },
    })
    const plain = await f.req('GET', '/api/songs/vacia/audio')
    const ranged = await f.req('GET', '/api/songs/vacia/audio', { headers: { Range: 'bytes=0-' } })
    expect([200, 416]).toContain(plain.status)
    expect([200, 206, 416]).toContain(ranged.status)
    expect((await f.req('GET', '/api/session')).status).toBe(200)
  })

  it('AD-AUD-09 cancion inexistente -> 404 NOT_FOUND', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/api/songs/no-existe/audio')
    expect([r.status, r.json.error.code]).toEqual([404, 'NOT_FOUND'])
  })

  it('AD-AUD-09 cancion sin fuente en work/ -> 404 NOT_FOUND', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/api/songs/dp-twinleaf-town/audio')
    expect([r.status, r.json.error.code]).toEqual([404, 'NOT_FOUND'])
  })

  for (const id of ['..%2F..%2Fetc%2Fpasswd', '%2e%2e', '..%5C..%5Csecret', '%00', 'rse-littleroot-town%00.x', '..%2Fcatalog.json', '%2e%2e%2f%2e%2e%2fsecret']) {
    it(`AD-AUD-10 el audio se localiza por id via catalogo, nunca por ruta del cliente: ${id}`, async () => {
      const f = await startFixture()
      writeFileSync(join(f.dataDir, 'secret.webm'), 'CENTINELA-SECRETO')
      writeFileSync(join(f.dataDir, 'secret'), 'CENTINELA-SECRETO')
      const r = await f.req('GET', `/api/songs/${id}/audio`)
      expect(r.status).toBe(404)
      expect(r.text).not.toContain('CENTINELA-SECRETO')
    })
  }

  for (const hostile of ['../sentinel', '../../sentinel', 'a/b', 'a\\b', '..']) {
    it(`AD-AUD-11 youtubeId hostil en un catalogo corrupto (${hostile}) no sale de work/ -> 404`, async () => {
      const f = await startFixture({
        catalog: catalogOf([song({ id: 'hostil', clipKey: '1111111111111111', youtubeId: hostile, durationSec: 90 })]),
        sources: {},
      })
      writeFileSync(join(f.dataDir, 'sentinel.webm'), 'CENTINELA-SECRETO')
      mkdirSync(join(f.dataDir, 'work', 'a'), { recursive: true })
      writeFileSync(join(f.dataDir, 'work', 'a', 'b.webm'), 'CENTINELA-SECRETO')
      const r = await f.req('GET', '/api/songs/hostil/audio')
      expect(r.status).toBe(404)
      expect(r.text).not.toContain('CENTINELA-SECRETO')
    })
  }

  it('AD-AUD-12 youtubeId que empieza por "-" se resuelve y se sirve', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/api/songs/dp-dash/audio')
    expect([r.status, r.buffer.equals(bytesOf('dash', 3000))]).toEqual([200, true])
  })

  it('AD-AUD-13 con <id>.webm y <id>.webm.part sirve el completo e ignora .part/.ytdl', async () => {
    const f = await startFixture({
      catalog: catalogOf([song({ id: 'dos', clipKey: '1111111111111111', youtubeId: 'PPPPPPPPPP1', durationSec: 90 })]),
      sources: { PPPPPPPPPP1: { ext: 'webm', bytes: 1000 } },
    })
    writeFileSync(join(f.dataDir, 'work', 'PPPPPPPPPP1.webm.part'), Buffer.alloc(500))
    writeFileSync(join(f.dataDir, 'work', 'PPPPPPPPPP1.webm.ytdl'), Buffer.alloc(10))
    const r = await f.req('GET', '/api/songs/dos/audio')
    expect([r.status, r.buffer.length]).toEqual([200, 1000])
  })

  it('AD-AUD-13 solo con .part -> 404 (la fuente aun no esta completa)', async () => {
    const f = await startFixture({
      catalog: catalogOf([song({ id: 'parcial', clipKey: '1111111111111111', youtubeId: 'PPPPPPPPPP2', durationSec: 90 })]),
      sources: {},
    })
    writeFileSync(join(f.dataDir, 'work', 'PPPPPPPPPP2.webm.part'), Buffer.alloc(500))
    expect((await f.req('GET', '/api/songs/parcial/audio')).status).toBe(404)
  })

  describe('ficheros grandes (50 MB, dispersos)', () => {
    const BIG = 50 * 1024 * 1024
    async function bigFixture() {
      const f = await startFixture({
        catalog: catalogOf([song({ id: 'grande', clipKey: '1111111111111111', youtubeId: 'GGGGGGGGGG1', durationSec: 900 })]),
        sources: { GGGGGGGGGG1: { ext: 'webm', bytes: 1 } },
      })
      const file = join(f.dataDir, 'work', 'GGGGGGGGGG1.webm')
      const fd = openSync(file, 'r+')
      closeSync(fd)
      truncateSync(file, BIG)
      return f
    }

    it('AD-AUD-14 streaming: rangos pequenos de un fichero de 50 MB no cargan el fichero en memoria', async () => {
      const f = await bigFixture()
      const before = process.memoryUsage().rss
      for (let i = 0; i < 3; i++) {
        const head = await f.req('GET', '/api/songs/grande/audio', { headers: { Range: 'bytes=0-99' } })
        const tail = await f.req('GET', '/api/songs/grande/audio', { headers: { Range: 'bytes=-100' } })
        expect([head.status, head.buffer.length, tail.status, tail.buffer.length, tail.headers['content-range']]).toEqual([206, 100, 206, 100, `bytes ${BIG - 100}-${BIG - 1}/${BIG}`])
      }
      expect(process.memoryUsage().rss - before).toBeLessThan(30 * 1024 * 1024)
    })

    it('AD-AUD-16 un cliente que corta la conexion a mitad no cuelga el servidor ni lanza error no controlado', async () => {
      const f = await bigFixture()
      await new Promise<void>((resolve) => {
        const req = http.request({ host: '127.0.0.1', port: f.port, path: '/api/songs/grande/audio', headers: { Host: `127.0.0.1:${f.port}` } }, (res) => {
          res.once('data', () => {
            req.destroy()
            resolve()
          })
        })
        req.on('error', () => resolve())
        req.end()
      })
      await new Promise((r) => setTimeout(r, 100))
      expect((await f.req('GET', '/api/session')).status).toBe(200)
      expect((await f.req('GET', '/api/songs/grande/audio', { headers: { Range: 'bytes=0-9' } })).status).toBe(206)
    })
  })

  it('AD-AUD-15 el audio NO exige X-Admin-Token (un <audio> no puede enviarlo)', async () => {
    const f = await startFixture()
    const r = await f.req('GET', AUDIO, { headers: { 'X-Admin-Token': undefined } })
    expect(r.status).toBe(200)
  })

  it('AD-AUD-15 con un token incorrecto tambien se sirve (solo cuenta el Host)', async () => {
    const f = await startFixture()
    expect((await f.req('GET', AUDIO, { headers: { 'X-Admin-Token': 'basura' } })).status).toBe(200)
  })

  it('AD-AUD-15 con Host ajeno -> 403', async () => {
    const f = await startFixture()
    expect((await f.req('GET', AUDIO, { host: 'evil.com' })).status).toBe(403)
  })

  it('AD-AUD-15 con Host ajeno no se filtra ni un byte del audio', async () => {
    const f = await startFixture()
    const r = await request(f.port, 'GET', AUDIO, { host: `evil.com:${f.port}`, headers: { Range: 'bytes=0-9' } })
    expect([r.status, r.buffer.length < 200]).toEqual([403, true])
  })

  it('sanidad de fixtures', async () => {
    expect(adminCatalog().songs.length).toBe(5)
    expect(Object.keys(adminSources()).length).toBe(4)
    const stray = tmp()
    expect(makeUiDir().length).toBeGreaterThan(0)
    expect(stray.length).toBeGreaterThan(0)
    const dir = makeDataDir({ catalog: adminCatalog(), sources: adminSources() })
    const server = await startAdminServer({ dataDir: dir, uiDir: makeUiDir(), port: 0 })
    await server.close()
  })
})

describe('AD-AUD audio: youtubeId vacio', () => {
  it('SC-DUR-08 el admin no sirve work/.secret con youtubeId vacio', async () => {
    const f = await startFixture({ catalog: catalogOf([song({ id: 'vacio', clipKey: '1111111111111111', youtubeId: '' })]), sources: {} })
    mkdirSync(join(f.dataDir, 'work'), { recursive: true })
    writeFileSync(join(f.dataDir, 'work', '.secret'), 'CENTINELA-OCULTO')
    const r = await f.req('GET', '/api/songs/vacio/audio')
    expect(r.status).toBe(404)
    expect(r.text).not.toContain('CENTINELA-OCULTO')
  })
})
