// Integracion: createApp + listen(0) + fetch con FsClipStore (catalogo y clips sinteticos de test).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { startTestApp, closeAllTestApps, codeOf, DAILY_SEED, type TestApp } from '../helpers/app'
import { catalogR, dailyTarget, enabledSorted, T } from '../helpers/fixtures'

afterEach(closeAllTestApps)

const A1 = 'a-one-song-01'
const A2 = 'a-two-song-02'
const AB = 'ab-multi-game-song-017'
const B1 = 'b-one-song-03'
const C1 = 'c-only-song-05'
const D1 = 'd-only-song-06'

/** Ilimitado con filtro {C}: pool de 1 -> objetivo = c-only-song-05. */
async function unlimitedC(opts: Parameters<typeof startTestApp>[0] = {}) {
  const app = await startTestApp({ randomInt: () => 0, ...opts })
  const r = await app.createUnlimited(['C'])
  return { app, r, view: r.json }
}

describe('API /api/catalog y /api/health', () => {
  it('GET /health -> 200 { ok:true, catalog:true }', async () => {
    const app = await startTestApp()
    const r = await app.get('/api/health')
    expect([r.status, r.json]).toEqual([200, { ok: true, catalog: true }])
  })

  it('BE-CAT-06 GET /catalog devuelve solo canciones enabled con id,title,games', async () => {
    const app = await startTestApp()
    const r = await app.get('/api/catalog')
    expect(r.json.songs.map((s: any) => s.id).sort()).toEqual(enabledSorted(catalogR()).map((s) => s.id).sort())
    expect(Object.keys(r.json.songs[0]).sort()).toEqual(['games', 'id', 'title'])
  })

  it('BE-CAT-06 GET /catalog no contiene claves internas ni datos de youtube', async () => {
    const app = await startTestApp()
    const r = await app.get('/api/catalog')
    for (const k of ['clipKey', 'startSec', 'source', 'enabled', 'reviewed', 'youtubeId', 'videoTitle', 'durationSec', 'Phantom Biscuit'])
      expect(r.text).not.toContain(k)
  })

  it('BE-CAT-06 el JSON serializado de /catalog no contiene el youtubeId, videoTitle ni durationSec de ninguna cancion', async () => {
    const app = await startTestApp()
    const r = await app.get('/api/catalog')
    for (const s of catalogR().songs) {
      expect(r.text).not.toContain(s.source.youtubeId)
      expect(r.text).not.toContain(s.source.videoTitle)
      expect(r.text).not.toContain(String(s.source.durationSec))
    }
  })

  it('BE-CAT-10 /catalog lista solo los juegos con alguna cancion habilitada (DEC-32)', async () => {
    const c: any = catalogR()
    c.games.push({ id: 'E', name: 'Pokemon Game Echo' })
    c.songs.push({ ...c.songs[0], id: 'e-short-song-09', title: 'Brief Jingle', clipKey: 'eeeeeeeeeeeeeeee', games: ['E'], enabled: false, source: { youtubeId: 'ytEEEEEEEEE', videoTitle: 'x', durationSec: 7.4 } })
    const app = await startTestApp({ catalog: c })
    const r = await app.get('/api/catalog')
    const ids = r.json.games.map((g: any) => g.id)
    expect([ids.includes('E'), ids.includes('A'), ids.includes('D')]).toEqual([false, true, true])
  })

  it('BE-CAT-10 el juego reaparece al habilitar una de sus canciones', async () => {
    const c: any = catalogR()
    c.games.push({ id: 'E', name: 'Pokemon Game Echo' })
    c.songs.push({ ...c.songs[0], id: 'e-back-song-09', title: 'Back Again', clipKey: 'eeeeeeeeeeeeeeee', games: ['E'], enabled: true, source: { youtubeId: 'ytEEEEEEEEE', videoTitle: 'x', durationSec: 90.5 } })
    const app = await startTestApp({ catalog: c })
    expect((await app.get('/api/catalog')).json.games.map((g: any) => g.id)).toContain('E')
  })
})

describe('Partida ilimitada: ganar, perder, skip, recuperar', () => {
  it('crear partida ilimitada devuelve GameView playing con clipUrl opaca', async () => {
    const { r } = await unlimitedC()
    expect([r.status < 300, r.json.status, r.json.mode, r.json.attempt, r.json.clipUrl.startsWith('/api/clips/')]).toEqual([
      true,
      'playing',
      'unlimited',
      0,
      true,
    ])
  })

  it('RQ3 ganar: acierto en el intento 1 -> won, solution revelada, sin clipUrl', async () => {
    const { app, view } = await unlimitedC()
    const r = await app.guess(view.token, C1)
    expect([r.json.status, r.json.attempt, r.json.results, r.json.solution.id, r.json.clipUrl]).toEqual([
      'won',
      1,
      ['hit'],
      C1,
      undefined,
    ])
  })

  it('BE-LEAK-02 solution al ganar: id, title, games con nombre y youtubeId', async () => {
    const { app, view } = await unlimitedC()
    const r = await app.guess(view.token, C1)
    expect(r.json.solution).toEqual({
      id: C1,
      title: 'Tangerine Glacier',
      games: [{ id: 'C', name: 'Pokemon Game Charlie' }],
      youtubeId: 'yt666666666',
    })
  })

  it('BE-LEAK-03 perder: 6 skips -> lost con solution y sin clipUrl', async () => {
    const { app, view } = await unlimitedC()
    let token = view.token
    let last: any
    for (let i = 0; i < 6; i++) {
      last = await app.skip(token)
      token = last.json.token
    }
    expect([last.json.status, last.json.attempt, last.json.solution.id, last.json.clipUrl]).toEqual(['lost', 6, C1, undefined])
  })

  it('perder con fallos distintos: 6 guesses erroneos -> lost', async () => {
    const { app, view } = await unlimitedC()
    let token = view.token
    let last: any
    for (const s of [A1, A2, B1, AB, D1, 'b-two-song-04']) {
      last = await app.guess(token, s)
      token = last.json.token
    }
    expect([last.json.status, last.json.results]).toEqual(['lost', ['miss', 'miss', 'miss', 'miss', 'miss', 'miss']])
  })

  it('BE-ENG-08 skip: attempt+1 y results skip', async () => {
    const { app, view } = await unlimitedC()
    const r = await app.skip(view.token)
    expect([r.json.attempt, r.json.results, r.json.status]).toEqual([1, ['skip'], 'playing'])
  })

  it('BE-ENG-17 cada accion devuelve un token distinto; el anterior sigue siendo descifrable y refleja el estado antiguo', async () => {
    const { app, view } = await unlimitedC()
    const r = await app.skip(view.token)
    expect(r.json.token).not.toBe(view.token)
    const old = await app.state(view.token)
    expect(old.json.attempt).toBe(0)
  })

  it('recuperacion: /games/state con el ultimo token devuelve el mismo estado y un clipUrl nuevo', async () => {
    const { app, view } = await unlimitedC()
    const s1 = await app.skip(view.token)
    const s2 = await app.guess(s1.json.token, A1)
    const rec = await app.state(s2.json.token)
    expect([rec.json.attempt, rec.json.results, rec.json.guesses, rec.json.status]).toEqual([2, ['skip', 'miss'], [A1], 'playing'])
    expect(rec.json.clipUrl).not.toBe(s2.json.clipUrl)
  })

  it('recuperacion de partida terminada: state muestra solution y sin clipUrl', async () => {
    const { app, view } = await unlimitedC()
    const won = await app.guess(view.token, C1)
    const rec = await app.state(won.json.token)
    expect([rec.json.status, rec.json.solution.id, rec.json.clipUrl]).toEqual(['won', C1, undefined])
  })

  it('BE-ENG-02 fallo con juego distinto -> miss', async () => {
    const { app, view } = await unlimitedC()
    expect((await app.guess(view.token, A1)).json.results).toEqual(['miss'])
  })

  it('BE-ENG-03 fallo con juego correcto -> game (filtro {A}, objetivo = primera de A por id)', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const g = await app.createUnlimited(['A'])
    expect((await app.guess(g.json.token, A2)).json.results).toEqual(['game'])
  })

  // BE-ENG-04 (cancion con varios juegos) esta RETIRADO: DEC-53, una cancion pertenece a un solo juego.

  it('BE-ENG-06 con filtro {A} se acepta una cancion de B (fuera del pool) y se evalua miss', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const g = await app.createUnlimited(['A'])
    expect((await app.guess(g.json.token, B1)).json.results).toEqual(['miss'])
  })

  it('BE-ENG-13 skip y guess tras partida ganada -> 409 GAME_OVER', async () => {
    const { app, view } = await unlimitedC()
    const won = await app.guess(view.token, C1)
    const a = await app.skip(won.json.token)
    const b = await app.guess(won.json.token, A1)
    expect([a.status, codeOf(a), b.status, codeOf(b)]).toEqual([409, 'GAME_OVER', 409, 'GAME_OVER'])
  })

  it('BE-ENG-13 guess tras partida perdida -> GAME_OVER', async () => {
    const { app, view } = await unlimitedC()
    let token = view.token
    for (let i = 0; i < 6; i++) token = (await app.skip(token)).json.token
    expect(codeOf(await app.guess(token, A1))).toBe('GAME_OVER')
  })

  it('BE-ENG-15 songId inexistente -> 400 UNKNOWN_SONG', async () => {
    const { app, view } = await unlimitedC()
    const r = await app.guess(view.token, 'no-existe')
    expect([r.status, codeOf(r)]).toEqual([400, 'UNKNOWN_SONG'])
  })

  it('BE-ENG-15 songId de cancion deshabilitada -> UNKNOWN_SONG', async () => {
    const { app, view } = await unlimitedC()
    expect(codeOf(await app.guess(view.token, 'a-disabled-song-07'))).toBe('UNKNOWN_SONG')
  })

  it('BE-ENG-21 prioridad HTTP: token invalido + songId inexistente -> 401 TOKEN_INVALID', async () => {
    const { app } = await unlimitedC()
    const r = await app.guess('basura', 'no-existe')
    expect([r.status, codeOf(r)]).toEqual([401, 'TOKEN_INVALID'])
  })
})

describe('Intento repetido (DEC-18)', () => {
  it('BE-ENG-16 repetir una fallida -> 409 ALREADY_GUESSED', async () => {
    const { app, view } = await unlimitedC()
    const g = await app.guess(view.token, A1)
    const r = await app.guess(g.json.token, A1)
    expect([r.status, codeOf(r)]).toEqual([409, 'ALREADY_GUESSED'])
  })

  it('BE-ENG-18 ALREADY_GUESSED no emite token nuevo', async () => {
    const { app, view } = await unlimitedC()
    const g = await app.guess(view.token, A1)
    const r = await app.guess(g.json.token, A1)
    expect(r.json.token).toBeUndefined()
    expect(JSON.stringify(r.json)).not.toContain(g.json.token)
  })

  it('BE-ENG-18 ALREADY_GUESSED no consume intento: state con el mismo token da el mismo attempt', async () => {
    const { app, view } = await unlimitedC()
    const g = await app.guess(view.token, A1)
    await app.guess(g.json.token, A1)
    const after = await app.state(g.json.token)
    expect([after.json.attempt, after.json.results]).toEqual([1, ['miss']])
  })

  it('BE-ENG-19 repetir una cancion que dio juego acertado -> ALREADY_GUESSED', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const g = await app.createUnlimited(['A'])
    const first = await app.guess(g.json.token, A2) // 'game'
    expect(codeOf(await app.guess(first.json.token, A2))).toBe('ALREADY_GUESSED')
  })

  it('BE-ENG-20 skip no marca canciones: tras skip se puede elegir cualquiera', async () => {
    const { app, view } = await unlimitedC()
    const s = await app.skip(view.token)
    expect((await app.guess(s.json.token, A1)).status).toBe(200)
  })

  it('BE-ENG-22 5 distintos fallidos, 6.o repetido: se rechaza y la partida sigue en attempt=5', async () => {
    const { app, view } = await unlimitedC()
    let token = view.token
    for (const s of [A1, A2, B1, AB, D1]) token = (await app.guess(token, s)).json.token
    const dup = await app.guess(token, A1)
    const st = await app.state(token)
    expect([codeOf(dup), st.json.status, st.json.attempt]).toEqual(['ALREADY_GUESSED', 'playing', 5])
  })

  it('BE-ENG-23 guesses en orden de jugada, sin skips, y se recuperan igual con state', async () => {
    const { app, view } = await unlimitedC()
    let token = view.token
    for (const s of [A1, 'skip', B1, A2]) {
      const r = s === 'skip' ? await app.skip(token) : await app.guess(token, s)
      token = r.json.token
    }
    const rec = await app.state(token)
    expect(rec.json.guesses).toEqual([A1, B1, A2])
  })

  it('BE-ENG-24 guesses de una ganada incluyen el acierto', async () => {
    const { app, view } = await unlimitedC()
    const g = await app.guess(view.token, A1)
    const w = await app.guess(g.json.token, C1)
    expect(w.json.guesses).toEqual([A1, C1])
  })

  it('BE-ENG-24 guesses de una perdida son solo intentos propios', async () => {
    const { app, view } = await unlimitedC()
    let token = (await app.guess(view.token, A1)).json.token
    let last: any
    for (let i = 0; i < 5; i++) {
      last = await app.skip(token)
      token = last.json.token
    }
    expect([last.json.status, last.json.guesses]).toEqual(['lost', [A1]])
  })

  it('BE-LEAK-11 el cuerpo de ALREADY_GUESSED es identico con dos objetivos distintas', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const bodies: string[] = []
    for (const filter of [['C'], ['D']]) {
      const g = await app.createUnlimited(filter)
      const first = await app.guess(g.json.token, A1)
      bodies.push((await app.guess(first.json.token, A1)).text)
    }
    expect(bodies[0]).toBe(bodies[1])
  })
})

describe('Modo diario', () => {
  const DATE1 = '2026-07-01'
  const DATE2 = '2026-07-02'

  it('crear diario devuelve mode=daily y date de Madrid (servidor)', async () => {
    const app = await startTestApp({ nowMs: Date.parse('2026-07-01T22:30:00Z') })
    const r = await app.createDaily()
    expect([r.json.mode, r.json.date]).toEqual(['daily', DATE2])
  })

  it('BE-DAY-02 diario con games -> 400 VALIDATION_ERROR', async () => {
    const app = await startTestApp()
    const r = await app.post('/api/games', { mode: 'daily', games: ['A'] })
    expect([r.status, codeOf(r)]).toEqual([400, 'VALIDATION_ERROR'])
  })

  it('BE-DAY-02 diario con games vacio -> 400 VALIDATION_ERROR', async () => {
    const app = await startTestApp()
    const r = await app.post('/api/games', { mode: 'daily', games: [] })
    expect([r.status, codeOf(r)]).toEqual([400, 'VALIDATION_ERROR'])
  })

  it('BE-DAY-16 un campo date en POST /games no permite elegir el dia', async () => {
    const app = await startTestApp()
    const r = await app.post('/api/games', { mode: 'daily', date: '2030-01-01' })
    expect(r.status === 400 || r.json.date === DATE1).toBe(true)
  })

  it('BE-DAY-19 dos partidas diarias el mismo dia revelan la misma cancion (la del vector)', async () => {
    const app = await startTestApp()
    const sols: string[] = []
    for (let i = 0; i < 2; i++) {
      let token = (await app.createDaily()).json.token
      let last: any
      for (let k = 0; k < 6; k++) {
        last = await app.skip(token)
        token = last.json.token
      }
      sols.push(last.json.solution.id)
    }
    expect(sols).toEqual([dailyTarget(catalogR(), DAILY_SEED, DATE1).id, dailyTarget(catalogR(), DAILY_SEED, DATE1).id])
  })

  it('BE-DAY-19 misma fecha en ambas partidas', async () => {
    const app = await startTestApp()
    const a = await app.createDaily()
    const b = await app.createDaily()
    expect([a.json.date, b.json.date]).toEqual([DATE1, DATE1])
  })

  it('BE-DAY-20 el token de D sigue valido tras medianoche y mantiene su cancion; la nueva partida usa D+1', async () => {
    const app = await startTestApp({ nowMs: T.JUL_01_NOON })
    const g = await app.createDaily()
    app.clock.now = T.JUL_02_0300Z // 05:00 en Madrid del 07-02, antes de exp (04:00Z)
    const rec = await app.state(g.json.token)
    expect([rec.status, rec.json.date, rec.json.status]).toEqual([200, DATE1, 'playing'])
    let token = rec.json.token
    let last: any
    for (let k = 0; k < 6; k++) {
      last = await app.skip(token)
      token = last.json.token
    }
    expect(last.json.solution.id).toBe(dailyTarget(catalogR(), DAILY_SEED, DATE1).id)
    const next = await app.createDaily()
    expect(next.json.date).toBe(DATE2)
  })

  it('BE-TOK-15 el token diario caduca pasado el fin del dia + 6 h', async () => {
    const app = await startTestApp({ nowMs: T.JUL_01_NOON })
    const g = await app.createDaily()
    app.clock.now = Date.parse('2026-07-02T04:00:01Z')
    const r = await app.state(g.json.token)
    expect([r.status, codeOf(r)]).toEqual([401, 'TOKEN_INVALID'])
  })

  it('BE-TOK-05 el token ilimitado caduca a las 24 h', async () => {
    const { app, view } = await unlimitedC()
    app.clock.now += 24 * 3600 * 1000 + 1000
    expect(codeOf(await app.state(view.token))).toBe('TOKEN_INVALID')
  })

  it('catalogo de 1 cancion: el diario siempre es esa (BE-DAY-07)', async () => {
    const { catalogM } = await import('../helpers/fixtures')
    const app = await startTestApp({ catalog: catalogM() as any })
    let token = (await app.createDaily()).json.token
    let last: any
    for (let k = 0; k < 6; k++) {
      last = await app.skip(token)
      token = last.json.token
    }
    expect(last.json.solution.id).toBe('mono-song-only1')
  })
})

describe('Filtro ilimitado (errores)', () => {
  it('BE-CAT-03 games [] -> 400 EMPTY_FILTER', async () => {
    const app = await startTestApp()
    const r = await app.createUnlimited([])
    expect([r.status, codeOf(r)]).toEqual([400, 'EMPTY_FILTER'])
  })

  it('BE-CAT-04 juego con todas las canciones deshabilitadas -> EMPTY_FILTER', async () => {
    const c: any = catalogR()
    c.games.push({ id: 'E', name: 'Pokemon Game Echo' })
    c.songs.push({ ...c.songs[0], id: 'e-off-song-08', clipKey: '9999999999999999', games: ['E'], enabled: false })
    const app = await startTestApp({ catalog: c })
    expect(codeOf(await app.createUnlimited(['E']))).toBe('EMPTY_FILTER')
  })

  it('BE-CAT-05 juego inexistente -> 400 UNKNOWN_GAME', async () => {
    const app = await startTestApp()
    const r = await app.createUnlimited(['ZZ'])
    expect([r.status, codeOf(r)]).toEqual([400, 'UNKNOWN_GAME'])
  })

  it('BE-CAT-05 mezcla valido + invalido -> UNKNOWN_GAME', async () => {
    const app = await startTestApp()
    expect(codeOf(await app.createUnlimited(['A', 'ZZ']))).toBe('UNKNOWN_GAME')
  })

  it('CA-5 pool con una sola cancion funciona y siempre es la misma', async () => {
    const app = await startTestApp()
    const sols = new Set<string>()
    for (let i = 0; i < 3; i++) {
      const g = await app.createUnlimited(['C'])
      sols.add((await app.guess(g.json.token, C1)).json.solution.id)
    }
    expect([...sols]).toEqual([C1])
  })

  it('BE-DAY-18 el ilimitado elige pool[randomInt(len)] con el pool ordenado por id', async () => {
    const seen: number[] = []
    const app = await startTestApp({ randomInt: (max) => (seen.push(max), max - 1) })
    const g = await app.createUnlimited(['A']) // pool: a-one, a-two, ab-multi -> el ultimo
    const w = await app.guess(g.json.token, AB)
    expect([seen.at(-1), w.json.status]).toEqual([3, 'won'])
  })
})

describe('BE-ENG-26 solucion tras terminar (idempotente)', () => {
  it('state sobre una partida ganada devuelve la misma solution con youtubeId', async () => {
    const { app, view } = await unlimitedC()
    const won = await app.guess(view.token, C1)
    const s1 = await app.state(won.json.token)
    const s2 = await app.state(won.json.token)
    expect(s1.json.solution).toEqual(won.json.solution)
    expect(s2.json.solution).toEqual(won.json.solution)
    expect(s1.json.solution.youtubeId).toBe('yt666666666')
  })

  it('state sobre una partida perdida devuelve la solution con youtubeId', async () => {
    const { app, view } = await unlimitedC()
    let token = view.token
    for (let i = 0; i < 6; i++) token = (await app.skip(token)).json.token
    const r = await app.state(token)
    expect([r.json.status, r.json.solution.youtubeId]).toEqual(['lost', 'yt666666666'])
  })

  it('guess y skip tras terminar -> 409 GAME_OVER sin solution ni youtubeId', async () => {
    const { app, view } = await unlimitedC()
    const won = await app.guess(view.token, C1)
    for (const r of [await app.skip(won.json.token), await app.guess(won.json.token, A1)]) {
      expect([r.status, codeOf(r)]).toEqual([409, 'GAME_OVER'])
      expect(r.text).not.toContain('solution')
      expect(r.text).not.toContain('yt666666666')
    }
  })
})

describe('Catalogo cambiante y no disponible', () => {
  it('BE-CAT-07 cancion objetivo retirada del catalogo con partida en curso -> 401 TOKEN_INVALID', async () => {
    const { view } = await unlimitedC()
    const reduced: any = catalogR()
    reduced.songs = reduced.songs.filter((s: any) => s.id !== C1)
    const app2 = await startTestApp({ catalog: reduced })
    const r = await app2.state(view.token)
    expect([r.status, codeOf(r)]).toEqual([401, 'TOKEN_INVALID'])
  })

  it('BE-TOK-18 cancion ya intentada (q) retirada del catalogo -> TOKEN_INVALID', async () => {
    const { app, view } = await unlimitedC()
    const g = await app.guess(view.token, A1)
    const reduced: any = catalogR()
    reduced.songs = reduced.songs.filter((s: any) => s.id !== A1)
    const app2 = await startTestApp({ catalog: reduced })
    expect(codeOf(await app2.state(g.json.token))).toBe('TOKEN_INVALID')
  })

  it('BE-CAT-08 catalogo no cargado: /health 503, escucha igualmente y recupera con reintento y backoff', async () => {
    let failing = true
    const scheduled: Array<{ fn: () => void; delay: number }> = []
    const app = await startTestApp({
      skipCatalogWait: true,
      schedule: (fn, delay) => void scheduled.push({ fn, delay }),
      wrapStore: (inner) => ({
        getCatalog: async () => {
          if (failing) throw new Error('bucket caido')
          return inner.getCatalog()
        },
        getClip: (k: string) => inner.getClip(k),
      }),
    })
    const down = await app.get('/api/health')
    expect([down.status, codeOf(down)]).toEqual([503, 'CATALOG_UNAVAILABLE'])
    await vi.waitFor(() => expect(scheduled.length).toBe(1))
    scheduled[0].fn() // segundo intento: sigue fallando
    await vi.waitFor(() => expect(scheduled.length).toBe(2))
    expect(scheduled[1].delay).toBeGreaterThanOrEqual(scheduled[0].delay)
    failing = false
    scheduled[1].fn()
    await app.ready()
    expect((await app.get('/api/health')).status).toBe(200)
  })

  it('BE-CAT-09 /games con catalogo no cargado -> 503 CATALOG_UNAVAILABLE', async () => {
    const app = await startTestApp({
      skipCatalogWait: true,
      schedule: () => {},
      wrapStore: (inner) => ({
        getCatalog: async () => {
          throw new Error('bucket caido')
        },
        getClip: (k: string) => inner.getClip(k),
      }),
    })
    const r = await app.createDaily()
    expect([r.status, codeOf(r)]).toEqual([503, 'CATALOG_UNAVAILABLE'])
  })

  it('BE-CAT-11 cancion enabled y corta en catalog.json -> el validador compartido lo rechaza: /health 503 CATALOG_UNAVAILABLE', async () => {
    const c: any = catalogR()
    c.songs[0].source.durationSec = 7.4
    const app = await startTestApp({ catalog: c, skipCatalogWait: true, schedule: () => {} })
    const r = await app.get('/api/health')
    expect([r.status, codeOf(r)]).toEqual([503, 'CATALOG_UNAVAILABLE'])
  })

  it('BE-CAT-11 youtubeId mal formado en catalog.json -> /health 503 CATALOG_UNAVAILABLE', async () => {
    const c: any = catalogR()
    c.songs[2].source.youtubeId = '"><script>x'
    const app = await startTestApp({ catalog: c, skipCatalogWait: true, schedule: () => {} })
    expect(codeOf(await app.get('/api/health'))).toBe('CATALOG_UNAVAILABLE')
  })

  it('BE-CAT-11 la misma cancion corta pero desactivada si arranca (no es un error)', async () => {
    const c: any = catalogR()
    c.songs[0].source.durationSec = 7.4
    c.songs[0].enabled = false
    const app = await startTestApp({ catalog: c })
    expect((await app.get('/api/health')).status).toBe(200)
  })
})
