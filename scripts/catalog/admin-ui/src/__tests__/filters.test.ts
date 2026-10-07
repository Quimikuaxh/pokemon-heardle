import { describe, it, expect } from 'vitest'
import { filterSongs } from '../filters'
import { GAMES, baseSongs, mkSong } from './helpers'

const catalog = () => ({ games: GAMES, songs: baseSongs() })
const ids = (list: Array<{ id: string }>) => list.map((s) => s.id)

describe('admin-ui filtros y busqueda (modulo puro)', () => {
  it('sin filtros devuelve todas las canciones', () => {
    expect(filterSongs(catalog(), {}).length).toBe(5)
  })

  it('AU-FIL-01 [MOD] filtro por juego (cada cancion tiene un unico juego, DEC-53)', () => {
    expect(ids(filterSongs(catalog(), { gameId: 'dp' }))).toEqual(['dp-dash'])
    expect(ids(filterSongs(catalog(), { gameId: 'rse' })).sort()).toEqual(['rse-badge', 'rse-littleroot-town', 'rse-oldale-town'])
  })

  it('AU-FIL-11 texto con palabras de juego y titulo a la vez ("ruby town")', () => {
    expect(ids(filterSongs(catalog(), { text: 'ruby town' })).sort()).toEqual(['rse-littleroot-town', 'rse-oldale-town'])
    expect(filterSongs(catalog(), { text: 'diamond littleroot' })).toEqual([])
  })

  it('AU-FIL-01 juego sin canciones -> lista vacia', () => {
    expect(filterSongs(catalog(), { gameId: 'unused' })).toEqual([])
  })

  it('AU-FIL-01 gameId null o undefined = sin filtro', () => {
    expect(filterSongs(catalog(), { gameId: null }).length).toBe(5)
  })

  it('AU-FIL-02 activadas', () => {
    expect(ids(filterSongs(catalog(), { enabled: 'enabled' })).sort()).toEqual(['dp-dash', 'rse-littleroot-town'])
  })

  it('AU-FIL-02 desactivadas', () => {
    expect(ids(filterSongs(catalog(), { enabled: 'disabled' })).sort()).toEqual(['dp-twinleaf-town', 'rse-badge', 'rse-oldale-town'])
  })

  it('AU-FIL-02 todas', () => {
    expect(filterSongs(catalog(), { enabled: 'all' }).length).toBe(5)
  })

  it('AU-FIL-03 revisadas', () => {
    expect(ids(filterSongs(catalog(), { reviewed: 'reviewed' })).sort()).toEqual(['rse-badge', 'rse-littleroot-town'])
  })

  it('AU-FIL-03 pendientes', () => {
    expect(ids(filterSongs(catalog(), { reviewed: 'pending' })).sort()).toEqual(['dp-dash', 'dp-twinleaf-town', 'rse-oldale-town'])
  })

  it('AU-FIL-04 solo cortas (tooShort)', () => {
    expect(ids(filterSongs(catalog(), { onlyTooShort: true }))).toEqual(['rse-badge'])
  })

  it('AU-FIL-04 solo con errores (errors.length > 0)', () => {
    expect(ids(filterSongs(catalog(), { onlyErrors: true }))).toEqual(['dp-twinleaf-town'])
  })

  it('AU-FIL-04 onlyTooShort/onlyErrors en false = sin filtro', () => {
    expect(filterSongs(catalog(), { onlyTooShort: false, onlyErrors: false }).length).toBe(5)
  })

  it('AU-FIL-05 texto sobre el titulo', () => {
    expect(ids(filterSongs(catalog(), { text: 'oldale' }))).toEqual(['rse-oldale-town'])
  })

  it('AU-FIL-05 texto sobre el nombre de juego', () => {
    expect(ids(filterSongs(catalog(), { text: 'diamond' })).sort()).toEqual(['dp-dash', 'dp-twinleaf-town'])
  })

  it('AU-FIL-05 texto sobre el titulo del video original', () => {
    expect(ids(filterSongs(catalog(), { text: 'RSE - Littleroot' }))).toEqual(['rse-littleroot-town'])
  })

  it('AU-FIL-05 sin distinguir mayusculas ni acentos ("pokemon" encuentra "Pokémon")', () => {
    expect(filterSongs(catalog(), { text: 'POKEMON ruby' }).length).toBeGreaterThan(0)
    expect(ids(filterSongs(catalog(), { text: 'pokemon diamond' }))).toContain('dp-dash')
  })

  it('AU-FIL-05 acento en el dato y no en la consulta y viceversa', () => {
    const c = { games: GAMES, songs: [mkSong({ id: 'cafe', title: 'Café Théme' })] }
    expect(ids(filterSongs(c, { text: 'cafe theme' }))).toEqual(['cafe'])
    expect(ids(filterSongs(c, { text: 'CAFÉ' }))).toEqual(['cafe'])
  })

  it('AU-FIL-06 combinacion AND: juego + desactivadas + pendientes + texto', () => {
    const r = filterSongs(catalog(), { gameId: 'rse', enabled: 'disabled', reviewed: 'pending', text: 'town' })
    expect(ids(r)).toEqual(['rse-oldale-town'])
  })

  it('AU-FIL-06 combinacion sin interseccion -> vacio', () => {
    expect(filterSongs(catalog(), { enabled: 'enabled', onlyTooShort: true })).toEqual([])
  })

  for (const text of ['(', '*', '\\', '[', '.*', '?', '+', '$', '^', '|']) {
    it(`AU-FIL-07 texto con caracter especial de regex ${JSON.stringify(text)} no lanza`, () => {
      expect(() => filterSongs(catalog(), { text })).not.toThrow()
    })
  }

  it('AU-FIL-07 ".*" se trata como texto literal (no casa con todo)', () => {
    expect(filterSongs(catalog(), { text: '.*' })).toEqual([])
  })

  it('AU-FIL-07 texto vacio o solo espacios = sin filtro de texto', () => {
    expect(filterSongs(catalog(), { text: '' }).length).toBe(5)
    expect(filterSongs(catalog(), { text: '    ' }).length).toBe(5)
  })

  it('AU-FIL-08 sin resultados -> []', () => {
    expect(filterSongs(catalog(), { text: 'zzzz-no-existe' })).toEqual([])
  })

  it('AU-FIL-08 catalogo vacio -> [] sin error', () => {
    expect(filterSongs({ games: [], songs: [] }, { text: 'x', gameId: 'rse' })).toEqual([])
  })

  it('AU-FIL-09 1500 canciones: < 100 ms', () => {
    const songs = Array.from({ length: 1500 }, (_, i) => mkSong({ id: `s-${i}`, title: `Cancion numero ${i} Théme`, games: i % 2 ? ['rse'] : ['dp'] }))
    const t0 = performance.now()
    filterSongs({ games: GAMES, songs }, { gameId: 'rse', enabled: 'enabled', text: 'numero 14' })
    expect(performance.now() - t0).toBeLessThan(100)
  })

  it('AU-FIL-10 es puro: no muta la entrada (congelada en profundidad) y devuelve un array nuevo', () => {
    const deepFreeze = (o: any): any => {
      Object.values(o).forEach((v) => typeof v === 'object' && v !== null && deepFreeze(v))
      return Object.freeze(o)
    }
    const input = deepFreeze({ games: GAMES.map((g) => ({ ...g })), songs: baseSongs() })
    const filters = deepFreeze({ gameId: 'rse', text: 'town' })
    const out = filterSongs(input, filters)
    expect(out).not.toBe(input.songs)
    expect(input.songs.length).toBe(5)
  })

  it('AU-FIL-10 conserva el orden original de las canciones', () => {
    expect(ids(filterSongs(catalog(), {}))).toEqual(ids(baseSongs()))
  })
})
