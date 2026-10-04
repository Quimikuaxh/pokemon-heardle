// Contrato: src/upload.ts exporta
//   runUpload({ catalog, outDir, store, validate, prune? }): Promise<{ uploaded: string[]; deleted: string[] }>
//     store: ObjectStore { list(prefix): Promise<Map<key, { md5: string }>>;
//                          put(key, body: Buffer): Promise<void>; delete(key): Promise<void> }
//     validate: () => Promise<{ ok: boolean; errors: string[] }>   (si falla, runUpload rechaza y no sube nada)
//     claves remotas: clips/<clipKey>/<n>.mp3 y catalog/catalog.json (ultimo)
//     "cambiado" = md5 remoto distinto del md5 local (con CBR el tamano no sirve: es siempre igual)
import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runUpload } from '../src/upload'

const K1 = '1111111111111111'
const K2 = '2222222222222222'
const md5 = (b: Buffer | string) => createHash('md5').update(b).digest('hex')
const clipBytes = (key: string, n: number) => Buffer.from(`${key}-${n}`)

const song = (id: string, clipKey: string, enabled = true): any => ({
  id,
  title: id,
  games: ['g'],
  clipKey,
  startSec: 0,
  enabled,
  reviewed: true,
  source: { youtubeId: 'vid00000001', videoTitle: 'x' },
})
const catalog = (songs: any[]): any => ({ version: 1, generatedAt: 'x', games: [{ id: 'g', name: 'G' }], songs })

function setup(keys: string[]) {
  const data = mkdtempSync(join(tmpdir(), 'up-'))
  const out = join(data, 'out')
  const work = join(data, 'work')
  mkdirSync(work, { recursive: true })
  writeFileSync(join(work, 'vid00000001.m4a'), 'ORIGINAL-SIN-RECORTAR')
  for (const k of keys) {
    mkdirSync(join(out, k), { recursive: true })
    for (let n = 1; n <= 6; n++) writeFileSync(join(out, k, `${n}.mp3`), clipBytes(k, n))
  }
  return { data, out }
}

function fakeStore(remote: Record<string, string> = {}) {
  const calls: string[] = []
  const store = {
    list: vi.fn(async (_prefix: string) => new Map(Object.entries(remote).map(([k, m]) => [k, { md5: m }]))),
    put: vi.fn(async (key: string, _body: Buffer) => void calls.push(`put ${key}`)),
    delete: vi.fn(async (key: string) => void calls.push(`delete ${key}`)),
  }
  return { store, calls }
}

const okValidate = async () => ({ ok: true, errors: [] as string[] })

describe('runUpload', () => {
  it('SC-UP-01 ejecuta validate primero y, si falla, no sube nada y rechaza', async () => {
    const { out } = setup([K1])
    const { store } = fakeStore()
    const validate = vi.fn(async () => ({ ok: false, errors: ['falta un clip'] }))
    await expect(runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate })).rejects.toThrow()
    expect(validate).toHaveBeenCalledTimes(1)
    expect(store.put).not.toHaveBeenCalled()
  })

  it('SC-UP-01 validate se invoca antes de cualquier operacion del almacen', async () => {
    const { out } = setup([K1])
    const order: string[] = []
    const { store } = fakeStore()
    store.list.mockImplementation(async () => (order.push('list'), new Map()))
    const validate = async () => (order.push('validate'), { ok: true, errors: [] })
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate })
    expect(order[0]).toBe('validate')
  })

  it('SC-UP-02 sube los 6 clips de cada cancion activa y por ultimo catalog/catalog.json', async () => {
    const { out } = setup([K1, K2])
    const { store, calls } = fakeStore()
    await runUpload({ catalog: catalog([song('a', K1), song('b', K2)]), outDir: out, store, validate: okValidate })
    expect(calls.length).toBe(13)
    expect(calls.at(-1)).toBe('put catalog/catalog.json')
    expect(calls.slice(0, 12).every((c) => /^put clips\/(1{16}|2{16})\/[1-6]\.mp3$/.test(c))).toBe(true)
  })

  it('SC-UP-02 el contenido subido de catalog.json es el catalogo', async () => {
    const { out } = setup([K1])
    const { store } = fakeStore()
    const c = catalog([song('a', K1)])
    await runUpload({ catalog: c, outDir: out, store, validate: okValidate })
    const call = store.put.mock.calls.find((x) => x[0] === 'catalog/catalog.json')!
    expect(JSON.parse(call[1].toString())).toEqual(c)
  })

  it('SC-UP-03 nunca sube data/work/ ni los originales', async () => {
    const { out } = setup([K1])
    const { store, calls } = fakeStore()
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate })
    expect(calls.some((c) => /work|vid00000001|\.m4a|ORIGINAL/.test(c))).toBe(false)
    for (const [, body] of store.put.mock.calls) expect(body.toString()).not.toContain('ORIGINAL-SIN-RECORTAR')
  })

  it('SC-UP-03 no sube ficheros sueltos de outDir que no pertenezcan a canciones activas', async () => {
    const { out } = setup([K1, K2])
    writeFileSync(join(out, 'notas.txt'), 'x')
    const f = fakeStore()
    await runUpload({ catalog: catalog([song('a', K1), song('b', K2, false)]), outDir: out, store: f.store, validate: okValidate })
    expect(f.calls.some((c) => c.includes(K2) || c.includes('notas'))).toBe(false)
  })

  it('SC-UP-04 solo sube lo nuevo: clips ya presentes con el mismo md5 no se vuelven a subir', async () => {
    const { out } = setup([K1])
    const remote: Record<string, string> = {}
    for (let n = 1; n <= 5; n++) remote[`clips/${K1}/${n}.mp3`] = md5(clipBytes(K1, n)) // falta el 6
    const c = catalog([song('a', K1)])
    remote['catalog/catalog.json'] = md5(JSON.stringify(c))
    const { store, calls } = fakeStore(remote)
    await runUpload({ catalog: c, outDir: out, store, validate: okValidate })
    expect(calls).toContain(`put clips/${K1}/6.mp3`)
    expect(calls.filter((x) => x.startsWith('put clips/')).length).toBe(1)
  })

  it('SC-UP-04 un clip con md5 remoto distinto se vuelve a subir (CBR: mismo tamano, otro contenido)', async () => {
    const { out } = setup([K1])
    const remote: Record<string, string> = {}
    for (let n = 1; n <= 6; n++) remote[`clips/${K1}/${n}.mp3`] = md5(clipBytes(K1, n))
    remote[`clips/${K1}/3.mp3`] = md5('contenido-antiguo')
    const { store, calls } = fakeStore(remote)
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate })
    expect(calls.filter((x) => x.startsWith('put clips/'))).toEqual([`put clips/${K1}/3.mp3`])
  })

  it('SC-UP-04 con todo igual en remoto no sube clips', async () => {
    const { out } = setup([K1])
    const remote: Record<string, string> = {}
    for (let n = 1; n <= 6; n++) remote[`clips/${K1}/${n}.mp3`] = md5(clipBytes(K1, n))
    const { store, calls } = fakeStore(remote)
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate })
    expect(calls.some((x) => x.startsWith('put clips/'))).toBe(false)
  })

  it('SC-UP-05 --prune borra clips huerfanos del remoto', async () => {
    const { out } = setup([K1])
    const { store, calls } = fakeStore({ 'clips/ffffffffffffffff/1.mp3': 'x', 'clips/ffffffffffffffff/2.mp3': 'x' })
    const r = await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate, prune: true })
    expect(calls.filter((c) => c.startsWith('delete'))).toEqual(['delete clips/ffffffffffffffff/1.mp3', 'delete clips/ffffffffffffffff/2.mp3'])
    expect(r.deleted.length).toBe(2)
  })

  it('SC-UP-05 sin --prune no borra nada', async () => {
    const { out } = setup([K1])
    const { store } = fakeStore({ 'clips/ffffffffffffffff/1.mp3': 'x' })
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate })
    expect(store.delete).not.toHaveBeenCalled()
  })

  it('SC-UP-05 --prune tambien borra los clips de canciones ahora deshabilitadas, pero nunca catalog.json', async () => {
    const { out } = setup([K1, K2])
    const { store, calls } = fakeStore({ [`clips/${K2}/1.mp3`]: 'x', 'catalog/catalog.json': 'viejo' })
    await runUpload({ catalog: catalog([song('a', K1), song('b', K2, false)]), outDir: out, store, validate: okValidate, prune: true })
    expect(calls).toContain(`delete clips/${K2}/1.mp3`)
    expect(calls).not.toContain('delete catalog/catalog.json')
  })

  it('SC-UP-05 --prune borra tras subir el catalogo nuevo (el catalogo nunca apunta a clips ausentes)', async () => {
    const { out } = setup([K1])
    const { store, calls } = fakeStore({ 'clips/ffffffffffffffff/1.mp3': 'x' })
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate, prune: true })
    expect(calls.indexOf('put catalog/catalog.json')).toBeLessThan(calls.indexOf('delete clips/ffffffffffffffff/1.mp3'))
  })

  it('SC-UP-06 no sube clips de canciones desactivadas (cortas) y el catalog.json subido las mantiene enabled:false', async () => {
    const { out } = setup([K1, K2])
    const short = { ...song('corta', K2, false), source: { youtubeId: 'vid00000002', videoTitle: 'x', durationSec: 7.4 } }
    const c = catalog([song('a', K1), short])
    const f = fakeStore()
    await runUpload({ catalog: c, outDir: out, store: f.store, validate: okValidate })
    expect(f.calls.some((x) => x.includes(K2))).toBe(false)
    const uploaded = JSON.parse(f.store.put.mock.calls.find((x) => x[0] === 'catalog/catalog.json')![1].toString())
    const sent = uploaded.songs.find((x: any) => x.id === 'corta')
    expect([sent.enabled, sent.source.durationSec]).toEqual([false, 7.4])
  })
})
