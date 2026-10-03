import { describe, it, expect } from 'vitest'
import { currentClipSeconds, resultLabel } from '../game/view'
import { mkView, mkFinished } from './helpers'

describe('game/view', () => {
  for (const [attempt, secs] of [[0, 1], [1, 2], [2, 4], [3, 7], [4, 11], [5, 16]]) {
    it(`FE-GAM-04 attempt ${attempt} -> ${secs} s`, () => {
      expect(currentClipSeconds(mkView({ attempt }))).toBe(secs)
    })
  }

  it('FE-GAM-04 partida terminada -> null', () => {
    expect(currentClipSeconds(mkFinished())).toBeNull()
  })

  it('FE-GAM-06 game -> "juego acertado"', () => {
    expect(resultLabel('game')).toMatch(/juego acertado/i)
  })

  it('FE-GAM-06 miss -> "juego incorrecto"', () => {
    expect(resultLabel('miss')).toMatch(/juego incorrecto/i)
  })

  it('hit y skip tienen etiqueta no vacia y distinta', () => {
    expect(resultLabel('hit').length).toBeGreaterThan(0)
    expect(resultLabel('skip')).not.toBe(resultLabel('hit'))
  })
})
