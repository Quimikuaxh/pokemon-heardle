// Contrato: src/build.ts exporta
//   songsToBuild(catalog: Catalog,
//                manifest: Record<clipKey, { startSec: number; source: string }>,
//                sourceFingerprint: (song: Song) => string,
//                hasClip: (song: Song) => boolean): Song[]        (DEC-44: existe out/clips/<clipKey>.mp3)
import { describe, it, expect } from 'vitest'
import { songsToBuild } from '../src/build'

const song = (over: Record<string, unknown> = {}): any => ({
  id: 'a-song',
  title: 'A Song',
  games: ['g'],
  clipKey: '0123456789abcdef',
  startSec: 5,
  enabled: true,
  reviewed: true,
  source: { youtubeId: 'vid00000001', videoTitle: 'x' },
  ...over,
})
const catalog = (songs: any[]): any => ({ version: 1, generatedAt: 'x', games: [{ id: 'g', name: 'G' }], songs })
const fp = (s: any) => `fp-${s.source.youtubeId}`

describe('songsToBuild', () => {
  it('SC-BU-01 sin cambios: no recompila nada', () => {
    const m = { '0123456789abcdef': { startSec: 5, source: 'fp-vid00000001' } }
    expect(songsToBuild(catalog([song()]), m, fp, () => true)).toEqual([])
  })

  it('SC-BU-01 cambia startSec: recompila', () => {
    const m = { '0123456789abcdef': { startSec: 4, source: 'fp-vid00000001' } }
    expect(songsToBuild(catalog([song()]), m, fp, () => true).map((s) => s.id)).toEqual(['a-song'])
  })

  it('SC-BU-01 cambia el fuente (huella distinta): recompila', () => {
    const m = { '0123456789abcdef': { startSec: 5, source: 'otra-huella' } }
    expect(songsToBuild(catalog([song()]), m, fp, () => true).map((s) => s.id)).toEqual(['a-song'])
  })

  it('SC-BU-01 cancion sin entrada en el manifest: recompila', () => {
    expect(songsToBuild(catalog([song()]), {}, fp, () => true).length).toBe(1)
  })

  it('SC-BU-01 cambiar solo el titulo o los juegos no recompila (no afecta al audio)', () => {
    const m = { '0123456789abcdef': { startSec: 5, source: 'fp-vid00000001' } }
    expect(songsToBuild(catalog([song({ title: 'Otro titulo', games: ['g'] })]), m, fp, () => true)).toEqual([])
  })

  it('SC-BU-02 ignora enabled:false aunque no este en el manifest', () => {
    expect(songsToBuild(catalog([song({ enabled: false })]), {}, fp, () => true)).toEqual([])
  })

  it('SC-BU-02 mezcla: solo devuelve las activas que lo necesitan', () => {
    const c = catalog([song(), song({ id: 'b', clipKey: 'fedcba9876543210', enabled: false }), song({ id: 'c', clipKey: '1111111111111111' })])
    const m = { '0123456789abcdef': { startSec: 5, source: 'fp-vid00000001' } }
    expect(songsToBuild(c, m, fp, () => true).map((s) => s.id)).toEqual(['c'])
  })

  it('SC-BU-01 [MOD] un clip con el layout antiguo (sin <clipKey>.mp3) cuenta como no compilado aunque el manifest este al dia', () => {
    const m = { '0123456789abcdef': { startSec: 5, source: 'fp-vid00000001' } }
    expect(songsToBuild(catalog([song()]), m, fp, () => false).map((s) => s.id)).toEqual(['a-song'])
  })

  it('SC-BU-01 [MOD] con <clipKey>.mp3 presente y manifest al dia no se recompila (ya migrado)', () => {
    const m = { '0123456789abcdef': { startSec: 5, source: 'fp-vid00000001' } }
    expect(songsToBuild(catalog([song()]), m, fp, () => true)).toEqual([])
  })

  it('SC-BU-01 [MOD] hasClip se consulta por cancion: solo se recompilan las que no tienen el fichero nuevo', () => {
    const m = { '0123456789abcdef': { startSec: 5, source: 'fp-vid00000001' }, '1111111111111111': { startSec: 5, source: 'fp-vid00000001' } }
    const c = catalog([song(), song({ id: 'b-song', clipKey: '1111111111111111' })])
    expect(songsToBuild(c, m, fp, (s) => s.id === 'b-song').map((s) => s.id)).toEqual(['a-song'])
  })

  it('SC-BU-01 [MOD] cambiar startSec o la fuente sigue recompilando aunque el fichero nuevo exista', () => {
    const m = { '0123456789abcdef': { startSec: 4, source: 'fp-vid00000001' } }
    expect(songsToBuild(catalog([song()]), m, fp, () => true).length).toBe(1)
  })

  it('SC-BU-01 [MOD] las desactivadas no se recompilan aunque no tengan clip nuevo', () => {
    expect(songsToBuild(catalog([song({ enabled: false })]), {}, fp, () => false)).toEqual([])
  })
})
