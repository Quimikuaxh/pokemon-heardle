export interface AdminSong {
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

export interface AdminGame {
  id: string
  name: string
  songCount: number
}

export interface AdminCatalog {
  games: AdminGame[]
  songs: AdminSong[]
}

export interface AdminApi {
  loadCatalog(): Promise<AdminCatalog>
  patchSong(id: string, patch: Record<string, unknown>): Promise<AdminSong>
  createGame(name: string): Promise<{ id: string; name: string }>
  renameGame(id: string, name: string): Promise<{ id: string; name: string }>
}

export class AdminApiError extends Error {}

/**
 * Cliente de la API local. El token de sesion se pide una vez (GET /api/session) y se envia en las
 * mutaciones; tras un 403 se pide de nuevo UNA vez y se reintenta la mutacion una sola vez.
 */
export function createAdminApi(options: { fetchFn?: typeof fetch } = {}): AdminApi {
  const fetchFn: typeof fetch = options.fetchFn ?? ((input, init) => fetch(input, init))
  let token: string | null = null

  async function send(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetchFn(path, init)
    } catch {
      throw new AdminApiError('No se pudo conectar con el admin. ¿Sigue arrancado?')
    }
  }

  async function errorOf(response: Response): Promise<AdminApiError> {
    try {
      const body = await response.json()
      if (typeof body?.error?.message === 'string') return new AdminApiError(body.error.message)
    } catch {
      // cuerpo sin JSON: basta el estado HTTP
    }
    return new AdminApiError(`El admin respondio con un error (${response.status}).`)
  }

  async function sessionToken(refresh = false): Promise<string> {
    if (token && !refresh) return token
    const response = await send('/api/session')
    if (!response.ok) throw new AdminApiError('No se pudo obtener la sesion del admin.')
    token = (await response.json()).token as string
    return token
  }

  async function mutate<T>(method: string, path: string, body: unknown): Promise<T> {
    const attempt = async (sessionValue: string) =>
      send(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': sessionValue },
        body: JSON.stringify(body),
      })
    let response = await attempt(await sessionToken())
    if (response.status === 403) response = await attempt(await sessionToken(true))
    if (!response.ok) throw await errorOf(response)
    return (await response.json()) as T
  }

  return {
    async loadCatalog() {
      const response = await send('/api/catalog')
      if (!response.ok) throw await errorOf(response)
      return (await response.json()) as AdminCatalog
    },
    patchSong: (id, patch) => mutate('PATCH', `/api/songs/${encodeURIComponent(id)}`, patch),
    createGame: (name) => mutate('POST', '/api/games', { name }),
    renameGame: (id, name) => mutate('PATCH', `/api/games/${encodeURIComponent(id)}`, { name }),
  }
}
