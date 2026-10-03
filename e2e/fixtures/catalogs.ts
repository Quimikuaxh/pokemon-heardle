// Catalogos sinteticos de E2E (TEST_PLAN 3 y 6). Ningun dato real: titulos y juegos inventados.
// Los usan el generador de fixtures (node) y los tests (Playwright); no importar nada de produccion.

export interface FixtureSong {
  id: string
  title: string
  games: string[]
  clipKey: string
  startSec: number
  enabled: boolean
  reviewed: boolean
  source: { youtubeId: string; videoTitle: string }
  /** Frecuencia (Hz) del tono senoidal de sus clips. */
  toneHz: number
}

export interface FixtureCatalog {
  version: 1
  generatedAt: string
  games: Array<{ id: string; name: string }>
  songs: Array<Omit<FixtureSong, 'toneHz'>>
}

function song(id: string, title: string, games: string[], clipKey: string, toneHz: number, enabled = true): FixtureSong {
  return {
    id,
    title,
    games,
    clipKey,
    startSec: 7,
    enabled,
    reviewed: true,
    source: { youtubeId: `yt${clipKey.slice(0, 9)}`, videoTitle: `Video original de ${title} (OST)` },
    toneHz,
  }
}

/**
 * Catalogo R (varias canciones y juegos). Disenado para que el objetivo del ilimitado sea determinista:
 *  - C solo contiene la cancion multi-juego (A+C): filtro {C} -> objetivo fijo con juegos A y C.
 *  - D solo contiene d-only: filtro {D} -> objetivo fijo.
 * Ids de 13 y 22 caracteres; clipKey de 16 hex.
 */
export const R_SONGS: FixtureSong[] = [
  song('a-one-song-01', 'Zephyr Harbor', ['A'], '1111111111111111', 262),
  song('a-two-song-02', 'Quasar Meadow', ['A'], '2222222222222222', 294),
  song('b-one-song-03', 'Obsidian Lantern', ['B'], '3333333333333333', 330),
  song('b-two-song-04', 'Velvet Cascade', ['B'], '4444444444444444', 349),
  song('ab-multi-game-song-017', 'Marigold Citadel', ['A', 'C'], '5555555555555555', 392),
  song('d-only-song-06', 'Hollow Pinecone', ['D'], '7777777777777777', 440),
  song('b-accent-song-08', 'Pokémon Café Medley', ['B'], '9999999999999999', 494),
  song('a-disabled-song-07', 'Phantom Biscuit', ['A'], '8888888888888888', 523, false),
]

export const R_CATALOG: FixtureCatalog = {
  version: 1,
  generatedAt: '2026-10-03T12:00:00Z',
  games: [
    { id: 'A', name: 'Pokemon Game Alpha' },
    { id: 'B', name: 'Pokemon Game Bravo' },
    { id: 'C', name: 'Pokemon Game Charlie' },
    { id: 'D', name: 'Pokemon Game Delta' },
  ],
  songs: R_SONGS.map(({ toneHz: _t, ...rest }) => rest),
}

export const M_SONGS: FixtureSong[] = [song('mono-song-only1', 'Lonely Obelisk', ['A'], 'aaaaaaaaaaaaaaaa', 330)]

/** Catalogo M: una sola cancion habilitada; el diario siempre resuelve a ella. */
export const M_CATALOG: FixtureCatalog = {
  version: 1,
  generatedAt: '2026-10-03T12:00:00Z',
  games: [{ id: 'A', name: 'Pokemon Game Alpha' }],
  songs: M_SONGS.map(({ toneHz: _t, ...rest }) => rest),
}

export const STORES = {
  R: { catalog: R_CATALOG, songs: R_SONGS },
  M: { catalog: M_CATALOG, songs: M_SONGS },
} as const
