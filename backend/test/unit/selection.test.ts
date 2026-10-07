// BE-SEL-*: seleccion equiprobable por grupo (DEC-54), diario (v2, determinista) y libre (randomInt inyectado).
// Contrato: catalog/index.ts exporta
//   indexCatalog(catalog)                       (ahora tambien con games en orden y selectionGroup)
//   buildGroups(index, gameIds): Array<{ id: string; songs: Song[] }>   grupos con algun juego filtrado y canciones activas
//   selectUnlimited(index, gameIds, randomInt?): Song   = randomInt(nGrupos) y despues randomInt(nCanciones del grupo elegido)
// Los muestreos usan semilla fija y fechas generadas: nunca Math.random.
import { describe, it, expect } from 'vitest'
import { indexCatalog, buildGroups, selectUnlimited } from '../../src/catalog'
import { selectDaily } from '../../src/game/daily'
import { dateRange, groupedCatalog, referenceGroups, seededRandomInt, dailyVectorV2, dailyTargetV1, type AnyCatalog } from '../helpers/fixtures'
import { thrown } from '../helpers/errors'

const SEED = 'sel-seed-2026'
const daily = (c: AnyCatalog, date: string, seed = SEED) => selectDaily(c.songs as any, c.games as any, seed, date)
const idx = (c: AnyCatalog) => indexCatalog(c as any)
const share = (counts: Map<string, number>, key: string, total: number) => (counts.get(key) ?? 0) / total
const tally = (values: string[]) => values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())
const groupOfSong = (c: AnyCatalog, songId: string) => {
  const song = c.songs.find((s) => s.id === songId)!
  const game = c.games.find((g) => g.id === song.games[0])!
  return game.selectionGroup ?? game.id
}

const UNEVEN = () => groupedCatalog([{ id: 'one', songs: 1 }, { id: 'ten', songs: 10 }, { id: 'hundred', songs: 100 }])
const DATES = dateRange(3000)

describe('BE-SEL diario v2', () => {
  it('BE-SEL-01 misma fecha y semilla -> misma cancion, tambien tras barajar songs y reconstruir', () => {
    const c = UNEVEN()
    const shuffled = { ...c, songs: [...c.songs].reverse() }
    for (const d of dateRange(40)) expect(daily(shuffled, d).id).toBe(daily(c, d).id)
  })

  it('BE-SEL-02 v2 difiere de v1 en al menos el 50 % de 365 fechas (3 grupos desiguales)', () => {
    const c = UNEVEN()
    const dates = dateRange(365, '2026-01-01')
    const different = dates.filter((d) => daily(c, d).id !== dailyTargetV1(c, SEED, d).id).length
    expect(different).toBeGreaterThanOrEqual(dates.length * 0.5)
  })

  it('BE-SEL-02 el codigo de produccion no usa la etiqueta daily|v1| (solo v2)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const text = readFileSync(join(__dirname, '..', '..', 'src', 'game', 'daily.ts'), 'utf8')
    expect(text).toContain('daily|v2|')
    expect(text).not.toContain('daily|v1|')
  })

  it('BE-SEL-03 diario uniforme por grupo: grupos de 1, 10 y 100 canciones en 3000 fechas -> cada grupo 33,3 % +- 3 puntos', () => {
    const c = UNEVEN()
    const counts = tally(DATES.map((d) => groupOfSong(c, daily(c, d).id)))
    for (const g of ['one', 'ten', 'hundred']) expect(Math.abs(share(counts, g, DATES.length) - 1 / 3), g).toBeLessThan(0.03)
  })

  it('BE-SEL-03 el muestreo del test coincide con el vector independiente (valida la propia prueba)', () => {
    const c = UNEVEN()
    for (const d of DATES.slice(0, 200)) expect(daily(c, d).id).toBe(dailyVectorV2(c, SEED, d).song.id)
  })

  it('BE-SEL-04 dentro de un grupo de 10 canciones la cancion es uniforme: cada una 10 % +- 3 y ninguna con 0', () => {
    const c = UNEVEN()
    const inTen = DATES.map((d) => daily(c, d)).filter((s) => s.games[0] === 'ten')
    expect(inTen.length).toBeGreaterThanOrEqual(900)
    const counts = tally(inTen.map((s) => s.id))
    expect(counts.size).toBe(10)
    for (const [id, n] of counts) expect(Math.abs(n / inTen.length - 0.1), id).toBeLessThan(0.03)
  })

  it('BE-SEL-05 probabilidad 1/(grupos x canciones): una cancion del grupo de 1 ~ 1/3 y de la del grupo de 100 ~ 1/300', () => {
    const c = UNEVEN()
    const counts = tally(DATES.map((d) => daily(c, d).id))
    expect(Math.abs((counts.get('one-s00') ?? 0) / DATES.length - 1 / 3)).toBeLessThan(0.03)
    const hundred = [...counts].filter(([id]) => id.startsWith('hundred-'))
    const mean = hundred.reduce((a, [, n]) => a + n, 0) / 100 / DATES.length
    expect(Math.abs(mean - 1 / 300)).toBeLessThan(0.0015)
  })

  it('BE-SEL-06 un grupo sin canciones activas nunca sale y no cuenta en nGrupos', () => {
    const c = groupedCatalog([{ id: 'vacio', songs: 0, off: 5 }, { id: 'a', songs: 2 }, { id: 'b', songs: 2 }])
    for (const d of dateRange(200)) expect(daily(c, d).games[0]).not.toBe('vacio')
    const groups = referenceGroups(c)
    expect(groups.length).toBe(2)
    for (const d of dateRange(40)) expect(daily(c, d).id).toBe(dailyVectorV2(c, SEED, d).song.id)
  })

  it('BE-SEL-07 activar o desactivar una cancion cambia el tamano del grupo; desactivar todas reduce nGrupos (sigue el vector)', () => {
    const before = groupedCatalog([{ id: 'a', songs: 3 }, { id: 'b', songs: 3 }])
    const after = { ...before, songs: before.songs.map((s) => (s.games[0] === 'b' ? { ...s, enabled: false } : s)) }
    for (const d of dateRange(30)) {
      expect(daily(before, d).id).toBe(dailyVectorV2(before, SEED, d).song.id)
      expect(daily(after, d).id).toBe(dailyVectorV2(after, SEED, d).song.id)
      expect(daily(after, d).games[0]).toBe('a')
    }
  })

  it('BE-SEL-08 un grupo de dos juegos pesa como uno: {BW+B2W2 con 30+10, X con 5} -> BW+B2W2 ~ 50 %, X ~ 50 %, dentro cada cancion ~ 1/40', () => {
    const c = groupedCatalog([{ id: 'bw', songs: 30 }, { id: 'b2w2', group: 'bw', songs: 10 }, { id: 'x', songs: 5 }])
    const picks = DATES.map((d) => daily(c, d))
    const bwGroup = picks.filter((s) => s.games[0] !== 'x')
    expect(Math.abs(bwGroup.length / DATES.length - 0.5)).toBeLessThan(0.03)
    const counts = tally(bwGroup.map((s) => s.id))
    expect(counts.size).toBe(40)
    for (const [id, n] of counts) expect(Math.abs(n / bwGroup.length - 1 / 40), id).toBeLessThan(0.025)
  })

  it('BE-SEL-09 grupo de dos juegos con uno sin activas: aporta solo las del otro y pesa uno', () => {
    const c = groupedCatalog([{ id: 'bw', songs: 4 }, { id: 'b2w2', group: 'bw', songs: 0, off: 3 }, { id: 'x', songs: 4 }])
    const picks = dateRange(400).map((d) => daily(c, d))
    expect(picks.every((s) => s.games[0] !== 'b2w2')).toBe(true)
    const bwShare = picks.filter((s) => s.games[0] === 'bw').length / picks.length
    expect(Math.abs(bwShare - 0.5)).toBeLessThan(0.07)
  })

  it('BE-SEL-09 el juego cabeza sin activas y el miembro con activas: el grupo sigue pesando uno', () => {
    const c = groupedCatalog([{ id: 'bw', songs: 0, off: 4 }, { id: 'b2w2', group: 'bw', songs: 4 }, { id: 'x', songs: 4 }])
    const picks = dateRange(400).map((d) => daily(c, d))
    expect(picks.some((s) => s.games[0] === 'b2w2')).toBe(true)
    expect(Math.abs(picks.filter((s) => s.games[0] === 'b2w2').length / picks.length - 0.5)).toBeLessThan(0.07)
  })

  it('BE-SEL-09 sin activas en ninguno de los dos juegos del grupo: el grupo desaparece', () => {
    const c = groupedCatalog([{ id: 'bw', songs: 0, off: 2 }, { id: 'b2w2', group: 'bw', songs: 0, off: 2 }, { id: 'x', songs: 3 }])
    for (const d of dateRange(60)) expect(daily(c, d).games[0]).toBe('x')
  })

  it('BE-SEL-10 sin selectionGroup cada juego es su propio grupo (equivale a selectionGroup = su id)', () => {
    const plain = groupedCatalog([{ id: 'a', songs: 3 }, { id: 'b', songs: 7 }])
    const explicit = { ...plain, games: plain.games.map((g) => ({ ...g, selectionGroup: g.id })) }
    for (const d of dateRange(60)) expect(daily(explicit, d).id).toBe(daily(plain, d).id)
  })

  it('BE-SEL-11 [MOD] orden de grupos por id del grupo, no por su posicion en games: games [X, B2W2 (grupo BW), BW] -> BW en 0, X en 1', () => {
    const c = groupedCatalog([{ id: 'x', songs: 2 }, { id: 'b2w2', group: 'bw', songs: 2 }, { id: 'bw', songs: 2 }])
    expect(referenceGroups(c).map((g) => g.id)).toEqual(['bw', 'x'])
    for (const d of dateRange(40)) expect(daily(c, d).id).toBe(dailyVectorV2(c, SEED, d).song.id)
    const reordered = { ...c, games: [...c.games].reverse() }
    for (const d of dateRange(40)) expect(daily(reordered, d).id).toBe(daily(c, d).id)
  })

  it('BE-SEL-12 un solo grupo con varias canciones, y un solo juego con una cancion', () => {
    const many = groupedCatalog([{ id: 'a', songs: 6 }])
    const one = groupedCatalog([{ id: 'a', songs: 1 }])
    expect(new Set(dateRange(120).map((d) => daily(many, d).id)).size).toBe(6)
    expect(new Set(dateRange(20).map((d) => daily(one, d).id))).toEqual(new Set(['a-s00']))
  })
})

describe('BE-SEL libre (randomInt inyectado)', () => {
  const calls = () => {
    const log: number[] = []
    return { log, fn: (max: number) => (log.push(max), 0) }
  }

  it('BE-DAY-18 randomInt(nGrupos) y despues randomInt(nCanciones del grupo); nunca randomInt(0)', () => {
    const c = groupedCatalog([{ id: 'a', songs: 3 }, { id: 'b', songs: 5 }])
    const { log, fn } = calls()
    selectUnlimited(idx(c), ['a', 'b'], fn)
    expect(log).toEqual([2, 3]) // el grupo 0 (a) tiene 3 canciones
    expect(log.every((n) => n > 0)).toBe(true)
  })

  it('BE-DAY-18 el segundo sorteo usa el tamano del grupo elegido (grupo 1 -> 5 canciones)', () => {
    const c = groupedCatalog([{ id: 'a', songs: 3 }, { id: 'b', songs: 5 }])
    const log: number[] = []
    const song = selectUnlimited(idx(c), ['a', 'b'], (max) => (log.push(max), log.length === 1 ? 1 : 4))
    expect([log, song.id]).toEqual([[2, 5], 'b-s04'])
  })

  it('BE-SEL-13 solo cuentan grupos con juegos filtrados: filtro {SM} con grupo SM+USUM -> solo SM, y el grupo pesa 1', () => {
    const c = groupedCatalog([{ id: 'sm', songs: 3 }, { id: 'usum', group: 'sm', songs: 9 }, { id: 'x', songs: 2 }])
    const groups = buildGroups(idx(c), ['sm'])
    expect(groups.map((g) => g.id)).toEqual(['sm'])
    expect(groups[0].songs.map((s) => s.games[0])).toEqual(['sm', 'sm', 'sm'])
  })

  it('BE-CAT-01 filtro {B2W2} con grupo BW+B2W2 -> el grupo cuenta y solo aporta canciones de B2W2', () => {
    const c = groupedCatalog([{ id: 'bw', songs: 4 }, { id: 'b2w2', group: 'bw', songs: 2 }, { id: 'x', songs: 3 }])
    const groups = buildGroups(idx(c), ['b2w2'])
    expect(groups.length).toBe(1)
    expect(groups[0].songs.map((s) => s.id)).toEqual(['b2w2-s00', 'b2w2-s01'])
  })

  it('BE-CAT-01 filtro con los dos juegos del grupo: las canciones de ambos van en el mismo grupo ordenadas por id', () => {
    const c = groupedCatalog([{ id: 'bw', songs: 2 }, { id: 'b2w2', group: 'bw', songs: 2 }])
    const [g] = buildGroups(idx(c), ['bw', 'b2w2'])
    expect(g.songs.map((s) => s.id)).toEqual(['b2w2-s00', 'b2w2-s01', 'bw-s00', 'bw-s01'])
  })

  it('BE-CAT-01 grupos ordenados por la primera aparicion en games', () => {
    const c = groupedCatalog([{ id: 'b2w2', group: 'bw', songs: 1 }, { id: 'x', songs: 1 }, { id: 'bw', songs: 1 }])
    expect(buildGroups(idx(c), ['x', 'bw', 'b2w2']).map((g) => g.id)).toEqual(['bw', 'x'])
  })

  it('BE-SEL-14 libre con filtro de un juego: cancion uniforme entre las suyas (randomInt(1) o se omite, nunca randomInt(0))', () => {
    const c = groupedCatalog([{ id: 'a', songs: 4 }, { id: 'b', songs: 4 }])
    const log: number[] = []
    const song = selectUnlimited(idx(c), ['a'], (max) => (log.push(max), max - 1))
    expect(song.id).toBe('a-s03')
    expect(log.every((n) => n >= 1)).toBe(true)
    expect(log.at(-1)).toBe(4)
  })

  it('BE-SEL-15 libre con dos grupos desiguales: 3000 sorteos con generador con semilla -> A ~ 50 %, B ~ 50 % (+- 3)', () => {
    const c = groupedCatalog([{ id: 'a', songs: 1 }, { id: 'b', songs: 50 }])
    const index = idx(c)
    const rnd = seededRandomInt(20261004)
    const counts = tally(Array.from({ length: 3000 }, () => selectUnlimited(index, ['a', 'b'], rnd).games[0]))
    expect(Math.abs(share(counts, 'a', 3000) - 0.5)).toBeLessThan(0.03)
    expect(Math.abs(share(counts, 'b', 3000) - 0.5)).toBeLessThan(0.03)
  })

  it('BE-SEL-16 recorrer todos los pares (g,s) de randomInt devuelve cada candidata exactamente una vez', () => {
    const c = groupedCatalog([{ id: 'a', songs: 3 }, { id: 'b', group: 'a', songs: 2 }, { id: 'x', songs: 4 }])
    const index = idx(c)
    const groups = referenceGroups(c, ['a', 'b', 'x'])
    const seen: string[] = []
    for (let g = 0; g < groups.length; g++)
      for (let s = 0; s < groups[g].songs.length; s++) {
        let step = 0
        seen.push(selectUnlimited(index, ['a', 'b', 'x'], () => (step++ === 0 ? g : s)).id)
      }
    expect(seen.sort()).toEqual(groups.flatMap((g) => g.songs.map((s) => s.id)).sort())
    expect(new Set(seen).size).toBe(groups.reduce((n, g) => n + g.songs.length, 0))
  })

  it('selectUnlimited con filtro vacio -> EMPTY_FILTER; juego inexistente -> UNKNOWN_GAME', () => {
    const c = groupedCatalog([{ id: 'a', songs: 2 }])
    expect(thrown(() => selectUnlimited(idx(c), [], () => 0))?.code).toBe('EMPTY_FILTER')
    expect(thrown(() => selectUnlimited(idx(c), ['zz'], () => 0))?.code).toBe('UNKNOWN_GAME')
  })

  it('juegos filtrados sin activas se ignoran; si ninguno tiene activas -> EMPTY_FILTER', () => {
    const c = groupedCatalog([{ id: 'a', songs: 2 }, { id: 'off', songs: 0, off: 3 }])
    expect(buildGroups(idx(c), ['a', 'off']).map((g) => g.id)).toEqual(['a'])
    expect(thrown(() => selectUnlimited(idx(c), ['off'], () => 0))?.code).toBe('EMPTY_FILTER')
  })

  it('BE-SEL-22 selectionGroup hacia un juego inexistente (catalogo que se salta el validador): sin grupo nuevo (el grupo cuenta como inexistente)', () => {
    const c = groupedCatalog([{ id: 'a', songs: 2 }, { id: 'b', group: 'fantasma', songs: 2 }])
    expect(() => indexCatalog(c as any)).not.toThrow()
    const groups = buildGroups(idx(c), ['a', 'b'])
    // no se crea "fantasma" como grupo: el juego b queda en su propio grupo o se descarta, pero nunca aparece un grupo "fantasma"
    expect(groups.map((g) => g.id)).not.toContain('fantasma')
  })
})
