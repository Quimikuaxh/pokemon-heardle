import { describe, it, expect } from 'vitest'
import { searchSongs } from '../game/search'
import { mkCatalog } from './helpers'

const ids = (r: Array<{ id: string }>) => r.map((x) => x.id).sort()

describe('game/search searchSongs', () => {
  it('FE-SRC-01 busca por subcadena del titulo', () => {
    expect(ids(searchSongs(mkCatalog(), 'town'))).toEqual(['dp-twinleaf-town', 'rse-littleroot-town', 'rse-oldale-town'])
  })

  it('FE-SRC-02 busca por nombre de juego: todas las canciones del juego', () => {
    expect(ids(searchSongs(mkCatalog(), 'ruby'))).toEqual(['rse-dp-shared-cafe', 'rse-littleroot-town', 'rse-oldale-town'])
  })

  it('FE-SRC-03 sin distinguir mayusculas', () => {
    expect(ids(searchSongs(mkCatalog(), 'LITTLEROOT'))).toEqual(['rse-littleroot-town'])
  })

  it('FE-SRC-03 sin distinguir acentos: "pokemon" encuentra juegos "Pokémon"', () => {
    expect(searchSongs(mkCatalog(), 'pokemon').length).toBe(5)
  })

  it('FE-SRC-03 acento en la consulta, no en el dato y viceversa ("cafe" encuentra "Café", "théme" encuentra "Theme")', () => {
    expect(ids(searchSongs(mkCatalog(), 'cafe'))).toEqual(['rse-dp-shared-cafe'])
    expect(ids(searchSongs(mkCatalog(), 'theme'))).toEqual(['rse-dp-shared-cafe'])
  })

  it('FE-SRC-04 la busqueda no admite filtro: solo catalogo y texto', () => {
    expect(searchSongs.length).toBe(2)
    expect(ids(searchSongs(mkCatalog(), 'castle'))).toEqual(['bw-castle'])
  })

  it('FE-SRC-05 cada opcion trae titulo y todos sus juegos con nombre', () => {
    const r = searchSongs(mkCatalog(), 'cafe')[0]
    expect(r.title).toBe('Café Théme')
    expect(r.games.map((g) => g.id)).toEqual(['rse', 'dp'])
    expect(r.games[0].name).toContain('Ruby')
  })

  it('FE-SRC-06 una cancion multi-juego aparece una sola vez aunque casen ambos juegos', () => {
    const r = searchSongs(mkCatalog(), 'pokemon')
    expect(r.filter((x) => x.id === 'rse-dp-shared-cafe').length).toBe(1)
  })

  for (const q of ['', '   ', 'zzzz-no-existe']) {
    it(`FE-SRC-08 consulta ${JSON.stringify(q)}: devuelve array sin lanzar`, () => {
      expect(Array.isArray(searchSongs(mkCatalog(), q))).toBe(true)
    })
  }

  it('FE-SRC-08 sin coincidencias -> []', () => {
    expect(searchSongs(mkCatalog(), 'zzzz-no-existe')).toEqual([])
  })

  for (const q of ['(', '*', '\\', '[', '.*', '?', '+', '$', '^', '|']) {
    it(`FE-SRC-09 caracter especial ${JSON.stringify(q)} no lanza y se trata como texto literal`, () => {
      expect(() => searchSongs(mkCatalog(), q)).not.toThrow()
    })
  }

  it('FE-SRC-09 ".*" no casa con todo (es literal)', () => {
    expect(searchSongs(mkCatalog(), '.*')).toEqual([])
  })

  it('FE-SRC-11 todos los resultados pertenecen al catalogo (no se fabrican opciones)', () => {
    const all = new Set(mkCatalog().songs.map((s: any) => s.id))
    for (const r of searchSongs(mkCatalog(), 'o')) expect(all.has(r.id)).toBe(true)
  })

  it('FE-SRC-10 catalogo de 1500 canciones: < 50 ms', () => {
    const songs = Array.from({ length: 1500 }, (_, i) => ({ id: `s-${i}`, title: `Cancion numero ${i} Théme`, games: ['rse'] }))
    const cat = { ...mkCatalog(), songs }
    const t0 = performance.now()
    searchSongs(cat, 'numero 14')
    expect(performance.now() - t0).toBeLessThan(50)
  })
})
