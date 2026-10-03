import { describe, it, expect } from 'vitest'
import { selectDaily } from '../../src/game/daily'
import { catalogR, catalogM, dailyIndexVector, enabledSorted, ids } from '../helpers/fixtures'

const SEED = 'unit-seed-A'
const dates = (n: number, start = '2026-01-01') => {
  const out: string[] = []
  const d = new Date(start + 'T00:00:00Z')
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

function bigCatalog(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `song-${String(i).padStart(3, '0')}`,
    title: `T${i}`,
    games: [i % 2 ? 'A' : 'B'],
    clipKey: i.toString(16).padStart(16, '0'),
    startSec: 0,
    enabled: true,
    reviewed: true,
    source: { youtubeId: 'x', videoTitle: 'x' },
  }))
}

describe('game/daily selectDaily', () => {
  it('BE-DAY-01 misma semilla y fecha: siempre la misma cancion (50 llamadas)', () => {
    const songs = bigCatalog(20)
    const first = selectDaily(songs, SEED, '2026-10-03').id
    for (let i = 0; i < 50; i++) expect(selectDaily(songs, SEED, '2026-10-03').id).toBe(first)
  })

  it('BE-DAY-01 la firma no admite filtro: exactamente 3 parametros (songs, seed, date)', () => {
    expect(selectDaily.length).toBe(3)
  })

  it('BE-DAY-03 a lo largo de 60 fechas salen canciones de mas de un juego', () => {
    const c = catalogR()
    const games = new Set<string>()
    for (const d of dates(60)) selectDaily(c.songs, SEED, d).games.forEach((g) => games.add(g))
    expect(games.size).toBeGreaterThan(1)
  })

  it('BE-DAY-03 las canciones enabled:false nunca salen (365 fechas)', () => {
    const c = catalogR()
    for (const d of dates(365)) expect(selectDaily(c.songs, SEED, d).enabled).toBe(true)
  })

  it('BE-DAY-04 semillas distintas dan selecciones distintas en alguna de 30 fechas', () => {
    const songs = bigCatalog(20)
    const diff = dates(30).some((d) => selectDaily(songs, 'seed-1', d).id !== selectDaily(songs, 'seed-2', d).id)
    expect(diff).toBe(true)
  })

  it('BE-DAY-05 coincide con el vector independiente HMAC-SHA256(seed, "daily|v1|"+fecha) uint48 mod n', () => {
    const c = catalogR()
    const list = enabledSorted(c)
    for (const d of ['2026-10-03', '2026-12-31', '2027-02-28']) {
      const expected = list[dailyIndexVector(SEED, d, list.length)].id
      expect(selectDaily(c.songs, SEED, d).id).toBe(expected)
    }
  })

  it('BE-DAY-05 con 20 canciones el vector tambien coincide', () => {
    const songs = bigCatalog(20)
    for (const d of dates(10)) {
      expect(selectDaily(songs, SEED, d).id).toBe(songs[dailyIndexVector(SEED, d, 20)].id)
    }
  })

  it('BE-DAY-06 el resultado no depende del orden de carga del catalogo', () => {
    const c = catalogR()
    const shuffled = [...c.songs].reverse()
    for (const d of dates(30)) expect(selectDaily(shuffled, SEED, d).id).toBe(selectDaily(c.songs, SEED, d).id)
  })

  it('BE-DAY-07 catalogo con 1 sola cancion enabled: siempre esa', () => {
    const only = catalogM().songs
    for (const d of dates(10)) expect(selectDaily(only, SEED, d).id).toBe(only[0].id)
  })

  it('BE-DAY-07 una enabled entre varias deshabilitadas: siempre la enabled', () => {
    const c = catalogR()
    const songs = c.songs.map((s) => ({ ...s, enabled: s.id === 'c-only-song-05' }))
    for (const d of dates(10)) expect(selectDaily(songs, SEED, d).id).toBe('c-only-song-05')
  })

  it('BE-DAY-17 365 dias con catalogo de 10: todas aparecen al menos una vez', () => {
    const songs = bigCatalog(10)
    const seen = new Set(dates(365).map((d) => selectDaily(songs, SEED, d).id))
    expect(seen.size).toBe(10)
  })

  it('BE-DAY-17 sin sesgo grave: ninguna cancion supera el 25% en 365 dias (n=10)', () => {
    const songs = bigCatalog(10)
    const counts = new Map<string, number>()
    for (const d of dates(365)) {
      const id = selectDaily(songs, SEED, d).id
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    expect(Math.max(...counts.values())).toBeLessThan(365 * 0.25)
  })

  it('la lista de ids usada por el vector es la de canciones enabled ordenadas (sanidad del fixture)', () => {
    expect(ids(enabledSorted(catalogR()))).toEqual([
      'a-one-song-01',
      'a-two-song-02',
      'ab-multi-game-song-017',
      'b-one-song-03',
      'b-two-song-04',
      'c-only-song-05',
      'd-only-song-06',
    ])
  })
})
