// AD-GAM-*: POST /api/games y PATCH /api/games/:id (DEC-39).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startFixture } from '../helpers/admin'
import { readCatalog } from '../helpers/data'
import { draftCatalog } from '../../src/draft'
import { slugify, uniqueId } from '../../src/ids'
import { indexCatalog } from '../../../../backend/src/catalog'

type F = Awaited<ReturnType<typeof startFixture>>
const create = (f: F, name: unknown) => f.mutate('POST', '/api/games', { name })
const rename = (f: F, id: string, body: unknown) => f.mutate('PATCH', `/api/games/${id}`, body)
const OK = [200, 201]

describe('AD-GAM juegos', () => {
  it('AD-GAM-01 crear juego: { name } -> { id, name } con id slug; aparece en /api/catalog con songCount 0', async () => {
    const f = await startFixture()
    const r = await create(f, 'Pokemon X / Y')
    expect(OK).toContain(r.status)
    expect(r.json).toEqual({ id: 'pokemon-x-y', name: 'Pokemon X / Y' })
    const g = (await f.req('GET', '/api/catalog')).json.games.find((x: any) => x.id === 'pokemon-x-y')
    expect([g.name, g.songCount]).toEqual(['Pokemon X / Y', 0])
    expect(readCatalog(f.dataDir).games.at(-1)).toEqual({ id: 'pokemon-x-y', name: 'Pokemon X / Y' })
  })

  it('AD-GAM-01 recorta espacios del nombre', async () => {
    const f = await startFixture()
    expect((await create(f, '  Pokemon Black / White  ')).json.name).toBe('Pokemon Black / White')
  })

  it('AD-GAM-02 / SC-ID-04 el id coincide con el que generaria draft para el mismo nombre', async () => {
    const f = await startFixture()
    const name = 'Pokemon Sword/Shield'
    const fromDraft = draftCatalog(null, [{ youtubeId: 'vid00000001', title: `${name} - Route 1` }], {}).games[0]
    const r = await create(f, name)
    expect(r.json.id).toBe(fromDraft.id)
    expect(r.json.id).toBe(uniqueId(slugify(name).slice(0, 40), new Set()))
  })

  it('AD-GAM-02 la colision de ids se resuelve igual que en draft (sufijo) para nombres distintos con el mismo slug', async () => {
    const f = await startFixture()
    const a = await create(f, 'Pokemon Z-A')
    const b = await create(f, 'Pokemon Z/A')
    if (OK.includes(b.status)) expect(b.json.id).not.toBe(a.json.id)
    else expect(b.status).toBe(400)
  })

  for (const [label, name] of [
    ['vacio', ''],
    ['solo espacios', '    '],
    ['numero', 5],
    ['null', null],
    ['objeto', {}],
    ['muy largo', 'x'.repeat(500)],
  ] as Array<[string, unknown]>) {
    it(`AD-GAM-04 nombre ${label} -> 400 VALIDATION_ERROR sin cambios`, async () => {
      const f = await startFixture()
      const before = readCatalog(f.dataDir)
      const r = await create(f, name)
      expect([r.status, r.json.error.code]).toEqual([400, 'VALIDATION_ERROR'])
      expect(readCatalog(f.dataDir)).toEqual(before)
    })
  }

  for (const dup of ['Pokemon Diamond / Pearl', 'pokemon diamond / pearl', '  POKEMON DIAMOND / PEARL  ', 'Pokemon  Diamond  /  Pearl']) {
    it(`AD-GAM-05 nombre duplicado (${JSON.stringify(dup)}) -> 400 sin cambios`, async () => {
      const f = await startFixture()
      const before = readCatalog(f.dataDir)
      expect((await create(f, dup)).status).toBe(400)
      expect(readCatalog(f.dataDir)).toEqual(before)
    })
  }

  it('AD-GAM-03 nombres con el mismo slug ("Ruby" / "RUBY!"): el segundo recibe sufijo o se rechaza', async () => {
    const f = await startFixture()
    const a = await create(f, 'Ruby')
    const b = await create(f, 'RUBY!')
    expect(OK).toContain(a.status)
    if (OK.includes(b.status)) expect([b.json.id, a.json.id].every((id) => /^[A-Za-z0-9-]+$/.test(id)) && b.json.id !== a.json.id).toBe(true)
    else expect(b.status).toBe(400)
  })

  for (const name of ['???', '!!!', '★★★']) {
    it(`AD-GAM-06 nombre sin slug (${name}): id de fallback valido o 400, nunca id vacio`, async () => {
      const f = await startFixture()
      const r = await create(f, name)
      if (OK.includes(r.status)) expect(r.json.id).toMatch(/^[A-Za-z0-9-]+$/)
      else expect(r.status).toBe(400)
    })
  }

  it('AD-GAM-07 renombrar cambia SOLO name: el id y las canciones que lo referencian no cambian', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await rename(f, 'rse', { name: 'Pokemon Ruby / Sapphire / Emerald (RSE)' })
    expect(r.status).toBe(200)
    expect(r.json).toEqual({ id: 'rse', name: 'Pokemon Ruby / Sapphire / Emerald (RSE)' })
    const after = readCatalog(f.dataDir)
    expect(after.songs).toEqual(before.songs)
    expect(after.games.find((g: any) => g.id === 'rse').name).toBe('Pokemon Ruby / Sapphire / Emerald (RSE)')
    expect(after.games.map((g: any) => g.id)).toEqual(before.games.map((g: any) => g.id))
  })

  it('AD-GAM-08 renombrar a nombre vacio -> 400 sin cambios', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    expect((await rename(f, 'rse', { name: '   ' })).status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-GAM-08 renombrar al nombre de OTRO juego -> 400 sin cambios', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    expect((await rename(f, 'rse', { name: 'pokemon diamond / pearl' })).status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-GAM-09 renombrar al mismo nombre que ya tiene -> 200 idempotente', async () => {
    const f = await startFixture()
    expect((await rename(f, 'rse', { name: 'Pokemon Ruby / Sapphire / Emerald' })).status).toBe(200)
  })

  it('AD-GAM-10 renombrar un juego inexistente -> 404', async () => {
    const f = await startFixture()
    const r = await rename(f, 'no-existe', { name: 'X' })
    expect([r.status, r.json.error.code]).toEqual([404, 'NOT_FOUND'])
  })

  it('AD-GAM-11 un id en el cuerpo de PATCH /api/games/:id se ignora: el id es inmutable', async () => {
    const f = await startFixture()
    const r = await rename(f, 'rse', { id: 'hackeado', name: 'Nombre Nuevo' })
    expect([200, 400]).toContain(r.status)
    const ids = readCatalog(f.dataDir).games.map((g: any) => g.id)
    expect(ids).toEqual(['rse', 'dp', 'unused'])
  })

  for (const [method, path] of [['DELETE', '/api/games/rse'], ['PUT', '/api/games/rse'], ['POST', '/api/games/rse/merge'], ['POST', '/api/games/rse/delete']]) {
    it(`AD-GAM-12 no existe ${method} ${path} (borrar/fusionar) -> 404/405 sin efecto`, async () => {
      const f = await startFixture()
      const before = readCatalog(f.dataDir)
      const r = await f.mutate(method, path, {})
      expect([404, 405]).toContain(r.status)
      expect(readCatalog(f.dataDir)).toEqual(before)
    })
  }

  it('AD-GAM-13 un juego sin canciones activas deja de aparecer en el /catalog del backend (DEC-32)', async () => {
    const f = await startFixture()
    expect((await f.mutate('PATCH', '/api/songs/dp-dash', { enabled: false })).status).toBe(200)
    const cat = readCatalog(f.dataDir)
    const publicGames = indexCatalog(cat).publicCatalog().games.map((g: any) => g.id)
    expect(publicGames).not.toContain('dp')
    expect(publicGames).toContain('rse')
  })

  it('AD-GAM-13 un juego creado en el admin sin canciones tampoco aparece en el /catalog del backend', async () => {
    const f = await startFixture()
    await create(f, 'Pokemon Nuevo')
    expect(indexCatalog(readCatalog(f.dataDir)).publicCatalog().games.map((g: any) => g.id)).not.toContain('pokemon-nuevo')
  })

  for (const [method, path, body] of [['POST', '/api/games', { name: 'Hack' }], ['PATCH', '/api/games/rse', { name: 'Hack' }]] as Array<[string, string, unknown]>) {
    it(`AD-GAM-14 ${method} ${path} sin token -> 403 sin cambios`, async () => {
      const f = await startFixture()
      const before = readFileSync(join(f.dataDir, 'catalog.json'), 'utf8')
      const r = await f.req(method, path, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      expect(r.status).toBe(403)
      expect(readFileSync(join(f.dataDir, 'catalog.json'), 'utf8')).toBe(before)
    })
  }
})
