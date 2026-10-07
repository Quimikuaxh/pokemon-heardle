// Catalogos sinteticos de E2E (TEST_PLAN 3 y 6). Ningun dato real: titulos y juegos inventados.
// Los usan el generador de fixtures (node) y los tests (Playwright); no importar nada de produccion.

/** Escalon de frecuencia entre segundos consecutivos del clip (E2E-76: tono distinto por segundo). */
export const STEP_HZ = 250

export interface FixtureSong {
  id: string
  title: string
  games: string[]
  clipKey: string
  startSec: number
  enabled: boolean
  reviewed: boolean
  source: { youtubeId: string; videoTitle: string; durationSec: number }
  /** Frecuencia (Hz) del tono senoidal de sus clips. */
  toneHz: number
}

export interface FixtureGame {
  id: string
  name: string
  consoles: string[]
  /** Grupo de seleccion (DEC-54): id del juego cabeza. Ausente = su propio grupo. */
  selectionGroup?: string
}

export interface FixtureCatalog {
  version: 1
  generatedAt: string
  games: FixtureGame[]
  songs: Array<Omit<FixtureSong, 'toneHz'>>
}

function song(
  id: string,
  title: string,
  games: string[],
  clipKey: string,
  toneHz: number,
  enabled = true,
  youtubeId = `yt${clipKey.slice(0, 9)}`,
): FixtureSong {
  return {
    id,
    title,
    games,
    clipKey,
    startSec: 7,
    enabled,
    reviewed: true,
    source: { youtubeId, videoTitle: `Video original de ${title} (OST)`, durationSec: 60 },
    toneHz,
  }
}

/**
 * Catalogo R (varias canciones y juegos, cada cancion de UN juego: DEC-53). Orden de salida = orden de `games`.
 * Disenado para que el objetivo del ilimitado sea determinista cuando el filtro es un juego de una sola cancion:
 *  - Charlie (DS), Delta (3DS), Foxtrot (Switch), Golf (Switch 2) y Zeta (Switch + Switch 2, como Legends: Z-A)
 *    tienen UNA cancion; Echo (3DS) tambien, y forma grupo de seleccion con Delta (DEC-54).
 *  - Alpha (2 canciones + 1 deshabilitada) y Bravo (3) tienen varias: el objetivo se identifica por el tono del clip.
 * Ids de juego unicos y largos (E2E-26/92 buscan el id y el nombre del juego objetivo en la red).
 */
export const R_SONGS: FixtureSong[] = [
  // youtubeId de 11 caracteres; este empieza por '-' (caso de ids con guion inicial).
  song('a-one-song-01', 'Zephyr Harbor', ['game-alpha'], '1111111111111111', 262, true, '-abcDEF_123'),
  song('a-two-song-02', 'Quasar Meadow', ['game-alpha'], '2222222222222222', 294),
  song('b-one-song-03', 'Obsidian Lantern', ['game-bravo'], '3333333333333333', 330),
  song('b-two-song-04', 'Velvet Cascade', ['game-bravo'], '4444444444444444', 349),
  song('c-only-song-05', 'Marigold Citadel', ['game-charlie'], '5555555555555555', 392),
  song('d-only-song-06', 'Hollow Pinecone', ['game-delta'], '7777777777777777', 440),
  song('b-accent-song-08', 'Pokémon Café Medley', ['game-bravo'], '9999999999999999', 494),
  song('a-disabled-song-07', 'Phantom Biscuit', ['game-alpha'], '8888888888888888', 523, false),
  song('e-only-song-09', 'Ember Orchard', ['game-echo'], 'abababababababab', 587),
  song('f-only-song-10', 'Fjord Lantern', ['game-foxtrot'], 'bcbcbcbcbcbcbcbc', 659),
  song('g-only-song-11', 'Glacier Bell', ['game-golf'], 'cdcdcdcdcdcdcdcd', 698),
  song('z-only-song-12', 'Zenith Garden', ['game-zeta'], 'dededededededede', 784),
]

export const R_CATALOG: FixtureCatalog = {
  version: 1,
  generatedAt: '2026-10-03T12:00:00Z',
  games: [
    { id: 'game-alpha', name: 'Pokemon Game Alpha', consoles: ['GB'] },
    { id: 'game-bravo', name: 'Pokemon Game Bravo', consoles: ['GBA'] },
    { id: 'game-charlie', name: 'Pokemon Game Charlie', consoles: ['DS'] },
    { id: 'game-delta', name: 'Pokemon Game Delta', consoles: ['3DS'] },
    { id: 'game-echo', name: 'Pokemon Game Echo', consoles: ['3DS'], selectionGroup: 'game-delta' },
    { id: 'game-foxtrot', name: 'Pokemon Game Foxtrot', consoles: ['Switch'] },
    { id: 'game-golf', name: 'Pokemon Game Golf', consoles: ['Switch 2'] },
    // Como Legends: Z-A: Switch y Switch 2. Nombre largo para el desbordamiento de la burbuja (E2E-95).
    { id: 'game-zeta', name: 'Pokemon Legends Zeta: the remastered ultimate collector edition', consoles: ['Switch', 'Switch 2'] },
  ],
  songs: R_SONGS.map(({ toneHz: _t, ...rest }) => rest),
}

export const M_SONGS: FixtureSong[] = [song('mono-song-only1', 'Lonely Obelisk', ['game-alpha'], 'aaaaaaaaaaaaaaaa', 330)]

/** Catalogo M: una sola cancion habilitada; el diario siempre resuelve a ella. */
export const M_CATALOG: FixtureCatalog = {
  version: 1,
  generatedAt: '2026-10-03T12:00:00Z',
  games: [{ id: 'game-alpha', name: 'Pokemon Game Alpha', consoles: ['GB'] }],
  songs: M_SONGS.map(({ toneHz: _t, ...rest }) => rest),
}

export const STORES = {
  R: { catalog: R_CATALOG, songs: R_SONGS },
  M: { catalog: M_CATALOG, songs: M_SONGS },
} as const

// ---- Fixture del admin (E2E-62..72) ---------------------------------------------------------------------
// `work/<youtubeId>.mp3` solo existe para las dos canciones con fuente: la larga (40 s, para el seek) y la corta (7,4 s).

interface AdminSongSpec {
  id: string
  title: string
  games: string[]
  enabled: boolean
  reviewed: boolean
  durationSec?: number
  youtubeId: string
  clipKey: string
}

const A = (spec: AdminSongSpec) => spec

export const ADMIN_SONGS: AdminSongSpec[] = [
  A({ id: 'song-long-one', title: 'Long Melody', games: ['alpha'], enabled: true, reviewed: true, durationSec: 40, youtubeId: 'longsrc0001', clipKey: 'b1b1b1b1b1b1b1b1' }),
  A({ id: 'song-short-one', title: 'Short Jingle', games: ['alpha'], enabled: false, reviewed: false, durationSec: 7.4, youtubeId: 'shortsrc001', clipKey: 'b2b2b2b2b2b2b2b2' }),
  A({ id: 'song-bravo-a', title: 'Bravo Theme', games: ['bravo'], enabled: true, reviewed: true, durationSec: 120, youtubeId: 'bravosrc001', clipKey: 'b3b3b3b3b3b3b3b3' }),
  A({ id: 'song-bravo-b', title: 'Cañón de Bravo', games: ['bravo'], enabled: false, reviewed: true, durationSec: 100, youtubeId: 'bravosrc002', clipKey: 'b4b4b4b4b4b4b4b4' }),
  A({ id: 'song-multi', title: 'Multi Game Tune', games: ['alpha'], enabled: true, reviewed: false, durationSec: 90, youtubeId: 'multisrc001', clipKey: 'b5b5b5b5b5b5b5b5' }),
  A({ id: 'song-charlie', title: 'Charlie Song', games: ['charlie'], enabled: false, reviewed: false, durationSec: 80, youtubeId: 'charsrc0001', clipKey: 'b6b6b6b6b6b6b6b6' }),
  A({ id: 'song-nodur', title: 'Unknown Length', games: ['charlie'], enabled: false, reviewed: false, youtubeId: 'nodursrc001', clipKey: 'b7b7b7b7b7b7b7b7' }),
  A({ id: 'song-pending-b', title: 'Another Pending', games: ['bravo'], enabled: true, reviewed: false, durationSec: 60, youtubeId: 'pendsrc0001', clipKey: 'b8b8b8b8b8b8b8b8' }),
]

export const ADMIN_CATALOG = {
  version: 1,
  generatedAt: '2026-10-04T12:00:00Z',
  games: [
    { id: 'alpha', name: 'Admin Alpha', consoles: ['GB'] },
    { id: 'bravo', name: 'Admin Bravo', consoles: ['GBA'] },
    // Sin consolas y con canciones: el admin lo marca "Sin consola" (E2E-96/97). Delta no tiene canciones (E2E-101).
    { id: 'charlie', name: 'Admin Charlie' },
    { id: 'delta', name: 'Admin Delta', consoles: ['3DS'] },
  ],
  songs: ADMIN_SONGS.map((s) => ({
    id: s.id,
    title: s.title,
    games: s.games,
    clipKey: s.clipKey,
    startSec: 0,
    enabled: s.enabled,
    reviewed: s.reviewed,
    source: { youtubeId: s.youtubeId, videoTitle: `Original video of ${s.title}`, ...(s.durationSec === undefined ? {} : { durationSec: s.durationSec }) },
  })),
}

/** Fuentes sinteticas del admin: youtubeId -> segundos de tono. */
export const ADMIN_SOURCES: Record<string, { seconds: number; toneHz: number }> = {
  longsrc0001: { seconds: 40, toneHz: 330 },
  shortsrc001: { seconds: 7.4, toneHz: 440 },
}
