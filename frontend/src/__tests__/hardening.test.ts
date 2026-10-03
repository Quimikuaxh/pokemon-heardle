import { describe, it, expect, vi } from 'vitest'
import { createApiClient } from '../api/client'
import { createGameController } from '../game/controller'
import { createStore } from '../storage/store'
import { mkApi, mkCatalog, mkView, NOW_MS } from './helpers'

const ok = () => new Response(JSON.stringify(mkView()), { status: 200 })

describe('api/client timeouts', () => {
  it('las peticiones de partida llevan AbortSignal con timeout', async () => {
    const fetchFn = vi.fn(async () => ok())
    const api = createApiClient({ baseUrl: '', fetchFn: fetchFn as any })
    await api.skip('t')
    await api.catalog().catch(() => {})
    expect((fetchFn.mock.calls[0] as any[])[1].signal).toBeInstanceOf(AbortSignal)
    expect((fetchFn.mock.calls[1] as any[])[1].signal).toBeInstanceOf(AbortSignal)
  })

  it('/health no lleva timeout (el arranque en frio puede tardar casi un minuto)', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }))
    await createApiClient({ baseUrl: '', fetchFn: fetchFn as any }).health()
    expect((fetchFn.mock.calls[0] as any[])[1]?.signal).toBeUndefined()
  })

  it('un timeout (fetch abortado) se traduce a ApiError NETWORK', async () => {
    const fetchFn = vi.fn(async () => {
      throw new DOMException('timeout', 'TimeoutError')
    })
    const e = await createApiClient({ baseUrl: '', fetchFn: fetchFn as any }).skip('t').catch((x) => x)
    expect([e.code, e.status]).toEqual(['NETWORK', 0])
  })
})

describe('controller sin depender de this', () => {
  it('getFilter y setFilter funcionan desestructurados', () => {
    const store = createStore(localStorage)
    const { getFilter, setFilter } = createGameController({ api: mkApi(), store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    setFilter(['rse', 'rse'])
    expect(getFilter()).toEqual(['rse'])
  })

  it('startUnlimited desestructurado usa el filtro guardado', async () => {
    const api = mkApi({ createGame: vi.fn(async () => mkView()) })
    const store = createStore(localStorage)
    store.setFilter(['dp'])
    const { startUnlimited } = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    await startUnlimited()
    expect(api.createGame.mock.calls).toEqual([[{ mode: 'unlimited', games: ['dp'] }]])
  })
})
