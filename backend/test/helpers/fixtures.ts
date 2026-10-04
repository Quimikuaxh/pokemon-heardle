import { createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMp3 } from '../../../shared/test/helpers/mp3'

export const CLIP_SECONDS = [1, 2, 4, 7, 11, 16]
/** Referencia DEC-44 escrita a mano en el test (NO importa shared/rules): bytes del prefijo que se sirve en cada intento. */
export const OFFSETS = [16300, 32182, 64365, 112013, 176378, 256626]
export const TOTAL_BYTES = 256626

export interface FixtureSong {
  id: string
  title: string
  games: string[]
  clipKey: string
  startSec: number
  enabled: boolean
  reviewed: boolean
  source: { youtubeId: string; videoTitle: string; durationSec: number }
}

function song(id: string, title: string, games: string[], clipKey: string, enabled = true): FixtureSong {
  return {
    id,
    title,
    games,
    clipKey,
    startSec: 7,
    enabled,
    reviewed: true,
    source: {
      youtubeId: `yt${clipKey.slice(0, 9)}`,
      videoTitle: `Video original de ${title} (OST)`,
      // duracion medida de la fuente (DEC-40), siempre con decimales y > 16,1 s
      durationSec: Number((121.37 + parseInt(clipKey.slice(0, 2), 16) * 1.01).toFixed(2)),
    },
  }
}

/**
 * Catalogo R (TEST_PLAN 3): 4 juegos A,B,C,D. Ids de 13 y 22 caracteres.
 * Orden por id: a-one, a-two, ab-multi, b-one, b-two, c-only, d-only (a-disabled no cuenta).
 * C y D tienen una sola cancion cada una (pool de 1 para fijar el objetivo del ilimitado).
 */
export function catalogR() {
  const songs: FixtureSong[] = [
    song('a-one-song-01', 'Zephyr Harbor', ['A'], '1111111111111111'),
    song('a-two-song-02', 'Quasar Meadow', ['A'], '2222222222222222'),
    song('b-one-song-03', 'Obsidian Lantern', ['B'], '3333333333333333'),
    song('b-two-song-04', 'Velvet Cascade', ['B'], '4444444444444444'),
    song('ab-multi-game-song-017', 'Marigold Citadel', ['A', 'B'], '5555555555555555'),
    song('c-only-song-05', 'Tangerine Glacier', ['C'], '6666666666666666'),
    song('d-only-song-06', 'Hollow Pinecone', ['D'], '7777777777777777'),
    song('a-disabled-song-07', 'Phantom Biscuit', ['A'], '8888888888888888', false),
  ]
  return {
    version: 1,
    generatedAt: '2026-10-03T12:00:00Z',
    games: [
      { id: 'A', name: 'Pokemon Game Alpha' },
      { id: 'B', name: 'Pokemon Game Bravo' },
      { id: 'C', name: 'Pokemon Game Charlie' },
      { id: 'D', name: 'Pokemon Game Delta' },
    ],
    songs,
  }
}

/** Catalogo M: una sola cancion habilitada. */
export function catalogM() {
  return {
    version: 1,
    generatedAt: '2026-10-03T12:00:00Z',
    games: [{ id: 'A', name: 'Pokemon Game Alpha' }],
    songs: [song('mono-song-only1', 'Lonely Obelisk', ['A'], 'aaaaaaaaaaaaaaaa')],
  }
}

export type CatalogFixture = ReturnType<typeof catalogR>

export const ids = (songs: Array<{ id: string }>) => songs.map((s) => s.id)

export function enabledSorted(catalog: CatalogFixture): FixtureSong[] {
  return catalog.songs.filter((s) => s.enabled).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Clip unico sintetico (DEC-44): 614 tramas MPEG-1 L3 128 kbps 44,1 kHz estereo, patron 417/418, main_data_begin=0,
 * 256.626 bytes, sin ID3 ni Xing. Generado por shared/test/helpers/mp3 (independiente de las constantes de produccion).
 * Los datos de cada cancion son distintos (semilla = clipKey); las cabeceras son iguales.
 */
export function makeClip(clipKey: string, options?: Parameters<typeof buildMp3>[1]): Buffer {
  return buildMp3(clipKey, options)
}

/** Escribe un almacen driver `fs` en un directorio temporal nuevo (layout nuevo: clips/<clipKey>.mp3). */
export function writeStore(catalog: unknown, songs: Array<{ clipKey: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), 'heardle-store-'))
  mkdirSync(join(dir, 'catalog'), { recursive: true })
  writeFileSync(join(dir, 'catalog', 'catalog.json'), JSON.stringify(catalog))
  mkdirSync(join(dir, 'clips'), { recursive: true })
  for (const s of songs) writeFileSync(join(dir, 'clips', `${s.clipKey}.mp3`), makeClip(s.clipKey))
  return dir
}

/** Vector independiente de BE-DAY-05 (NO usa la funcion bajo test). */
export function dailyIndexVector(seed: string, date: string, n: number): number {
  const mac = createHmac('sha256', seed).update(`daily|v1|${date}`).digest()
  return mac.readUIntBE(0, 6) % n
}

export function dailyTarget(catalog: CatalogFixture, seed: string, date: string): FixtureSong {
  const list = enabledSorted(catalog)
  return list[dailyIndexVector(seed, date, list.length)]
}

export const T = {
  // instantes fijos (UTC) con su fecha Madrid
  JUL_01_NOON: Date.parse('2026-07-01T12:00:00Z'), // 2026-07-01
  JUL_02_0300Z: Date.parse('2026-07-02T03:00:00Z'), // 2026-07-02 05:00 CEST, antes de exp (04:00Z) del 07-01? exp = 07-02T04:00Z
  JUL_02_NOON: Date.parse('2026-07-02T12:00:00Z'),
}
