import { describe, it, expect } from 'vitest'
import { indexCatalog, buildGroups } from '../../src/catalog'
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
    expect(ids(buildGroups(idx(), ['A']).flatMap((group) => group.songs))).toEqual(['a-one-song-01', 'a-two-song-02', 'ab-multi-game-song-017'])
  })

  it('BE-CAT-01 pool con varios juegos es la union', () => {
    expect(ids(buildGroups(idx(), ['C', 'D']).flatMap((group) => group.songs))).toEqual(['c-only-song-05', 'd-only-song-06'])
  })

  it('BE-CAT-01 el pool excluye las deshabilitadas', () => {
    expect(ids(buildGroups(idx(), ['A']).flatMap((group) => group.songs))).not.toContain('a-disabled-song-07')
  })

  // BE-CAT-02 (cancion multi-juego aparece una sola vez) esta RETIRADO: DEC-53, una cancion = un juego.
  it('BE-CAT-01 [MOD] pool = canciones enabled cuyo UNICO juego esta en el filtro; con {A,B} salen 5 canciones sin duplicados', () => {
    const pool = ids(buildGroups(idx(), ['A', 'B']).flatMap((group) => group.songs))
    expect(pool.length).toBe(5)
    expect(new Set(pool).size).toBe(5)
  })

  it('BE-CAT-01 filtro con ids de juego repetidos no duplica canciones', () => {
    expect(buildGroups(idx(), ['C', 'C']).flatMap((group) => group.songs).length).toBe(1)
  })

  it('BE-CAT-03 filtro vacio -> EMPTY_FILTER', () => {
    expect(thrown(() => buildGroups(idx(), []))?.code).toBe('EMPTY_FILTER')
  })

  it('BE-CAT-04 juego cuyas canciones estan todas deshabilitadas -> EMPTY_FILTER', () => {
    const c: any = catalogR()
    c.songs = c.songs.map((s: any) => (s.games.includes('D') ? { ...s, enabled: false } : s))
    expect(thrown(() => buildGroups(indexCatalog(c), ['D']))?.code).toBe('EMPTY_FILTER')
  })

  it('BE-CAT-05 id de juego inexistente -> UNKNOWN_GAME', () => {
    expect(thrown(() => buildGroups(idx(), ['ZZ']))?.code).toBe('UNKNOWN_GAME')
  })

  it('BE-CAT-05 mezcla valido + invalido -> UNKNOWN_GAME', () => {
    expect(thrown(() => buildGroups(idx(), ['A', 'ZZ']))?.code).toBe('UNKNOWN_GAME')
  })

  it('BE-CAT-05 ids que son claves del prototipo -> UNKNOWN_GAME, sin excepcion rara', () => {
    expect(thrown(() => buildGroups(idx(), ['__proto__']))?.code).toBe('UNKNOWN_GAME')
    expect(thrown(() => buildGroups(idx(), ['constructor']))?.code).toBe('UNKNOWN_GAME')
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
    expect(pub.games[0]).toEqual({ id: 'A', name: 'Pokemon Game Alpha', series: 'main' })
  })

  it('BE-CAT-06 [MOD] publicCatalog: cada cancion lleva UN solo juego y los juegos solo {id,name} (no se expone selectionGroup)', () => {
    const c: any = catalogR()
    c.games[1] = { ...c.games[1], selectionGroup: 'A' }
    const pub: any = indexCatalog(c).publicCatalog()
    for (const s of pub.songs) expect(s.games.length).toBe(1)
    // DEC-60: cada juego lleva tambien su serie efectiva.
    for (const g of pub.games) expect(Object.keys(g).sort()).toEqual(['id', 'name', 'series'])
    expect(JSON.stringify(pub)).not.toContain('selectionGroup')
  })

  it('BE-CAT-12 publicCatalog conserva el orden de games de catalog.json (no el alfabetico)', () => {
    const c: any = catalogR()
    c.games = [c.games[2], c.games[0], c.games[3], c.games[1]] // C, A, D, B
    expect(indexCatalog(c).publicCatalog().games.map((g: any) => g.id)).toEqual(['C', 'A', 'D', 'B'])
  })

  it('BE-CAT-12 el indice expone games en el orden del catalogo y el grupo efectivo de cada juego', () => {
    const c: any = catalogR()
    c.games[1] = { ...c.games[1], selectionGroup: 'A' }
    const index: any = indexCatalog(c)
    expect(index.games.map((g: any) => g.id)).toEqual(['A', 'B', 'C', 'D'])
    expect([index.groupOf('A'), index.groupOf('B'), index.groupOf('C')]).toEqual(['A', 'A', 'C'])
  })
})
