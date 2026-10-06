import { describe, it, expect } from 'vitest'
import { formatClock, formatDayLabel } from '../game/format'

describe('game/format', () => {
  it('FE-DSN-03 formatClock: m:ss truncado', () => {
    expect([formatClock(0), formatClock(4), formatClock(2.99), formatClock(16), formatClock(75.4)]).toEqual(['0:00', '0:04', '0:02', '0:16', '1:15'])
  })

  it('FE-DSN-03 formatClock con NaN, negativos e infinitos no lanza ni pinta NaN', () => {
    expect([formatClock(NaN), formatClock(-3), formatClock(-Infinity)]).toEqual(['0:00', '0:00', '0:00'])
  })

  it('FE-DSN-03 formatDayLabel: "2026-10-06" -> "06 OCT"', () => {
    expect([formatDayLabel('2026-10-06'), formatDayLabel('2026-01-31'), formatDayLabel('2026-12-01')]).toEqual(['06 OCT', '31 ENE', '01 DIC'])
  })
})
