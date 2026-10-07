import { createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMp3 } from '../../../shared/test/helpers/mp3'

export const CLIP_SECONDS = [1, 2, 4, 7, 11, 16]
/** Referencia DEC-44 escrita a mano en el test (NO importa shared/rules): bytes del prefijo que se sirve en cada intento. */
export const OFFSETS = [16300, 32182, 64365, 112013, 176378, 256626]
export const TOTAL_BYTES = 256626

export interface FixtureGame {
  id: string
  name: string
  consoles?: string[]
  selectionGroup?: string
}

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
    song('ab-multi-game-song-017', 'Marigold Citadel', ['A'], '5555555555555555'), // DEC-53: un solo juego por cancion
    song('c-only-song-05', 'Tangerine Glacier', ['C'], '6666666666666666'),
    song('d-only-song-06', 'Hollow Pinecone', ['D'], '7777777777777777'),
    song('a-disabled-song-07', 'Phantom Biscuit', ['A'], '8888888888888888', false),
  ]
  return {
    version: 1,
    generatedAt: '2026-10-03T12:00:00Z',
    games: [
      // orden de salida A < B < C < D; C hace de "Legends: Z-A" (Switch y Switch 2) y D es solo Switch 2
      { id: 'A', name: 'Pokemon Game Alpha', consoles: ['GBA'] },
      { id: 'B', name: 'Pokemon Game Bravo', consoles: ['DS'] },
      { id: 'C', name: 'Pokemon Game Charlie', consoles: ['Switch', 'Switch 2'] },
      { id: 'D', name: 'Pokemon Game Delta', consoles: ['Switch 2'] },
    ] as FixtureGame[],
    songs,
  }
}

/**
 * Catalogo de pistas (TEST_PLAN 0.4), en orden de salida: rby GB, gsc GBC, rse GBA, bw DS, xy 3DS, swsh Switch,
 * za Switch + Switch 2; ademas sw2only (Switch 2) y noconsole (sin consoles). Dos canciones por juego.
 */
export const HINT_GAMES: FixtureGame[] = [
  { id: 'rby', name: 'Pokemon Red/Blue/Yellow', consoles: ['GB'] },
  { id: 'gsc', name: 'Pokemon Gold/Silver/Crystal', consoles: ['GBC'] },
  { id: 'rse', name: 'Pokemon Ruby/Sapphire/Emerald', consoles: ['GBA'] },
  { id: 'bw', name: 'Pokemon Black/White', consoles: ['DS'] },
  { id: 'xy', name: 'Pokemon X/Y', consoles: ['3DS'] },
  { id: 'swsh', name: 'Pokemon Sword/Shield', consoles: ['Switch'] },
  { id: 'za', name: 'Pokemon Legends Z-A', consoles: ['Switch', 'Switch 2'] },
  { id: 'sw2only', name: 'Pokemon Switch Two Only', consoles: ['Switch 2'] },
  { id: 'noconsole', name: 'Pokemon Sin Consola' },
]
const HINT_TITLES = ['Zubat Lullaby', 'Mossdeep Sunrise', 'Rustboro Fanfare', 'Lavender Echo', 'Cerulean Drift', 'Viridian Dusk', 'Petalburg Rain', 'Slateport Bazaar', 'Fortree Canopy', 'Lilycove Harbor', 'Sootopolis Calm', 'Dewford Tide', 'Pacifidlog Wind', 'Mauville Neon', 'Verdanturf Meadow', 'Fallarbor Ash', 'Lavaridge Steam', 'Oldale Breeze']
export function hintsCatalog(): AnyCatalog {
  const songs: FixtureSong[] = []
  HINT_GAMES.forEach((g, gi) => {
    for (let k = 0; k < 2; k++) {
      const n = gi * 2 + k
      songs.push(song(`${g.id}-song-${k + 1}`, HINT_TITLES[n], [g.id], (0xa0 + n).toString(16).padStart(2, '0').repeat(8)))
    }
  })
  return { version: 1, generatedAt: '2026-10-05T12:00:00Z', games: HINT_GAMES.map((g) => ({ ...g })), songs }
}

/**
 * Catalogo con grupos de seleccion: spec en orden de `games`. Cada juego tiene `songs` canciones activas
 * (`off` desactivadas extra) y `group` opcional (= selectionGroup). ids de cancion `<juego>-s<NN>`.
 */
export function groupedCatalog(spec: Array<{ id: string; group?: string; songs: number; off?: number }>): AnyCatalog {
  const games: FixtureGame[] = spec.map((g) => ({ id: g.id, name: `Game ${g.id}`, consoles: ['DS'], ...(g.group ? { selectionGroup: g.group } : {}) }))
  const songs: FixtureSong[] = []
  let counter = 0
  for (const g of spec) {
    for (let k = 0; k < g.songs + (g.off ?? 0); k++) {
      counter++
      songs.push(song(`${g.id}-s${String(k).padStart(2, '0')}`, `Title ${g.id} ${k}`, [g.id], counter.toString(16).padStart(16, '0'), k < g.songs))
    }
  }
  return { version: 1, generatedAt: '2026-10-05T12:00:00Z', games, songs }
}

/** Catalogo M: una sola cancion habilitada. */
export function catalogM() {
  return {
    version: 1,
    generatedAt: '2026-10-03T12:00:00Z',
    games: [{ id: 'A', name: 'Pokemon Game Alpha', consoles: ['GBA'] }] as FixtureGame[],
    songs: [song('mono-song-only1', 'Lonely Obelisk', ['A'], 'aaaaaaaaaaaaaaaa')],
  }
}

export type CatalogFixture = ReturnType<typeof catalogR>
export type AnyCatalog = { version: number; generatedAt: string; games: FixtureGame[]; songs: FixtureSong[] }

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

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Grupo de seleccion de un juego: `selectionGroup` o su propio id (DEC-54). */
export const groupOf = (game: FixtureGame) => game.selectionGroup ?? game.id

/**
 * Grupos de seleccion con alguna cancion `enabled`, por id del grupo (no por la posicion en `games`);
 * canciones de todos los juegos del grupo, por id. Calculado en el test, NO con la funcion bajo prueba.
 * `onlyGames` limita a los juegos filtrados (modo libre).
 */
export function referenceGroups(catalog: { games: FixtureGame[]; songs: FixtureSong[] }, onlyGames?: string[]) {
  const gameGroup = new Map(catalog.games.map((g) => [g.id, groupOf(g)]))
  const order = [...new Set(catalog.games.map(groupOf))].sort()
  const groups = order.map((id) => ({
    id,
    songs: catalog.songs
      .filter((s) => s.enabled && gameGroup.get(s.games[0]) === id && (!onlyGames || onlyGames.includes(s.games[0])))
      .sort(byId),
  }))
  return groups.filter((g) => g.songs.length > 0)
}

/** Vector independiente de BE-DAY-05 (DEC-09 v2): bytes 0-5 -> grupo; bytes 6-11 -> cancion del grupo. */
export function dailyVectorV2(catalog: { games: FixtureGame[]; songs: FixtureSong[] }, seed: string, date: string) {
  const groups = referenceGroups(catalog)
  const mac = createHmac('sha256', seed).update(`daily|v2|${date}`).digest()
  const group = groups[mac.readUIntBE(0, 6) % groups.length]
  return { group, song: group.songs[mac.readUIntBE(6, 6) % group.songs.length], groupIndex: groups.indexOf(group) }
}

/** Seleccion v1 (anterior a DEC-54), solo para comprobar que v2 es distinta. */
export function dailyTargetV1(catalog: { songs: FixtureSong[] }, seed: string, date: string): FixtureSong {
  const list = catalog.songs.filter((s) => s.enabled).sort(byId)
  return list[createHmac('sha256', seed).update(`daily|v1|${date}`).digest().readUIntBE(0, 6) % list.length]
}

export function dailyTarget(catalog: { games: FixtureGame[]; songs: FixtureSong[] }, seed: string, date: string): FixtureSong {
  return dailyVectorV2(catalog, seed, date).song
}

/** Fechas consecutivas (YYYY-MM-DD) desde `start`: muestreos deterministas, nunca Math.random. */
export function dateRange(n: number, start = '2000-01-01'): string[] {
  const out: string[] = []
  const d = new Date(start + 'T00:00:00Z')
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** PRNG con semilla (mulberry32): randomInt(max) determinista para los muestreos del modo libre. */
export function seededRandomInt(seed: number): (max: number) => number {
  let a = seed >>> 0
  return (max) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max)
  }
}

export const T = {
  // instantes fijos (UTC) con su fecha Madrid
  JUL_01_NOON: Date.parse('2026-07-01T12:00:00Z'), // 2026-07-01
  JUL_02_0300Z: Date.parse('2026-07-02T03:00:00Z'), // 2026-07-02 05:00 CEST, antes de exp (04:00Z) del 07-01? exp = 07-02T04:00Z
  JUL_02_NOON: Date.parse('2026-07-02T12:00:00Z'),
}
