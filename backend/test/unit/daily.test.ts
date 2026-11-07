// game/daily.selectDaily(songs, games, seed, date) -> Song   (DEC-09 v2, DEC-54)
//   h = HMAC-SHA256(seed, "daily|v2|"+fecha); grupo = h.readUIntBE(0,6) % nGrupos; cancion = h.readUIntBE(6,6) % nCancionesDelGrupo.
//   BE-DAY-17 (365 dias cubren todas las canciones) esta RETIRADO: lo sustituyen BE-SEL-03..05 (selection.test.ts).
import { describe, it, expect } from 'vitest'
import { selectDaily } from '../../src/game/daily'
import { catalogR, catalogM, dailyTargetV1, dailyVectorV2, dateRange, enabledSorted, groupedCatalog, ids } from '../helpers/fixtures'

const SEED = 'unit-seed-A'
const pick = (c: any, date: string, seed = SEED) => selectDaily(c.songs, c.games, seed, date)
const shuffle = <T,>(list: T[], seed = 7): T[] => {
  const out = [...list]
  let a = seed
  for (let i = out.length - 1; i > 0; i--) {
    a = (a * 1103515245 + 12345) & 0x7fffffff
    const j = a % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const THREE = () => groupedCatalog([{ id: 'g1', songs: 1 }, { id: 'g2', songs: 5 }, { id: 'g3', songs: 40 }])

describe('game/daily selectDaily', () => {
  it('BE-DAY-01 misma semilla y fecha: siempre la misma cancion (50 llamadas)', () => {
    const c = THREE()
    const first = pick(c, '2026-10-03').id
    for (let i = 0; i < 50; i++) expect(pick(c, '2026-10-03').id).toBe(first)
  })

  it('BE-DAY-01 la firma no admite filtro: (songs, games, seed, date)', () => {
    expect(selectDaily.length).toBe(4)
  })

  it('BE-DAY-03 la seleccion usa canciones enabled agrupadas: en 120 fechas salen los 3 grupos y nunca una deshabilitada', () => {
    const c = groupedCatalog([{ id: 'g1', songs: 3, off: 4 }, { id: 'g2', songs: 3, off: 2 }, { id: 'g3', songs: 2, off: 5 }])
    const seen = new Set<string>()
    for (const d of dateRange(120)) {
      const s = pick(c, d)
      expect(s.enabled).toBe(true)
      seen.add(s.games[0])
    }
    expect([...seen].sort()).toEqual(['g1', 'g2', 'g3'])
  })

  it('BE-DAY-04 semillas distintas dan selecciones distintas en alguna de 30 fechas', () => {
    const c = THREE()
    expect(dateRange(30).some((d) => pick(c, d, 'seed-1').id !== pick(c, d, 'seed-2').id)).toBe(true)
  })

  it('BE-DAY-05 coincide con el vector independiente "daily|v2|": bytes 0-5 -> grupo, bytes 6-11 -> cancion (grupos de 1, 5 y 40)', () => {
    const c = THREE()
    for (const d of dateRange(60, '2026-10-01')) expect(pick(c, d).id, d).toBe(dailyVectorV2(c, SEED, d).song.id)
  })

  it('BE-DAY-05 el vector con v1 NO coincide en al menos una fecha (la etiqueta cambio a v2)', () => {
    const c = THREE()
    expect(dateRange(30).some((d) => pick(c, d).id !== dailyTargetV1(c, SEED, d).id)).toBe(true)
  })

  it('BE-DAY-05 catalogo R: coincide con el vector (4 juegos, cada uno su grupo)', () => {
    const c = catalogR()
    for (const d of ['2026-10-03', '2026-12-31', '2027-02-28']) expect(selectDaily(c.songs as any, c.games as any, SEED, d).id).toBe(dailyVectorV2(c as any, SEED, d).song.id)
  })

  it('BE-DAY-06 barajar songs no cambia el resultado', () => {
    const c = THREE()
    const shuffled = shuffle(c.songs)
    for (const d of dateRange(30)) expect(selectDaily(shuffled, c.games, SEED, d).id).toBe(pick(c, d).id)
  })

  it('BE-DAY-06 [MOD] los grupos se ordenan por id: reordenar games NO cambia la seleccion y sigue el vector', () => {
    const c = THREE()
    const reordered = { ...c, games: [c.games[2], c.games[0], c.games[1]] }
    for (const d of dateRange(60)) {
      expect(pick(reordered, d).id, d).toBe(dailyVectorV2(reordered, SEED, d).song.id)
      expect(pick(reordered, d).id, d).toBe(pick(c, d).id)
    }
  })

  it('BE-DAY-07 un solo juego con una sola cancion activa: siempre esa, sin dividir por cero', () => {
    const only = catalogM()
    for (const d of dateRange(10)) expect(selectDaily(only.songs as any, only.games as any, SEED, d).id).toBe('mono-song-only1')
  })

  it('BE-DAY-07 una activa entre varias deshabilitadas y varios juegos: siempre la activa', () => {
    const c = catalogR()
    const songs = c.songs.map((s) => ({ ...s, enabled: s.id === 'c-only-song-05' }))
    for (const d of dateRange(10)) expect(selectDaily(songs as any, c.games as any, SEED, d).id).toBe('c-only-song-05')
  })

  it('sin canciones activas lanza (no hay seleccion posible)', () => {
    const c = groupedCatalog([{ id: 'g1', songs: 0, off: 2 }])
    expect(() => pick(c, '2026-01-01')).toThrow()
  })

  it('sanidad del fixture: canciones enabled de catalogR en orden de id', () => {
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

describe('game/daily selectDaily por serie (DEC-60)', () => {
  const withSpinoffs = () => {
    const c: any = THREE()
    const extra: any = groupedCatalog([{ id: 'md1', songs: 4 }, { id: 'md2', songs: 2, group: 'md1' }, { id: 'xd', songs: 3 }])
    for (const g of extra.games) c.games.push({ ...g, series: 'spinoff' })
    // clipKeys distintos de los de THREE
    for (const s of extra.songs) c.songs.push({ ...s, clipKey: `f${s.clipKey.slice(1)}` })
    return c
  }

  it('BE-DAY-23 anadir juegos spin-off no cambia la cancion del dia principal (60 fechas)', () => {
    const base = THREE()
    const mixed = withSpinoffs()
    for (const d of dateRange(60)) expect(selectDaily(mixed.songs, mixed.games, SEED, d, 'main').id).toBe(pick(base, d).id)
  })

  it('BE-DAY-24 el diario spin-off solo elige canciones de juegos spin-off, con la etiqueta daily-spinoff|v1|', () => {
    const mixed = withSpinoffs()
    const spinoffOnly = { ...mixed, games: mixed.games.filter((g: any) => g.series === 'spinoff').map(({ series, ...g }: any) => g) }
    for (const d of dateRange(60)) {
      const song = selectDaily(mixed.songs, mixed.games, SEED, d, 'spinoff')
      expect(['md1', 'md2', 'xd']).toContain(song.games[0])
      const groups = new Map<string, any[]>()
      for (const g of spinoffOnly.games) groups.set(g.selectionGroup ?? g.id, [])
      for (const s of [...mixed.songs].filter((s: any) => s.enabled).sort((a: any, b: any) => (a.id < b.id ? -1 : 1))) {
        const g = spinoffOnly.games.find((x: any) => x.id === s.games[0])
        if (g) groups.get(g.selectionGroup ?? g.id)!.push(s)
      }
      const ordered = [...groups].filter(([, l]) => l.length).sort(([a], [b]) => (a < b ? -1 : 1))
      const mac = require('node:crypto').createHmac('sha256', SEED).update(`daily-spinoff|v1|${d}`).digest()
      const [, list] = ordered[mac.readUIntBE(0, 6) % ordered.length]
      expect(song.id).toBe(list[mac.readUIntBE(6, 6) % list.length].id)
    }
  })

  it('BE-DAY-25 sin canciones spin-off el diario spin-off es EMPTY_FILTER', () => {
    expect(() => selectDaily(THREE().songs as any, THREE().games as any, SEED, '2026-11-07', 'spinoff')).toThrow(expect.objectContaining({ code: 'EMPTY_FILTER' }))
  })
})
