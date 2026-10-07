// BE-HNT-19..24 y BE-LEAK-17..19 (DEC-50): GameView.hints en la API y su alcance. Catalogo de pistas (hintsCatalog):
// rby GB, gsc GBC, rse GBA, bw DS, xy 3DS, swsh Switch, za Switch+Switch 2, sw2only Switch 2, noconsole.
import { describe, it, expect, afterEach } from 'vitest'
import { startTestApp, closeAllTestApps, DAILY_SEED, codeOf, type TestApp, type Res } from '../helpers/app'
import { HINT_GAMES, dailyTarget, hintsCatalog } from '../helpers/fixtures'

afterEach(closeAllTestApps)

async function game(app: TestApp, targetGame: string) {
  const g = await app.createUnlimited([targetGame])
  return g.json
}
const serialize = (r: Res) => {
  const h: string[] = []
  r.headers.forEach((v, k) => h.push(`${k}: ${v}`))
  return `${r.status}\n${h.join('\n')}\n${r.text}`
}
const nameWords = (name: string) => name.split(/[\s/]+/).filter((w) => w.length >= 4)

describe('hints en la API', () => {
  it('BE-HNT-19 POST /games (ilimitado y diario) trae hints = [] al empezar', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const u = await app.createUnlimited(['rse'])
    const d = await app.createDaily()
    expect([u.json.hints, d.json.hints]).toEqual([[], []])
  })

  it('BE-HNT-19 guess, skip y state traen siempre hints con la longitud de results', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const g = await game(app, 'rse')
    const s = await app.skip(g.token)
    const m = await app.guess(s.json.token, 'bw-song-1')
    const st = await app.state(m.json.token)
    for (const r of [s, m, st]) expect(r.json.hints.length).toBe(r.json.results.length)
    expect(m.json.hints).toEqual([null, expect.objectContaining({ order: 'earlier' })])
  })

  it('BE-HNT-19 se recuperan iguales tras recargar (state con el mismo token)', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const g = await game(app, 'rse')
    const m = await app.guess(g.token, 'bw-song-1')
    const again = await app.state(m.json.token)
    expect(again.json.hints).toEqual(m.json.hints)
  })

  it('BE-HNT-19 en el diario tambien: hints presentes y alineados', async () => {
    const app = await startTestApp({ catalog: hintsCatalog() })
    const d = await app.createDaily()
    const target = dailyTarget(hintsCatalog(), DAILY_SEED, '2026-07-01')
    const other = hintsCatalog().songs.find((s) => s.games[0] !== target.games[0])!
    const m = await app.guess(d.json.token, other.id)
    expect(m.json.hints.length).toBe(1)
    expect(m.json.hints[0]).not.toBeNull()
  })

  it('BE-HNT-19 tras GAME_OVER (409) la respuesta de state trae los hints finales', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const g = await game(app, 'rse')
    let token = g.token
    for (const s of ['bw-song-1', 'xy-song-1', 'swsh-song-1', 'za-song-1', 'rby-song-1', 'gsc-song-1']) token = (await app.guess(token, s)).json.token
    expect(codeOf(await app.skip(token))).toBe('GAME_OVER')
    const st = await app.state(token)
    expect([st.json.status, st.json.hints.length]).toEqual(['lost', 6])
  })

  it('BE-HNT-20 el servidor ignora ajustes del cliente en el cuerpo (settings, consoleHint, dateHint, hints)', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const a = await game(app, 'rse')
    const b = await game(app, 'rse')
    const plain = await app.guess(a.token, 'bw-song-1')
    const extra = await app.post('/api/games/guess', {
      token: b.token,
      songId: 'bw-song-1',
      settings: { consoleHint: false, dateHint: false },
      consoleHint: false,
      dateHint: false,
      hints: [],
    })
    expect([extra.status, extra.json.hints]).toEqual([200, plain.json.hints])
  })

  it('BE-HNT-20 tampoco en POST /games ni /games/state', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const g = await app.post('/api/games', { mode: 'unlimited', games: ['rse'], settings: { consoleHint: true }, hints: [1] })
    expect(g.status).toBe(200)
    const st = await app.post('/api/games/state', { token: g.json.token, settings: { dateHint: true } })
    expect(st.json.hints).toEqual([])
  })

  it('BE-HNT-21 cambiar consoles en el catalogo y recargarlo cambia las pistas de la misma partida sin invalidar el token', async () => {
    const first = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const g = await game(first, 'rse')
    const m = await first.guess(g.token, 'bw-song-1')
    expect(m.json.hints[0].console).toEqual({ label: 'DS', match: false })
    const changed = hintsCatalog()
    changed.games.find((x) => x.id === 'bw')!.consoles = ['GBA']
    const second = await startTestApp({ catalog: changed, randomInt: () => 0 })
    const st = await second.state(m.json.token)
    expect(st.status).toBe(200)
    expect(st.json.hints[0].console).toEqual({ label: 'GBA', match: true })
  })

  it('BE-HNT-22 AttemptHint tiene exactamente console { label, match } y order', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const g = await game(app, 'rse')
    const r = await app.guess(g.token, 'za-song-1')
    const h = r.json.hints[0]
    expect(Object.keys(h).sort()).toEqual(['console', 'order'])
    expect(Object.keys(h.console).sort()).toEqual(['label', 'match'])
  })

  it('BE-HNT-22 con una consola ausente, console es null (clave presente)', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const g = await game(app, 'rse')
    const r = await app.guess(g.token, 'noconsole-song-1')
    // noconsole va despues de rse en `games`: la buscada (rse) es anterior a la elegida
    expect(r.json.hints[0]).toEqual({ console: null, order: 'earlier' })
  })

  it('BE-HNT-23 el label de una pista roja nunca es una consola de la buscada (buscada bw/DS, elegidas de los demas juegos)', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    for (const chosen of HINT_GAMES.filter((x) => x.id !== 'bw' && x.consoles)) {
      const g = await game(app, 'bw')
      const r = await app.guess(g.token, `${chosen.id}-song-1`)
      const c = r.json.hints[0].console
      if (!c.match) expect(c.label, chosen.id).not.toBe('DS')
      expect(chosen.consoles).toContain(c.label)
    }
  })

  it('BE-HNT-24 alcance: la pista solo contiene una consola canonica, un booleano y un lado del orden (nada mas)', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const g = await game(app, 'za')
    let token = g.token
    for (const s of ['rby-song-1', 'swsh-song-1', 'sw2only-song-1', 'noconsole-song-1']) {
      const r = await app.guess(token, s)
      token = r.json.token
      const h = r.json.hints.at(-1)
      expect(JSON.stringify(h)).toMatch(/^\{"console":(null|\{"label":"(GB|GBC|GBA|DS|3DS|Switch|Switch 2)","match":(true|false)\}),"order":("earlier"|"later"|null)\}$/)
    }
  })
})

describe('fuga con pistas (CA-1, criterio 9)', () => {
  async function playAndCollect(app: TestApp, targetGame: string, chosen: string[]) {
    const responses: Res[] = []
    const created = await app.createUnlimited([targetGame])
    responses.push(created)
    let token = created.json.token
    for (const id of chosen) {
      const r = await app.guess(token, id)
      responses.push(r)
      token = r.json.token
    }
    responses.push(await app.state(token))
    return responses
  }

  function assertNoGameLeak(responses: Res[], gameId: string, name: string) {
    for (const r of responses) {
      const text = serialize(r)
      expect(text, `id "${gameId}"`).not.toContain(`"${gameId}"`)
      expect(text).not.toContain(name)
      for (const w of nameWords(name)) expect(text, w).not.toContain(w)
    }
  }

  it('BE-LEAK-17 partida con 5 fallos y pistas: el id y el nombre del juego objetivo (y palabras >= 4) no aparecen en /games* antes del final', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const responses = await playAndCollect(app, 'bw', ['rby-song-1', 'gsc-song-1', 'rse-song-1', 'xy-song-1', 'swsh-song-1'])
    expect(responses.at(-1)!.json.status).toBe('playing')
    assertNoGameLeak(responses, 'bw', 'Pokemon Black/White')
  })

  it('BE-LEAK-17 tampoco con la buscada en otro juego (xy) y en el diario', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    assertNoGameLeak(await playAndCollect(app, 'xy', ['rby-song-1', 'rse-song-1', 'swsh-song-1']), 'xy', 'Pokemon X/Y')
  })

  it('BE-LEAK-18 pistas verdes (misma consola, Z-A): se revela la consola, no el id ni el nombre del juego', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const responses = await playAndCollect(app, 'za', ['swsh-song-1', 'sw2only-song-1'])
    const hints = responses.at(-1)!.json.hints
    expect(hints.map((h: any) => h.console.match)).toEqual([true, true])
    expect(hints.map((h: any) => h.console.label)).toEqual(['Switch', 'Switch 2'])
    assertNoGameLeak(responses, 'za', 'Pokemon Legends Z-A')
  })

  it('BE-LEAK-18 el nombre de la consola no revela el juego: "Switch" lo comparten swsh y za', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const a = await playAndCollect(app, 'za', ['swsh-song-1'])
    const b = await playAndCollect(app, 'swsh', ['za-song-1'])
    expect(a.at(-1)!.json.hints[0].console).toEqual(b.at(-1)!.json.hints[0].console)
  })

  it('BE-LEAK-19 dos objetivos de juegos distintos con la misma secuencia de elegidas: las respuestas solo difieren en match y order', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const seq = ['bw-song-1', 'xy-song-1', 'swsh-song-1', 'noconsole-song-1']
    const strip = (r: Res) => {
      const { token: _t, clipUrl: _c, hints, ...rest } = r.json
      return { rest, hints }
    }
    const a = (await playAndCollect(app, 'rse', seq)).slice(1, -1).map(strip)
    const b = (await playAndCollect(app, 'rby', seq)).slice(1, -1).map(strip)
    a.forEach((x, i) => {
      expect(x.rest, `respuesta ${i}`).toEqual(b[i].rest)
      x.hints.forEach((h: any, k: number) => {
        const other = b[i].hints[k]
        expect(h.console?.label ?? null).toBe(other.console?.label ?? null)
        expect(Object.keys(h).sort()).toEqual(['console', 'order'])
      })
    })
  })

  it('BE-LEAK-06 [MOD] claves de GameView: token,mode,date?,status,attempt,maxAttempts,clipSeconds,results,guesses,hints,clipUrl?,solution?', async () => {
    const app = await startTestApp({ catalog: hintsCatalog(), randomInt: () => 0 })
    const g = await app.createUnlimited(['rse'])
    const allowed = ['token', 'mode', 'date', 'status', 'attempt', 'maxAttempts', 'clipSeconds', 'results', 'guesses', 'hints', 'clipUrl', 'solution']
    for (const key of Object.keys(g.json)) expect(allowed).toContain(key)
    for (const key of ['token', 'mode', 'status', 'attempt', 'maxAttempts', 'clipSeconds', 'results', 'guesses', 'hints', 'clipUrl']) expect(Object.keys(g.json)).toContain(key)
    expect(g.json.hints.length).toBe(g.json.results.length)
  })
})
