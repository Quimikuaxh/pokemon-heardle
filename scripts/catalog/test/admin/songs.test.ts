// AD-PAT-*: PATCH /api/songs/:id (AR 6.1). Todo con --data-dir temporal.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startFixture } from '../helpers/admin'
import { readCatalog } from '../helpers/data'

const PATCH = (f: Awaited<ReturnType<typeof startFixture>>, id: string, body: unknown) => f.mutate('PATCH', `/api/songs/${id}`, body)
const songOnDisk = (f: any, id: string) => readCatalog(f.dataDir).songs.find((s: any) => s.id === id)

describe('AD-PAT edicion de canciones', () => {
  it('AD-PAT-01 title cambia el titulo; id y clipKey no cambian; el resto intacto', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await PATCH(f, 'rse-oldale-town', { title: 'Nuevo Titulo' })
    expect(r.status).toBe(200)
    expect([r.json.id, r.json.title, r.json.clipKey]).toEqual(['rse-oldale-town', 'Nuevo Titulo', '2222222222222222'])
    const after = readCatalog(f.dataDir)
    expect(after.songs.map((s: any) => s.id)).toEqual(before.songs.map((s: any) => s.id))
    expect(after.songs.filter((s: any) => s.id !== 'rse-oldale-town')).toEqual(before.songs.filter((s: any) => s.id !== 'rse-oldale-town'))
    expect({ ...after.songs[1], title: before.songs[1].title }).toEqual(before.songs[1])
  })

  it('AD-PAT-01 la respuesta es un AdminSong completo (tooShort, hasSource, errors)', async () => {
    const f = await startFixture()
    const r = await PATCH(f, 'rse-oldale-town', { title: 'X' })
    expect([typeof r.json.tooShort, typeof r.json.hasSource, Array.isArray(r.json.errors)]).toEqual(['boolean', 'boolean', true])
  })

  for (const [label, title] of [
    ['vacio', ''],
    ['solo espacios', '    '],
    ['numero', 5],
    ['null', null],
    ['objeto', {}],
    ['demasiado largo', 'x'.repeat(500)],
  ] as Array<[string, unknown]>) {
    it(`AD-PAT-02 title ${label} -> 400 VALIDATION_ERROR sin cambios`, async () => {
      const f = await startFixture()
      const before = readCatalog(f.dataDir)
      const r = await PATCH(f, 'rse-oldale-town', { title })
      expect([r.status, r.json.error.code]).toEqual([400, 'VALIDATION_ERROR'])
      expect(readCatalog(f.dataDir)).toEqual(before)
    })
  }

  it('AD-PAT-03 recorta espacios extremos', async () => {
    const f = await startFixture()
    await PATCH(f, 'rse-oldale-town', { title: '   Con Espacios   ' })
    expect(songOnDisk(f, 'rse-oldale-town').title).toBe('Con Espacios')
  })

  it('AD-PAT-03 conserva unicode y comillas', async () => {
    const f = await startFixture()
    const title = `N’s "Castle" — Día ★ 日本`
    await PATCH(f, 'rse-oldale-town', { title })
    expect(songOnDisk(f, 'rse-oldale-town').title).toBe(title)
  })

  it('AD-PAT-04 games con varios juegos existentes, en el orden recibido', async () => {
    const f = await startFixture()
    const r = await PATCH(f, 'rse-oldale-town', { games: ['dp', 'rse'] })
    expect([r.status, songOnDisk(f, 'rse-oldale-town').games]).toEqual([200, ['dp', 'rse']])
  })

  it('AD-PAT-05 games con juego inexistente -> 400 sin cambios', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await PATCH(f, 'rse-oldale-town', { games: ['rse', 'no-existe'] })
    expect([r.status, r.json.error.code]).toEqual([400, 'VALIDATION_ERROR'])
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-PAT-06 games con ids repetidos -> 400 sin cambios', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    expect((await PATCH(f, 'rse-oldale-town', { games: ['rse', 'rse'] })).status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-PAT-07 games [] (vaciar): permitido (errors la marca) o rechazado (400); nunca queda un estado que el admin no pueda corregir', async () => {
    const f = await startFixture()
    const r = await PATCH(f, 'rse-oldale-town', { games: [] })
    if (r.status === 200) {
      expect(r.json.errors.length).toBeGreaterThan(0)
      expect((await PATCH(f, 'rse-oldale-town', { games: ['rse'] })).status).toBe(200)
    } else {
      expect(r.status).toBe(400)
      expect(songOnDisk(f, 'rse-oldale-town').games).toEqual(['rse'])
    }
  })

  for (const [label, games] of [
    ['string', 'rse'],
    ['objeto', { 0: 'rse' }],
    ['elementos no string', [1, 2]],
    ['null en el array', [null]],
  ] as Array<[string, unknown]>) {
    it(`AD-PAT-08 games ${label} -> 400`, async () => {
      const f = await startFixture()
      expect((await PATCH(f, 'rse-oldale-town', { games })).status).toBe(400)
    })
  }

  it('AD-PAT-09 enabled true/false en una cancion larga se persiste', async () => {
    const f = await startFixture()
    expect((await PATCH(f, 'rse-oldale-town', { enabled: true })).status).toBe(200)
    expect(songOnDisk(f, 'rse-oldale-town').enabled).toBe(true)
    expect((await PATCH(f, 'rse-oldale-town', { enabled: false })).status).toBe(200)
    expect(songOnDisk(f, 'rse-oldale-town').enabled).toBe(false)
  })

  it('AD-PAT-10 activar una cancion corta -> 409 TOO_SHORT sin cambios en disco', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await PATCH(f, 'rse-badge', { enabled: true })
    expect([r.status, r.json.error.code]).toEqual([409, 'TOO_SHORT'])
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-PAT-11 desactivar una cancion corta o ya desactivada es idempotente (200)', async () => {
    const f = await startFixture()
    expect((await PATCH(f, 'rse-badge', { enabled: false })).status).toBe(200)
    expect((await PATCH(f, 'rse-oldale-town', { enabled: false })).status).toBe(200)
    expect(songOnDisk(f, 'rse-badge').enabled).toBe(false)
  })

  it('AD-PAT-12 todo o nada: {title, enabled:true} sobre una corta -> 409 y NI el titulo cambia', async () => {
    const f = await startFixture()
    const r = await PATCH(f, 'rse-badge', { title: 'Cambiado', enabled: true })
    expect(r.status).toBe(409)
    expect(songOnDisk(f, 'rse-badge').title).toBe('Obtained a Badge')
  })

  it('AD-PAT-13 reviewed true/false se persiste', async () => {
    const f = await startFixture()
    expect((await PATCH(f, 'rse-oldale-town', { reviewed: true })).status).toBe(200)
    expect(songOnDisk(f, 'rse-oldale-town').reviewed).toBe(true)
    await PATCH(f, 'rse-oldale-town', { reviewed: false })
    expect(songOnDisk(f, 'rse-oldale-town').reviewed).toBe(false)
  })

  for (const field of ['enabled', 'reviewed']) {
    for (const [label, value] of [['"true"', 'true'], ['1', 1], ['null', null], ['0', 0], ['objeto', {}]] as Array<[string, unknown]>) {
      it(`AD-PAT-14 ${field} ${label} (no booleano) -> 400`, async () => {
        const f = await startFixture()
        const before = readCatalog(f.dataDir)
        expect((await PATCH(f, 'rse-oldale-town', { [field]: value })).status).toBe(400)
        expect(readCatalog(f.dataDir)).toEqual(before)
      })
    }
  }

  it('AD-PAT-15 startSec en el cuerpo nunca modifica startSec (ignorado o rechazado)', async () => {
    const f = await startFixture()
    const solo = await PATCH(f, 'rse-oldale-town', { startSec: 33 })
    const mixto = await PATCH(f, 'rse-oldale-town', { startSec: 44, title: 'Con startSec' })
    expect([200, 400]).toContain(solo.status)
    expect([200, 400]).toContain(mixto.status)
    expect(songOnDisk(f, 'rse-oldale-town').startSec).toBe(0)
  })

  it('AD-PAT-16 campos no editables (id, clipKey, source, youtubeId, durationSec, tooShort, errors) se ignoran: disco intacto', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await PATCH(f, 'rse-oldale-town', {
      id: 'hackeado',
      clipKey: 'ffffffffffffffff',
      source: { youtubeId: 'ZZZZZZZZZZZ', videoTitle: 'x', durationSec: 1 },
      youtubeId: 'ZZZZZZZZZZZ',
      durationSec: 1,
      tooShort: true,
      errors: ['x'],
    })
    expect([200, 400]).toContain(r.status)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-PAT-16 __proto__ y constructor en el cuerpo no contaminan el prototipo ni el catalogo', async () => {
    const f = await startFixture()
    const r = await f.mutate('PATCH', '/api/songs/rse-oldale-town', '{"title":"Seguro","__proto__":{"polluted":"si"},"constructor":{"prototype":{"polluted2":"si"}}}')
    expect([200, 400]).toContain(r.status)
    expect(({} as any).polluted).toBeUndefined()
    expect(({} as any).polluted2).toBeUndefined()
    expect(readFileSync(join(f.dataDir, 'catalog.json'), 'utf8')).not.toContain('polluted')
  })

  it('AD-PAT-17 cuerpo vacio {} -> 400 o no-op (200) sin cambios', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await PATCH(f, 'rse-oldale-town', {})
    expect([200, 400]).toContain(r.status)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  for (const id of ['no-existe', '..%2F..%2Fetc%2Fpasswd', '%00', '..', '%2e%2e%2f', 'rse-oldale-town%00x', 'constructor', '__proto__']) {
    it(`AD-PAT-18 cancion inexistente o id raro (${id}) -> 404 NOT_FOUND`, async () => {
      const f = await startFixture()
      const before = readCatalog(f.dataDir)
      const r = await PATCH(f, id, { title: 'x' })
      expect([r.status, r.json?.error?.code]).toEqual([404, 'NOT_FOUND'])
      expect(readCatalog(f.dataDir)).toEqual(before)
    })
  }

  it('AD-PAT-19 activar una cancion con games [] : permitido (errors la marca) o rechazado; nunca silencioso', async () => {
    const f = await startFixture()
    const r = await PATCH(f, 'dp-twinleaf-town', { enabled: true })
    if (r.status === 200) expect(r.json.errors.length).toBeGreaterThan(0)
    else expect([400, 409]).toContain(r.status)
  })

  it('AD-PAT-20 la primera escritura crea catalog.json.bak con el original; las siguientes no lo tocan; sin .tmp', async () => {
    const f = await startFixture()
    const original = readFileSync(join(f.dataDir, 'catalog.json'), 'utf8')
    expect(existsSync(join(f.dataDir, 'catalog.json.bak'))).toBe(false)
    await PATCH(f, 'rse-oldale-town', { title: 'Uno' })
    expect(readFileSync(join(f.dataDir, 'catalog.json.bak'), 'utf8')).toBe(original)
    await PATCH(f, 'rse-oldale-town', { title: 'Dos' })
    await PATCH(f, 'rse-oldale-town', { reviewed: true })
    expect(readFileSync(join(f.dataDir, 'catalog.json.bak'), 'utf8')).toBe(original)
    expect(() => JSON.parse(readFileSync(join(f.dataDir, 'catalog.json'), 'utf8'))).not.toThrow()
    expect(existsSync(join(f.dataDir, 'catalog.json.tmp-' + process.pid))).toBe(false)
  })

  it('peticiones concurrentes sobre distintas canciones no pierden ediciones (cola de catalogStore)', async () => {
    const f = await startFixture()
    await Promise.all([
      PATCH(f, 'rse-oldale-town', { title: 'A' }),
      PATCH(f, 'rse-littleroot-town', { reviewed: false }),
      PATCH(f, 'dp-dash', { title: 'B' }),
      PATCH(f, 'rse-badge', { title: 'C' }),
    ])
    const cat = readCatalog(f.dataDir)
    const t = (id: string) => cat.songs.find((s: any) => s.id === id)
    expect([t('rse-oldale-town').title, t('rse-littleroot-town').reviewed, t('dp-dash').title, t('rse-badge').title]).toEqual(['A', false, 'B', 'C'])
  })
})
