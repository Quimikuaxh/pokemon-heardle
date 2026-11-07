// AD-SER-*: PATCH /api/games/:id { series } (DEC-60). `main` se guarda quitando el campo; un grupo de seleccion no
// puede mezclar series.
import { describe, it, expect } from 'vitest'
import { startFixture } from '../helpers/admin'
import { readCatalog } from '../helpers/data'

type F = Awaited<ReturnType<typeof startFixture>>
const patch = (f: F, id: string, body: unknown) => f.mutate('PATCH', `/api/games/${id}`, body)
const gameOnDisk = (f: F, id: string) => readCatalog(f.dataDir).games.find((g: any) => g.id === id)
const listed = async (f: F, id: string) => (await f.req('GET', '/api/catalog')).json.games.find((g: any) => g.id === id)

describe('AD-SER serie del juego', () => {
  it('AD-SER-01 GET /api/catalog lista la serie efectiva (main por defecto)', async () => {
    const f = await startFixture()
    expect((await listed(f, 'dp')).series).toBe('main')
  })

  it('AD-SER-02 PATCH { series: spinoff } persiste y la devuelve; volver a main quita el campo', async () => {
    const f = await startFixture()
    const r = await patch(f, 'dp', { series: 'spinoff' })
    expect([r.status, r.json.series]).toEqual([200, 'spinoff'])
    expect(gameOnDisk(f, 'dp').series).toBe('spinoff')
    expect((await listed(f, 'dp')).series).toBe('spinoff')
    await patch(f, 'dp', { series: 'main' })
    expect('series' in gameOnDisk(f, 'dp')).toBe(false)
  })

  for (const [label, value] of [['texto desconocido', 'side'], ['numero', 1], ['null', null]] as Array<[string, unknown]>) {
    it(`AD-SER-03 serie no valida (${label}) -> 400 sin cambios`, async () => {
      const f = await startFixture()
      const before = readCatalog(f.dataDir)
      expect((await patch(f, 'dp', { series: value })).status).toBe(400)
      expect(readCatalog(f.dataDir)).toEqual(before)
    })
  }

  it('AD-SER-04 no se puede cambiar la serie de un juego que esta en un grupo, ni agrupar juegos de series distintas', async () => {
    const f = await startFixture()
    await patch(f, 'dp', { selectionGroup: 'rse' })
    const before = readCatalog(f.dataDir)
    expect((await patch(f, 'dp', { series: 'spinoff' })).status).toBe(400)
    expect((await patch(f, 'rse', { series: 'spinoff' })).status).toBe(400)
    expect(readCatalog(f.dataDir)).toEqual(before)
    await patch(f, 'dp', { selectionGroup: null })
    await patch(f, 'dp', { series: 'spinoff' })
    const r = await patch(f, 'dp', { selectionGroup: 'rse' })
    expect(r.status).toBe(400)
    expect(r.json.error.message).toMatch(/otra serie/)
  })
})
