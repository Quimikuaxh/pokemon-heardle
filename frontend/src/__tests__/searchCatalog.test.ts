// game/search.searchCatalog(catalog, query, gameId | null) -> { games, songs }   (DEC-49)
//   games: juegos cuyo nombre cumple matchesAllWords(query, [name]), en el orden de catalog.games;
//   songs: canciones como searchSongs (todas las palabras en titulo o nombre de su juego), en el orden del catalogo, y con gameId
//          solo las de ese juego; con gameId y texto vacio, todas las del juego. Sin burbuja y texto vacio: nada.
import { describe, it, expect } from 'vitest'
import { searchCatalog } from '../game/search'
import { GAMES, bigCatalog, mkCatalog } from './helpers'

const gameIds = (r: { games: Array<{ id: string }> }) => r.games.map((g) => g.id)
const songIds = (r: { songs: Array<{ id: string }> }) => r.songs.map((s) => s.id)

describe('searchCatalog', () => {
  it('FE-SRC-19 devuelve { games, songs }: juegos en el orden de catalog.games y canciones en el del catalogo', () => {
    const r = searchCatalog(mkCatalog(), 'pokemon', null)
    expect(gameIds(r)).toEqual(['rse', 'dp', 'bw'])
    expect(songIds(r)).toEqual(['rse-littleroot-town', 'rse-oldale-town', 'dp-twinleaf-town', 'dp-cafe-theme', 'bw-castle'])
  })

  it('FE-SRC-19 respeta un orden de games distinto del alfabetico (el de salida)', () => {
    const c = mkCatalog()
    c.games = [GAMES[2], GAMES[0], GAMES[1]]
    expect(gameIds(searchCatalog(c, 'pokemon', null))).toEqual(['bw', 'rse', 'dp'])
  })

  it('FE-SRC-02 [MOD] "ruby": el grupo Juegos lista ese juego y Canciones todas sus canciones', () => {
    const r = searchCatalog(mkCatalog(), 'ruby', null)
    expect(gameIds(r)).toEqual(['rse'])
    expect(songIds(r)).toEqual(['rse-littleroot-town', 'rse-oldale-town'])
  })

  it('FE-SRC-02 una palabra de titulo no devuelve juegos: "town" -> games [] y 3 canciones', () => {
    const r = searchCatalog(mkCatalog(), 'town', null)
    expect([gameIds(r), songIds(r).length]).toEqual([[], 3])
  })

  it('FE-SRC-20 sin burbuja y texto vacio o solo espacios -> { games: [], songs: [] }', () => {
    for (const q of ['', '   ', '\t\n']) expect(searchCatalog(mkCatalog(), q, null)).toEqual({ games: [], songs: [] })
  })

  it('FE-SRC-21 con burbuja y texto vacio: todas las canciones del juego (200)', () => {
    const r = searchCatalog(bigCatalog(200, 'rse'), '', 'rse')
    expect(r.songs.length).toBe(200)
    expect(r.songs.every((s) => s.games[0].id === 'rse')).toBe(true)
  })

  it('FE-SRC-21 con burbuja y solo espacios tambien lista todas las del juego', () => {
    expect(searchCatalog(mkCatalog(), '   ', 'rse').songs.map((s) => s.id)).toEqual(['rse-littleroot-town', 'rse-oldale-town'])
  })

  it('FE-SRC-22 con burbuja y texto: solo canciones de ese juego que cumplen el texto ("town" con Ruby)', () => {
    const r = searchCatalog(mkCatalog(), 'town', 'rse')
    expect(songIds(r)).toEqual(['rse-littleroot-town', 'rse-oldale-town'])
  })

  it('FE-SRC-22 el texto sigue filtrando dentro del juego ("littleroot" con Ruby -> 1)', () => {
    expect(songIds(searchCatalog(mkCatalog(), 'littleroot', 'rse'))).toEqual(['rse-littleroot-town'])
  })

  it('FE-SRC-22 una cancion de otro juego no sale aunque coincida con el texto ("twinleaf" con Ruby)', () => {
    expect(searchCatalog(mkCatalog(), 'twinleaf', 'rse').songs).toEqual([])
  })

  it('FE-SRC-23 con burbuja, el grupo Juegos sigue ofreciendo juegos que coinciden ("diamond" con burbuja Ruby incluye Diamond/Pearl)', () => {
    const r = searchCatalog(mkCatalog(), 'diamond', 'rse')
    expect(gameIds(r)).toContain('dp')
  })

  it('FE-SRC-23 puede ofrecer tambien el propio juego de la burbuja si coincide', () => {
    expect(gameIds(searchCatalog(mkCatalog(), 'ruby', 'rse'))).toContain('rse')
  })

  it('FE-SRC-24 gameId inexistente -> songs [] sin excepcion; gameId nulo funciona', () => {
    expect(() => searchCatalog(mkCatalog(), 'town', 'no-existe')).not.toThrow()
    expect(searchCatalog(mkCatalog(), 'town', 'no-existe').songs).toEqual([])
    expect(searchCatalog(mkCatalog(), '', 'no-existe').songs).toEqual([])
    expect(searchCatalog(mkCatalog(), 'town', null).songs.length).toBe(3)
  })

  it('FE-SRC-24 gameId que son claves del prototipo no rompen', () => {
    for (const id of ['__proto__', 'constructor', 'toString']) expect(searchCatalog(mkCatalog(), '', id).songs).toEqual([])
  })

  it('FE-SRC-25 sin acentos ni mayusculas en Juegos: "POKEMON black" encuentra Pokémon Black / White', () => {
    expect(gameIds(searchCatalog(mkCatalog(), 'POKEMON black', null))).toEqual(['bw'])
  })

  for (const q of ['(', '*', '\\', '[', '.*', '?', '+', '$', '^', '|']) {
    it(`FE-SRC-25 caracter de regex ${JSON.stringify(q)} se trata como texto literal y no lanza`, () => {
      expect(() => searchCatalog(mkCatalog(), q, null)).not.toThrow()
      expect(searchCatalog(mkCatalog(), q, null)).toEqual({ games: [], songs: [] })
    })
  }

  it('FE-SRC-26 funcion pura: no muta el catalogo congelado y no lee ningun filtro externo (3 parametros)', () => {
    const deepFreeze = (o: any): any => {
      Object.values(o).forEach((v) => typeof v === 'object' && v !== null && deepFreeze(v))
      return Object.freeze(o)
    }
    const catalog = deepFreeze(mkCatalog())
    expect(() => searchCatalog(catalog, 'town', 'rse')).not.toThrow()
    expect(searchCatalog.length).toBe(3)
  })

  it('FE-SRC-26 sin estado oculto: dos llamadas iguales dan lo mismo aunque entre medias se busque otra cosa', () => {
    const first = searchCatalog(mkCatalog(), 'town', null)
    searchCatalog(mkCatalog(), 'castle', 'bw')
    expect(searchCatalog(mkCatalog(), 'town', null)).toEqual(first)
  })

  it('FE-SRC-27 las canciones intentadas siguen en songs (la funcion no conoce los intentos), tambien con burbuja', () => {
    const r = searchCatalog(mkCatalog(), 'oldale', 'rse')
    expect(songIds(r)).toEqual(['rse-oldale-town'])
  })

  it('FE-SRC-28 1500 canciones con y sin burbuja: < 50 ms', () => {
    const c = bigCatalog(1500, 'rse')
    // Mejor de 5 pasadas: mide el coste de la funcion, no la carga puntual de la maquina.
    const runs = Array.from({ length: 5 }, () => {
      const t0 = performance.now()
      searchCatalog(c, 'numero 14', null)
      searchCatalog(c, 'numero 14', 'rse')
      searchCatalog(c, '', 'rse')
      return performance.now() - t0
    })
    expect(Math.min(...runs)).toBeLessThan(50)
  })

  it('FE-GRP-02 el buscador lista BW y B2W2 como juegos separados (sin grupos de seleccion)', () => {
    const c = {
      version: 1,
      games: [
        { id: 'bw', name: 'Pokémon Black / White' },
        { id: 'b2w2', name: 'Pokémon Black 2 / White 2' },
      ],
      songs: [
        { id: 'bw-s', title: 'Castle', games: ['bw'] },
        { id: 'b2w2-s', title: 'Gear Station', games: ['b2w2'] },
      ],
    }
    const r = searchCatalog(c as any, 'black', null)
    expect(gameIds(r)).toEqual(['bw', 'b2w2'])
    expect(songIds(searchCatalog(c as any, '', 'b2w2'))).toEqual(['b2w2-s'])
  })

  it('FE-SRC-04 [MOD] busca sobre TODO el catalogo: juegos y canciones de cualquier juego salen (la funcion no recibe el filtro del modo libre)', () => {
    const r = searchCatalog(mkCatalog(), 'castle', null)
    expect(songIds(r)).toEqual(['bw-castle'])
    expect(gameIds(searchCatalog(mkCatalog(), 'black', null))).toEqual(['bw'])
  })
})
