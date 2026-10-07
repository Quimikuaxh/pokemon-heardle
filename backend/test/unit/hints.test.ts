// Pistas de consola y de fecha (DEC-50). Contrato:
//   game/hints.ts  computeHint(chosen: Song, target: Song, gameOrder: readonly string[], gamesById: ReadonlyMap<string, Game>): AttemptHint
//   AttemptHint = { console: { label: ConsoleName, match: boolean } | null, order: 'earlier' | 'later' | null }
//   `order` describe el juego de la BUSCADA respecto al de la ELEGIDA; `label` es de la ELEGIDA salvo coincidencia (primera comun canonica).
//   engine.buildGameView(...).hints: Array<AttemptHint | null> alineado con results (null en skip y en hit), sin tocar el token.
import { describe, it, expect } from 'vitest'
import { computeHint } from '../../src/game/hints'
import { createPayload, applyGuess, applySkip, buildGameView } from '../../src/game/engine'
import { indexCatalog } from '../../src/catalog'
import { HINT_GAMES, hintsCatalog } from '../helpers/fixtures'

const catalog = hintsCatalog()
const index = indexCatalog(catalog as any)
const songOf = (id: string) => index.songById(id)!
const ORDER = catalog.games.map((g) => g.id)
const BY_ID = new Map(catalog.games.map((g) => [g.id, g] as const))
const hint = (chosen: string, target: string, order: readonly string[] = ORDER, byId: ReadonlyMap<string, any> = BY_ID) =>
  computeHint(songOf(chosen), songOf(target), order, byId as any)

const consoleOf = (h: any) => h.console

describe('computeHint: consola', () => {
  it('BE-HNT-01 coincide: elegida y buscada de rse -> { label: GBA, match: true }', () => {
    expect(consoleOf(hint('rse-song-1', 'rse-song-2'))).toEqual({ label: 'GBA', match: true })
  })

  it('BE-HNT-02 no coincide: elegida rse, buscada bw -> { label: GBA, match: false } (label de la ELEGIDA)', () => {
    expect(consoleOf(hint('rse-song-1', 'bw-song-1'))).toEqual({ label: 'GBA', match: false })
  })

  it('BE-HNT-03 Z-A 1: elegida Z-A, buscada Switch -> { Switch, true }', () => {
    expect(consoleOf(hint('za-song-1', 'swsh-song-1'))).toEqual({ label: 'Switch', match: true })
  })

  it('BE-HNT-04 Z-A 2: elegida Z-A, buscada solo Switch 2 -> { Switch 2, true }', () => {
    expect(consoleOf(hint('za-song-1', 'sw2only-song-1'))).toEqual({ label: 'Switch 2', match: true })
  })

  for (const target of ['rse-song-1', 'bw-song-1', 'rby-song-1']) {
    it(`BE-HNT-05 Z-A 3: elegida Z-A, buscada de otra consola (${target}) -> { Switch, false }`, () => {
      expect(consoleOf(hint('za-song-1', target))).toEqual({ label: 'Switch', match: false })
    })
  }

  it('BE-HNT-06 Z-A 4a: buscada Z-A, elegida Switch -> { Switch, true }', () => {
    expect(consoleOf(hint('swsh-song-1', 'za-song-1'))).toEqual({ label: 'Switch', match: true })
  })

  it('BE-HNT-07 Z-A 4b: buscada Z-A, elegida solo Switch 2 -> { Switch 2, true }', () => {
    expect(consoleOf(hint('sw2only-song-1', 'za-song-1'))).toEqual({ label: 'Switch 2', match: true })
  })

  it('BE-HNT-08 Z-A contra Z-A -> { Switch, true } y order null', () => {
    const h = hint('za-song-1', 'za-song-2')
    expect([consoleOf(h), h.order]).toEqual([{ label: 'Switch', match: true }, null])
  })

  it('BE-HNT-09 producto cartesiano de juegos: el label nunca es una consola que la elegida no tenga', () => {
    for (const chosen of HINT_GAMES.filter((g) => g.consoles)) {
      for (const target of HINT_GAMES.filter((g) => g.consoles)) {
        const h = hint(`${chosen.id}-song-1`, `${target.id}-song-2`)
        expect(chosen.consoles, `${chosen.id} -> ${target.id}`).toContain(h.console!.label)
        const shared = chosen.consoles!.some((c) => target.consoles!.includes(c))
        expect(h.console!.match, `${chosen.id} -> ${target.id}`).toBe(shared)
      }
    }
  })

  it('BE-HNT-09 con coincidencia el label es la primera consola comun en orden canonico', () => {
    // elegida Z-A [Switch, Switch 2] contra una buscada que solo comparte "Switch 2"
    expect(consoleOf(hint('za-song-1', 'sw2only-song-2')).label).toBe('Switch 2')
  })

  it('BE-HNT-10 elegida sin consoles -> console null; order calculado', () => {
    const h = hint('noconsole-song-1', 'rby-song-1')
    expect([h.console, h.order]).toEqual([null, 'earlier'])
  })

  it('BE-HNT-10 buscada sin consoles -> console null; order calculado', () => {
    const h = hint('rby-song-1', 'noconsole-song-1')
    expect([h.console, h.order]).toEqual([null, 'later'])
  })

  it('BE-HNT-10 juego sin consoles contra si mismo -> null y order null', () => {
    const h = hint('noconsole-song-1', 'noconsole-song-2')
    expect([h.console, h.order]).toEqual([null, null])
  })
})

describe('computeHint: fecha (orden de games)', () => {
  it('BE-HNT-11 elegida rse, buscada rby -> order earlier', () => {
    expect(hint('rse-song-1', 'rby-song-1').order).toBe('earlier')
  })

  it('BE-HNT-12 elegida rby, buscada za -> order later', () => {
    expect(hint('rby-song-1', 'za-song-1').order).toBe('later')
  })

  it('BE-HNT-13 mismo juego -> order null', () => {
    expect(hint('bw-song-1', 'bw-song-2').order).toBeNull()
  })

  it('BE-HNT-14 reordenar games invierte las flechas (earlier <-> later)', () => {
    const reversed = [...ORDER].reverse()
    expect(hint('rse-song-1', 'rby-song-1', reversed).order).toBe('later')
    expect(hint('rby-song-1', 'za-song-1', reversed).order).toBe('earlier')
  })

  it('BE-HNT-15 juego fuera de games (catalogo corrupto): sin excepcion y order null', () => {
    const partial = ORDER.filter((id) => id !== 'bw')
    expect(() => hint('rse-song-1', 'bw-song-1', partial)).not.toThrow()
    expect(hint('rse-song-1', 'bw-song-1', partial).order).toBeNull()
    expect(hint('bw-song-1', 'rse-song-1', partial).order).toBeNull()
  })

  it('BE-HNT-15 juego ausente de gamesById: sin excepcion, console null', () => {
    const noBw = new Map([...BY_ID].filter(([id]) => id !== 'bw'))
    expect(() => hint('rse-song-1', 'bw-song-1', ORDER, noBw)).not.toThrow()
    expect(hint('rse-song-1', 'bw-song-1', ORDER, noBw).console).toBeNull()
  })

  it('las claves de AttemptHint son exactamente console y order', () => {
    expect(Object.keys(hint('rse-song-1', 'bw-song-1')).sort()).toEqual(['console', 'order'])
  })

  it('el hint no incluye ni el id ni el nombre del juego buscado', () => {
    const text = JSON.stringify(hint('rse-song-1', 'bw-song-1'))
    expect(text).not.toContain('bw')
    expect(text).not.toMatch(/Black|White/)
  })
})

describe('buildGameView: hints alineados con results', () => {
  const start = (target: string) => createPayload({ mode: 'unlimited', target: songOf(target), nowMs: Date.parse('2026-10-05T12:00:00Z') })
  const play = (p: any, steps: string[]) => steps.reduce((cur, s) => (s === 'skip' ? applySkip(cur) : applyGuess(cur, s, index).payload), p)
  const view = (p: any) => buildGameView(p, index, { token: 't' }) as any

  it('BE-HNT-16 hints.length === results.length; null en skip y en hit; objeto en miss y game', () => {
    const p = play(start('rse-song-1'), ['skip', 'bw-song-1', 'rse-song-2', 'rse-song-1'])
    const v = view(p)
    expect(v.results).toEqual(['skip', 'miss', 'game', 'hit'])
    expect(v.hints.length).toBe(v.results.length)
    expect(v.hints[0]).toBeNull()
    expect(v.hints[1]).toMatchObject({ console: { label: 'DS', match: false }, order: 'earlier' })
    expect(v.hints[3]).toBeNull()
  })

  it('BE-HNT-16 en game: console.match true y order null', () => {
    const v = view(play(start('rse-song-1'), ['rse-song-2']))
    expect(v.hints[0]).toEqual({ console: { label: 'GBA', match: true }, order: null })
  })

  it('BE-HNT-17 skips intercalados S,M,S,G,M con q=[k1,k2,k3] -> [null,h(k1),null,h(k2),h(k3)]', () => {
    const steps = ['skip', 'bw-song-1', 'skip', 'rse-song-2', 'xy-song-1']
    const v = view(play(start('rse-song-1'), steps))
    expect(v.results).toEqual(['skip', 'miss', 'skip', 'game', 'miss'])
    const expected = ['bw-song-1', 'rse-song-2', 'xy-song-1'].map((c) => hint(c, 'rse-song-1'))
    expect(v.hints).toEqual([null, expected[0], null, expected[1], expected[2]])
  })

  it('BE-HNT-18 6 fallos -> 6 hints', () => {
    const v = view(play(start('rby-song-1'), ['gsc-song-1', 'rse-song-1', 'bw-song-1', 'xy-song-1', 'swsh-song-1', 'za-song-1']))
    expect(v.status).toBe('lost')
    expect(v.hints.length).toBe(6)
    expect(v.hints.every((h: any) => h && typeof h.order === 'string')).toBe(true)
  })

  it('BE-HNT-18 ganada en el 3.o tras 2 fallos -> [h, h, null]', () => {
    const v = view(play(start('rby-song-1'), ['gsc-song-1', 'rse-song-1', 'rby-song-1']))
    expect(v.status).toBe('won')
    expect(v.hints[2]).toBeNull()
    expect(v.hints[0]).not.toBeNull()
    expect(v.hints[1]).not.toBeNull()
  })

  it('BE-HNT-18 solo skips -> todo null', () => {
    const v = view(play(start('rby-song-1'), ['skip', 'skip', 'skip']))
    expect(v.hints).toEqual([null, null, null])
  })

  it('BE-HNT-18 partida recien creada -> hints []', () => {
    expect(view(start('rby-song-1')).hints).toEqual([])
  })

  it('las pistas se recalculan del catalogo: no dependen del token (mismo payload, otro catalogo de consolas, otras pistas)', () => {
    const p = play(start('rse-song-1'), ['bw-song-1'])
    const other: any = hintsCatalog()
    other.games.find((g: any) => g.id === 'bw').consoles = ['GBA'] // ahora comparte consola con rse
    const v2 = buildGameView(p, indexCatalog(other), { token: 't' }) as any
    expect(view(p).hints[0].console).toEqual({ label: 'DS', match: false })
    expect(v2.hints[0].console).toEqual({ label: 'GBA', match: true })
  })

  it('BE-LEAK-17 (unit) la vista en curso no contiene el id ni el nombre del juego de la buscada', () => {
    const v = view(play(start('bw-song-1'), ['rse-song-1', 'xy-song-1', 'rby-song-1']))
    const text = JSON.stringify(v)
    expect(text).not.toContain('"bw"')
    expect(text).not.toMatch(/Black\/White|Black|White/)
  })
})
