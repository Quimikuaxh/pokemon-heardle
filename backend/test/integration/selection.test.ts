// BE-SEL-17..22 (unit int) y BE-CAT-06/12/13 por HTTP: seleccion equiprobable por grupo (DEC-54), un juego por cancion (DEC-53).
import { describe, it, expect, afterEach } from 'vitest'
import { startTestApp, closeAllTestApps, codeOf, DAILY_SEED } from '../helpers/app'
import { SECRET_A } from '../helpers/secrets'
import { encryptToken, decryptToken } from '../../src/game/token'
import { catalogR, dailyVectorV2, groupedCatalog, hintsCatalog } from '../helpers/fixtures'

afterEach(closeAllTestApps)

async function finishWithSkips(app: any, token: string) {
  let last: any
  for (let i = 0; i < 6; i++) {
    last = await app.skip(token)
    token = last.json.token
  }
  return last.json
}

describe('seleccion por grupo por HTTP', () => {
  it('BE-SEL-17 juegos filtrados sin canciones activas se ignoran', async () => {
    const c = groupedCatalog([{ id: 'a', songs: 2 }, { id: 'off', songs: 0, off: 3 }])
    const app = await startTestApp({ catalog: c, randomInt: () => 0 })
    const r = await app.createUnlimited(['a', 'off'])
    expect(r.status).toBe(200)
  })

  it('BE-SEL-17 si ningun juego filtrado tiene canciones activas -> 400 EMPTY_FILTER', async () => {
    const c = groupedCatalog([{ id: 'a', songs: 2 }, { id: 'off', songs: 0, off: 3 }])
    const app = await startTestApp({ catalog: c })
    const r = await app.createUnlimited(['off'])
    expect([r.status, codeOf(r)]).toEqual([400, 'EMPTY_FILTER'])
  })

  it('BE-SEL-18 feedback por juego dentro de un grupo: elegida de B2W2 con buscada de BW -> miss', async () => {
    const c = groupedCatalog([{ id: 'bw', songs: 1 }, { id: 'b2w2', group: 'bw', songs: 1 }])
    const app = await startTestApp({ catalog: c, randomInt: () => 0 })
    const g = await app.createUnlimited(['bw'])
    const r = await app.guess(g.json.token, 'b2w2-s00')
    expect(r.json.results).toEqual(['miss'])
  })

  it('BE-SEL-18 la misma cancion del juego del grupo es game si comparten juego', async () => {
    const c = groupedCatalog([{ id: 'bw', songs: 2 }, { id: 'b2w2', group: 'bw', songs: 1 }])
    const app = await startTestApp({ catalog: c, randomInt: () => 0 })
    const g = await app.createUnlimited(['bw'])
    const r = await app.guess(g.json.token, 'bw-s01')
    expect(r.json.results).toEqual(['game'])
  })

  it('BE-SEL-19 selectionGroup no aparece en el token, la GameView ni /catalog', async () => {
    const c = groupedCatalog([{ id: 'bw', songs: 2 }, { id: 'b2w2', group: 'bw', songs: 2 }])
    const app = await startTestApp({ catalog: c, randomInt: () => 0 })
    const g = await app.createUnlimited(['bw', 'b2w2'])
    const m = await app.guess(g.json.token, 'b2w2-s00')
    const payload = decryptToken(m.json.token, SECRET_A, app.clock.now)
    expect(JSON.stringify(payload)).not.toContain('selectionGroup')
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'k', 'm', 'n', 'q', 'r', 'v'])
    for (const text of [g.text, m.text, (await app.get('/api/catalog')).text]) expect(text).not.toContain('selectionGroup')
  })

  it('BE-SEL-20 dos POST /games daily el mismo dia con grupos: misma solucion y coincide con el vector v2', async () => {
    const c = groupedCatalog([{ id: 'one', songs: 1 }, { id: 'ten', songs: 10 }, { id: 'bw', songs: 4 }, { id: 'b2w2', group: 'bw', songs: 3 }])
    const app = await startTestApp({ catalog: c })
    const a = await finishWithSkips(app, (await app.createDaily()).json.token)
    const b = await finishWithSkips(app, (await app.createDaily()).json.token)
    expect(a.solution.id).toBe(b.solution.id)
    expect(a.solution.id).toBe(dailyVectorV2(c, DAILY_SEED, '2026-07-01').song.id)
  })

  it('BE-SEL-21 cambio de v1 a v2: una partida diaria ya empezada conserva su cancion; una nueva sigue v2', async () => {
    const c = groupedCatalog([{ id: 'one', songs: 1 }, { id: 'ten', songs: 10 }, { id: 'hundred', songs: 20 }])
    const app = await startTestApp({ catalog: c })
    const v2 = dailyVectorV2(c, DAILY_SEED, '2026-07-01').song
    const old = c.songs.find((s) => s.id !== v2.id && s.enabled)! // "token antiguo": cancion distinta de la v2
    const nowS = Math.floor(app.clock.now / 1000)
    const token = encryptToken(
      { v: 1, n: '0123456789abcdef', m: 'd', d: '2026-07-01', k: old.clipKey, r: [], q: [], iat: nowS, exp: nowS + 36000 } as any,
      SECRET_A,
    )
    const resumed = await finishWithSkips(app, token)
    expect(resumed.solution.id).toBe(old.id)
    const fresh = await finishWithSkips(app, (await app.createDaily()).json.token)
    expect(fresh.solution.id).toBe(v2.id)
  })

  it('BE-SEL-22 selectionGroup hacia un juego inexistente (catalogo que se salta el validador): 503 CATALOG_UNAVAILABLE, sin grupo nuevo', async () => {
    const c = groupedCatalog([{ id: 'a', songs: 2 }, { id: 'b', group: 'fantasma', songs: 2 }])
    const app = await startTestApp({ catalog: c, skipCatalogWait: true, schedule: () => {} })
    const r = await app.get('/api/health')
    expect([r.status, codeOf(r)]).toEqual([503, 'CATALOG_UNAVAILABLE'])
  })

  it('BE-SEL-22 una cadena (c -> b -> a) tambien es catalogo no disponible', async () => {
    const c = groupedCatalog([{ id: 'a', songs: 2 }, { id: 'b', group: 'a', songs: 2 }, { id: 'c', group: 'b', songs: 2 }])
    const app = await startTestApp({ catalog: c, skipCatalogWait: true, schedule: () => {} })
    expect(codeOf(await app.get('/api/health'))).toBe('CATALOG_UNAVAILABLE')
  })
})

describe('catalogo: un juego por cancion y orden de juegos', () => {
  it('BE-CAT-06 [MOD] /catalog: cada cancion lleva UN juego; juegos {id,name} (el test documenta que NO se exponen consoles); sin selectionGroup ni hints', async () => {
    const c: any = catalogR()
    c.games[1] = { ...c.games[1], selectionGroup: 'A' }
    const app = await startTestApp({ catalog: c })
    const r = await app.get('/api/catalog')
    for (const s of r.json.songs) expect(s.games.length).toBe(1)
    // DEC-60: cada juego lleva tambien su serie efectiva.
    for (const g of r.json.games) expect(Object.keys(g).sort()).toEqual(['id', 'name', 'series'])
    for (const k of ['selectionGroup', 'consoles', 'hints', 'clipKey', 'youtubeId']) expect(r.text).not.toContain(k)
  })

  it('BE-CAT-12 GET /catalog devuelve games en el orden de catalog.json', async () => {
    const c: any = hintsCatalog()
    c.games = [c.games[4], c.games[0], c.games[8], c.games[2]]
    c.songs = c.songs.filter((s: any) => c.games.some((g: any) => g.id === s.games[0]))
    const app = await startTestApp({ catalog: c })
    expect((await app.get('/api/catalog')).json.games.map((g: any) => g.id)).toEqual(['xy', 'rby', 'noconsole', 'rse'])
  })

  for (const [label, games] of [
    ['0 juegos', []],
    ['2 juegos', ['A', 'B']],
    ['2 iguales', ['A', 'A']],
  ] as Array<[string, string[]]>) {
    it(`BE-CAT-13 cancion con ${label} en el catalogo cargado: /health 503 CATALOG_UNAVAILABLE`, async () => {
      const c: any = catalogR()
      c.songs[0].games = games
      const app = await startTestApp({ catalog: c, skipCatalogWait: true, schedule: () => {} })
      const r = await app.get('/api/health')
      expect([r.status, codeOf(r)]).toEqual([503, 'CATALOG_UNAVAILABLE'])
    })
  }
})
