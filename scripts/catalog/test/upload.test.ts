// Contrato: src/upload.ts exporta
//   runUpload({ catalog, outDir, store, validate, prune? }): Promise<{ uploaded: string[]; deleted: string[] }>
//     store: ObjectStore { list(prefix): Promise<Map<key, { md5: string }>>;
//                          put(key, body: Buffer): Promise<void>; delete(key): Promise<void> }
//     validate: () => Promise<{ ok: boolean; errors: string[] }>   (si falla, runUpload rechaza y no sube nada)
//     claves remotas (DEC-44): clips/<clipKey>.mp3 y catalog/catalog.json (ultimo)
//     "cambiado" = md5 remoto distinto del md5 local
//     outDir = data/out/clips (<outDir>/<clipKey>.mp3)
import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runUpload } from '../src/upload'
import { validateOutput } from '../src/validate'
import { buildMp3 } from '../../../shared/test/helpers/mp3'
import { writeClip } from './helpers/clips'
import { tmp } from './helpers/data'

const K1 = '1111111111111111'
const K2 = '2222222222222222'
const K3 = '3333333333333333'
const md5 = (b: Buffer | string) => createHash('md5').update(b).digest('hex')
const clipBytes = (key: string) => buildMp3(key)
const clipKeyOf = (key: string) => `clips/${key}.mp3`

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
const catalog = (songs: any[]): any => ({ version: 1, generatedAt: 'x', games: [{ id: 'g', name: 'G', consoles: ['GBA'] }], songs })

function setup(keys: string[]) {
  const data = tmp('up-')
  const out = join(data, 'out')
  const work = join(data, 'work')
  mkdirSync(work, { recursive: true })
  writeFileSync(join(work, 'vid00000001.m4a'), 'ORIGINAL-SIN-RECORTAR')
  for (const k of keys) writeClip(out, k)
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
const OLD = (key: string) => [1, 2, 3, 4, 5, 6].map((n) => `clips/${key}/${n}.mp3`)

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

  it('SC-UP-02 sube UN fichero por cancion activa (clips/<clipKey>.mp3) y por ultimo catalog/catalog.json', async () => {
    const { out } = setup([K1, K2])
    const { store, calls } = fakeStore()
    await runUpload({ catalog: catalog([song('a', K1), song('b', K2)]), outDir: out, store, validate: okValidate })
    expect(calls.length).toBe(3)
    expect(calls.at(-1)).toBe('put catalog/catalog.json')
    expect(calls.slice(0, 2).sort()).toEqual([`put ${clipKeyOf(K1)}`, `put ${clipKeyOf(K2)}`])
  })

  it('SC-UP-02 el contenido subido del clip son los bytes del fichero local', async () => {
    const { out } = setup([K1])
    const { store } = fakeStore()
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate })
    const call = store.put.mock.calls.find((x) => x[0] === clipKeyOf(K1))!
    expect(call[1].equals(readFileSync(join(out, `${K1}.mp3`)))).toBe(true)
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
    for (const [, body] of store.put.mock.calls) expect(body.toString('latin1')).not.toContain('ORIGINAL-SIN-RECORTAR')
  })

  it('SC-UP-03 no sube ficheros sueltos de outDir ni los clips de canciones desactivadas', async () => {
    const { out } = setup([K1, K2])
    writeFileSync(join(out, 'notas.txt'), 'x')
    const f = fakeStore()
    await runUpload({ catalog: catalog([song('a', K1), song('b', K2, false)]), outDir: out, store: f.store, validate: okValidate })
    expect(f.calls.some((c) => c.includes(K2) || c.includes('notas'))).toBe(false)
  })

  it('SC-UP-04 sube solo los clips nuevos: los ya presentes con el mismo md5 no se vuelven a subir', async () => {
    const { out } = setup([K1, K2])
    const c = catalog([song('a', K1), song('b', K2)])
    const remote = { [clipKeyOf(K1)]: md5(clipBytes(K1)), 'catalog/catalog.json': md5(JSON.stringify(c)) }
    const { store, calls } = fakeStore(remote)
    await runUpload({ catalog: c, outDir: out, store, validate: okValidate })
    expect(calls.filter((x) => x.startsWith('put clips/'))).toEqual([`put ${clipKeyOf(K2)}`])
  })

  it('SC-UP-04 un clip con md5 remoto distinto se vuelve a subir', async () => {
    const { out } = setup([K1, K2])
    const remote = { [clipKeyOf(K1)]: md5(clipBytes(K1)), [clipKeyOf(K2)]: md5('contenido-antiguo') }
    const { store, calls } = fakeStore(remote)
    await runUpload({ catalog: catalog([song('a', K1), song('b', K2)]), outDir: out, store, validate: okValidate })
    expect(calls.filter((x) => x.startsWith('put clips/'))).toEqual([`put ${clipKeyOf(K2)}`])
  })

  it('SC-UP-04 con todo igual en remoto no sube clips', async () => {
    const { out } = setup([K1])
    const { store, calls } = fakeStore({ [clipKeyOf(K1)]: md5(clipBytes(K1)) })
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate })
    expect(calls.some((x) => x.startsWith('put clips/'))).toBe(false)
  })

  it('SC-UP-04 el primer upload tras migrar (remoto con layout antiguo) sube todos los clips nuevos y el segundo ninguno', async () => {
    const { out } = setup([K1, K2])
    const c = catalog([song('a', K1), song('b', K2)])
    const remote: Record<string, string> = {}
    for (const k of [K1, K2]) for (const key of OLD(k)) remote[key] = 'md5-antiguo'
    const first = fakeStore(remote)
    await runUpload({ catalog: c, outDir: out, store: first.store, validate: okValidate })
    expect(first.calls.filter((x) => x.startsWith('put clips/')).sort()).toEqual([`put ${clipKeyOf(K1)}`, `put ${clipKeyOf(K2)}`])
    const afterFirst = { ...remote, [clipKeyOf(K1)]: md5(clipBytes(K1)), [clipKeyOf(K2)]: md5(clipBytes(K2)), 'catalog/catalog.json': md5(JSON.stringify(c)) }
    const second = fakeStore(afterFirst)
    await runUpload({ catalog: c, outDir: out, store: second.store, validate: okValidate })
    expect(second.calls.filter((x) => x.startsWith('put clips/'))).toEqual([])
  })

  it('SC-UP-05 --prune borra clips huerfanos del remoto (claves nuevas sin cancion activa)', async () => {
    const { out } = setup([K1])
    const { store, calls } = fakeStore({ 'clips/ffffffffffffffff.mp3': 'x', 'clips/eeeeeeeeeeeeeeee.mp3': 'x' })
    const r = await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate, prune: true })
    expect(calls.filter((c) => c.startsWith('delete')).sort()).toEqual(['delete clips/eeeeeeeeeeeeeeee.mp3', 'delete clips/ffffffffffffffff.mp3'])
    expect(r.deleted.length).toBe(2)
  })

  it('SC-UP-05 --prune borra todo bajo clips/ que no sea clips/<clipKey>.mp3 de una activa: carpetas antiguas incluidas', async () => {
    const { out } = setup([K1])
    const remote: Record<string, string> = { [clipKeyOf(K1)]: md5(clipBytes(K1)) }
    for (const key of OLD(K1)) remote[key] = 'x'
    for (const key of OLD(K2)) remote[key] = 'x'
    const { store, calls } = fakeStore(remote)
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate, prune: true })
    expect(calls.filter((c) => c.startsWith('delete')).sort()).toEqual([...OLD(K1), ...OLD(K2)].map((k) => `delete ${k}`).sort())
    expect(calls).not.toContain(`delete ${clipKeyOf(K1)}`)
  })

  it('SC-UP-05 sin --prune no borra nada (ni layouts antiguos ni huerfanos)', async () => {
    const { out } = setup([K1])
    const { store } = fakeStore({ 'clips/ffffffffffffffff.mp3': 'x', [OLD(K1)[0]]: 'x' })
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate })
    expect(store.delete).not.toHaveBeenCalled()
  })

  it('SC-UP-05 --prune borra el clip de una cancion ahora deshabilitada pero nunca catalog/catalog.json', async () => {
    const { out } = setup([K1, K2])
    const { store, calls } = fakeStore({ [clipKeyOf(K2)]: 'x', 'catalog/catalog.json': 'viejo' })
    await runUpload({ catalog: catalog([song('a', K1), song('b', K2, false)]), outDir: out, store, validate: okValidate, prune: true })
    expect(calls).toContain(`delete ${clipKeyOf(K2)}`)
    expect(calls).not.toContain('delete catalog/catalog.json')
  })

  it('SC-UP-05 --prune borra tras subir el catalogo nuevo (el catalogo nunca apunta a clips ausentes)', async () => {
    const { out } = setup([K1])
    const { store, calls } = fakeStore({ 'clips/ffffffffffffffff.mp3': 'x' })
    await runUpload({ catalog: catalog([song('a', K1)]), outDir: out, store, validate: okValidate, prune: true })
    expect(calls.indexOf('put catalog/catalog.json')).toBeLessThan(calls.indexOf('delete clips/ffffffffffffffff.mp3'))
  })

  it('SC-UP-06 no sube clips de canciones desactivadas (cortas) y el catalog.json subido las mantiene enabled:false', async () => {
    const { out } = setup([K1, K2])
    const short = { ...song('corta', K2, false), source: { youtubeId: 'vid00000002', videoTitle: 'x', durationSec: 7.4 } }
    const f = fakeStore()
    await runUpload({ catalog: catalog([song('a', K1), short]), outDir: out, store: f.store, validate: okValidate })
    expect(f.calls.some((x) => x.includes(K2))).toBe(false)
    const uploaded = JSON.parse(f.store.put.mock.calls.find((x) => x[0] === 'catalog/catalog.json')![1].toString())
    const sent = uploaded.songs.find((x: any) => x.id === 'corta')
    expect([sent.enabled, sent.source.durationSec]).toEqual([false, 7.4])
  })

  it('SC-UP-06 falta el clip local de una cancion activa -> error claro y no se sube el catalogo', async () => {
    const { out } = setup([K1])
    const f = fakeStore()
    await expect(runUpload({ catalog: catalog([song('a', K1), song('b', K2)]), outDir: out, store: f.store, validate: okValidate })).rejects.toThrow()
    expect(f.calls).not.toContain('put catalog/catalog.json')
  })
})

describe('runUpload: migracion DEC-44 y validacion real', () => {
  it('SC-CLP-11 upload sin prune sube los nuevos y deja los antiguos', async () => {
    const { out } = setup([K1, K2])
    const remote: Record<string, string> = {}
    for (const k of [K1, K2]) for (const key of OLD(k)) remote[key] = 'x'
    const f = fakeStore(remote)
    const r = await runUpload({ catalog: catalog([song('a', K1), song('b', K2)]), outDir: out, store: f.store, validate: okValidate })
    expect(f.calls.filter((x) => x.startsWith('put clips/')).length).toBe(2)
    expect(f.calls.filter((x) => x.startsWith('delete'))).toEqual([])
    expect(r.deleted).toEqual([])
  })

  it('SC-CLP-11 upload --prune despues borra los antiguos y conserva los nuevos', async () => {
    const { out } = setup([K1, K2])
    const remote: Record<string, string> = { [clipKeyOf(K1)]: md5(clipBytes(K1)), [clipKeyOf(K2)]: md5(clipBytes(K2)), 'catalog/catalog.json': 'x' }
    for (const k of [K1, K2]) for (const key of OLD(k)) remote[key] = 'x'
    const f = fakeStore(remote)
    const r = await runUpload({ catalog: catalog([song('a', K1), song('b', K2)]), outDir: out, store: f.store, validate: okValidate, prune: true })
    expect(r.deleted.sort()).toEqual([...OLD(K1), ...OLD(K2)].sort())
  })

  it('SC-CLP-11 estado tras cada paso: tras el primero conviven ambos layouts; tras el segundo solo el nuevo', async () => {
    const { out } = setup([K1])
    const c = catalog([song('a', K1)])
    const remote = new Map<string, string>(OLD(K1).map((k) => [k, 'x']))
    const live = {
      list: vi.fn(async () => new Map([...remote].map(([k, m]) => [k, { md5: m }]))),
      put: vi.fn(async (k: string, b: Buffer) => void remote.set(k, md5(b))),
      delete: vi.fn(async (k: string) => void remote.delete(k)),
    }
    await runUpload({ catalog: c, outDir: out, store: live, validate: okValidate })
    expect([...remote.keys()].sort()).toEqual([...OLD(K1), clipKeyOf(K1), 'catalog/catalog.json'].sort())
    await runUpload({ catalog: c, outDir: out, store: live, validate: okValidate, prune: true })
    expect([...remote.keys()].sort()).toEqual([clipKeyOf(K1), 'catalog/catalog.json'].sort())
  })

  it('SC-CLP-12 con la validacion real, un clip corrupto entre 5 impide TODO el upload (0 subidas)', async () => {
    const keys = ['aaaaaaaaaaaaaaa1', 'aaaaaaaaaaaaaaa2', 'aaaaaaaaaaaaaaa3', 'aaaaaaaaaaaaaaa4', 'aaaaaaaaaaaaaaa5']
    const { out } = setup(keys)
    writeClip(out, keys[2], { breakHeaderAtFrame: 154 }) // el 3.o corrupto
    const c = catalog(keys.map((k, i) => song(`s${i}`, k)))
    const f = fakeStore()
    const probe = async () => ({ durationSec: 16, tags: {} })
    await expect(
      runUpload({ catalog: c, outDir: out, store: f.store, validate: () => validateOutput({ catalog: c, outDir: out, probe }) }),
    ).rejects.toThrow()
    expect(f.store.put).not.toHaveBeenCalled()
    expect(f.store.delete).not.toHaveBeenCalled()
  })

  it('SC-CLP-12 con los 5 validos si se suben (sanidad del escenario)', async () => {
    const keys = ['aaaaaaaaaaaaaaa1', 'aaaaaaaaaaaaaaa2', 'aaaaaaaaaaaaaaa3', 'aaaaaaaaaaaaaaa4', 'aaaaaaaaaaaaaaa5']
    const { out } = setup(keys)
    const c = catalog(keys.map((k, i) => song(`s${i}`, k)))
    const f = fakeStore()
    const probe = async () => ({ durationSec: 16, tags: {} })
    await runUpload({ catalog: c, outDir: out, store: f.store, validate: () => validateOutput({ catalog: c, outDir: out, probe }) })
    expect(f.store.put).toHaveBeenCalledTimes(6)
  })
})
