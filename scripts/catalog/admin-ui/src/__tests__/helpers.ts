/**
 * CONTRATO DE admin-ui (lo que asumen los tests; ARQUITECTURA 6.1 / DEC-38 solo fijan el paquete y el modulo puro de filtros).
 *
 * src/filters.ts   filterSongs(catalog: { games: Game[]; songs: AdminSong[] }, filters: SongFilters): AdminSong[]
 *   SongFilters = { gameId?: string | null; enabled?: 'all'|'enabled'|'disabled'; reviewed?: 'all'|'reviewed'|'pending';
 *                   onlyTooShort?: boolean; onlyErrors?: boolean; text?: string }   (campo ausente = sin filtro; AND entre todos)
 * src/AdminApp.tsx  export function AdminApp({ fetchFn? }: { fetchFn?: typeof fetch })   (usa fetchFn o fetch global; mismo origen)
 *   Convenciones de accesibilidad que usan los tests:
 *   - cada cancion: elemento con data-song-id="<id>"; dentro: textbox "Titulo" + boton "Guardar titulo", boton "Activar"/"Desactivar",
 *     boton "Marcar revisada"/"Marcar pendiente", grupo "Juegos" con un checkbox por juego (etiqueta = nombre) + boton "Guardar juegos",
 *     <audio controls src="/api/songs/<id>/audio"> si hasSource, o el texto "Sin fuente descargada";
 *     marca "Demasiado corta (7,4 s)" (coma decimal, 1 decimal) si tooShort; los errors[] como texto.
 *   - panel de juegos: textbox "Nombre del juego nuevo" + boton "Crear juego"; por cada juego: textbox "Nombre del juego <id>"
 *     + boton "Renombrar <id>" y su songCount; el total aparece como "<n> canciones".
 *   - filtros: combobox "Juego" (opcion "Todos"), combobox "Estado" (Todas/Activadas/Desactivadas), combobox "Revision"
 *     (Todas/Revisadas/Pendientes), checkbox "Solo cortas", checkbox "Solo con errores", textbox "Buscar".
 *   - los errores de red/servidor se muestran en un elemento role="alert".
 * src/api.ts        createAdminApi({ fetchFn? }): { loadCatalog(), patchSong(id, patch), createGame(name), renameGame(id, name) }
 *   obtiene el token con GET /api/session (una vez; reintenta UNA vez tras un 403) y lo envia como X-Admin-Token en las mutaciones.
 */
import { vi } from 'vitest'

export interface FakeSong {
  id: string
  title: string
  games: string[]
  clipKey: string
  startSec: number
  enabled: boolean
  reviewed: boolean
  source: { youtubeId: string; videoTitle: string; durationSec?: number }
  durationSec?: number
  tooShort: boolean
  hasSource: boolean
  errors: string[]
}

export const GAMES = [
  { id: 'rse', name: 'Pokémon Ruby / Sapphire / Emerald' },
  { id: 'dp', name: 'Pokémon Diamond / Pearl' },
  { id: 'unused', name: 'Pokémon Unused' },
]

export function mkSong(over: Partial<FakeSong> & { id: string }): FakeSong {
  return {
    title: over.id,
    games: ['rse'],
    clipKey: '1111111111111111',
    startSec: 0,
    enabled: true,
    reviewed: false,
    source: { youtubeId: 'AAAAAAAAAAA', videoTitle: `Video ${over.id}`, durationSec: 120.5 },
    durationSec: 120.5,
    tooShort: false,
    hasSource: true,
    errors: [],
    ...over,
  }
}

export function baseSongs(): FakeSong[] {
  return [
    mkSong({ id: 'rse-littleroot-town', title: 'Littleroot Town', games: ['rse'], enabled: true, reviewed: true, source: { youtubeId: 'AAAAAAAAAA1', videoTitle: 'Pokemon RSE - Littleroot Town', durationSec: 183.42 } }),
    mkSong({ id: 'rse-oldale-town', title: 'Oldale Town', games: ['rse'], enabled: false, reviewed: false, source: { youtubeId: 'AAAAAAAAAA2', videoTitle: 'Pokemon RSE - Oldale Town', durationSec: 120.5 } }),
    mkSong({ id: 'rse-badge', title: 'Obtained a Badge', games: ['rse'], enabled: false, reviewed: true, durationSec: 7.4, tooShort: true, source: { youtubeId: 'AAAAAAAAAA3', videoTitle: 'Obtained a Badge', durationSec: 7.4 } }),
    mkSong({ id: 'dp-twinleaf-town', title: 'Twinleaf Town', games: [], enabled: false, reviewed: false, hasSource: false, errors: ['dp-twinleaf-town: games debe ser un array no vacio'], source: { youtubeId: 'AAAAAAAAAA4', videoTitle: 'Twinleaf Town - Diamond' } }),
    mkSong({ id: 'dp-dash', title: 'Dash Song', games: ['dp', 'rse'], enabled: true, reviewed: false, source: { youtubeId: '-BRQ_XVwg-M', videoTitle: 'Dash', durationSec: 90 } }),
  ]
}

export interface RequestLog {
  method: string
  path: string
  headers: Record<string, string>
  body: any
}

type Override = (req: RequestLog) => { status: number; body: unknown } | undefined

/** Servidor del admin simulado en memoria (fetch). Aplica las reglas basicas del contrato de AR 6.1. */
export function fakeAdmin(initial: { songs?: FakeSong[]; games?: Array<{ id: string; name: string }> } = {}) {
  const state = { songs: structuredClone(initial.songs ?? baseSongs()), games: structuredClone(initial.games ?? GAMES) }
  const log: RequestLog[] = []
  let override: Override | undefined
  let sessionFailures = 0

  const catalogBody = () => ({
    games: state.games.map((g) => ({ ...g, songCount: state.songs.filter((s) => s.games.includes(g.id)).length })),
    songs: structuredClone(state.songs),
  })
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const err = (status: number, code: string, message = 'error simulado') => json(status, { error: { code, message } })

  const fetchFn = vi.fn(async (input: any, init: any = {}) => {
    const url = new URL(String(input), 'http://127.0.0.1:5180')
    const method = String(init.method ?? 'GET').toUpperCase()
    const headers: Record<string, string> = {}
    new Headers(init.headers ?? {}).forEach((v, k) => (headers[k.toLowerCase()] = v))
    const body = init.body ? JSON.parse(init.body) : undefined
    const req: RequestLog = { method, path: url.pathname, headers, body }
    log.push(req)

    if (url.pathname === '/api/session') {
      if (sessionFailures > 0) {
        sessionFailures--
        return err(500, 'SERVER_ERROR', 'sesion no disponible')
      }
      return json(200, { token: 'tok-123' })
    }
    const forced = override?.(req)
    if (forced) return json(forced.status, forced.body)
    if (url.pathname === '/api/catalog' && method === 'GET') return json(200, catalogBody())

    if (method !== 'GET' && headers['x-admin-token'] !== 'tok-123') return err(403, 'FORBIDDEN', 'token invalido')

    let m = /^\/api\/songs\/([^/]+)$/.exec(url.pathname)
    if (m && method === 'PATCH') {
      const song = state.songs.find((s) => s.id === decodeURIComponent(m![1]))
      if (!song) return err(404, 'NOT_FOUND')
      if (body.title !== undefined && String(body.title).trim() === '') return err(400, 'VALIDATION_ERROR', 'El titulo no puede estar vacio')
      if (body.enabled === true && song.tooShort) return err(409, 'TOO_SHORT', 'La cancion es demasiado corta para activarla')
      if (body.title !== undefined) song.title = String(body.title).trim()
      if (body.games !== undefined) song.games = body.games
      if (body.enabled !== undefined) song.enabled = body.enabled
      if (body.reviewed !== undefined) song.reviewed = body.reviewed
      return json(200, structuredClone(song))
    }
    if (url.pathname === '/api/games' && method === 'POST') {
      const name = String(body.name ?? '').trim()
      if (!name) return err(400, 'VALIDATION_ERROR', 'El nombre no puede estar vacio')
      if (state.games.some((g) => g.name.toLowerCase() === name.toLowerCase())) return err(400, 'VALIDATION_ERROR', 'Ya existe un juego con ese nombre')
      const game = { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name }
      state.games.push(game)
      return json(201, game)
    }
    m = /^\/api\/games\/([^/]+)$/.exec(url.pathname)
    if (m && method === 'PATCH') {
      const game = state.games.find((g) => g.id === m![1])
      if (!game) return err(404, 'NOT_FOUND')
      const name = String(body.name ?? '').trim()
      if (!name) return err(400, 'VALIDATION_ERROR', 'El nombre no puede estar vacio')
      if (state.games.some((g) => g.id !== game.id && g.name.toLowerCase() === name.toLowerCase())) return err(400, 'VALIDATION_ERROR', 'Ya existe un juego con ese nombre')
      game.name = name
      return json(200, { id: game.id, name })
    }
    return err(404, 'NOT_FOUND')
  })

  return {
    fetchFn,
    state,
    log,
    /** Peticiones de mutacion (todo lo que no es GET). */
    mutations: () => log.filter((r) => r.method !== 'GET'),
    catalogGets: () => log.filter((r) => r.method === 'GET' && r.path === '/api/catalog').length,
    sessionGets: () => log.filter((r) => r.path === '/api/session').length,
    setOverride(fn: Override | undefined) {
      override = fn
    },
    failSession(times: number) {
      sessionFailures = times
    },
  }
}
