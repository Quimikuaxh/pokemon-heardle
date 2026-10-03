import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LruCache } from '../../src/storage/LruCache'
import { FsClipStore } from '../../src/storage/FsClipStore'
import { S3ClipStore } from '../../src/storage/S3ClipStore'
import { CachedClipStore } from '../../src/storage/CachedClipStore'
import { catalogR, makeClip, writeStore } from '../helpers/fixtures'
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

  it('BE-STO-03 lee clips/<clipKey>/<n>.mp3 sin transformar', async () => {
    const dir = writeStore(c, c.songs)
    const got = await new FsClipStore(dir).getClip('1111111111111111', 3)
    expect(got.equals(makeClip('1111111111111111', 3))).toBe(true)
  })

  for (const bad of ['../etc', '..', '../../x', '/etc/passwd', '1111111111111111/../2222222222222222', 'ZZZZZZZZZZZZZZZZ', '', '111111111111111', '1111111111111111\0']) {
    it(`BE-STO-03 clipKey fuera de [0-9a-f]{16} rechazado: ${JSON.stringify(bad)}`, async () => {
      const dir = writeStore(c, c.songs)
      expect(await rejected(new FsClipStore(dir).getClip(bad, 1))).toBeDefined()
    })
  }

  it('BE-STO-03 no sale del directorio aunque exista el fichero fuera', async () => {
    const dir = writeStore(c, c.songs)
    const outside = mkdtempSync(join(tmpdir(), 'outside-'))
    mkdirSync(join(outside, 'x'), { recursive: true })
    writeFileSync(join(outside, 'secret.txt'), 'top-secret')
    expect(await rejected(new FsClipStore(dir).getClip(`../../${outside}/secret`, 1))).toBeDefined()
  })

  for (const n of [0, 7, -1, 1.5, NaN]) {
    it(`BE-STO-03 numero de clip invalido ${n} rechazado`, async () => {
      const dir = writeStore(c, c.songs)
      expect(await rejected(new FsClipStore(dir).getClip('1111111111111111', n))).toBeDefined()
    })
  }

  it('clip inexistente rechaza', async () => {
    const dir = writeStore(c, c.songs)
    expect(await rejected(new FsClipStore(dir).getClip('9999999999999999', 1))).toBeDefined()
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

  it('BE-STO-04 getClip pide Bucket y Key esperados (clips/<clipKey>/<n>.mp3)', async () => {
    const cl = client(buf(10))
    await new S3ClipStore({ client: cl as any, bucket: 'heardle-audio' }).getClip('abcdef0123456789', 4)
    const input = (cl.send.mock.calls[0] as any[])[0].input
    expect(input).toMatchObject({ Bucket: 'heardle-audio', Key: 'clips/abcdef0123456789/4.mp3' })
  })

  it('BE-STO-04 getClip devuelve los bytes', async () => {
    const data = buf(32, 7)
    const got = await new S3ClipStore({ client: client(data) as any, bucket: 'b' }).getClip('abcdef0123456789', 1)
    expect(got.equals(data)).toBe(true)
  })

  it('BE-STO-04 getCatalog pide catalog/catalog.json y parsea el JSON', async () => {
    const cl = client(Buffer.from(JSON.stringify({ version: 1 })))
    const got = await new S3ClipStore({ client: cl as any, bucket: 'b' }).getCatalog()
    expect([(cl.send.mock.calls[0] as any[])[0].input.Key, got]).toEqual(['catalog/catalog.json', { version: 1 }])
  })

  it('BE-STO-04 error del cliente -> STORAGE_ERROR (502) sin detalles internos', async () => {
    const e = await rejected(
      new S3ClipStore({ client: client(new Error('AccessDenied key=SECRET123')) as any, bucket: 'b' }).getClip('abcdef0123456789', 1),
    )
    expect([e?.code, e?.status, String(e?.message).includes('SECRET123')]).toEqual(['STORAGE_ERROR', 502, false])
  })

  it('clipKey fuera de [0-9a-f]{16} se rechaza antes de llamar al cliente', async () => {
    const cl = client(buf(1))
    await rejected(new S3ClipStore({ client: cl as any, bucket: 'b' }).getClip('../x', 1))
    expect(cl.send).not.toHaveBeenCalled()
  })
})

describe('storage/CachedClipStore', () => {
  function inner() {
    return {
      getCatalog: vi.fn(async () => ({})),
      getClip: vi.fn(async (k: string, n: number) => makeClip('1111111111111111', n)),
    }
  }

  it('BE-STO-05 un hit de cache no vuelve a llamar al store (1 lectura)', async () => {
    const i = inner()
    const s = new CachedClipStore(i as any, new LruCache(10_000_000))
    await s.getClip('1111111111111111', 1)
    await s.getClip('1111111111111111', 1)
    expect(i.getClip).toHaveBeenCalledTimes(1)
  })

  it('BE-STO-05 claves distintas leen por separado', async () => {
    const i = inner()
    const s = new CachedClipStore(i as any, new LruCache(10_000_000))
    await s.getClip('1111111111111111', 1)
    await s.getClip('1111111111111111', 2)
    expect(i.getClip).toHaveBeenCalledTimes(2)
  })

  it('BE-STO-05 devuelve los mismos bytes en miss y en hit', async () => {
    const s = new CachedClipStore(inner() as any, new LruCache(10_000_000))
    const a = await s.getClip('1111111111111111', 1)
    const b = await s.getClip('1111111111111111', 1)
    expect(a.equals(b)).toBe(true)
  })

  it('BE-STO-05 un error del store no se cachea', async () => {
    const i = inner()
    i.getClip.mockRejectedValueOnce(new Error('boom'))
    const s = new CachedClipStore(i as any, new LruCache(10_000_000))
    await rejected(s.getClip('1111111111111111', 1))
    await s.getClip('1111111111111111', 1)
    expect(i.getClip).toHaveBeenCalledTimes(2)
  })

  it('getCatalog se delega siempre al store interno', async () => {
    const i = inner()
    const s = new CachedClipStore(i as any, new LruCache(10))
    await s.getCatalog()
    expect(i.getCatalog).toHaveBeenCalledTimes(1)
  })
})
