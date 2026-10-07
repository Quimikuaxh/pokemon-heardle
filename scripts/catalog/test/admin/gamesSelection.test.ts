// AD-SEL-*: PATCH /api/games/:id { selectionGroup } (DEC-54). Reglas: el valor es el id de un juego "cabeza" (cuyo propio grupo es
// el mismo), sin cadenas ni ciclos; quitarlo ({selectionGroup:null} o el propio id) devuelve al juego a su propio grupo.
import { describe, it, expect } from 'vitest'
import { adminCatalog, startFixture } from '../helpers/admin'
import { readCatalog } from '../helpers/data'

type F = Awaited<ReturnType<typeof startFixture>>
const patch = (f: F, id: string, body: unknown) => f.mutate('PATCH', `/api/games/${id}`, body)
const gameOnDisk = (f: F, id: string) => readCatalog(f.dataDir).games.find((g: any) => g.id === id)
const effective = async (f: F) => Object.fromEntries((await f.req('GET', '/api/catalog')).json.games.map((g: any) => [g.id, g.selectionGroup]))

describe('AD-SEL grupo de seleccion', () => {
  it('AD-SEL-01 PATCH { selectionGroup } valido persiste (200 y disco actualizado)', async () => {
    const f = await startFixture()
    const r = await patch(f, 'dp', { selectionGroup: 'rse' })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ id: 'dp', selectionGroup: 'rse' })
    expect(gameOnDisk(f, 'dp').selectionGroup).toBe('rse')
  })

  it('AD-SEL-01 no cambia id, name ni consoles', async () => {
    const f = await startFixture()
    const before = gameOnDisk(f, 'dp')
    await patch(f, 'dp', { selectionGroup: 'rse' })
    expect(gameOnDisk(f, 'dp')).toMatchObject({ id: before.id, name: before.name, consoles: before.consoles })
  })

  it('AD-SEL-02 grupo inexistente -> 400 sin cambios', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await patch(f, 'dp', { selectionGroup: 'fantasma' })
    expect([r.status, r.json.error.code]).toEqual([400, 'VALIDATION_ERROR'])
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  for (const [label, value] of [['numero', 5], ['array', ['rse']], ['objeto', { id: 'rse' }], ['cadena vacia', ''], ['id mal formado', 'rse 2']] as Array<[string, unknown]>) {
    it(`AD-SEL-02 selectionGroup de tipo/formato invalido (${label}) -> 400 sin cambios`, async () => {
      const f = await startFixture()
      const before = readCatalog(f.dataDir)
      expect((await patch(f, 'dp', { selectionGroup: value })).status).toBe(400)
      expect(readCatalog(f.dataDir)).toEqual(before)
    })
  }

  it('AD-SEL-03 destino que no es cabeza (ya es miembro de otro grupo) -> 400 sin cambios', async () => {
    const f = await startFixture()
    await patch(f, 'dp', { selectionGroup: 'rse' })
    const before = readCatalog(f.dataDir)
    const r = await patch(f, 'unused', { selectionGroup: 'dp' }) // dp ya es miembro de rse: seria una cadena
    expect(r.status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-SEL-03 destino que crearia un ciclo (rse -> dp con dp -> rse) -> 400 sin cambios', async () => {
    const f = await startFixture()
    await patch(f, 'dp', { selectionGroup: 'rse' })
    const before = readCatalog(f.dataDir)
    expect((await patch(f, 'rse', { selectionGroup: 'dp' })).status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-SEL-04 un juego cabeza de otros no puede pasar a miembro de otro grupo', async () => {
    const f = await startFixture()
    await patch(f, 'dp', { selectionGroup: 'rse' }) // rse es cabeza de dp
    const before = readCatalog(f.dataDir)
    const r = await patch(f, 'rse', { selectionGroup: 'unused' })
    expect(r.status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-SEL-05 quitar el grupo con null devuelve al juego a su propio grupo (estado valido)', async () => {
    const f = await startFixture()
    await patch(f, 'dp', { selectionGroup: 'rse' })
    const r = await patch(f, 'dp', { selectionGroup: null })
    expect(r.status).toBe(200)
    expect((await effective(f)).dp).toBe('dp')
    const stored = gameOnDisk(f, 'dp').selectionGroup
    expect(stored === undefined || stored === 'dp').toBe(true) // se documenta como queda el JSON: sin la clave o con el propio id
  })

  it('AD-SEL-05 quitar el grupo con el propio id tambien devuelve al juego a su propio grupo', async () => {
    const f = await startFixture()
    await patch(f, 'dp', { selectionGroup: 'rse' })
    expect((await patch(f, 'dp', { selectionGroup: 'dp' })).status).toBe(200)
    expect((await effective(f)).dp).toBe('dp')
  })

  it('AD-SEL-05 tras quitar el grupo, el que era cabeza puede volver a unirse a otro (ya no tiene miembros)', async () => {
    const f = await startFixture()
    await patch(f, 'dp', { selectionGroup: 'rse' })
    await patch(f, 'dp', { selectionGroup: null })
    expect((await patch(f, 'rse', { selectionGroup: 'dp' })).status).toBe(200)
  })

  it('AD-SEL-06 { name, selectionGroup invalido } es atomico: 400 y el nombre no cambia', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const r = await patch(f, 'dp', { name: 'Nombre que no debe guardarse', selectionGroup: 'fantasma' })
    expect(r.status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-SEL-06 { consoles invalidas, selectionGroup valido } tambien es atomico', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    expect((await patch(f, 'dp', { consoles: ['PS5'], selectionGroup: 'rse' })).status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
  })

  it('AD-SEL-07 GET /api/catalog devuelve el grupo EFECTIVO de cada juego (el propio id si no tiene selectionGroup)', async () => {
    const f = await startFixture()
    expect(await effective(f)).toEqual({ rse: 'rse', dp: 'dp', unused: 'unused' })
    await patch(f, 'dp', { selectionGroup: 'rse' })
    expect(await effective(f)).toEqual({ rse: 'rse', dp: 'rse', unused: 'unused' })
  })

  it('AD-SEL-08 sin token -> 403 y un id en el cuerpo se ignora', async () => {
    const f = await startFixture()
    const before = readCatalog(f.dataDir)
    const noToken = await f.req('PATCH', '/api/games/dp', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectionGroup: 'rse' }) })
    expect(noToken.status).toBe(403)
    expect(readCatalog(f.dataDir)).toEqual(before)
    await patch(f, 'dp', { id: 'otro', selectionGroup: 'rse' })
    expect(readCatalog(f.dataDir).games.map((g: any) => g.id)).toEqual(['rse', 'dp', 'unused'])
  })

  it('AD-SEL-09 selectionGroup no afecta a songCount ni a la lista de juegos', async () => {
    const f = await startFixture()
    const summary = async () => (await f.req('GET', '/api/catalog')).json.games.map((g: any) => [g.id, g.name, g.songCount])
    const before = await summary()
    await patch(f, 'dp', { selectionGroup: 'rse' })
    expect(await summary()).toEqual(before)
  })

  it('AD-SEL-01 el orden de games no cambia al asignar un grupo (DEC-48)', async () => {
    const f = await startFixture()
    await patch(f, 'dp', { selectionGroup: 'rse' })
    expect(readCatalog(f.dataDir).games.map((g: any) => g.id)).toEqual(['rse', 'dp', 'unused'])
    expect(adminCatalog().games.length).toBe(3)
  })
})
