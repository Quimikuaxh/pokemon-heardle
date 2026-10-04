// Contrato: src/draft.ts exporta
//   draftCatalog(existing: Catalog | null,
//                videos: Array<{ youtubeId: string; title: string }>,
//                opts?: { randomClipKey?: () => string; now?: () => string }): Catalog
// Pura. Nunca modifica ni elimina entradas existentes; ids de cancion y de juego derivados por slug.
import { describe, it, expect } from 'vitest'
import { draftCatalog } from '../src/draft'
import { validateCatalog } from '../../../shared/catalog'

const NOW = () => '2026-10-03T12:00:00Z'
let counter = 0
const seqKeys = () => {
  counter = 0
  return () => (++counter).toString(16).padStart(16, '0')
}

const V1 = { youtubeId: 'vid00000001', title: 'Pokemon Ruby/Sapphire/Emerald - Littleroot Town' }
const V2 = { youtubeId: 'vid00000002', title: 'Pokemon Diamond/Pearl - Twinleaf Town' }

describe('draftCatalog', () => {
  it('SC-DR-01 crea un catalogo valido desde cero (existing null)', () => {
    const c = draftCatalog(null, [V1, V2], { randomClipKey: seqKeys(), now: NOW })
    expect(validateCatalog(c).ok).toBe(true)
  })

  it('SC-DR-01 entradas nuevas: startSec 0, reviewed false, youtubeId y videoTitle de origen', () => {
    const c = draftCatalog(null, [V1], { randomClipKey: seqKeys(), now: NOW })
    expect(c.songs[0]).toMatchObject({ startSec: 0, reviewed: false, source: { youtubeId: V1.youtubeId, videoTitle: V1.title } })
  })

  it('SC-DR-01 clipKey valido (16 hex) y unico por cancion', () => {
    const c = draftCatalog(null, [V1, V2], { now: NOW })
    const keys = c.songs.map((s) => s.clipKey)
    expect(keys.every((k) => /^[0-9a-f]{16}$/.test(k))).toBe(true)
    expect(new Set(keys).size).toBe(2)
  })

  it('SC-DR-01 el titulo y el juego se derivan del titulo del video', () => {
    const c = draftCatalog(null, [V1], { randomClipKey: seqKeys(), now: NOW })
    expect(c.songs[0].title).toBe('Littleroot Town')
    expect(c.games.some((g) => g.name === 'Pokemon Ruby/Sapphire/Emerald')).toBe(true)
  })

  it('SC-DR-01 video sin juego parseable: games vacio, reviewed:false y el validador lo rechaza (revision manual)', () => {
    const c = draftCatalog(null, [{ youtubeId: 'vid00000009', title: 'Sin formato alguno' }], { now: NOW })
    expect(c.songs[0].reviewed).toBe(false)
    expect(c.songs[0].games).toEqual([])
    expect(validateCatalog(c).ok).toBe(false)
  })

  it('SC-DR-02 idempotente: aplicar las mismas entradas dos veces no cambia nada', () => {
    const once = draftCatalog(null, [V1, V2], { randomClipKey: seqKeys(), now: NOW })
    const twice = draftCatalog(once, [V1, V2], { randomClipKey: seqKeys(), now: NOW })
    expect(twice.songs).toEqual(once.songs)
    expect(twice.games).toEqual(once.games)
  })

  it('SC-DR-02 videos ya presentes no se duplican por youtubeId', () => {
    const once = draftCatalog(null, [V1], { now: NOW })
    expect(draftCatalog(once, [V1], { now: NOW }).songs.length).toBe(1)
  })

  it('SC-DR-03 nunca pisa entradas editadas a mano (titulo, juegos, startSec, enabled, reviewed, clipKey)', () => {
    const base = draftCatalog(null, [V1], { randomClipKey: seqKeys(), now: NOW })
    const edited = {
      ...base,
      songs: [{ ...base.songs[0], title: 'Titulo Editado', games: [base.games[0].id], startSec: 33.5, enabled: false, reviewed: true }],
    }
    const merged = draftCatalog(edited, [V1, V2], { randomClipKey: seqKeys(), now: NOW })
    expect(merged.songs.find((s) => s.source.youtubeId === V1.youtubeId)).toEqual(edited.songs[0])
  })

  it('SC-DR-03 las entradas existentes que ya no estan en la lista de videos se conservan', () => {
    const base = draftCatalog(null, [V1], { now: NOW })
    expect(draftCatalog(base, [V2], { now: NOW }).songs.map((s) => s.source.youtubeId).sort()).toEqual(['vid00000001', 'vid00000002'])
  })

  it('SC-DR-04 colision de clipKey: reintenta hasta obtener uno unico', () => {
    const base = draftCatalog(null, [V1], { randomClipKey: () => 'aaaaaaaaaaaaaaaa', now: NOW })
    const answers = ['aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']
    const merged = draftCatalog(base, [V2], { randomClipKey: () => answers.shift() ?? 'cccccccccccccccc', now: NOW })
    expect(merged.songs.map((s) => s.clipKey).sort()).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'])
  })

  it('SC-DR-05 titulos repetidos de videos distintos dan ids de cancion distintos y validos', () => {
    const a = { youtubeId: 'vid0000000a', title: 'Pokemon X/Y - Route 1' }
    const b = { youtubeId: 'vid0000000b', title: 'Pokemon X/Y - Route 1' }
    const c = draftCatalog(null, [a, b], { randomClipKey: seqKeys(), now: NOW })
    expect(new Set(c.songs.map((s) => s.id)).size).toBe(2)
    expect(validateCatalog(c).ok).toBe(true)
  })

  it('SC-DR-05 ids con caracteres especiales o acentos siguen siendo [a-z0-9-]+', () => {
    const c = draftCatalog(null, [{ youtubeId: 'vid0000000c', title: "Pokémon X/Y - N's Castle (Día) ★" }], { now: NOW })
    expect(c.songs[0].id).toMatch(/^[a-z0-9-]+$/)
  })

  it('SC-DR-06 un juego nuevo se anade a games sin duplicar entre canciones del mismo juego', () => {
    const a = { youtubeId: 'vid0000000a', title: 'Pokemon X/Y - Route 1' }
    const b = { youtubeId: 'vid0000000b', title: 'Pokemon X/Y - Route 2' }
    const c = draftCatalog(null, [a, b], { randomClipKey: seqKeys(), now: NOW })
    expect(c.games.filter((g) => g.name === 'Pokemon X/Y').length).toBe(1)
    expect(validateCatalog(c).ok).toBe(true)
  })

  it('SC-DR-06 reutiliza un juego ya existente en el catalogo', () => {
    const base = draftCatalog(null, [V1], { now: NOW })
    const more = draftCatalog(base, [{ youtubeId: 'vid0000000d', title: 'Pokemon Ruby/Sapphire/Emerald - Oldale Town' }], { now: NOW })
    expect(more.games.length).toBe(base.games.length)
  })

  it('no muta el catalogo recibido', () => {
    const base = draftCatalog(null, [V1], { now: NOW })
    const snapshot = JSON.stringify(base)
    draftCatalog(base, [V2], { now: NOW })
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})

describe('draft: colas de juego comunes sobre toda la playlist', () => {
  const videos = [1, 2, 3].map((n) => ({ youtubeId: `AAAAAAAAAA${n}`, title: `Cancion ${n} - Foo Bar` }))

  it('SC-DR-11 con dos ya en el catalogo y una nueva, la cola repetida se sigue reconociendo como juego', () => {
    const first = draftCatalog(null, videos.slice(0, 2), {})
    const merged = draftCatalog(first, videos, {})
    const added = merged.songs.find((s) => s.source.youtubeId === 'AAAAAAAAAA3')!
    expect(added.games.length).toBe(1)
    expect(merged.games.map((g) => g.name)).toContain('Foo Bar')
  })
})
