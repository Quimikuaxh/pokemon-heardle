// Contrato: src/build.ts exporta
//   songsToBuild(catalog: Catalog,
//                manifest: Record<clipKey, { startSec: number; source: string }>,
//                sourceFingerprint: (song: Song) => string): Song[]
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
    expect(songsToBuild(catalog([song()]), m, fp)).toEqual([])
  })

  it('SC-BU-01 cambia startSec: recompila', () => {
    const m = { '0123456789abcdef': { startSec: 4, source: 'fp-vid00000001' } }
    expect(songsToBuild(catalog([song()]), m, fp).map((s) => s.id)).toEqual(['a-song'])
  })

  it('SC-BU-01 cambia el fuente (huella distinta): recompila', () => {
    const m = { '0123456789abcdef': { startSec: 5, source: 'otra-huella' } }
    expect(songsToBuild(catalog([song()]), m, fp).map((s) => s.id)).toEqual(['a-song'])
  })

  it('SC-BU-01 cancion sin entrada en el manifest: recompila', () => {
    expect(songsToBuild(catalog([song()]), {}, fp).length).toBe(1)
  })

  it('SC-BU-01 cambiar solo el titulo o los juegos no recompila (no afecta al audio)', () => {
    const m = { '0123456789abcdef': { startSec: 5, source: 'fp-vid00000001' } }
    expect(songsToBuild(catalog([song({ title: 'Otro titulo', games: ['g'] })]), m, fp)).toEqual([])
  })

  it('SC-BU-02 ignora enabled:false aunque no este en el manifest', () => {
    expect(songsToBuild(catalog([song({ enabled: false })]), {}, fp)).toEqual([])
  })

  it('SC-BU-02 mezcla: solo devuelve las activas que lo necesitan', () => {
    const c = catalog([song(), song({ id: 'b', clipKey: 'fedcba9876543210', enabled: false }), song({ id: 'c', clipKey: '1111111111111111' })])
    const m = { '0123456789abcdef': { startSec: 5, source: 'fp-vid00000001' } }
    expect(songsToBuild(c, m, fp).map((s) => s.id)).toEqual(['c'])
  })
})
