import { describe, it, expect } from 'vitest'
import { CLIP_SECONDS, MAX_ATTEMPTS } from '../rules'

describe('shared/rules', () => {
  it('SH-RUL-01 CLIP_SECONDS son exactamente 1,2,4,7,11,16', () => {
    expect([...CLIP_SECONDS]).toEqual([1, 2, 4, 7, 11, 16])
  })

  it('SH-RUL-01 MAX_ATTEMPTS es 6', () => {
    expect(MAX_ATTEMPTS).toBe(6)
  })

  it('SH-RUL-01 hay un clip por intento', () => {
    expect(CLIP_SECONDS.length).toBe(MAX_ATTEMPTS)
  })
})
