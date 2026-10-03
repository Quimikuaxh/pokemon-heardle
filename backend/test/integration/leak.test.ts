// Prueba de fuga (CA-1, RQ2): durante una partida completa, ninguna respuesta (cuerpo y cabeceras)
// anterior al final puede contener datos de la cancion objetivo.
import { describe, it, expect, afterEach } from 'vitest'
import { startTestApp, closeAllTestApps, codeOf, DAILY_SEED, type TestApp, type Res } from '../helpers/app'
import { catalogR, dailyTarget, enabledSorted, T, type FixtureSong } from '../helpers/fixtures'

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
  const direct = [s.id, s.title, s.clipKey, s.source.youtubeId, s.source.videoTitle, ...words]
  const b64 = [s.id, s.title, s.clipKey].flatMap((v) => [Buffer.from(v).toString('base64'), Buffer.from(v).toString('base64url')])
  return [...direct, ...b64.filter((x) => x.length >= 8)]
}

const FORBIDDEN_KEYS = ['clipKey', 'startSec', 'youtubeId', 'videoTitle', 'filterKey', '"source"', '"enabled"', '"reviewed"', '.mp3']

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

  it('BE-LEAK-10 solution revelada: solo id,title,games (sin clipKey, startSec, source)', async () => {
    const app = await startTestApp({ randomInt: () => 0 })
    const g = await app.createUnlimited(['C'])
    const w = await app.guess(g.json.token, 'c-only-song-05')
    expect(Object.keys(w.json.solution).sort()).toEqual(['games', 'id', 'title'])
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
})
