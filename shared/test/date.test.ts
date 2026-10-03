// Contrato: shared/date.ts exporta
//   madridDate(instant: Date | number): string        -> 'YYYY-MM-DD' en Europe/Madrid
//   addDays(date: string, n: number): string          -> aritmetica de calendario (sin horas)
//   diffDays(from: string, to: string): number        -> to - from en dias de calendario
// Los vectores son literales del plan (calculados de forma independiente), no se
// recalculan con la funcion bajo test.
import { describe, it, expect, afterEach } from 'vitest'
import { madridDate, addDays, diffDays } from '../date'

const VECTORS: Array<[string, string, string]> = [
  // [id, instante UTC, fecha Madrid esperada]
  ['BE-DAY-10 verano', '2026-07-01T22:00:00Z', '2026-07-02'],
  ['BE-DAY-10 verano -1s', '2026-07-01T21:59:59Z', '2026-07-01'],
  ['BE-DAY-11 invierno', '2026-12-01T23:00:00Z', '2026-12-02'],
  ['BE-DAY-11 invierno -1s', '2026-12-01T22:59:59Z', '2026-12-01'],
  ['BE-DAY-12 primavera pre', '2026-03-28T22:59:59Z', '2026-03-28'],
  ['BE-DAY-12 primavera medianoche', '2026-03-28T23:00:00Z', '2026-03-29'],
  ['BE-DAY-12 primavera fin dia 23h -1s', '2026-03-29T21:59:59Z', '2026-03-29'],
  ['BE-DAY-12 primavera dia siguiente', '2026-03-29T22:00:00Z', '2026-03-30'],
  ['BE-DAY-13 otono pre', '2026-10-24T21:59:59Z', '2026-10-24'],
  ['BE-DAY-13 otono medianoche', '2026-10-24T22:00:00Z', '2026-10-25'],
  ['BE-DAY-13 otono fin dia 25h -1s', '2026-10-25T22:59:59Z', '2026-10-25'],
  ['BE-DAY-13 otono dia siguiente', '2026-10-25T23:00:00Z', '2026-10-26'],
  ['BE-DAY-14 fin de ano', '2026-12-31T23:00:00Z', '2027-01-01'],
]

describe('shared/date madridDate', () => {
  for (const [id, iso, expected] of VECTORS) {
    it(`SH-DAT-01 ${id}: ${iso} -> ${expected}`, () => {
      expect(madridDate(new Date(iso))).toBe(expected)
    })
  }

  it('SH-DAT-01 acepta epoch en ms igual que Date', () => {
    const t = Date.parse('2026-07-01T22:00:00Z')
    expect(madridDate(t)).toBe(madridDate(new Date(t)))
  })

  it('SH-DAT-01 formato con ceros YYYY-MM-DD', () => {
    expect(madridDate(new Date('2026-01-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(madridDate(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05')
  })
})

describe('shared/date independencia de la zona del proceso (SH-DAT-02, BE-DAY-15)', () => {
  const original = process.env.TZ
  afterEach(() => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  })

  for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    it(`devuelve la fecha Madrid con TZ=${tz}`, () => {
      process.env.TZ = tz
      expect(madridDate(new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02')
      expect(madridDate(new Date('2026-12-01T22:59:59Z'))).toBe('2026-12-01')
    })
  }
})

describe('shared/date aritmetica de fechas (SH-DAT-03)', () => {
  it('addDays +1 normal', () => {
    expect(addDays('2026-07-01', 1)).toBe('2026-07-02')
  })

  it('addDays cruza fin de mes', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('addDays cruza fin de ano', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('addDays -1 cruza inicio de ano', () => {
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('addDays en ano bisiesto (2028-02-28 -> 02-29 -> 03-01)', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('addDays a traves del cambio de hora de primavera (03-28 -> 03-29 -> 03-30)', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
  })

  it('addDays a traves del cambio de hora de otono (10-24 -> 10-25 -> 10-26)', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('addDays 0 devuelve la misma fecha', () => {
    expect(addDays('2026-10-25', 0)).toBe('2026-10-25')
  })

  it('diffDays 1 en dias de 23 h (cambio de primavera)', () => {
    expect(diffDays('2026-03-28', '2026-03-29')).toBe(1)
    expect(diffDays('2026-03-29', '2026-03-30')).toBe(1)
  })

  it('diffDays 1 en dias de 25 h (cambio de otono)', () => {
    expect(diffDays('2026-10-24', '2026-10-25')).toBe(1)
    expect(diffDays('2026-10-25', '2026-10-26')).toBe(1)
  })

  it('diffDays a traves de fin de mes y de ano', () => {
    expect(diffDays('2026-01-31', '2026-02-01')).toBe(1)
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('diffDays de un ano completo (365 y 366 en bisiesto)', () => {
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365)
    expect(diffDays('2028-01-01', '2029-01-01')).toBe(366)
  })

  it('diffDays es negativo si to < from y 0 si son iguales', () => {
    expect(diffDays('2026-07-02', '2026-07-01')).toBe(-1)
    expect(diffDays('2026-07-01', '2026-07-01')).toBe(0)
  })

  it('diffDays es entero (sin residuos de horas)', () => {
    expect(Number.isInteger(diffDays('2026-03-01', '2026-11-01'))).toBe(true)
  })
})
