import type { CreateGameBody, GameView, PublicCatalog } from '../../../shared/api'

const REQUEST_TIMEOUT_MS = 20_000

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public retryAfterSec?: number,
  ) {
    super(code)
    this.name = 'ApiError'
  }
}

export interface ApiClient {
  health(): Promise<any>
  catalog(): Promise<PublicCatalog>
  createGame(body: CreateGameBody): Promise<GameView>
  getState(token: string): Promise<GameView>
  guess(token: string, songId: string): Promise<GameView>
  skip(token: string): Promise<GameView>
  fetchClip(clipUrl: string): Promise<Blob>
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
  const retryAfterSec = Number.isFinite(retryAfter) ? retryAfter : undefined
  let code = `HTTP_${response.status}`
  try {
    const body = await response.json()
    if (typeof body?.error?.code === 'string') code = body.error.code
  } catch {
    // Un proxy en frio devuelve HTML sin cuerpo JSON: basta el estado HTTP.
  }
  return new ApiError(code, response.status, retryAfterSec)
}

/** Nunca reintenta por su cuenta: reintentar un POST de accion podria consumir dos intentos. */
export function createApiClient(options: { baseUrl?: string; fetchFn?: typeof fetch } = {}): ApiClient {
  const baseUrl = options.baseUrl ?? ''
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))

  // /health no lleva timeout: durante el arranque en frio la peticion puede tardar casi un minuto.
  async function request(path: string, init: RequestInit = {}, withTimeout = true): Promise<Response> {
    let response: Response
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      if (withTimeout) {
        // AbortSignal.timeout no existe en Safari/iOS < 16: AbortController + setTimeout.
        const controller = new AbortController()
        timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        response = await fetchFn(baseUrl + path, { ...init, signal: controller.signal })
      } else {
        response = await fetchFn(baseUrl + path, init)
      }
    } catch {
      throw new ApiError('NETWORK', 0)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
    if (!response.ok) throw await errorFromResponse(response)
    return response
  }

  async function requestJson<T>(path: string, init?: RequestInit, withTimeout = true): Promise<T> {
    const response = await request(path, init, withTimeout)
    try {
      return (await response.json()) as T
    } catch {
      throw new ApiError('BAD_RESPONSE', response.status)
    }
  }

  const post = <T>(path: string, body: unknown) =>
    requestJson<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  return {
    health: () => requestJson('/api/health', undefined, false),
    catalog: () => requestJson<PublicCatalog>('/api/catalog'),
    createGame: (body) => post<GameView>('/api/games', body),
    getState: (token) => post<GameView>('/api/games/state', { token }),
    guess: (token, songId) => post<GameView>('/api/games/guess', { token, songId }),
    skip: (token) => post<GameView>('/api/games/skip', { token }),
    fetchClip: async (clipUrl) => (await request(clipUrl)).blob(),
  }
}
