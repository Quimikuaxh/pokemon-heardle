// AD-CON-*: PATCH /api/games/:id { consoles } (DEC-51). Contrato: respuesta { id, name, consoles, selectionGroup };
// GET /api/catalog: games[{ id, name, consoles: ConsoleName[] ([] si no hay), selectionGroup (grupo EFECTIVO), missingConsoles, songCount }].
import { describe, it, expect } from 'vitest'
import { adminCatalog, startFixture } from '../helpers/admin'
import { readCatalog } from '../helpers/data'

type F = Awaited<ReturnType<typeof startFixture>>
const patch = (f: F, id: string, body: unknown) => f.mutate('PATCH', `/api/games/${id}`, body)
const gameOnDisk = (f: F, id: string) => readCatalog(f.dataDir).games.find((g: any) => g.id === id)

describe('AD-CON consolas de los juegos', () => {
  it('AD-CON-01 PATCH { consoles: ["3DS"] } persiste sin cambiar id ni name', async () => {
    const f = await startFixture()
    const before = gameOnDisk(f, 'unused')
    const r = await patch(f, 'unused', { consoles: ['3DS'] })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ id: 'unused', name: before.name, consoles: ['3DS'] })
    expect(gameOnDisk(f, 'unused')).toMatchObject({ id: 'unused', name: before.name, consoles: ['3DS'] })
  })

  it('AD-CON-02 una entrada desordenada se guarda en orden canonico (disco y respuesta)', async () => {
    const f = await startFixture()
    const r = await patch(f, 'rse', { consoles: ['Switch 2', 'Switch', 'GB'] })
    expect(r.json.consoles).toEqual(['GB', 'Switch', 'Switch 2'])
    expect(gameOnDisk(f, 'rse').consoles).toEqual(['GB', 'Switch', 'Switch 2'])
  })

  for (const [label, consoles] of [
    ['[]', []],
    ['nombre desconocido', ['PS5']],
    ['minusculas', ['switch']],
    ['no array (string)', 'GBA'],
    ['null', null],
    ['elemento numerico', [1]],
    ['objeto', { 0: 'GBA' }],
  ] as Array<[string, unknown]>) {
    it(`AD-CON-03 consoles ${label} -> 400 VALIDATION_ERROR sin cambios`, async () => {
      const f = await startFixture()
      const before = readCatalog(f.dataDir)
      const r = await patch(f, 'rse', { consoles })
      expect([r.status, r.json.error.code]).toEqual([400, 'VALIDATION_ERROR'])
      expect(readCatalog(f.dataDir)).toEqual(before)
    })
  }

  it('AD-CON-03 repetidos: 400 sin cambios o se normalizan (se documenta: nunca queda un duplicado en disco)', async () => {
    const f = await startFixture()
    const r = await patch(f, 'rse', { consoles: ['GBA', 'GBA'] })
    if (r.status === 200) expect(gameOnDisk(f, 'rse').consoles).toEqual(['GBA'])
    else {
      expect(r.status).toBe(400)
      expect(gameOnDisk(f, 'rse').consoles).toEqual(['GBA'])
    }
  })

  it('AD-CON-04 PATCH { name } conserva las consolas y PATCH { consoles } conserva el nombre', async () => {
    const f = await startFixture()
    await patch(f, 'dp', { name: 'Pokemon Diamond / Pearl / Platinum' })
    expect(gameOnDisk(f, 'dp')).toMatchObject({ name: 'Pokemon Diamond / Pearl / Platinum', consoles: ['DS'] })
    await patch(f, 'dp', { consoles: ['DS', '3DS'] })
    expect(gameOnDisk(f, 'dp')).toMatchObject({ name: 'Pokemon Diamond / Pearl / Platinum', consoles: ['DS', '3DS'] })
  })

  it('AD-CON-04 PATCH {} -> 400 o no-op sin perdida de consolas', async () => {
    const f = await startFixture()
    const r = await patch(f, 'dp', {})
    expect([200, 400]).toContain(r.status)
    expect(gameOnDisk(f, 'dp').consoles).toEqual(['DS'])
  })

  it('AD-CON-05 name y consoles a la vez: ambos se aplican', async () => {
    const f = await startFixture()
    const r = await patch(f, 'unused', { name: 'Pokemon Nuevo', consoles: ['GBC'] })
    expect(r.status).toBe(200)
    expect(gameOnDisk(f, 'unused')).toMatchObject({ name: 'Pokemon Nuevo', consoles: ['GBC'] })
  })

  it('AD-CON-05 atomico: name valido con consoles invalidas -> 400 y el nombre NO cambia', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await patch(f, 'rse', { name: 'Nombre que no debe guardarse', consoles: ['PS5'] })
    expect(r.status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-CON-05 atomico: consoles validas con name invalido (vacio) -> 400 y las consolas NO cambian', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    expect((await patch(f, 'rse', { name: '   ', consoles: ['DS'] })).status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-CON-06 juego inexistente -> 404', async () => {
    const f = await startFixture()
    const r = await patch(f, 'no-existe', { consoles: ['GBA'] })
    expect([r.status, r.json.error.code]).toEqual([404, 'NOT_FOUND'])
  })

  it('AD-CON-06 un id en el cuerpo se ignora', async () => {
    const f = await startFixture()
    await patch(f, 'rse', { id: 'hackeado', consoles: ['GB'] })
    expect(readCatalog(f.dataDir).games.map((g: any) => g.id)).toEqual(['rse', 'dp', 'unused'])
  })

  it('AD-CON-07 sin token -> 403 sin cambios', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await f.req('PATCH', '/api/games/rse', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consoles: ['GB'] }) })
    expect(r.status).toBe(403)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-CON-07 con Host ajeno -> 403 sin cambios', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await f.req('PATCH', '/api/games/rse', {
      host: 'evil.com',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': f.token },
      body: JSON.stringify({ consoles: ['GB'] }),
    })
    expect(r.status).toBe(403)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-CON-08 GET /api/catalog devuelve consoles de cada juego', async () => {
    const f = await startFixture()
    const games = Object.fromEntries((await f.req('GET', '/api/catalog')).json.games.map((g: any) => [g.id, g.consoles]))
    expect(games).toEqual({ rse: ['GBA'], dp: ['DS'], unused: [] })
  })

  it('AD-CON-08 un juego sin consoles CON canciones activas aparece marcado (missingConsoles); sin canciones activas no', async () => {
    const cat = adminCatalog()
    delete cat.games[1].consoles // dp tiene una cancion activa (dp-dash)
    const f = await startFixture({ catalog: cat })
    const games = Object.fromEntries((await f.req('GET', '/api/catalog')).json.games.map((g: any) => [g.id, g.missingConsoles]))
    expect(games).toEqual({ rse: false, dp: true, unused: false })
  })

  for (const consoles of [['Switch', 'Switch 2'], ['Switch 2']]) {
    it(`AD-CON-09 ${JSON.stringify(consoles)} se acepta y persiste`, async () => {
      const f = await startFixture()
      const r = await patch(f, 'unused', { consoles })
      expect([r.status, gameOnDisk(f, 'unused').consoles]).toEqual([200, consoles])
    })
  }

  it('AD-CON-08 tras editar las consolas el catalogo las refleja y missingConsoles se apaga', async () => {
    const cat = adminCatalog()
    delete cat.games[1].consoles
    const f = await startFixture({ catalog: cat })
    await patch(f, 'dp', { consoles: ['DS'] })
    const dp = (await f.req('GET', '/api/catalog')).json.games.find((g: any) => g.id === 'dp')
    expect([dp.consoles, dp.missingConsoles]).toEqual([['DS'], false])
  })
})
