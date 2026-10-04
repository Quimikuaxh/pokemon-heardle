import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LruCache } from '../../src/storage/LruCache'
import { FsClipStore } from '../../src/storage/FsClipStore'
import { S3ClipStore } from '../../src/storage/S3ClipStore'
import { CachedClipStore } from '../../src/storage/CachedClipStore'
import { catalogR, makeClip, writeStore } from '../helpers/fixtures'
import { isValidClipLocation } from '../../src/storage/clipLocation'
import { rejected } from '../helpers/errors'

const buf = (n: number, fill = 1) => Buffer.alloc(n, fill)

describe('storage/LruCache', () => {
  it('BE-STO-01 guarda y recupera un valor', () => {
    const c = new LruCache(100)
    c.set('a', buf(10))
    expect(c.get('a')?.length).toBe(10)
  })

  it('BE-STO-01 respeta el limite en bytes', () => {
    const c = new LruCache(100)
    c.set('a', buf(40))
    c.set('b', buf(40))
    c.set('c', buf(40))
    expect(c.bytes).toBeLessThanOrEqual(100)
  })

  it('BE-STO-01 expulsa el menos recientemente usado', () => {
    const c = new LruCache(100)
    c.set('a', buf(40))
    c.set('b', buf(40))
    c.get('a') // a pasa a ser el mas reciente
    c.set('c', buf(40)) // expulsa b
    expect([c.has('a'), c.has('b'), c.has('c')]).toEqual([true, false, true])
  })

  it('BE-STO-01 get de clave ausente devuelve undefined', () => {
    expect(new LruCache(100).get('x')).toBeUndefined()
  })

  it('BE-STO-01 reemplazar una clave no duplica los bytes', () => {
    const c = new LruCache(100)
    c.set('a', buf(40))
    c.set('a', buf(30))
    expect(c.bytes).toBe(30)
  })

  it('BE-STO-02 un clip mayor que el limite no se cachea ni rompe', () => {
    const c = new LruCache(50)
    expect(() => c.set('big', buf(60))).not.toThrow()
    expect([c.has('big'), c.bytes]).toEqual([false, 0])
  })

  it('BE-STO-02 un clip enorme no expulsa los existentes', () => {
    const c = new LruCache(100)
    c.set('a', buf(40))
    c.set('big', buf(200))
    expect(c.has('a')).toBe(true)
  })

  it('limite 0: nada se cachea', () => {
    const c = new LruCache(0)
    c.set('a', buf(1))
    expect(c.has('a')).toBe(false)
  })
})

describe('storage/FsClipStore', () => {
  const c = catalogR()

  it('BE-STO-03 lee catalog/catalog.json', async () => {
    const dir = writeStore(c, c.songs)
    const got: any = await new FsClipStore(dir).getCatalog()
    expect(got.songs.length).toBe(c.songs.length)
  })

  it('BE-STO-03 getClip(clipKey) lee clips/<clipKey>.mp3 entero y sin transformar', async () => {
    const dir = writeStore(c, c.songs)
    const got = await new FsClipStore(dir).getClip('1111111111111111')
    expect(got.equals(makeClip('1111111111111111'))).toBe(true)
    expect(got.length).toBe(256626)
  })

  it('BE-STO-03 no lee el layout antiguo clips/<clipKey>/<n>.mp3', async () => {
    const dir = writeStore(c, [])
    mkdirSync(join(dir, 'clips', '1111111111111111'), { recursive: true })
    writeFileSync(join(dir, 'clips', '1111111111111111', '1.mp3'), 'antiguo')
    expect(await rejected(new FsClipStore(dir).getClip('1111111111111111'))).toBeDefined()
  })

  for (const bad of ['../etc', '..', '../../x', '/etc/passwd', 'a/b', '1111111111111111/../2222222222222222', '1111111111111111/1', 'ZZZZZZZZZZZZZZZZ', '', '111111111111111', '1111111111111111\0', '1111111111111111.mp3']) {
    it(`BE-STO-03 clipKey fuera de [0-9a-f]{16} rechazado: ${JSON.stringify(bad)}`, async () => {
      const dir = writeStore(c, c.songs)
      expect(await rejected(new FsClipStore(dir).getClip(bad))).toBeDefined()
    })
  }

  it('BE-STO-03 no sale del directorio aunque exista el fichero fuera', async () => {
    const dir = writeStore(c, c.songs)
    const outside = mkdtempSync(join(tmpdir(), 'outside-'))
    writeFileSync(join(outside, 'secret.mp3'), 'top-secret')
    expect(await rejected(new FsClipStore(dir).getClip(`../../${outside}/secret`))).toBeDefined()
  })

  it('BE-STO-03 clip inexistente rechaza', async () => {
    const dir = writeStore(c, c.songs)
    expect(await rejected(new FsClipStore(dir).getClip('9999999999999999'))).toBeDefined()
  })

  it('BE-CLP-06 isValidClipLocation(clipKey) acepta 16 hex y rechaza cualquier ruta con subdirectorio o numero', () => {
    expect(isValidClipLocation('1111111111111111')).toBe(true)
    for (const bad of ['1111111111111111/3', '1111111111111111/3.mp3', 'a/b', '../x', '', 'GGGGGGGGGGGGGGGG']) expect(isValidClipLocation(bad as any)).toBe(false)
  })

  it('BE-CLP-06 isValidClipLocation ya no admite un numero de clip: (clipKey, n) deja de ser una forma valida de pedir audio', () => {
    expect(isValidClipLocation.length).toBeLessThanOrEqual(1)
  })
})

describe('storage/S3ClipStore (cliente simulado)', () => {
  function client(body: Buffer | Error) {
    return {
      send: vi.fn(async () => {
        if (body instanceof Error) throw body
        return {
          Body: {
            transformToByteArray: async () => new Uint8Array(body),
            transformToString: async () => body.toString('utf8'),
          },
        }
      }),
    }
  }

  it('BE-STO-04 getClip pide Bucket y Key clips/<clipKey>.mp3', async () => {
    const cl = client(buf(10))
    await new S3ClipStore({ client: cl as any, bucket: 'heardle-audio' }).getClip('abcdef0123456789')
    const input = (cl.send.mock.calls[0] as any[])[0].input
    expect(input).toMatchObject({ Bucket: 'heardle-audio', Key: 'clips/abcdef0123456789.mp3' })
  })

  it('BE-STO-04 una sola lectura por getClip y nunca la clave antigua clips/<clipKey>/<n>.mp3', async () => {
    const cl = client(buf(10))
    await new S3ClipStore({ client: cl as any, bucket: 'b' }).getClip('abcdef0123456789')
    expect(cl.send).toHaveBeenCalledTimes(1)
    for (const call of cl.send.mock.calls as any[][]) expect(call[0].input.Key).not.toMatch(/\/[0-9]\.mp3$|abcdef0123456789\//)
  })

  it('BE-STO-04 getClip devuelve los bytes', async () => {
    const data = buf(32, 7)
    const got = await new S3ClipStore({ client: client(data) as any, bucket: 'b' }).getClip('abcdef0123456789')
    expect(got.equals(data)).toBe(true)
  })

  it('BE-STO-04 getCatalog pide catalog/catalog.json y parsea el JSON', async () => {
    const cl = client(Buffer.from(JSON.stringify({ version: 1 })))
    const got = await new S3ClipStore({ client: cl as any, bucket: 'b' }).getCatalog()
    expect([(cl.send.mock.calls[0] as any[])[0].input.Key, got]).toEqual(['catalog/catalog.json', { version: 1 }])
  })

  it('BE-STO-04 error del cliente -> STORAGE_ERROR (502) sin detalles internos', async () => {
    const e = await rejected(
      new S3ClipStore({ client: client(new Error('AccessDenied key=SECRET123')) as any, bucket: 'b' }).getClip('abcdef0123456789'),
    )
    expect([e?.code, e?.status, String(e?.message).includes('SECRET123')]).toEqual(['STORAGE_ERROR', 502, false])
  })

  it('clipKey fuera de [0-9a-f]{16} se rechaza antes de llamar al cliente', async () => {
    const cl = client(buf(1))
    await rejected(new S3ClipStore({ client: cl as any, bucket: 'b' }).getClip('../x'))
    await rejected(new S3ClipStore({ client: cl as any, bucket: 'b' }).getClip('abcdef0123456789/3'))
    expect(cl.send).not.toHaveBeenCalled()
  })
})

describe('storage/CachedClipStore', () => {
  function inner() {
    return {
      getCatalog: vi.fn(async () => ({})),
      getClip: vi.fn(async (k: string) => makeClip(k)),
    }
  }

  it('BE-STO-05 la cache guarda un fichero por cancion: 6 intentos = 1 lectura', async () => {
    const i = inner()
    const s = new CachedClipStore(i as any, new LruCache(10_000_000))
    for (let attempt = 0; attempt < 6; attempt++) await s.getClip('1111111111111111')
    expect(i.getClip).toHaveBeenCalledTimes(1)
  })

  it('BE-STO-05 canciones distintas leen por separado (una entrada por clipKey)', async () => {
    const i = inner()
    const s = new CachedClipStore(i as any, new LruCache(10_000_000))
    await s.getClip('1111111111111111')
    await s.getClip('2222222222222222')
    await s.getClip('1111111111111111')
    expect(i.getClip).toHaveBeenCalledTimes(2)
  })

  it('BE-STO-05 devuelve los mismos bytes en miss y en hit', async () => {
    const s = new CachedClipStore(inner() as any, new LruCache(10_000_000))
    const a = await s.getClip('1111111111111111')
    const b = await s.getClip('1111111111111111')
    expect(a.equals(b)).toBe(true)
  })

  it('BE-STO-05 la clave de cache es el clipKey (sin numero de clip)', async () => {
    const cache = new LruCache(10_000_000)
    const s = new CachedClipStore(inner() as any, cache)
    await s.getClip('1111111111111111')
    expect(cache.has('1111111111111111')).toBe(true)
    expect(cache.bytes).toBe(256626)
  })

  it('BE-STO-05 un error del store no se cachea', async () => {
    const i = inner()
    i.getClip.mockRejectedValueOnce(new Error('boom'))
    const s = new CachedClipStore(i as any, new LruCache(10_000_000))
    await rejected(s.getClip('1111111111111111'))
    await s.getClip('1111111111111111')
    expect(i.getClip).toHaveBeenCalledTimes(2)
  })

  it('getCatalog se delega siempre al store interno', async () => {
    const i = inner()
    const s = new CachedClipStore(i as any, new LruCache(10))
    await s.getCatalog()
    expect(i.getCatalog).toHaveBeenCalledTimes(1)
  })

  it('BE-CLP-12 CLIP_CACHE_MB=32 guarda unas 130 canciones; la 131.a expulsa la mas antigua', async () => {
    const i = { getCatalog: vi.fn(), getClip: vi.fn(async (_k: string) => Buffer.alloc(256626, 1)) }
    const cache = new LruCache(32 * 1024 * 1024)
    const s = new CachedClipStore(i as any, cache)
    const key = (n: number) => n.toString(16).padStart(16, '0')
    for (let n = 1; n <= 130; n++) await s.getClip(key(n))
    expect(cache.has(key(1))).toBe(true)
    await s.getClip(key(131))
    expect([cache.has(key(1)), cache.has(key(2)), cache.has(key(131))]).toEqual([false, true, true])
    expect(cache.bytes).toBeLessThanOrEqual(32 * 1024 * 1024)
  })

  it('BE-CLP-12 leer de nuevo la expulsada vuelve al store (130 hits no la protegen)', async () => {
    const i = { getCatalog: vi.fn(), getClip: vi.fn(async (_k: string) => Buffer.alloc(256626, 1)) }
    const s = new CachedClipStore(i as any, new LruCache(32 * 1024 * 1024))
    const key = (n: number) => n.toString(16).padStart(16, '0')
    for (let n = 1; n <= 131; n++) await s.getClip(key(n))
    const before = i.getClip.mock.calls.length
    await s.getClip(key(1))
    expect(i.getClip.mock.calls.length).toBe(before + 1)
  })
})

describe('storage/CachedClipStore.evict', () => {
  it('BE-STO-05 evict(clipKey) olvida el fichero y la siguiente lectura vuelve al store', async () => {
    const getClip = vi.fn(async (k: string) => makeClip(k))
    const s = new CachedClipStore({ getCatalog: vi.fn(), getClip } as any, new LruCache(10_000_000))
    await s.getClip('1111111111111111')
    s.evict('1111111111111111')
    await s.getClip('1111111111111111')
    expect(getClip).toHaveBeenCalledTimes(2)
  })

  it('BE-STO-01 LruCache.delete libera los bytes y no falla con claves ausentes', () => {
    const c = new LruCache(100)
    c.set('a', buf(40))
    c.delete('a')
    c.delete('no-existe')
    expect([c.has('a'), c.bytes]).toEqual([false, 0])
  })
})
