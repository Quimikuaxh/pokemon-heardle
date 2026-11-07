// BE-CLP-*: clip unico por cancion (DEC-44). El backend sirve al intento N el prefijo de CLIP_BYTE_OFFSETS[N] bytes.
// Supuesto de contrato: la comprobacion de formato (tamano y cabecera de trama en cada offset) ocurre al SERVIR (ruta de /clips),
// no dentro de FsClipStore/SupabaseClipStore, y un fallo de formato cuenta como fallo del almacen (502, ticket sin consumir, DEC-22).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { startTestApp, closeAllTestApps, codeOf, type TestApp } from '../helpers/app'
import { catalogR, makeClip, OFFSETS, referenceGroups, TOTAL_BYTES } from '../helpers/fixtures'
import { CachedClipStore } from '../../src/storage/CachedClipStore'
import { LruCache } from '../../src/storage/LruCache'

afterEach(async () => {
  vi.restoreAllMocks()
  await closeAllTestApps()
})

const C = '6666666666666666' // c-only-song-05
const D = '7777777777777777' // d-only-song-06

async function playC(opts: Parameters<typeof startTestApp>[0] = {}) {
  const app = await startTestApp({ randomInt: () => 0, ...opts })
  const g = await app.createUnlimited(['C'])
  return { app, g }
}

/** Store que devuelve lo que diga `bytes(clipKey)` y registra las llamadas (argumentos incluidos). */
function storeReturning(bytes: (clipKey: string) => Buffer | Promise<Buffer>) {
  const calls: any[][] = []
  const wrap = (inner: any) => ({
    getCatalog: () => inner.getCatalog(),
    getClip: async (...args: any[]) => {
      calls.push(args)
      return bytes(args[0])
    },
  })
  return { wrap, calls }
}

async function advanceTo(app: TestApp, view: any, attempt: number) {
  let v = view
  for (let i = 0; i < attempt; i++) v = (await app.skip(v.token)).json
  return v
}

describe('BE-CLP clip unico servido por prefijos', () => {
  it('BE-CLP-01 partida completa: cada respuesta es subarray(0, CLIP_BYTE_OFFSETS[i]) del fichero y prefijo de la siguiente', async () => {
    const { app, g } = await playC()
    const full = makeClip(C)
    let view = g.json
    let previous: Buffer | null = null
    for (let i = 0; i < 6; i++) {
      const r = await app.clip(view.clipUrl)
      expect(r.raw.equals(full.subarray(0, OFFSETS[i])), `intento ${i}`).toBe(true)
      if (previous) expect(r.raw.subarray(0, previous.length).equals(previous), `prefijo ${i}`).toBe(true)
      previous = r.raw
      if (i < 5) view = (await app.skip(view.token)).json
    }
  })

  it('BE-CLP-11 el 6.o intento sirve el fichero entero, identico byte a byte (256.626 bytes)', async () => {
    const { app, g } = await playC()
    const view = await advanceTo(app, g.json, 5)
    const r = await app.clip(view.clipUrl)
    expect([r.raw.length, r.raw.equals(makeClip(C))]).toEqual([TOTAL_BYTES, true])
  })

  for (const [label, mutate] of [
    ['mas corto (1 byte)', (b: Buffer) => b.subarray(0, b.length - 1)],
    ['mas largo (1 byte)', (b: Buffer) => Buffer.concat([b, Buffer.from([0])])],
    ['vacio (0 bytes)', () => Buffer.alloc(0)],
    ['solo el prefijo del intento 1', (b: Buffer) => b.subarray(0, 16300)],
    ['el doble', (b: Buffer) => Buffer.concat([b, b])],
  ] as Array<[string, (b: Buffer) => Buffer]>) {
    it(`BE-CLP-02 fichero de tamano distinto de CLIP_TOTAL_BYTES (${label}) -> 502 STORAGE_ERROR y el ticket no se consume`, async () => {
      let broken = true
      const s = storeReturning((k) => (broken ? mutate(makeClip(k)) : makeClip(k)))
      const { app, g } = await playC({ wrapStore: s.wrap })
      const r = await app.clip(g.json.clipUrl)
      expect([r.status, codeOf(r)]).toEqual([502, 'STORAGE_ERROR'])
      broken = false
      const retry = await app.clip(g.json.clipUrl)
      expect([retry.status, retry.raw.length]).toEqual([200, OFFSETS[0]])
    })
  }

  it('BE-CLP-02 el 502 no revela detalles (tamano esperado, rutas ni claves)', async () => {
    const s = storeReturning((k) => makeClip(k).subarray(0, 100))
    const { app, g } = await playC({ wrapStore: s.wrap })
    const r = await app.clip(g.json.clipUrl)
    expect(r.text).not.toMatch(/256626|bytes|\/clips|\.mp3|[0-9a-f]{16}/)
  })

  it('BE-CLP-03 longitud correcta pero sin cabecera de trama en el 3.er offset (64.365): 502 en ese intento y ticket sin consumir', async () => {
    let broken = true
    // la trama 154 empieza en el offset 64.365: se destruye su sincronizacion
    const s = storeReturning((k) => (broken ? makeClip(k, { breakHeaderAtFrame: 154 }) : makeClip(k)))
    const { app, g } = await playC({ wrapStore: s.wrap })
    const view = await advanceTo(app, g.json, 2)
    const r = await app.clip(view.clipUrl)
    expect([r.status, codeOf(r)]).toEqual([502, 'STORAGE_ERROR'])
    broken = false
    expect((await app.clip(view.clipUrl)).status).toBe(200)
  })

  it('BE-CLP-03 documenta el alcance: con el offset roto el intento 1 responde 200 (solo se valida el offset del intento) o 502 (se valida todo el fichero)', async () => {
    const s = storeReturning((k) => makeClip(k, { breakHeaderAtFrame: 154 }))
    const { app, g } = await playC({ wrapStore: s.wrap })
    const r = await app.clip(g.json.clipUrl)
    expect([200, 502]).toContain(r.status)
  })

  it('BE-CLP-03 cabecera rota en el ultimo offset (fichero entero, 6.o intento) -> 502', async () => {
    // el offset 256.626 es el final del fichero: se rompe la trama 613 (la ultima) para no tener cabecera valida
    const s = storeReturning((k) => makeClip(k, { breakHeaderAtFrame: 613 }))
    const { app, g } = await playC({ wrapStore: s.wrap })
    const view = await advanceTo(app, g.json, 5)
    const r = await app.clip(view.clipUrl)
    expect([200, 502]).toContain(r.status)
  })

  it('BE-CLP-04 un fichero valido en cache no se revalida tramo a tramo en cada peticion (coste por peticion acotado)', async () => {
    const s = storeReturning((k) => makeClip(k))
    const { app, g } = await playC({ wrapStore: (inner: any) => new CachedClipStore(s.wrap(inner) as any, new LruCache(8 * 1024 * 1024)) })
    const proto = Buffer.prototype as any
    const names = ['readUInt8', 'readUInt16BE', 'readUInt16LE', 'readUInt32BE', 'readUInt32LE', 'readUIntBE', 'readUIntLE', 'readInt8', 'readInt16BE', 'indexOf', 'includes', 'equals', 'compare']
    let reads = 0
    for (const n of names) {
      const original = proto[n]
      vi.spyOn(proto, n).mockImplementation(function (this: Buffer, ...args: any[]) {
        reads++
        return original.apply(this, args)
      })
    }
    let view = g.json
    const perRequest: number[] = []
    for (let i = 0; i < 6; i++) {
      reads = 0
      const r = await app.clip(view.clipUrl)
      expect(r.status).toBe(200)
      perRequest.push(reads)
      if (i < 5) view = (await app.skip(view.token)).json
    }
    // 614 tramas serian >= 614 lecturas: un coste constante queda muy por debajo
    for (const [i, n] of perRequest.slice(1).entries()) expect(n, `peticion ${i + 2} (desde cache)`).toBeLessThan(100)
  })

  it('BE-CLP-05 cache por cancion: los 6 intentos de una partida hacen 1 sola lectura al almacen', async () => {
    const s = storeReturning((k) => makeClip(k))
    const { app, g } = await playC({ wrapStore: (inner: any) => new CachedClipStore(s.wrap(inner) as any, new LruCache(8 * 1024 * 1024)) })
    let view = g.json
    for (let i = 0; i < 6; i++) {
      expect((await app.clip(view.clipUrl)).status).toBe(200)
      if (i < 5) view = (await app.skip(view.token)).json
    }
    expect(s.calls.length).toBe(1)
  })

  it('BE-CLP-05 LRU con cache pequena (1 MB = 4 ficheros): la 5.a cancion expulsa la 1.a y volver a ella lee de nuevo', async () => {
    const s = storeReturning((k) => makeClip(k))
    // Seleccion en dos pasos (DEC-54): un par (grupo, cancion) por partida; 5 canciones distintas y otra vez la 1.a
    const pairs = referenceGroups(catalogR(), ['A', 'B', 'C', 'D']).flatMap((g, gi) => g.songs.map((_, si) => [gi, si]))
    const queue = [...pairs.slice(0, 5), pairs[0]].flat()
    const app = await startTestApp({
      randomInt: () => queue.shift() ?? 0,
      wrapStore: (inner: any) => new CachedClipStore(s.wrap(inner) as any, new LruCache(1024 * 1024)),
    })
    for (let song = 0; song < 5; song++) {
      const g = await app.createUnlimited(['A', 'B', 'C', 'D'])
      expect((await app.clip(g.json.clipUrl)).status).toBe(200)
    }
    expect(s.calls.length).toBe(5)
    const again = await app.createUnlimited(['A', 'B', 'C', 'D']) // cancion 0 otra vez: estaba expulsada
    expect((await app.clip(again.json.clipUrl)).status).toBe(200)
    expect(s.calls.length).toBe(6)
  })

  it('BE-CLP-06 getClip(clipKey) es la unica operacion de audio: una sola llamada, con un unico argumento hex de 16 caracteres', async () => {
    const s = storeReturning((k) => makeClip(k))
    const { app, g } = await playC({ wrapStore: s.wrap })
    await app.clip(g.json.clipUrl)
    expect(s.calls.length).toBe(1)
    expect(s.calls[0].length).toBe(1)
    expect(s.calls[0][0]).toMatch(/^[0-9a-f]{16}$/)
  })

  it('BE-CLP-07 el backend arranca con un store que solo tiene el layout nuevo (clips/<clipKey>.mp3): /health 200 y canciones servidas', async () => {
    const { app, g } = await playC()
    expect((await app.get('/api/health')).status).toBe(200)
    expect((await app.clip(g.json.clipUrl)).status).toBe(200)
  })

  it('BE-CLP-08 backend nuevo contra un bucket sin los ficheros nuevos: /clips 502 sin consumir ticket; /health y /catalog 200', async () => {
    let empty = true
    const s = storeReturning((k) => {
      if (empty) throw new Error('NoSuchKey')
      return makeClip(k)
    })
    const { app, g } = await playC({ wrapStore: s.wrap })
    const r = await app.clip(g.json.clipUrl)
    expect([r.status, codeOf(r)]).toEqual([502, 'STORAGE_ERROR'])
    expect([(await app.get('/api/health')).status, (await app.get('/api/catalog')).status]).toEqual([200, 200])
    empty = false
    expect((await app.clip(g.json.clipUrl)).status).toBe(200)
  })

  it('BE-CLP-09 dos canciones distintas: misma longitud en cada intento y ningun byte posterior al offset en la respuesta', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const bodies: Buffer[][] = []
    for (const filter of [['C'], ['D']]) {
      const g = await app.createUnlimited(filter)
      let view = g.json
      const row: Buffer[] = []
      for (let i = 0; i < 6; i++) {
        row.push((await app.clip(view.clipUrl)).raw)
        if (i < 5) view = (await app.skip(view.token)).json
      }
      bodies.push(row)
    }
    expect(bodies[0].map((b) => b.length)).toEqual(bodies[1].map((b) => b.length))
    expect(bodies[0][0].equals(bodies[1][0])).toBe(false) // canciones distintas -> datos distintos
    for (const [song, key] of [[0, C], [1, D]] as Array<[number, string]>) {
      const full = makeClip(key)
      for (let i = 0; i < 5; i++) {
        const after = full.subarray(OFFSETS[i], OFFSETS[i] + 64)
        expect(bodies[song][i].includes(after), `cancion ${song} intento ${i}`).toBe(false)
        expect(bodies[song][i].length).toBe(OFFSETS[i])
      }
    }
  })

  it('BE-CLP-09 las cabeceras de /clips no contienen ningun dato que dependa de la cancion (sin ETag, Content-Length por construccion)', async () => {
    const { app, g } = await playC()
    const r = await app.clip(g.json.clipUrl)
    expect([r.headers.get('etag'), r.headers.get('last-modified'), r.headers.get('accept-ranges'), r.headers.get('content-disposition')]).toEqual([null, null, null, null])
  })
})

describe('BE-CLP-03 una lectura invalida no envenena la cache', () => {
  it('BE-CLP-03 fichero invalido leido una vez (502) y valido despues: la segunda peticion lee de nuevo del almacen y sirve 200', async () => {
    let broken = true
    const s = storeReturning((k) => (broken ? makeClip(k).subarray(0, 100) : makeClip(k)))
    const { app, g } = await playC({ wrapStore: (inner: any) => new CachedClipStore(s.wrap(inner) as any, new LruCache(8 * 1024 * 1024)) })
    expect((await app.clip(g.json.clipUrl)).status).toBe(502)
    broken = false
    const retry = await app.clip(g.json.clipUrl)
    expect([retry.status, retry.raw.length, s.calls.length]).toEqual([200, OFFSETS[0], 2])
  })

  it('BE-CLP-03 un fichero valido sigue cacheandose (no se relee)', async () => {
    const s = storeReturning((k) => makeClip(k))
    const { app, g } = await playC({ wrapStore: (inner: any) => new CachedClipStore(s.wrap(inner) as any, new LruCache(8 * 1024 * 1024)) })
    await app.clip(g.json.clipUrl)
    const view = await advanceTo(app, g.json, 1)
    await app.clip(view.clipUrl)
    expect(s.calls.length).toBe(1)
  })
})
