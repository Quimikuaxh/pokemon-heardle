// Prueba de fuga (CA-1, RQ2): durante una partida completa, ninguna respuesta (cuerpo y cabeceras)
// anterior al final puede contener datos de la cancion objetivo.
import { describe, it, expect, afterEach } from 'vitest'
import { startTestApp, closeAllTestApps, codeOf, DAILY_SEED, type TestApp, type Res } from '../helpers/app'
import { catalogR, dailyTarget, enabledSorted, T, type FixtureSong } from '../helpers/fixtures'
import { SECRET_A } from '../helpers/secrets'
import { decryptToken } from '../../src/game/token'
import { TicketService } from '../../src/game/tickets'

afterEach(closeAllTestApps)

const ALLOWED_KEYS = ['token', 'mode', 'date', 'status', 'attempt', 'maxAttempts', 'clipSeconds', 'results', 'guesses', 'clipUrl', 'solution']

function serialize(r: Res): string {
  const h: string[] = []
  r.headers.forEach((v, k) => h.push(`${k}: ${v}`))
  return `${r.status}\n${h.join('\n')}\n${r.text}`
}

/** Cadenas base64url largas (token, ticket) decodificadas, para buscar texto en claro dentro. */
function decodedBlobs(text: string): string[] {
  const out: string[] = []
  for (const m of text.match(/[A-Za-z0-9_-]{60,}/g) ?? []) out.push(Buffer.from(m, 'base64url').toString('latin1'))
  return out
}

function needlesFor(s: FixtureSong): string[] {
  const words = s.title.split(/\s+/).filter((w) => w.length >= 6)
  const duration = String(s.source.durationSec)
  const direct = [s.id, s.title, s.clipKey, s.source.youtubeId, s.source.videoTitle, ...words, ...(duration.length >= 6 ? [duration] : [])]
  const b64 = [s.id, s.title, s.clipKey].flatMap((v) => [Buffer.from(v).toString('base64'), Buffer.from(v).toString('base64url')])
  return [...direct, ...b64.filter((x) => x.length >= 8)]
}

const FORBIDDEN_KEYS = ['clipKey', 'startSec', 'youtubeId', 'videoTitle', 'durationSec', 'filterKey', '"source"', '"enabled"', '"reviewed"', '.mp3']

function assertNoLeak(responses: Res[], target: FixtureSong) {
  const needles = needlesFor(target)
  for (const r of responses) {
    const text = serialize(r)
    const blobs = decodedBlobs(r.text)
    for (const n of needles) {
      expect(text, `la respuesta contiene "${n}"`).not.toContain(n)
      for (const b of blobs) expect(b, `un blob decodificado contiene "${n}"`).not.toContain(n)
    }
    for (const k of FORBIDDEN_KEYS) expect(text, `la respuesta contiene "${k}"`).not.toContain(k)
    for (const other of catalogR().songs) expect(text).not.toContain(other.clipKey)
  }
}

/** 5 intentos consumidos sin terminar: guess, skip, guess, (repetido -> 409), guess, state, clip, guess. */
async function playBeforeEnd(app: TestApp, created: Res, target: FixtureSong): Promise<Res[]> {
  const others = enabledSorted(catalogR()).filter((s) => s.id !== target.id)
  const all: Res[] = [created]
  const push = (r: Res) => (all.push(r), r)
  let token = created.json.token
  const act = async (r: Res) => {
    push(r)
    if (r.json?.token) token = r.json.token
    return r
  }
  await act(await app.guess(token, others[0].id))
  await act(await app.skip(token))
  await act(await app.guess(token, others[1].id))
  await act(await app.guess(token, others[0].id)) // ALREADY_GUESSED
  const st = await act(await app.state(token))
  push(await app.clip(st.json.clipUrl))
  await act(await app.guess(token, others[2].id))
  await act(await app.guess(token, others[3].id))
  return all
}

describe('BE-LEAK fuga de la cancion objetivo', () => {
  it('BE-LEAK-05 diario: partida de 5 intentos (con ALREADY_GUESSED, state y clip) no filtra nada', async () => {
    const app = await startTestApp()
    const target = dailyTarget(catalogR(), DAILY_SEED, '2026-07-01')
    const all = await playBeforeEnd(app, await app.createDaily(), target)
    assertNoLeak(all, target)
  })

  it('BE-LEAK-05 la partida de la prueba sigue en curso (5 intentos) y hubo un 409 ALREADY_GUESSED', async () => {
    const app = await startTestApp()
    const target = dailyTarget(catalogR(), DAILY_SEED, '2026-07-01')
    const all = await playBeforeEnd(app, await app.createDaily(), target)
    expect(all.some((r) => codeOf(r) === 'ALREADY_GUESSED')).toBe(true)
    expect(all.at(-1)!.json).toMatchObject({ attempt: 5, status: 'playing' })
  })

  it('BE-LEAK-06 diario en una segunda fecha distinta tampoco filtra', async () => {
    const app = await startTestApp({ nowMs: T.JUL_02_NOON })
    const target = dailyTarget(catalogR(), DAILY_SEED, '2026-07-02')
    assertNoLeak(await playBeforeEnd(app, await app.createDaily(), target), target)
  })

  for (const [label, filter, targetId] of [
    ['C', ['C'], 'c-only-song-05'],
    ['D', ['D'], 'd-only-song-06'],
  ] as Array<[string, string[], string]>) {
    it(`BE-LEAK-06 ilimitado con objetivo en juego ${label} no filtra`, async () => {
      const app = await startTestApp({ randomInt: () => 0 })
      const target = catalogR().songs.find((s) => s.id === targetId)!
      assertNoLeak(await playBeforeEnd(app, await app.createUnlimited(filter), target), target)
    })
  }

  it('BE-LEAK-06 GameView solo tiene las claves permitidas (whitelist) durante la partida', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const target = catalogR().songs.find((s) => s.id === 'c-only-song-05')!
    const all = await playBeforeEnd(app, await app.createUnlimited(['C']), target)
    for (const r of all.filter((x) => x.json?.token)) for (const k of Object.keys(r.json)) expect(ALLOWED_KEYS).toContain(k)
  })

  it('BE-LEAK-01 solution ausente mientras playing en todas las respuestas', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const target = catalogR().songs.find((s) => s.id === 'c-only-song-05')!
    const all = await playBeforeEnd(app, await app.createUnlimited(['C']), target)
    for (const r of all) expect(r.text).not.toContain('"solution"')
  })

  it('BE-LEAK-04 clipUrl ausente al terminar', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const g = await app.createUnlimited(['C'])
    const w = await app.guess(g.json.token, 'c-only-song-05')
    expect('clipUrl' in w.json).toBe(false)
  })

  it('BE-LEAK-07 los errores 4xx de /games/* no filtran datos de la objetivo ni trazas', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const target = catalogR().songs.find((s) => s.id === 'c-only-song-05')!
    const g = await app.createUnlimited(['C'])
    const errs = [
      await app.guess(g.json.token, 'no-existe'),
      await app.guess('basura', 'a-one-song-01'),
      await app.post('/api/games/guess', 'no es json'),
      await app.post('/api/games', { mode: 'otro' }),
      await app.createUnlimited(['ZZ']),
    ]
    assertNoLeak(errs, target)
    for (const e of errs) expect(e.text).not.toMatch(/node_modules|\bat .*\(|\.ts:\d+|Error:/)
  })

  it('BE-LEAK-08 Content-Length de los clips y tamano del JSON iguales entre dos objetivos para el mismo intento', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const sizes: Array<{ clip: string | null; json: number; afterGuess: number }> = []
    for (const filter of [['C'], ['D']]) {
      const g = await app.createUnlimited(filter)
      const clip = await app.clip(g.json.clipUrl)
      const miss = await app.guess(g.json.token, 'a-one-song-01')
      sizes.push({ clip: clip.headers.get('content-length'), json: g.text.length, afterGuess: miss.text.length })
    }
    expect(sizes[0]).toEqual(sizes[1])
  })

  it('BE-LEAK-09 clipUrl opaca: /api/clips/<ticket> sin clipKey, id ni extension', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const g = await app.createUnlimited(['C'])
    expect(g.json.clipUrl).toMatch(/^\/api\/clips\/[A-Za-z0-9_-]+$/)
  })

  it('BE-LEAK-10 solution revelada: solo id,title,games,youtubeId (sin clipKey, startSec, source, durationSec)', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const g = await app.createUnlimited(['C'])
    const w = await app.guess(g.json.token, 'c-only-song-05')
    expect(Object.keys(w.json.solution).sort()).toEqual(['games', 'id', 'title', 'youtubeId'])
  })

  it('BE-LEAK-12 ninguna respuesta incluye el clipKey de las canciones intentadas (solo songId)', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const g = await app.createUnlimited(['C'])
    const r1 = await app.guess(g.json.token, 'a-one-song-01')
    expect(r1.text).not.toContain('1111111111111111')
    expect(r1.json.guesses).toEqual(['a-one-song-01'])
  })

  it('el token de la partida tiene la misma longitud para dos objetivos distintas (mismo intento)', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const a = await app.createUnlimited(['C'])
    const b = await app.createUnlimited(['D'])
    expect(a.json.token.length).toBe(b.json.token.length)
  })

  it('la clipUrl tiene la misma longitud para dos objetivos distintas', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const a = await app.createUnlimited(['C'])
    const b = await app.createUnlimited(['A'])
    expect(a.json.clipUrl.length).toBe(b.json.clipUrl.length)
  })

  // ---- DEC-41: el youtubeId solo existe en solution.youtubeId, y solo tras terminar ----
  const C_YT = 'yt666666666' // youtubeId de c-only-song-05 en el fixture

  async function playUnlimitedCToEnd(app: TestApp) {
    const created = await app.createUnlimited(['C'])
    const before: Res[] = [created]
    let token = created.json.token
    for (let i = 0; i < 5; i++) {
      const r = await app.skip(token)
      before.push(r)
      token = r.json.token
    }
    const final = await app.skip(token)
    return { before, final, finalToken: final.json.token as string }
  }

  it('BE-LEAK-13 al terminar el youtubeId aparece solo en solution.youtubeId de la respuesta final', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const { final } = await playUnlimitedCToEnd(app)
    expect(final.json.solution.youtubeId).toBe(C_YT)
    const copy = JSON.parse(final.text)
    delete copy.solution.youtubeId
    expect(JSON.stringify(copy)).not.toContain(C_YT)
    expect(final.text.split(C_YT).length - 1).toBe(1)
  })

  it('BE-LEAK-13 /games/state posterior devuelve el youtubeId solo en solution y no en cabeceras', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const { final, finalToken } = await playUnlimitedCToEnd(app)
    const again = await app.state(finalToken)
    expect(again.json.solution).toEqual(final.json.solution)
    const copy = JSON.parse(again.text)
    delete copy.solution.youtubeId
    expect(JSON.stringify(copy)).not.toContain(C_YT)
    let headers = ''
    again.headers.forEach((v, k) => (headers += `${k}: ${v}\n`))
    expect(headers).not.toContain(C_YT)
  })

  it('BE-LEAK-13 /catalog nunca contiene un youtubeId, ni antes ni despues de terminar', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const pre = await app.get('/api/catalog')
    await playUnlimitedCToEnd(app)
    const post = await app.get('/api/catalog')
    for (const s of catalogR().songs) {
      expect(pre.text).not.toContain(s.source.youtubeId)
      expect(post.text).not.toContain(s.source.youtubeId)
    }
  })

  it('BE-LEAK-13 la unica clave de GameView que puede llevar el youtubeId es solution (el resto no)', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const { final } = await playUnlimitedCToEnd(app)
    const { solution: _solution, ...rest } = final.json
    expect(JSON.stringify(rest)).not.toContain(C_YT)
  })

  it('BE-LEAK-14 ninguna respuesta anterior a la final contiene el youtubeId (cuerpo ni cabeceras)', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const { before } = await playUnlimitedCToEnd(app)
    expect(before.length).toBe(6)
    for (const r of before) {
      expect(serialize(r)).not.toContain(C_YT)
      for (const b of decodedBlobs(r.text)) expect(b).not.toContain(C_YT)
    }
  })

  it('BE-LEAK-14 la respuesta del 5.o intento (la ultima antes del final) tampoco lo contiene aunque la siguiente si', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const { before, final } = await playUnlimitedCToEnd(app)
    expect(before.at(-1)!.json.attempt).toBe(5)
    expect(before.at(-1)!.text).not.toContain(C_YT)
    expect(final.text).toContain(C_YT)
  })

  it('BE-LEAK-15 dos partidas diarias el mismo dia: ninguna respuesta anterior al final contiene el youtubeId comun', async () => {
    const app = await startTestApp()
    const target = dailyTarget(catalogR(), DAILY_SEED, '2026-07-01')
    for (let game = 0; game < 2; game++) {
      const all = await playBeforeEnd(app, await app.createDaily(), target)
      for (const r of all) expect(serialize(r)).not.toContain(target.source.youtubeId)
    }
  })

  it('BE-LEAK-16 el token descifrado no contiene youtubeId y q solo tiene clipKeys de 16 hex', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const g = await app.createUnlimited(['C'])
    const a = await app.guess(g.json.token, 'a-one-song-01')
    const b = await app.skip(a.json.token)
    for (const token of [g.json.token, a.json.token, b.json.token]) {
      const payload = decryptToken(token, SECRET_A, app.clock.now)
      const text = JSON.stringify(payload)
      expect(text).not.toContain(C_YT)
      expect(text).not.toContain('youtubeId')
      for (const key of payload.q) expect(key).toMatch(/^[0-9a-f]{16}$/)
    }
  })

  it('BE-LEAK-16 el ticket descifrado solo lleva clipKey, intento y nonce (sin youtubeId)', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const g = await app.createUnlimited(['C'])
    const ticket = g.json.clipUrl.split('/').pop() as string
    const svc = new TicketService({ secret: SECRET_A, ttlSec: 60, now: () => app.clock.now })
    const redeemed = svc.redeem(ticket)
    expect(Object.keys(redeemed).sort()).toEqual(['attempt', 'clipKey', 'nonce'])
    expect(JSON.stringify(redeemed)).not.toContain(C_YT)
  })
})
