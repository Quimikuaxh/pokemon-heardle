import { describe, it, expect, afterEach } from 'vitest'
import { emptyDailyStats, recordDaily, emptyUnlimitedStats, recordUnlimited } from '../game/stats'

const run = (dates: string[], outcome: number | null = 3) => dates.reduce((s, d) => recordDaily(s, d, outcome), emptyDailyStats())

describe('game/stats diario (una sola racha y una sola distribucion)', () => {
  it('estado inicial vacio: racha 0, distribucion a 0 para 1..6 y X', () => {
    const s = emptyDailyStats()
    expect([s.current, s.max, s.played, s.lastDate]).toEqual([0, 0, 0, null])
    expect(Object.keys(s.distribution).sort()).toEqual(['1', '2', '3', '4', '5', '6', 'X'])
    expect(Object.values(s.distribution).every((v) => v === 0)).toBe(true)
  })

  it('FE-STA-01 primera victoria diaria: racha 1 y distribucion[intento]++', () => {
    const s = recordDaily(emptyDailyStats(), '2026-10-03', 3)
    expect([s.current, s.max, s.played, s.distribution['3'], s.lastDate]).toEqual([1, 1, 1, 1, '2026-10-03'])
  })

  it('FE-STA-02 dias consecutivos incrementan la racha y actualizan la maxima', () => {
    const s = run(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect([s.current, s.max]).toEqual([3, 3])
  })

  it('FE-STA-03 saltar un dia rompe la racha y conserva la maxima', () => {
    const s = run(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'])
    expect([s.current, s.max]).toEqual([1, 3])
  })

  it('FE-STA-04 una derrota (null) rompe la racha y suma en X', () => {
    const s = recordDaily(run(['2026-10-01', '2026-10-02']), '2026-10-03', null)
    expect([s.current, s.max, s.distribution.X, s.played]).toEqual([0, 2, 1, 3])
  })

  it('FE-STA-04 una victoria tras una derrota empieza racha 1', () => {
    const s = recordDaily(recordDaily(run(['2026-10-01']), '2026-10-02', null), '2026-10-03', 2)
    expect(s.current).toBe(1)
  })

  describe('FE-STA-05 consecutividad por fecha (Madrid), no por reloj local', () => {
    const original = process.env.TZ
    afterEach(() => {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    })
    for (const tz of ['Asia/Tokyo', 'America/Los_Angeles', 'UTC']) {
      it(`TZ=${tz}: 2026-03-28 -> 2026-03-29 es racha 2`, () => {
        process.env.TZ = tz
        expect(run(['2026-03-28', '2026-03-29']).current).toBe(2)
      })
    }
  })

  for (const [label, dates] of [
    ['cambio de hora de primavera (23 h)', ['2026-03-28', '2026-03-29', '2026-03-30']],
    ['cambio de hora de otono (25 h)', ['2026-10-24', '2026-10-25', '2026-10-26']],
    ['fin de mes', ['2026-01-30', '2026-01-31', '2026-02-01']],
    ['fin de ano', ['2026-12-30', '2026-12-31', '2027-01-01']],
    ['ano bisiesto', ['2028-02-28', '2028-02-29', '2028-03-01']],
  ] as Array<[string, string[]]>) {
    it(`FE-STA-06 la racha continua a traves de ${label}`, () => {
      expect(run(dates).current).toBe(3)
    })
  }

  it('FE-STA-07 registrar la misma fecha dos veces (recarga) es idempotente', () => {
    const once = recordDaily(emptyDailyStats(), '2026-10-03', 3)
    const twice = recordDaily(once, '2026-10-03', 3)
    expect(twice).toEqual(once)
  })

  it('FE-STA-07 idempotente tambien para derrotas', () => {
    const once = recordDaily(emptyDailyStats(), '2026-10-03', null)
    expect(recordDaily(once, '2026-10-03', null)).toEqual(once)
  })

  it('no muta el estado recibido', () => {
    const s = emptyDailyStats()
    const snap = JSON.stringify(s)
    recordDaily(s, '2026-10-03', 1)
    expect(JSON.stringify(s)).toBe(snap)
  })

  it('FE-STA-01 victorias en intentos 1 y 6 caen en los extremos de la distribucion', () => {
    const s = recordDaily(recordDaily(emptyDailyStats(), '2026-10-01', 1), '2026-10-02', 6)
    expect([s.distribution['1'], s.distribution['6']]).toEqual([1, 1])
  })
})

describe('game/stats ilimitado (sin racha)', () => {
  it('FE-STA-08 estado inicial sin campos de racha', () => {
    const s: any = emptyUnlimitedStats()
    expect(['current' in s, 'max' in s, 'lastDate' in s]).toEqual([false, false, false])
  })

  it('FE-STA-08 acumula distribucion y partidas', () => {
    const s: any = recordUnlimited(recordUnlimited(emptyUnlimitedStats(), 2), null)
    expect([s.played, s.distribution['2'], s.distribution.X]).toEqual([2, 1, 1])
  })

  it('FE-STA-08 varias partidas el mismo dia se cuentan todas (no es idempotente por fecha)', () => {
    const s: any = [1, 1, 1].reduce((acc: any, n) => recordUnlimited(acc, n), emptyUnlimitedStats())
    expect(s.distribution['1']).toBe(3)
  })
})
