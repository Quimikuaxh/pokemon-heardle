import { describe, it, expect, vi } from 'vitest'
import { createApiClient, ApiError } from '../api/client'
import { mkView } from './helpers'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const err = (code: string, status: number, headers: Record<string, string> = {}) => json({ error: { code, message: 'm' } }, status, headers)

function setup(res: () => Response | Promise<Response>, baseUrl = 'https://api.test') {
  const fetchFn = vi.fn(async (_u: any, _i?: any) => res())
  return { fetchFn, api: createApiClient({ baseUrl, fetchFn: fetchFn as any }) }
}
const body = (fetchFn: any, i = 0) => JSON.parse(fetchFn.mock.calls[i][1].body)
const url = (fetchFn: any, i = 0) => String(fetchFn.mock.calls[i][0])

describe('api/client peticiones', () => {
  it('createGame diario: POST {baseUrl}/api/games con cuerpo exactamente {mode:"daily"}', async () => {
    const { api, fetchFn } = setup(() => json(mkView()))
    await api.createGame({ mode: 'daily' })
    expect([url(fetchFn), fetchFn.mock.calls[0][1].method, body(fetchFn)]).toEqual(['https://api.test/api/games', 'POST', { mode: 'daily' }])
  })

  it('createGame ilimitado envia mode y games', async () => {
    const { api, fetchFn } = setup(() => json(mkView()))
    await api.createGame({ mode: 'unlimited', games: ['rse'] })
    expect(body(fetchFn)).toEqual({ mode: 'unlimited', games: ['rse'] })
  })

  it('FE-SRC-07 guess envia exactamente {token, songId}', async () => {
    const { api, fetchFn } = setup(() => json(mkView()))
    await api.guess('tok', 'song-1')
    expect([url(fetchFn), body(fetchFn)]).toEqual(['https://api.test/api/games/guess', { token: 'tok', songId: 'song-1' }])
  })

  it('skip y getState envian {token} a su ruta', async () => {
    const { api, fetchFn } = setup(() => json(mkView()))
    await api.skip('t1')
    await api.getState('t2')
    expect([url(fetchFn, 0), body(fetchFn, 0), url(fetchFn, 1), body(fetchFn, 1)]).toEqual([
      'https://api.test/api/games/skip',
      { token: 't1' },
      'https://api.test/api/games/state',
      { token: 't2' },
    ])
  })

  it('las peticiones JSON llevan Content-Type application/json', async () => {
    const { api, fetchFn } = setup(() => json(mkView()))
    await api.skip('t')
    const h = new Headers(fetchFn.mock.calls[0][1].headers)
    expect(h.get('content-type')).toContain('application/json')
  })

  it('devuelve la GameView parseada', async () => {
    const v = mkView({ token: 'abc' })
    const { api } = setup(() => json(v))
    expect(await api.skip('t')).toEqual(v)
  })

  it('health hace GET {baseUrl}/api/health', async () => {
    const { api, fetchFn } = setup(() => json({ ok: true, catalog: true }))
    await api.health()
    expect([url(fetchFn), fetchFn.mock.calls[0][1]?.method ?? 'GET']).toEqual(['https://api.test/api/health', 'GET'])
  })

  it('fetchClip pide baseUrl + clipUrl y devuelve un Blob', async () => {
    const { api, fetchFn } = setup(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }))
    const b = await api.fetchClip('/api/clips/abc')
    expect(url(fetchFn)).toBe('https://api.test/api/clips/abc')
    expect(b.size).toBe(3)
  })
})

describe('api/client errores', () => {
  it('traduce { error: { code } } a ApiError con code y status', async () => {
    const { api } = setup(() => err('TOKEN_INVALID', 401))
    const e = await api.getState('t').catch((x) => x)
    expect([e instanceof ApiError, e.code, e.status]).toEqual([true, 'TOKEN_INVALID', 401])
  })

  it('FE-API-05 409 ALREADY_GUESSED: una sola peticion, sin reintento', async () => {
    const { api, fetchFn } = setup(() => err('ALREADY_GUESSED', 409))
    await api.guess('t', 's').catch(() => {})
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('FE-API-05 409 GAME_OVER: una sola peticion, sin reintento', async () => {
    const { api, fetchFn } = setup(() => err('GAME_OVER', 409))
    await api.guess('t', 's').catch(() => {})
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('FE-API-04 sin reintentos de POST de accion tras 4xx', async () => {
    const { api, fetchFn } = setup(() => err('UNKNOWN_SONG', 400))
    await api.guess('t', 's').catch(() => {})
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('FE-API-04 sin reintentos de POST de accion tras fallo de red', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const api = createApiClient({ baseUrl: 'https://api.test', fetchFn: fetchFn as any })
    const e = await api.skip('t').catch((x) => x)
    expect([fetchFn.mock.calls.length, e.code, e.status]).toEqual([1, 'NETWORK', 0])
  })

  it('FE-GAM-09 429 expone retryAfterSec desde la cabecera Retry-After', async () => {
    const { api } = setup(() => err('RATE_LIMITED', 429, { 'retry-after': '7' }))
    const e = await api.skip('t').catch((x) => x)
    expect([e.code, e.retryAfterSec]).toEqual(['RATE_LIMITED', 7])
  })

  it('health con 503 sin cuerpo JSON (proxy en frio) -> ApiError con status 503', async () => {
    const { api } = setup(() => new Response('<html>Service Unavailable</html>', { status: 503 }))
    const e = await api.health().catch((x) => x)
    expect([e instanceof ApiError, e.status]).toEqual([true, 503])
  })

  it('health 503 CATALOG_UNAVAILABLE conserva el codigo', async () => {
    const { api } = setup(() => err('CATALOG_UNAVAILABLE', 503))
    expect((await api.health().catch((x) => x)).code).toBe('CATALOG_UNAVAILABLE')
  })

  it('fetchClip 410 -> ApiError status 410', async () => {
    const { api } = setup(() => err('CLIP_TICKET_USED', 410))
    expect((await api.fetchClip('/api/clips/x').catch((x) => x)).status).toBe(410)
  })

  it('respuesta 200 con cuerpo no JSON no deja una excepcion cruda', async () => {
    const { api } = setup(() => new Response('no json', { status: 200 }))
    const e = await api.skip('t').catch((x) => x)
    expect(e instanceof ApiError).toBe(true)
  })
})
