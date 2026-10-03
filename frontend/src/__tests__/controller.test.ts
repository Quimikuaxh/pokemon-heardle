import { describe, it, expect, vi, afterEach } from 'vitest'
import { createGameController } from '../game/controller'
import { createStore } from '../storage/store'
import { emptyDailyStats, recordDaily } from '../game/stats'
import { ApiError } from '../api/client'
import { mkApi, mkCatalog, mkView, mkFinished, NOW_MS, TODAY } from './helpers'

const YESTERDAY = '2026-10-02'
const TOMORROW = '2026-10-04'

function setup(apiOver: Record<string, unknown> = {}, nowMs = NOW_MS) {
  const api = mkApi(apiOver)
  const store = createStore(localStorage)
  const ctl = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => nowMs })
  return { api, store, ctl }
}
const noGameCalls = (api: any) => [api.createGame, api.getState, api.guess, api.skip].map((f: any) => f.mock.calls.length)
const dailyView = (over: Record<string, unknown> = {}) => mkView({ mode: 'daily', date: TODAY, ...over })
const dailyDone = (date = TODAY, over: Record<string, unknown> = {}) => mkFinished({ mode: 'daily', date, ...over })

describe('controller: apertura del diario', () => {
  it('FE-GAM-11 diario de hoy terminado: muestra el resultado con CERO llamadas de partida', async () => {
    const { api, store, ctl } = setup()
    store.setDaily(TODAY, { token: 'old', finished: true, view: dailyDone() })
    await ctl.openDaily()
    expect(noGameCalls(api)).toEqual([0, 0, 0, 0])
    expect([ctl.getState().phase, ctl.getState().view?.status, ctl.getState().view?.solution?.id]).toEqual(['finished', 'won', 'rse-littleroot-town'])
  })

  it('FE-GAM-12 sin registro de hoy: POST /games con cuerpo exactamente {mode:"daily"}', async () => {
    const { api, ctl } = setup({ createGame: vi.fn(async () => dailyView()) })
    await ctl.openDaily()
    expect(api.createGame.mock.calls).toEqual([[{ mode: 'daily' }]])
  })

  it('FE-GAM-12 la partida creada se guarda como daily:<fecha del servidor> y queda en playing', async () => {
    const { store, ctl } = setup({ createGame: vi.fn(async () => dailyView({ token: 'new' })) })
    await ctl.openDaily()
    expect([store.getDaily(TODAY)?.token, store.getDaily(TODAY)?.finished, ctl.getState().phase]).toEqual(['new', false, 'playing'])
  })

  it('FE-GAM-12 fecha del servidor distinta y esa fecha ya terminada: se muestra el resultado y se descarta el token nuevo', async () => {
    const { store, ctl } = setup({ createGame: vi.fn(async () => dailyView({ date: TOMORROW, token: 'descartado' })) })
    store.setDaily(TOMORROW, { token: 'guardado', finished: true, view: dailyDone(TOMORROW) })
    await ctl.openDaily()
    expect([ctl.getState().phase, store.getDaily(TOMORROW)?.token, store.getDaily(TODAY)]).toEqual(['finished', 'guardado', null])
  })

  it('FE-GAM-12 fecha del servidor distinta y no terminada: se guarda bajo la fecha del servidor, no la del cliente', async () => {
    const { store, ctl } = setup({ createGame: vi.fn(async () => dailyView({ date: TOMORROW, token: 'srv' })) })
    await ctl.openDaily()
    expect([store.getDaily(TOMORROW)?.token, store.getDaily(TODAY)]).toEqual(['srv', null])
  })

  it('FE-GAM-13 diario de hoy en curso: POST /games/state con su token y ninguna creacion', async () => {
    const { api, store, ctl } = setup({ getState: vi.fn(async () => dailyView({ token: 'tok-nuevo', attempt: 2 })) })
    store.setDaily(TODAY, { token: 'tok-guardado', finished: false })
    await ctl.openDaily()
    expect([api.getState.mock.calls, api.createGame.mock.calls.length]).toEqual([[['tok-guardado']], 0])
    expect(store.getDaily(TODAY)?.token).toBe('tok-nuevo')
  })

  it('FE-GAM-13 con TOKEN_INVALID se crea partida nueva', async () => {
    const { api, store, ctl } = setup({
      getState: vi.fn(async () => {
        throw new ApiError('TOKEN_INVALID', 401)
      }),
      createGame: vi.fn(async () => dailyView({ token: 'fresca' })),
    })
    store.setDaily(TODAY, { token: 'caducado', finished: false })
    await ctl.openDaily()
    expect([api.createGame.mock.calls.length, store.getDaily(TODAY)?.token, ctl.getState().phase]).toEqual([1, 'fresca', 'playing'])
  })

  it('FE-GAM-15 dia nuevo: el diario de ayer terminado no impide jugar hoy y no se modifica', async () => {
    const { api, store, ctl } = setup({ createGame: vi.fn(async () => dailyView()) })
    const yesterday = { token: 'ayer', finished: true, view: dailyDone(YESTERDAY) }
    store.setDaily(YESTERDAY, yesterday)
    await ctl.openDaily()
    expect([api.createGame.mock.calls.length, store.getDaily(YESTERDAY), ctl.getState().phase]).toEqual([1, yesterday, 'playing'])
  })

  for (const filter of [[], ['rse']]) {
    it(`FE-GAM-16 / FE-FIL-07 con filtro guardado ${JSON.stringify(filter)} el diario no envia games`, async () => {
      const { api, store, ctl } = setup({ createGame: vi.fn(async () => dailyView()) })
      store.setFilter(filter)
      await ctl.openDaily()
      expect(api.createGame.mock.calls).toEqual([[{ mode: 'daily' }]])
    })
  }

  describe('FE-GAM-17 fecha de hoy en Madrid independiente de la zona del navegador', () => {
    const original = process.env.TZ
    afterEach(() => {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    })
    it('TZ=Asia/Tokyo, 2026-07-01T16:00Z: Madrid 07-01 (Tokyo ya es 07-02)', async () => {
      process.env.TZ = 'Asia/Tokyo'
      const { api, store, ctl } = setup({}, Date.parse('2026-07-01T16:00:00Z'))
      store.setDaily('2026-07-01', { token: 't', finished: true, view: dailyDone('2026-07-01') })
      await ctl.openDaily()
      expect([noGameCalls(api), ctl.getState().phase]).toEqual([[0, 0, 0, 0], 'finished'])
    })
  })
})

describe('controller: ilimitado y filtro', () => {
  it('FE-FIL-01 filtro vacio: startUnlimited no llama a la API', async () => {
    const { api, store, ctl } = setup()
    store.setFilter([])
    await ctl.startUnlimited()
    expect(noGameCalls(api)).toEqual([0, 0, 0, 0])
  })

  it('FE-FIL-02 un juego: POST /games {mode:"unlimited", games:[id]}', async () => {
    const { api, store, ctl } = setup({ createGame: vi.fn(async () => mkView()) })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    expect(api.createGame.mock.calls).toEqual([[{ mode: 'unlimited', games: ['rse'] }]])
  })

  it('FE-FIL-04 getFilter descarta ids que no existen en el catalogo', () => {
    const { store, ctl } = setup()
    store.setFilter(['rse', 'ZZ'])
    expect(ctl.getFilter()).toEqual(['rse'])
  })

  it('FE-FIL-04 si todos son inexistentes el filtro queda vacio', () => {
    const { store, ctl } = setup()
    store.setFilter(['ZZ', 'YY'])
    expect(ctl.getFilter()).toEqual([])
  })

  it('FE-FIL-03 setFilter persiste en el store', () => {
    const { store, ctl } = setup()
    ctl.setFilter(['dp'])
    expect(store.getFilter()).toEqual(['dp'])
  })

  it('FE-GAM-10 cambiar el filtro con partida en curso no altera la vista activa; la siguiente usa el filtro nuevo', async () => {
    const createGame = vi.fn(async () => mkView({ token: 'u1' }))
    const guess = vi.fn(async () => mkFinished({ token: 'u2' }))
    const { api, ctl } = setup({ createGame, guess })
    ctl.setFilter(['rse'])
    await ctl.startUnlimited()
    const before = JSON.stringify(ctl.getState().view)
    ctl.setFilter(['dp'])
    expect(JSON.stringify(ctl.getState().view)).toBe(before)
    await ctl.guess('rse-littleroot-town')
    await ctl.startUnlimited()
    expect(api.createGame.mock.calls[1]).toEqual([{ mode: 'unlimited', games: ['dp'] }])
  })

  it('FE-FIL-06 EMPTY_FILTER del servidor -> aviso empty-filter con mensaje', async () => {
    const { store, ctl } = setup({
      createGame: vi.fn(async () => {
        throw new ApiError('EMPTY_FILTER', 400)
      }),
    })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    const n = ctl.getState().notice!
    expect([n.kind, n.message.length > 0]).toEqual(['empty-filter', true])
  })

  it('FE-FIL-06 UNKNOWN_GAME del servidor -> aviso unknown-game', async () => {
    const { store, ctl } = setup({
      createGame: vi.fn(async () => {
        throw new ApiError('UNKNOWN_GAME', 400)
      }),
    })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    expect(ctl.getState().notice?.kind).toBe('unknown-game')
  })

  it('FE-GAM-14 la partida ilimitada en curso se recupera tras recargar (nuevo controller, mismo storage)', async () => {
    const createGame = vi.fn(async () => mkView({ token: 'u1' }))
    const a = setup({ createGame })
    a.store.setFilter(['rse'])
    await a.ctl.startUnlimited()
    const getState = vi.fn(async () => mkView({ token: 'u1b', attempt: 1, results: ['miss'] }))
    const api2 = mkApi({ getState })
    const ctl2 = createGameController({ api: api2, store: createStore(localStorage), catalog: mkCatalog(), nowMs: () => NOW_MS })
    await ctl2.resumeUnlimited()
    expect([getState.mock.calls, ctl2.getState().phase, ctl2.getState().view?.attempt]).toEqual([[['u1']], 'playing', 1])
  })

  it('FE-GAM-14 al terminar la partida ilimitada se limpia el registro guardado y se permite otra', async () => {
    const { store, ctl } = setup({ createGame: vi.fn(async () => mkView()), guess: vi.fn(async () => mkFinished()) })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    await ctl.guess('rse-littleroot-town')
    expect([store.getUnlimited(), ctl.getState().phase]).toEqual([null, 'finished'])
  })

  it('FE-GAM-07 TOKEN_INVALID al recuperar: descarta el token, estado limpio y aviso', async () => {
    const { store, ctl } = setup({
      getState: vi.fn(async () => {
        throw new ApiError('TOKEN_INVALID', 401)
      }),
    })
    store.setUnlimited({ token: 'malo' })
    await ctl.resumeUnlimited()
    expect([store.getUnlimited(), ctl.getState().phase, ctl.getState().notice?.kind]).toEqual([null, 'idle', 'invalid-token'])
  })

  it('resumeUnlimited sin partida guardada no llama a la API', async () => {
    const { api, ctl } = setup()
    await ctl.resumeUnlimited()
    expect(noGameCalls(api)).toEqual([0, 0, 0, 0])
  })
})

describe('controller: acciones', () => {
  it('FE-GAM-01 secuencia crear -> miss -> skip -> win: el estado refleja siempre la ultima vista', async () => {
    const v0 = mkView({ token: 't0' })
    const v1 = mkView({ token: 't1', attempt: 1, results: ['miss'], guesses: ['dp-twinleaf-town'] })
    const v2 = mkView({ token: 't2', attempt: 2, results: ['miss', 'skip'], guesses: ['dp-twinleaf-town'] })
    const v3 = mkFinished({ token: 't3', attempt: 3, results: ['miss', 'skip', 'hit'] })
    const { ctl, store } = setup({
      createGame: vi.fn(async () => v0),
      guess: vi.fn().mockResolvedValueOnce(v1).mockResolvedValueOnce(v3),
      skip: vi.fn(async () => v2),
    })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    await ctl.guess('dp-twinleaf-town')
    expect(ctl.getState().view).toEqual(v1)
    await ctl.skip()
    expect(ctl.getState().view).toEqual(v2)
    await ctl.guess('rse-littleroot-town')
    expect([ctl.getState().view, ctl.getState().phase]).toEqual([v3, 'finished'])
  })

  it('guess llama a api.guess(token, songId) con el ultimo token', async () => {
    const { api, store, ctl } = setup({ createGame: vi.fn(async () => mkView({ token: 'tk' })), guess: vi.fn(async () => mkView({ token: 'tk2' })) })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    await ctl.guess('dp-twinleaf-town')
    expect(api.guess.mock.calls).toEqual([['tk', 'dp-twinleaf-town']])
  })

  it('FE-GAM-05 se guarda siempre el ultimo token recibido (guess y skip)', async () => {
    const { store, ctl } = setup({
      createGame: vi.fn(async () => mkView({ token: 't1' })),
      guess: vi.fn(async () => mkView({ token: 't2', attempt: 1 })),
      skip: vi.fn(async () => mkView({ token: 't3', attempt: 2 })),
    })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    await ctl.guess('dp-twinleaf-town')
    expect(store.getUnlimited()?.token).toBe('t2')
    await ctl.skip()
    expect(store.getUnlimited()?.token).toBe('t3')
  })

  it('FE-GAM-02 partida terminada: guess y skip no llaman a la API', async () => {
    const { api, store, ctl } = setup()
    store.setDaily(TODAY, { token: 'x', finished: true, view: dailyDone() })
    await ctl.openDaily()
    await ctl.guess('dp-twinleaf-town')
    await ctl.skip()
    expect([api.guess.mock.calls.length, api.skip.mock.calls.length]).toEqual([0, 0])
  })

  it('sin partida activa (idle) guess y skip no llaman a la API', async () => {
    const { api, ctl } = setup()
    await ctl.guess('dp-twinleaf-town')
    await ctl.skip()
    expect([api.guess.mock.calls.length, api.skip.mock.calls.length]).toEqual([0, 0])
  })

  it('FE-GAM-18 ALREADY_GUESSED: aviso, vista y token guardado sin cambios', async () => {
    const v = mkView({ token: 'tk', attempt: 1, results: ['miss'], guesses: ['dp-twinleaf-town'] })
    const { store, ctl } = setup({
      createGame: vi.fn(async () => v),
      guess: vi.fn(async () => {
        throw new ApiError('ALREADY_GUESSED', 409)
      }),
    })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    await ctl.guess('dp-twinleaf-town')
    expect([ctl.getState().view, store.getUnlimited()?.token, ctl.getState().notice?.kind]).toEqual([v, 'tk', 'already-guessed'])
  })

  it('FE-GAM-08 GAME_OVER del servidor: refresca con state y muestra el resultado', async () => {
    const final = mkFinished({ token: 'fin', attempt: 6, status: 'lost', results: ['miss', 'miss', 'miss', 'miss', 'miss', 'skip'] })
    const { api, store, ctl } = setup({
      createGame: vi.fn(async () => mkView({ token: 'tk' })),
      guess: vi.fn(async () => {
        throw new ApiError('GAME_OVER', 409)
      }),
      getState: vi.fn(async () => final),
    })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    await ctl.guess('dp-twinleaf-town')
    expect([api.getState.mock.calls, ctl.getState().phase, ctl.getState().view?.status]).toEqual([[['tk']], 'finished', 'lost'])
  })

  it('FE-GAM-09 429: aviso rate-limited con retryAfterSec y una sola llamada (sin bucle)', async () => {
    const { api, store, ctl } = setup({
      createGame: vi.fn(async () => mkView()),
      skip: vi.fn(async () => {
        throw new ApiError('RATE_LIMITED', 429, 3)
      }),
    })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    await ctl.skip()
    expect([ctl.getState().notice?.kind, ctl.getState().notice?.retryAfterSec, api.skip.mock.calls.length]).toEqual(['rate-limited', 3, 1])
  })

  it('FE-GAM-19 tras recargar los guesses de la vista se conservan para el buscador', async () => {
    const { store, ctl } = setup({ getState: vi.fn(async () => mkView({ guesses: ['dp-twinleaf-town', 'bw-castle'], attempt: 2 })) })
    store.setUnlimited({ token: 'x' })
    await ctl.resumeUnlimited()
    expect(ctl.getState().view?.guesses).toEqual(['dp-twinleaf-town', 'bw-castle'])
  })

  it('subscribe notifica los cambios y el unsubscribe los detiene', async () => {
    const { ctl, store } = setup({ createGame: vi.fn(async () => mkView()) })
    store.setFilter(['rse'])
    const fn = vi.fn()
    const off = ctl.subscribe(fn)
    await ctl.startUnlimited()
    expect(fn).toHaveBeenCalled()
    const n = fn.mock.calls.length
    off()
    await ctl.startUnlimited()
    expect(fn.mock.calls.length).toBe(n)
  })
})

describe('controller: estadisticas y almacenamiento', () => {
  it('FE-GAM-12 / FE-STA-02 al ganar el diario se registra con la fecha del servidor y continua la racha', async () => {
    const { store, ctl } = setup({
      createGame: vi.fn(async () => dailyView({ date: '2026-03-29' })),
      guess: vi.fn(async () => dailyDone('2026-03-29', { attempt: 2, results: ['miss', 'hit'] })),
    })
    store.setStats('daily', recordDaily(emptyDailyStats(), '2026-03-28', 3))
    await ctl.openDaily()
    await ctl.guess('rse-littleroot-town')
    const s: any = store.getStats('daily')
    expect([s.current, s.lastDate, s.distribution['2']]).toEqual([2, '2026-03-29', 1])
  })

  it('al terminar el diario el registro queda finished con la vista final', async () => {
    const final = dailyDone(TODAY)
    const { store, ctl } = setup({ createGame: vi.fn(async () => dailyView()), guess: vi.fn(async () => final) })
    await ctl.openDaily()
    await ctl.guess('rse-littleroot-town')
    expect([store.getDaily(TODAY)?.finished, store.getDaily(TODAY)?.view]).toEqual([true, final])
  })

  it('FE-STA-09 terminar una partida ilimitada no toca stats:daily y suma en stats:unlimited', async () => {
    const { store, ctl } = setup({ createGame: vi.fn(async () => mkView()), guess: vi.fn(async () => mkFinished()) })
    const daily = recordDaily(emptyDailyStats(), '2026-10-02', 4)
    store.setStats('daily', daily)
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    await ctl.guess('rse-littleroot-town')
    expect([store.getStats('daily'), (store.getStats('unlimited') as any).played]).toEqual([daily, 1])
  })

  it('FE-STA-12 durante la partida el storage solo tiene token y jugadas propias: ni titulo ni id de la solucion', async () => {
    const { ctl, store } = setup({
      createGame: vi.fn(async () => mkView({ token: 't1' })),
      guess: vi.fn(async () => mkView({ token: 't2', attempt: 1, results: ['miss'], guesses: ['dp-twinleaf-town'] })),
    })
    store.setFilter(['rse'])
    await ctl.startUnlimited()
    await ctl.guess('dp-twinleaf-town')
    const dump = Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\n')
    for (const s of ['Littleroot', 'rse-littleroot-town', '"solution"']) expect(dump).not.toContain(s)
  })

  it('FE-STA-11 si el storage falla la partida sigue funcionando', async () => {
    const api = mkApi({ createGame: vi.fn(async () => dailyView()), skip: vi.fn(async () => mkView({ attempt: 1, results: ['skip'] })) })
    const broken = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') }, clear() {}, key: () => null, length: 0 } as Storage
    const ctl = createGameController({ api, store: createStore(broken), catalog: mkCatalog(), nowMs: () => NOW_MS })
    await ctl.openDaily()
    await ctl.skip()
    expect(ctl.getState().view?.attempt).toBe(1)
  })
})
