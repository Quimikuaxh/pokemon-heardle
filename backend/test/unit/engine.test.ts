import { describe, it, expect } from 'vitest'
import { createPayload, applyGuess, applySkip, deriveStatus, buildGameView } from '../../src/game/engine'
import { indexCatalog } from '../../src/catalog'
import { catalogR } from '../helpers/fixtures'
import { thrown } from '../helpers/errors'

const index = indexCatalog(catalogR() as any)
const S = (id: string) => index.songById(id)!
const NOW = Date.parse('2026-07-01T12:00:00Z')

const A1 = 'a-one-song-01'
const A2 = 'a-two-song-02'
const AB = 'ab-multi-game-song-017'
const B1 = 'b-one-song-03'
const B2 = 'b-two-song-04'
const C1 = 'c-only-song-05'
const D1 = 'd-only-song-06'

const game = (targetId: string, mode: 'unlimited' | 'daily' = 'unlimited') =>
  createPayload({ mode, target: S(targetId), date: mode === 'daily' ? '2026-07-01' : undefined, nowMs: NOW })

function play(p: any, steps: string[]) {
  // 'skip' o songId
  let cur = p
  for (const s of steps) cur = s === 'skip' ? applySkip(cur) : applyGuess(cur, s, index).payload
  return cur
}

describe('game/engine createPayload (BE-TOK-15, BE-TOK-16)', () => {
  it('estado inicial: v=1, r y q vacios, k = clipKey objetivo, nonce 16 hex', () => {
    const p = game(A1)
    expect([p.v, p.r, p.q, p.k, /^[0-9a-f]{16}$/.test(p.n)]).toEqual([1, [], [], '1111111111111111', true])
  })

  it('nonces distintos entre partidas', () => {
    expect(game(A1).n).not.toBe(game(A1).n)
  })

  it('diario lleva m=d y la fecha en d; ilimitado m=u y sin d', () => {
    const d = game(A1, 'daily')
    const u = game(A1)
    expect([d.m, d.d, u.m, 'd' in u]).toEqual(['d', '2026-07-01', 'u', false])
  })

  it('BE-TOK-15 ilimitado: exp = iat + 24 h', () => {
    const p = game(A1)
    expect(p.exp - p.iat).toBe(86400)
  })

  it('BE-TOK-15 iat es epoch en segundos', () => {
    expect(game(A1).iat).toBe(Math.floor(NOW / 1000))
  })

  for (const [label, date, expIso] of [
    ['dia normal (verano)', '2026-07-01', '2026-07-02T04:00:00Z'], // fin dia 07-01 = 22:00Z, +6h
    ['dia normal (invierno)', '2026-12-01', '2026-12-02T05:00:00Z'], // fin = 23:00Z, +6h
    ['dia de 23 h (cambio primavera)', '2026-03-29', '2026-03-30T04:00:00Z'], // fin = 03-29T22:00Z
    ['dia de 25 h (cambio otono)', '2026-10-25', '2026-10-26T05:00:00Z'], // fin = 10-25T23:00Z
  ] as Array<[string, string, string]>) {
    it(`BE-TOK-15 diario ${label}: exp = fin del dia Madrid + 6 h`, () => {
      const p = createPayload({ mode: 'daily', target: S(A1), date, nowMs: Date.parse(date + 'T10:00:00Z') })
      expect(p.exp).toBe(Date.parse(expIso) / 1000)
    })
  }
})

describe('game/engine deriveStatus (BE-ENG-14)', () => {
  it('sin resultados: playing', () => {
    expect(deriveStatus(game(C1))).toBe('playing')
  })

  it('acierto como ultimo resultado: won', () => {
    expect(deriveStatus(play(game(C1), [C1]))).toBe('won')
  })

  it('6 resultados sin acierto: lost', () => {
    expect(deriveStatus(play(game(C1), ['skip', 'skip', 'skip', 'skip', 'skip', 'skip']))).toBe('lost')
  })

  it('5 resultados sin acierto: playing', () => {
    expect(deriveStatus(play(game(C1), ['skip', 'skip', 'skip', 'skip', 'skip']))).toBe('playing')
  })
})

describe('game/engine applyGuess', () => {
  it('BE-ENG-01 acierto -> H, won, results termina en hit', () => {
    const { payload, result } = applyGuess(game(C1), C1, index)
    const v = buildGameView(payload, index, { token: 't' })
    expect([result, v.status, v.results.at(-1)]).toEqual(['H', 'won', 'hit'])
  })

  it('BE-ENG-02 fallo con juego distinto -> M (miss)', () => {
    const { payload, result } = applyGuess(game(C1), A1, index)
    expect([result, payload.r]).toEqual(['M', ['M']])
  })

  it('BE-ENG-03 fallo con juego correcto -> G (game)', () => {
    const { result } = applyGuess(game(A1), A2, index)
    expect(result).toBe('G')
  })

  it('BE-ENG-04 interseccion parcial (objetivo {A,B}, elegida {B}) -> G', () => {
    expect(applyGuess(game(AB), B1, index).result).toBe('G')
  })

  it('BE-ENG-04 interseccion parcial inversa (objetivo {A}, elegida {A,B}) -> G', () => {
    expect(applyGuess(game(A1), AB, index).result).toBe('G')
  })

  it('BE-ENG-05 objetivo multi-juego y elegida con juegos disjuntos -> M', () => {
    expect(applyGuess(game(AB), C1, index).result).toBe('M')
  })

  it('BE-ENG-06 se acepta una cancion de otro juego aunque este fuera del pool del filtro (el filtro no esta en el token)', () => {
    const p = game(A1) // pool habria sido {A}; elegimos de B
    expect(applyGuess(p, B1, index).result).toBe('M')
  })

  it('BE-ENG-07 con objetivo de un solo juego, elegir otra del mismo juego nunca es M', () => {
    for (const other of [A2, AB]) expect(applyGuess(game(A1), other, index).result).not.toBe('M')
  })

  it('el acierto se anota en q con el clipKey de la cancion intentada', () => {
    const { payload } = applyGuess(game(C1), A1, index)
    expect(payload.q).toEqual(['1111111111111111'])
  })

  it('BE-ENG-15 songId inexistente -> UNKNOWN_SONG', () => {
    expect(thrown(() => applyGuess(game(C1), 'no-existe', index))?.code).toBe('UNKNOWN_SONG')
  })

  it('BE-ENG-15 songId de cancion deshabilitada -> UNKNOWN_SONG', () => {
    expect(thrown(() => applyGuess(game(C1), 'a-disabled-song-07', index))?.code).toBe('UNKNOWN_SONG')
  })

  it('BE-ENG-15 songId __proto__ / constructor -> UNKNOWN_SONG sin excepcion rara', () => {
    expect(thrown(() => applyGuess(game(C1), '__proto__', index))?.code).toBe('UNKNOWN_SONG')
    expect(thrown(() => applyGuess(game(C1), 'constructor', index))?.code).toBe('UNKNOWN_SONG')
  })

  it('BE-ENG-16 repetir una cancion fallida -> ALREADY_GUESSED (409)', () => {
    const p = play(game(C1), [A1])
    const e = thrown(() => applyGuess(p, A1, index))
    expect([e?.code, e?.status]).toEqual(['ALREADY_GUESSED', 409])
  })

  it('BE-ENG-16 el rechazo no modifica el payload recibido (attempt y results intactos)', () => {
    const p = play(game(C1), [A1])
    const before = JSON.stringify(p)
    thrown(() => applyGuess(p, A1, index))
    expect(JSON.stringify(p)).toBe(before)
  })

  it('BE-ENG-19 repetir una cancion que dio G -> ALREADY_GUESSED', () => {
    const p = play(game(A1), [A2])
    expect(thrown(() => applyGuess(p, A2, index))?.code).toBe('ALREADY_GUESSED')
  })

  it('BE-ENG-22 5 fallos distintos y un 6.o repetido: se rechaza y sigue playing con attempt=5', () => {
    const p = play(game(C1), [A1, A2, B1, B2, AB])
    expect(thrown(() => applyGuess(p, A1, index))?.code).toBe('ALREADY_GUESSED')
    expect(buildGameView(p, index, { token: 't' })).toMatchObject({ status: 'playing', attempt: 5 })
  })

  it('BE-ENG-22 tras el rechazo, un 6.o distinto cierra la partida (perdida)', () => {
    const p = play(game(C1), [A1, A2, B1, B2, AB])
    expect(deriveStatus(applyGuess(p, D1, index).payload)).toBe('lost')
  })

  it('BE-ENG-22 tras el rechazo, el 6.o distinto puede ser el acierto', () => {
    const p = play(game(C1), [A1, A2, B1, B2, AB])
    expect(deriveStatus(applyGuess(p, C1, index).payload)).toBe('won')
  })
})

describe('game/engine skip y fin de partida', () => {
  it('BE-ENG-08 skip anade S, attempt+1 y no toca q', () => {
    const p = applySkip(game(C1))
    expect([p.r, p.q]).toEqual([['S'], []])
  })

  it('BE-ENG-20 tras skip se puede elegir cualquier cancion no intentada', () => {
    const p = applySkip(game(C1))
    expect(applyGuess(p, A1, index).result).toBe('M')
  })

  it('BE-ENG-09 el 6.o intento fallido (guess) -> lost, attempt=6, sin clipUrl', () => {
    const p = play(game(C1), [A1, A2, B1, B2, AB, D1])
    const v = buildGameView(p, index, { token: 't', clipUrl: '/api/clips/x' })
    expect([v.status, v.attempt, v.clipUrl]).toEqual(['lost', 6, undefined])
  })

  it('BE-ENG-10 el 6.o intento con skip -> lost', () => {
    expect(deriveStatus(play(game(C1), [A1, A2, B1, B2, AB, 'skip']))).toBe('lost')
  })

  it('BE-ENG-11 acierto en el 6.o intento -> won con attempt=6', () => {
    const p = play(game(C1), [A1, A2, B1, B2, AB, C1])
    expect(buildGameView(p, index, { token: 't' })).toMatchObject({ status: 'won', attempt: 6 })
  })

  it('BE-ENG-12 acierto en el intento 1 -> won con attempt=1', () => {
    expect(buildGameView(play(game(C1), [C1]), index, { token: 't' })).toMatchObject({ status: 'won', attempt: 1 })
  })

  for (const [label, finish] of [
    ['ganada', [C1]],
    ['perdida', ['skip', 'skip', 'skip', 'skip', 'skip', 'skip']],
  ] as Array<[string, string[]]>) {
    it(`BE-ENG-13 skip tras partida ${label} -> GAME_OVER (409)`, () => {
      const p = play(game(C1), finish)
      const e = thrown(() => applySkip(p))
      expect([e?.code, e?.status]).toEqual(['GAME_OVER', 409])
    })

    it(`BE-ENG-13 guess tras partida ${label} -> GAME_OVER`, () => {
      expect(thrown(() => applyGuess(play(game(C1), finish), A1, index))?.code).toBe('GAME_OVER')
    })
  }

  it('BE-ENG-21 repetir tras partida terminada -> GAME_OVER (prioridad sobre ALREADY_GUESSED)', () => {
    const p = play(game(C1), ['skip', 'skip', 'skip', 'skip', A1, A2])
    expect(thrown(() => applyGuess(p, A1, index))?.code).toBe('GAME_OVER')
  })

  it('BE-ENG-21 songId inexistente tras partida terminada -> GAME_OVER (prioridad sobre UNKNOWN_SONG)', () => {
    const p = play(game(C1), [C1])
    expect(thrown(() => applyGuess(p, 'no-existe', index))?.code).toBe('GAME_OVER')
  })

  it('BE-ENG-21 songId inexistente con intentos previos -> UNKNOWN_SONG', () => {
    const p = play(game(C1), [A1])
    expect(thrown(() => applyGuess(p, 'no-existe', index))?.code).toBe('UNKNOWN_SONG')
  })
})

describe('game/engine buildGameView', () => {
  it('claves exactas durante la partida: sin solution ni clipUrl si no se pasa', () => {
    const v: any = buildGameView(game(C1), index, { token: 'tok' })
    expect(Object.keys(v).sort()).toEqual(['attempt', 'clipSeconds', 'guesses', 'maxAttempts', 'mode', 'results', 'status', 'token'])
  })

  it('el diario incluye date; el ilimitado no', () => {
    expect((buildGameView(game(C1, 'daily'), index, { token: 't' }) as any).date).toBe('2026-07-01')
    expect('date' in buildGameView(game(C1), index, { token: 't' })).toBe(false)
  })

  it('maxAttempts=6 y clipSeconds=[1,2,4,7,11,16]', () => {
    const v = buildGameView(game(C1), index, { token: 't' })
    expect([v.maxAttempts, v.clipSeconds]).toEqual([6, [1, 2, 4, 7, 11, 16]])
  })

  it('results mapea S/M/G/H a skip/miss/game/hit', () => {
    const p = play(game(A1), ['skip', B1, A2, A1])
    expect(buildGameView(p, index, { token: 't' }).results).toEqual(['skip', 'miss', 'game', 'hit'])
  })

  it('BE-ENG-23 guesses: songIds en orden de jugada, sin skips', () => {
    const p = play(game(C1), [A1, 'skip', B1, A2])
    expect(buildGameView(p, index, { token: 't' }).guesses).toEqual([A1, B1, A2])
  })

  it('BE-ENG-24 guesses de una partida ganada incluyen el acierto', () => {
    const p = play(game(C1), [A1, C1])
    expect(buildGameView(p, index, { token: 't' }).guesses).toEqual([A1, C1])
  })

  it('BE-ENG-24 guesses de una perdida solo contienen intentos propios (no la objetivo)', () => {
    const p = play(game(C1), [A1, 'skip', 'skip', 'skip', 'skip', 'skip'])
    expect(buildGameView(p, index, { token: 't' }).guesses).toEqual([A1])
  })

  it('solution ausente mientras playing, aunque se pase clipUrl esta presente', () => {
    const v: any = buildGameView(play(game(C1), [A1]), index, { token: 't', clipUrl: '/api/clips/abc' })
    expect([v.solution, v.clipUrl]).toEqual([undefined, '/api/clips/abc'])
  })

  it('BE-LEAK-10 solution al terminar: solo id,title y games con id y name', () => {
    const v: any = buildGameView(play(game(AB), [AB]), index, { token: 't' })
    expect(v.solution).toEqual({
      id: AB,
      title: 'Marigold Citadel',
      games: [
        { id: 'A', name: 'Pokemon Game Alpha' },
        { id: 'B', name: 'Pokemon Game Bravo' },
      ],
    })
  })

  it('al terminar la solution se revela tambien en partida perdida', () => {
    const v: any = buildGameView(play(game(C1), ['skip', 'skip', 'skip', 'skip', 'skip', 'skip']), index, { token: 't' })
    expect(v.solution.id).toBe(C1)
  })

  it('al terminar no hay clipUrl aunque se pase', () => {
    const v: any = buildGameView(play(game(C1), [C1]), index, { token: 't', clipUrl: '/api/clips/x' })
    expect(v.clipUrl).toBeUndefined()
  })

  it('BE-ENG-17 cada accion valida produce un payload distinto sin mutar el anterior', () => {
    const p0 = game(C1)
    const snap = JSON.stringify(p0)
    const p1 = applySkip(p0)
    expect([JSON.stringify(p0), p1 === p0]).toEqual([snap, false])
  })
})
