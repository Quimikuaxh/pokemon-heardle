// AD-CAT-*: GET /api/catalog del admin (AR 6.1).
import { describe, it, expect } from 'vitest'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { adminCatalog, adminSources, bytesOf, startFixture } from '../helpers/admin'
import { catalogOf, song } from '../helpers/data'


const byId = (r: any, id: string) => r.json.songs.find((s: any) => s.id === id)

describe('AD-CAT catalogo del admin', () => {
  it('AD-CAT-01 forma: games[{id,name,consoles,series,selectionGroup,missingConsoles,songCount}] y songs[AdminSong] con durationSec, tooShort, hasSource, errors', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/api/catalog')
    expect(r.status).toBe(200)
    expect(r.json.games.length).toBe(3)
    expect(r.json.songs.length).toBe(5)
    for (const g of r.json.games) expect(Object.keys(g).sort()).toEqual(['consoles', 'id', 'missingConsoles', 'name', 'selectionGroup', 'series', 'songCount'])
    const s = byId(r, 'rse-littleroot-town')
    expect([typeof s.tooShort, typeof s.hasSource, Array.isArray(s.errors), s.durationSec]).toEqual(['boolean', 'boolean', true, 183.42])
    expect([s.id, s.title, s.games, s.enabled, s.reviewed, s.clipKey, s.startSec]).toEqual(['rse-littleroot-town', 'Littleroot Town', ['rse'], true, true, '1111111111111111', 0])
    expect(s.source.youtubeId).toBe('LLLLLLLLLL1')
  })

  const cases: Array<[string, number | undefined, number, boolean]> = [
    ['7,4 s -> corta', 7.4, 0, true],
    ['16,1 s -> no corta (limite exacto)', 16 + 0.1, 0, false],
    ['16,0999 s -> corta', 16 + 0.1 - 0.0001, 0, true],
    ['sin durationSec -> no corta', undefined, 0, false],
    ['20 s con startSec 0 -> no corta', 20, 0, false],
    ['20 s con startSec 5 manual -> corta', 20, 5, true],
  ]
  for (const [label, dur, start, expected] of cases) {
    it(`AD-CAT-02 tooShort derivado: ${label}`, async () => {
      const f = await startFixture({ catalog: catalogOf([song({ id: 'x', clipKey: '1111111111111111', youtubeId: 'LLLLLLLLLL1', enabled: false, durationSec: dur, startSec: start })]) })
      const r = await f.req('GET', '/api/catalog')
      expect(byId(r, 'x').tooShort).toBe(expected)
    })
  }

  it('AD-CAT-02 tooShort no se persiste: ningun catalog.json contiene el campo, tampoco tras una edicion', async () => {
    const f = await startFixture()
    await f.mutate('PATCH', '/api/songs/rse-oldale-town', { title: 'Editado' })
    expect(readFileSync(join(f.dataDir, 'catalog.json'), 'utf8')).not.toContain('tooShort')
  })

  it('AD-CAT-03 hasSource: true con work/<youtubeId>.*, false sin fuente', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/api/catalog')
    expect([byId(r, 'rse-littleroot-town').hasSource, byId(r, 'dp-twinleaf-town').hasSource]).toEqual([true, false])
  })

  it('AD-CAT-03 ignora .part y .ytdl', async () => {
    const f = await startFixture({ sources: {} })
    writeFileSync(join(f.dataDir, 'work', 'LLLLLLLLLL1.webm.part'), 'x')
    writeFileSync(join(f.dataDir, 'work', 'LLLLLLLLLL1.webm.ytdl'), 'x')
    writeFileSync(join(f.dataDir, 'work', 'LLLLLLLLLL1.info.json'), '{}')
    expect(byId(await f.req('GET', '/api/catalog'), 'rse-littleroot-town').hasSource).toBe(false)
  })

  it('AD-CAT-03 youtubeId con "-" inicial se resuelve', async () => {
    const f = await startFixture()
    expect(byId(await f.req('GET', '/api/catalog'), 'dp-dash').hasSource).toBe(true)
  })

  it('AD-CAT-04 errors: games [] -> mensaje de validateCatalog en ESA cancion; las validas -> []', async () => {
    const f = await startFixture()
    const r = await f.req('GET', '/api/catalog')
    expect(byId(r, 'dp-twinleaf-town').errors.length).toBeGreaterThan(0)
    expect(byId(r, 'dp-twinleaf-town').errors.join(' ')).toMatch(/games/i)
    for (const id of ['rse-littleroot-town', 'rse-oldale-town', 'rse-badge', 'dp-dash']) expect(byId(r, id).errors).toEqual([])
  })

  it('AD-CAT-04 una cancion corta ACTIVA (editada a mano) lleva su error de corta', async () => {
    const f = await startFixture({ catalog: catalogOf([song({ id: 'tema-corto', clipKey: '1111111111111111', youtubeId: 'LLLLLLLLLL1', enabled: true, durationSec: 7.4 })]) })
    const s = byId(await f.req('GET', '/api/catalog'), 'tema-corto')
    expect(s.errors.join(' ')).toMatch(/7[.,]4|cort/i)
  })

  it('AD-CAT-05 catalogo invalido (games [], youtubeId malo) no hace fallar el endpoint', async () => {
    const f = await startFixture({ catalog: catalogOf([song({ id: 'a', clipKey: '1111111111111111', youtubeId: 'malo', games: [] })]) })
    const r = await f.req('GET', '/api/catalog')
    expect(r.status).toBe(200)
    expect(byId(r, 'a').errors.length).toBeGreaterThanOrEqual(2)
  })

  it('AD-CAT-06 songCount cuenta todas las canciones que listan el juego (activas o no); juego sin canciones -> 0', async () => {
    const f = await startFixture()
    const counts = Object.fromEntries((await f.req('GET', '/api/catalog')).json.games.map((g: any) => [g.id, g.songCount]))
    expect(counts).toEqual({ rse: 3, dp: 1, unused: 0 })
  })

  it('AD-CAT-07 no cachea: una edicion externa del fichero se refleja en la siguiente peticion', async () => {
    const f = await startFixture()
    expect(byId(await f.req('GET', '/api/catalog'), 'rse-oldale-town').title).toBe('Oldale Town')
    const cat = JSON.parse(readFileSync(join(f.dataDir, 'catalog.json'), 'utf8'))
    cat.songs[1].title = 'Editado fuera'
    writeFileSync(join(f.dataDir, 'catalog.json'), JSON.stringify(cat, null, 2) + '\n')
    expect(byId(await f.req('GET', '/api/catalog'), 'rse-oldale-town').title).toBe('Editado fuera')
  })

  it('AD-CAT-08 catalog.json corrupto: 500 controlado con error.code y mensaje; el fichero no se sobrescribe', async () => {
    const f = await startFixture()
    writeFileSync(join(f.dataDir, 'catalog.json'), '{corrupto')
    const r = await f.req('GET', '/api/catalog')
    expect(r.status).toBe(500)
    expect([typeof r.json.error.code, typeof r.json.error.message]).toEqual(['string', 'string'])
    expect(readFileSync(join(f.dataDir, 'catalog.json'), 'utf8')).toBe('{corrupto')
  })

  it('AD-CAT-08 catalog.json inexistente: error controlado', async () => {
    const f = await startFixture({ catalog: null })
    const r = await f.req('GET', '/api/catalog')
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(r.json.error.code).toBeTruthy()
  })

  it('las respuestas del admin no se cachean en el navegador (Cache-Control: no-store)', async () => {
    const f = await startFixture()
    expect((await f.req('GET', '/api/catalog')).headers['cache-control'] ?? '').toContain('no-store')
  })

  it('el catalogo de fixture sigue siendo el esperado (sanidad)', () => {
    expect(adminCatalog().songs.length).toBe(5)
    expect(Object.keys(adminSources()).length).toBe(4)
    expect(bytesOf('a', 10).length).toBe(10)
  })
})

describe('admin: catalogo invalido sin source', () => {
  it('AD-CAT-09 una cancion sin source no provoca 500 al listar ni al editar', async () => {
    const cat = adminCatalog()
    delete cat.songs[1].source
    const f = await startFixture({ catalog: cat, sources: adminSources() })
    expect((await f.req('GET', '/api/catalog')).status).toBe(200)
    const r = await f.mutate('PATCH', '/api/songs/rse-oldale-town', { enabled: true })
    expect(r.status).toBeLessThan(500)
  })

  it('AD-CAT-09 errors de la cancion incluyen "exactamente un juego" con 0 o 2 juegos (catalogo tolerante)', async () => {
    const f = await startFixture({
      catalog: catalogOf(
        [
          song({ id: 'sin-juego', clipKey: '1111111111111111', youtubeId: 'LLLLLLLLLL1', games: [] }),
          song({ id: 'dos-juegos', clipKey: '2222222222222222', youtubeId: 'LLLLLLLLLL2', games: ['rse', 'dp'] }),
          song({ id: 'un-juego', clipKey: '3333333333333333', youtubeId: 'SSSSSSSSSS1', games: ['rse'] }),
        ],
        [
          { id: 'rse', name: 'RSE', consoles: ['GBA'] },
          { id: 'dp', name: 'DP', consoles: ['DS'] },
        ],
      ),
    })
    const r = await f.req('GET', '/api/catalog')
    expect(r.status).toBe(200)
    expect(byId(r, 'sin-juego').errors.join(' ')).toMatch(/exactamente un juego/i)
    expect(byId(r, 'dos-juegos').errors.join(' ')).toMatch(/exactamente un juego/i)
    expect(byId(r, 'un-juego').errors).toEqual([])
  })
})
