import { describe, expect, it, vi } from 'vitest'
import { PostgresRateLimiter } from '../../src/http/postgresRateLimiter'
import { SupabaseClipStore } from '../../src/storage/SupabaseClipStore'

const URL_ = 'https://ref.supabase.co/'
const KEY = 'service-role-key'

type Call = { url: string; init: RequestInit }

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const call = { url, init }
    calls.push(call)
    return respond(call)
  })
  return { fn, calls }
}

describe('SupabaseClipStore', () => {
  it('lee clips/<clipKey>.mp3 del bucket con la clave service_role', async () => {
    const { fn, calls } = fakeFetch(() => new Response(new Uint8Array([1, 2, 3])))
    const store = new SupabaseClipStore({ url: URL_, serviceRoleKey: KEY, bucket: 'heardle-audio', fetchFn: fn })
    expect([...(await store.getClip('0123456789abcdef'))]).toEqual([1, 2, 3])
    expect(calls[0].url).toBe('https://ref.supabase.co/storage/v1/object/heardle-audio/clips/0123456789abcdef.mp3')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
  })

  it('lee y parsea catalog/catalog.json', async () => {
    const { fn, calls } = fakeFetch(() => new Response('{"version":1}'))
    const store = new SupabaseClipStore({ url: URL_, serviceRoleKey: KEY, bucket: 'heardle-audio', fetchFn: fn })
    expect(await store.getCatalog()).toEqual({ version: 1 })
    expect(calls[0].url.endsWith('/heardle-audio/catalog/catalog.json')).toBe(true)
  })

  it('un clipKey mal formado no llega a pedirse (anti path traversal)', async () => {
    const { fn } = fakeFetch(() => new Response(''))
    const store = new SupabaseClipStore({ url: URL_, serviceRoleKey: KEY, bucket: 'b', fetchFn: fn })
    await expect(store.getClip('../catalog/x')).rejects.toMatchObject({ code: 'STORAGE_ERROR' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('una respuesta no 2xx o un fallo de red es STORAGE_ERROR', async () => {
    const notFound = new SupabaseClipStore({ url: URL_, serviceRoleKey: KEY, bucket: 'b', fetchFn: fakeFetch(() => new Response('', { status: 404 })).fn })
    await expect(notFound.getClip('0123456789abcdef')).rejects.toMatchObject({ code: 'STORAGE_ERROR' })
    const down = new SupabaseClipStore({ url: URL_, serviceRoleKey: KEY, bucket: 'b', fetchFn: fakeFetch(() => Promise.reject(new Error('red'))).fn })
    await expect(down.getCatalog()).rejects.toMatchObject({ code: 'STORAGE_ERROR' })
  })
})

describe('PostgresRateLimiter', () => {
  it('llama a la RPC con las comprobaciones en orden y las claves como hash (sin IP en claro)', async () => {
    const { fn, calls } = fakeFetch(() => Response.json(0))
    const limiter = new PostgresRateLimiter({ url: URL_, serviceRoleKey: KEY, fetchFn: fn })
    await limiter.check([
      { bucket: 'global', key: '203.0.113.7', limit: 120 },
      { bucket: 'action', key: '203.0.113.7', limit: 40 },
    ])
    expect(calls[0].url).toBe('https://ref.supabase.co/rest/v1/rpc/heardle_rate_limit_hit')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.checks.map((c: any) => [c.bucket, c.limit])).toEqual([
      ['global', 120],
      ['action', 40],
    ])
    expect(String(calls[0].init.body)).not.toContain('203.0.113.7')
    expect(body.checks[0].key).toBe(body.checks[1].key)
  })

  it('una respuesta > 0 es RATE_LIMITED con esos segundos de espera', async () => {
    const limiter = new PostgresRateLimiter({ url: URL_, serviceRoleKey: KEY, fetchFn: fakeFetch(() => Response.json(17)).fn })
    await expect(limiter.check([{ bucket: 'global', key: 'ip', limit: 1 }])).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSec: 17 })
  })

  it('si la base de datos falla, deja pasar la peticion y avisa', async () => {
    for (const respond of [() => new Response('x', { status: 500 }), () => Promise.reject(new Error('red')), () => Response.json('no')]) {
      const onError = vi.fn()
      const limiter = new PostgresRateLimiter({ url: URL_, serviceRoleKey: KEY, fetchFn: fakeFetch(respond).fn, onError })
      await expect(limiter.check([{ bucket: 'global', key: 'ip', limit: 1 }])).resolves.toBeUndefined()
      expect(onError).toHaveBeenCalledOnce()
    }
  })
})
