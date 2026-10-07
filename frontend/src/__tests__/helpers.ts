/**
 * CONTRATO DE MODULOS DEL FRONTEND (lo que asumen los tests; ARQUITECTURA 2 y 7 solo dan carpetas).
 *
 * api/client.ts
 *   class ApiError extends Error { constructor(code, status, retryAfterSec?) ; code; status; retryAfterSec? }
 *     red caida -> code 'NETWORK', status 0
 *   createApiClient({ baseUrl?: string; fetchFn?: typeof fetch }): ApiClient
 *     health(), catalog(), createGame(body), getState(token), guess(token, songId), skip(token), fetchClip(clipUrl): Blob
 *     Nunca reintenta POSTs de accion por su cuenta.
 * api/warmup.ts
 *   useBackendWarmup(api: { health(): Promise<unknown> }): { status: 'waking'|'ready'|'error'; retry(): void }
 * storage/store.ts
 *   createStore(storage: Storage): Store   claves: heardle:filter, heardle:daily:<fecha>, heardle:unlimited,
 *                                           (heardle:stats:* RETIRADAS, DEC-43: createStore las borra al crearse)
 *   getFilter(): string[]; setFilter(ids)
 *   getDaily(date): DailyRecord | null; setDaily(date, rec)        DailyRecord = { token, finished, view? }
 *   getUnlimited(): { token } | null; setUnlimited(rec | null)
 *   writeFailed: boolean (true tras un fallo de escritura); ninguna operacion lanza.
 * game/search.ts
 *   searchSongs(catalog: PublicCatalog, query: string): Array<{ id, title, games: {id,name}[] }>
 * game/view.ts
 *   currentClipSeconds(view): number | null;  resultLabel(result): string
 * game/controller.ts
 *   createGameController({ api, store, catalog, nowMs?: () => number }): GameController
 *     getState(): { phase: 'idle'|'loading'|'playing'|'finished'; mode: 'daily'|'unlimited'|null;
 *                   view: GameView | null; notice: { kind, message, retryAfterSec? } | null }
 *     notice.kind: 'already-guessed'|'rate-limited'|'invalid-token'|'empty-filter'|'unknown-game'|'network'
 *     subscribe(fn): unsubscribe; getFilter(); setFilter(ids)
 *     openDaily(); startUnlimited(); resumeUnlimited(); guess(songId); skip()
 * audio/clipPlayer.ts
 *   createClipPlayer({ fetchClip, refreshClipUrl, createObjectURL, revokeObjectURL, createAudio })
 *     prepare(clipUrl, key): Promise<void>; play(): void (sincrono); dispose(): void
 * components/SongSearch.tsx   export function SongSearch({ catalog, guesses, disabled?, onSelect(songId) })
 * components/FilterPanel.tsx  export function FilterPanel({ games, selected, onChange(ids), onStart() })
 */
import { vi } from 'vitest'

export const GAMES = [
  { id: 'rse', name: 'Pokémon Ruby / Sapphire / Emerald' },
  { id: 'dp', name: 'Pokémon Diamond / Pearl' },
  { id: 'bw', name: 'Pokémon Black / White' },
]

export const SONGS = [
  { id: 'rse-littleroot-town', title: 'Littleroot Town', games: ['rse'] },
  { id: 'rse-oldale-town', title: 'Oldale Town', games: ['rse'] },
  { id: 'dp-twinleaf-town', title: 'Twinleaf Town', games: ['dp'] },
  { id: 'dp-cafe-theme', title: 'Café Théme', games: ['dp'] }, // DEC-53: un solo juego por cancion
  { id: 'bw-castle', title: "N's Castle", games: ['bw'] },
]

/** Catalogo de n canciones del mismo juego (listas largas, burbuja, rendimiento). */
export function bigCatalog(n: number, gameId = 'rse'): any {
  const songs = Array.from({ length: n }, (_, i) => ({ id: `${gameId}-tema-${String(i).padStart(4, '0')}`, title: `Tema numero ${i}`, games: [gameId] }))
  return { version: 1, games: GAMES, songs: [...songs, ...SONGS.filter((s) => s.games[0] !== gameId)] }
}

export function mkCatalog(): any {
  return { version: 1, games: GAMES, songs: SONGS }
}

export function mkView(over: Record<string, unknown> = {}): any {
  return {
    token: 'tok-0',
    mode: 'unlimited',
    status: 'playing',
    attempt: 0,
    maxAttempts: 6,
    clipSeconds: [1, 2, 4, 7, 11, 16],
    results: [],
    guesses: [],
    clipUrl: '/api/clips/ticket-0',
    ...over,
  }
}

export const YOUTUBE_ID = 'dQw4w9WgXcQ'

export const SOLUTION = {
  id: 'rse-littleroot-town',
  title: 'Littleroot Town',
  games: [{ id: 'rse', name: 'Pokémon Ruby / Sapphire / Emerald' }],
  youtubeId: YOUTUBE_ID,
}

export function mkFinished(over: Record<string, unknown> = {}): any {
  const { clipUrl: _omit, ...rest } = mkView()
  return { ...rest, status: 'won', attempt: 1, results: ['hit'], guesses: ['rse-littleroot-town'], solution: SOLUTION, ...over }
}

export function mkApi(over: Record<string, unknown> = {}): any {
  return {
    health: vi.fn(),
    catalog: vi.fn(),
    createGame: vi.fn(),
    getState: vi.fn(),
    guess: vi.fn(),
    skip: vi.fn(),
    fetchClip: vi.fn(),
    ...over,
  }
}

/** Fecha de "hoy" fija: 2026-10-03 10:00Z = 12:00 en Madrid. */
export const TODAY = '2026-10-03'
export const NOW_MS = Date.parse('2026-10-03T10:00:00Z')
