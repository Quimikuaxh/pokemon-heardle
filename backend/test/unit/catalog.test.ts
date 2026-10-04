import { describe, it, expect } from 'vitest'
import { indexCatalog, buildPool, pickRandom } from '../../src/catalog'
import { catalogR, ids } from '../helpers/fixtures'
import { thrown } from '../helpers/errors'

const idx = () => indexCatalog(catalogR() as any)

describe('catalog/ indice y pool de ilimitado', () => {
  it('indice: enabledSongs ordenadas por id y sin deshabilitadas', () => {
    expect(ids(idx().enabledSongs)).toEqual([
      'a-one-song-01',
      'a-two-song-02',
      'ab-multi-game-song-017',
      'b-one-song-03',
      'b-two-song-04',
      'c-only-song-05',
      'd-only-song-06',
    ])
  })

  it('indice: songById y songByClipKey encuentran la cancion y devuelven undefined si no existe', () => {
    const i = idx()
    expect(i.songById('a-one-song-01')?.clipKey).toBe('1111111111111111')
    expect(i.songByClipKey('1111111111111111')?.id).toBe('a-one-song-01')
    expect(i.songById('nope')).toBeUndefined()
    expect(i.songByClipKey('0000000000000000')).toBeUndefined()
  })

  it('indice: songById no resuelve claves del prototipo (__proto__, constructor)', () => {
    const i = idx()
    expect(i.songById('__proto__')).toBeUndefined()
    expect(i.songById('constructor')).toBeUndefined()
  })

  it('BE-CAT-01 pool = canciones enabled con algun juego del filtro', () => {
    expect(ids(buildPool(idx(), ['A']))).toEqual(['a-one-song-01', 'a-two-song-02', 'ab-multi-game-song-017'])
  })

  it('BE-CAT-01 pool con varios juegos es la union', () => {
    expect(ids(buildPool(idx(), ['C', 'D']))).toEqual(['c-only-song-05', 'd-only-song-06'])
  })

  it('BE-CAT-01 el pool excluye las deshabilitadas', () => {
    expect(ids(buildPool(idx(), ['A']))).not.toContain('a-disabled-song-07')
  })

  it('BE-CAT-02 cancion multi-juego aparece una sola vez con filtro {A,B}', () => {
    const pool = ids(buildPool(idx(), ['A', 'B']))
    expect(pool.filter((x) => x === 'ab-multi-game-song-017').length).toBe(1)
    expect(pool.length).toBe(5)
  })

  it('BE-CAT-02 filtro con ids de juego repetidos no duplica canciones', () => {
    expect(buildPool(idx(), ['C', 'C']).length).toBe(1)
  })

  it('BE-CAT-03 filtro vacio -> EMPTY_FILTER', () => {
    expect(thrown(() => buildPool(idx(), []))?.code).toBe('EMPTY_FILTER')
  })

  it('BE-CAT-04 juego cuyas canciones estan todas deshabilitadas -> EMPTY_FILTER', () => {
    const c: any = catalogR()
    c.songs = c.songs.map((s: any) => (s.games.includes('D') ? { ...s, enabled: false } : s))
    expect(thrown(() => buildPool(indexCatalog(c), ['D']))?.code).toBe('EMPTY_FILTER')
  })

  it('BE-CAT-05 id de juego inexistente -> UNKNOWN_GAME', () => {
    expect(thrown(() => buildPool(idx(), ['ZZ']))?.code).toBe('UNKNOWN_GAME')
  })

  it('BE-CAT-05 mezcla valido + invalido -> UNKNOWN_GAME', () => {
    expect(thrown(() => buildPool(idx(), ['A', 'ZZ']))?.code).toBe('UNKNOWN_GAME')
  })

  it('BE-CAT-05 ids que son claves del prototipo -> UNKNOWN_GAME, sin excepcion rara', () => {
    expect(thrown(() => buildPool(idx(), ['__proto__']))?.code).toBe('UNKNOWN_GAME')
    expect(thrown(() => buildPool(idx(), ['constructor']))?.code).toBe('UNKNOWN_GAME')
  })

  it('BE-CAT-06 publicCatalog: solo id,title,games por cancion; sin deshabilitadas', () => {
    const pub: any = idx().publicCatalog()
    expect(pub.songs.length).toBe(7)
    for (const s of pub.songs) expect(Object.keys(s).sort()).toEqual(['games', 'id', 'title'])
  })

  it('BE-CAT-06 publicCatalog no contiene claves internas en ningun nivel', () => {
    const text = JSON.stringify(idx().publicCatalog())
    for (const k of ['clipKey', 'startSec', 'source', 'enabled', 'reviewed', 'youtubeId', 'videoTitle', 'durationSec'])
      expect(text).not.toContain(k)
  })

  it('BE-CAT-06 publicCatalog incluye version y la lista de juegos con id y name', () => {
    const pub: any = idx().publicCatalog()
    expect(pub.version).toBe(1)
    expect(pub.games[0]).toEqual({ id: 'A', name: 'Pokemon Game Alpha' })
  })

  it('BE-DAY-18 pickRandom usa randomInt(pool.length) y devuelve el elemento de ese indice', () => {
    const calls: number[] = []
    const pool = ['x', 'y', 'z']
    const got = pickRandom(pool, (max) => (calls.push(max), 2))
    expect([got, calls]).toEqual(['z', [3]])
  })

  it('BE-DAY-18 pool de 1 devuelve siempre el mismo (randomInt(1) = 0)', () => {
    for (let i = 0; i < 20; i++) expect(pickRandom(['solo'])).toBe('solo')
  })

  it('BE-DAY-18 con randomInt real cubre todo el pool en 500 tiradas', () => {
    const pool = [0, 1, 2, 3, 4]
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(pickRandom(pool))
    expect(seen.size).toBe(5)
  })
})
