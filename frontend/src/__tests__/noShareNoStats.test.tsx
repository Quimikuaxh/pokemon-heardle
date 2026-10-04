// Decision 2026-10-04: sin compartir ni estadisticas (REQUISITOS 9, DEC-27 retirada, DEC-43). Ver tambien DailyRecord (FE-DRC).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ResultPanel } from '../components/ResultPanel'
import { GameBoard } from '../components/GameBoard'
import App from '../App'
import { createGameController } from '../game/controller'
import { createStore } from '../storage/store'
import { mkApi, mkCatalog, mkFinished, mkView, NOW_MS, TODAY, YOUTUBE_ID } from './helpers'

beforeEach(() => {
  ;(globalThis as any).Audio = class extends EventTarget {
    src = ''
    currentTime = 0
    play = vi.fn(() => Promise.resolve())
    pause() {}
  }
  URL.createObjectURL = vi.fn(() => 'blob:x') as any
  URL.revokeObjectURL = vi.fn() as any
})
afterEach(() => vi.restoreAllMocks())

const FINISHED: Array<[string, any]> = [
  ['diario ganado', mkFinished({ mode: 'daily', date: TODAY })],
  ['diario perdido', mkFinished({ mode: 'daily', date: TODAY, status: 'lost', attempt: 6, results: ['miss', 'miss', 'game', 'skip', 'miss', 'skip'] })],
  ['ilimitado ganado', mkFinished()],
  ['ilimitado perdido', mkFinished({ status: 'lost', attempt: 6, results: ['skip', 'skip', 'skip', 'skip', 'skip', 'skip'] })],
]

const SHARE_OR_STATS = /compartir|copiar resultado|copiar|racha|distribuci[oó]n|estad[ií]sticas|partidas jugadas|mejor racha/i

describe('FE-NOF sin compartir ni estadisticas', () => {
  for (const [label, view] of FINISHED) {
    it(`FE-NOF-01 ${label}: ResultPanel sin boton ni texto de compartir/copiar y sin emojis de resultado`, () => {
      const { container } = render(<ResultPanel view={view} />)
      expect(screen.queryByRole('button', { name: /compartir|copiar/i })).toBeNull()
      expect(container.textContent).not.toMatch(/compartir|copiar/i)
      expect(container.textContent).not.toMatch(/[🟩🟨🟥⬛⬜]/u)
      expect(container.querySelector('pre')).toBeNull()
    })

    it(`FE-NOF-01 ${label}: ninguna llamada a navigator.clipboard, navigator.share ni execCommand('copy') (ni tras abrir la cancion completa)`, () => {
      const writeText = vi.fn(async () => {})
      const share = vi.fn(async () => {})
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      Object.defineProperty(navigator, 'share', { value: share, configurable: true })
      const exec = vi.fn(() => true)
      ;(document as any).execCommand = exec
      render(<ResultPanel view={view} />)
      const full = screen.queryByRole('button', { name: /escuchar la canci[oó]n completa/i })
      if (full) fireEvent.click(full)
      for (const b of screen.queryAllByRole('button')) fireEvent.click(b)
      expect([writeText.mock.calls.length, share.mock.calls.length, exec.mock.calls.length]).toEqual([0, 0, 0])
    })
  }

  for (const [label, view] of FINISHED) {
    it(`FE-NOF-02 ${label}: GameBoard sin estadisticas (racha, distribucion, boton ni modal)`, async () => {
      const mode = view.mode === 'daily' ? 'daily' : 'unlimited'
      const api = mkApi()
      const store = createStore(localStorage)
      if (mode === 'daily') store.setDaily(TODAY, { token: 't', finished: true, view })
      const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
      if (mode === 'unlimited') {
        store.setUnlimited({ token: 'u' })
        api.getState.mockResolvedValue(view)
      }
      const { container } = render(<GameBoard mode={mode} controller={controller} api={api} catalog={mkCatalog()} store={store} />)
      expect((await screen.findAllByText('Littleroot Town')).length).toBeGreaterThan(0)
      expect(container.textContent).not.toMatch(SHARE_OR_STATS)
      expect(container.querySelector('details > summary')?.textContent ?? '').not.toMatch(/estad[ií]sticas/i)
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  }

  it('FE-NOF-02 la cabecera/menu de la App tampoco muestra estadisticas', async () => {
    globalThis.fetch = vi.fn(async (u: any) => {
      const url = String(u)
      const json = (b: any) => new Response(JSON.stringify(b), { status: 200 })
      if (url.endsWith('/health')) return json({ ok: true })
      if (url.endsWith('/catalog')) return json(mkCatalog())
      if (url.endsWith('/games')) return json(mkView({ mode: 'daily', date: TODAY }))
      return new Response(new Uint8Array(2))
    }) as any
    const { container } = render(<App />)
    await screen.findByRole('button', { name: /^Diario$/ })
    expect(container.textContent).not.toMatch(SHARE_OR_STATS)
  })

  it('FE-NOF-03 tras partidas completas las unicas claves heardle: son filter, daily:<fecha> y unlimited (solo en curso)', async () => {
    const api = mkApi({
      createGame: vi.fn(async (body: any) => (body.mode === 'daily' ? mkView({ mode: 'daily', date: TODAY, token: 'd1' }) : mkView({ token: 'u1' }))),
      guess: vi.fn(async () => mkFinished({ mode: 'daily', date: TODAY, token: 'd2' })),
      skip: vi.fn().mockResolvedValueOnce(mkView({ token: 'u2', attempt: 1 })).mockResolvedValue(mkFinished({ status: 'lost', attempt: 6, token: 'u3' })),
    })
    const store = createStore(localStorage)
    const ctl = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    const heardleKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('heardle:')).sort()
    await ctl.openDaily()
    await ctl.guess('rse-littleroot-town')
    ctl.setFilter(['rse'])
    await ctl.startUnlimited()
    expect(heardleKeys()).toEqual(['heardle:daily:' + TODAY, 'heardle:filter', 'heardle:unlimited'])
    await ctl.skip()
    await ctl.skip()
    expect(heardleKeys()).toEqual(['heardle:daily:' + TODAY, 'heardle:filter'])
    expect(Object.keys(localStorage).some((k) => /stats/.test(k))).toBe(false)
  })

  it('FE-NOF-04 las claves heardle:stats:* heredadas (validas, corruptas o de otra version) se borran al arrancar y no rompen nada', async () => {
    localStorage.setItem('heardle:stats:daily', JSON.stringify({ played: 3, current: 2, max: 4, lastDate: '2026-10-02', distribution: { 1: 0, 2: 1, 3: 2, 4: 0, 5: 0, 6: 0, X: 0 } }))
    localStorage.setItem('heardle:stats:unlimited', '{corrupto')
    localStorage.setItem('heardle:stats:otra', JSON.stringify({ v: 9 }))
    localStorage.setItem('heardle:filter', JSON.stringify(['rse']))
    localStorage.setItem('otra:app', 'intacta')
    const store = createStore(localStorage)
    expect(Object.keys(localStorage).filter((k) => k.startsWith('heardle:stats'))).toEqual([])
    expect([store.getFilter(), localStorage.getItem('otra:app')]).toEqual([['rse'], 'intacta'])
  })

  it('FE-NOF-04 el controlador funciona con el storage tras la limpieza (diario y filtro normales)', async () => {
    localStorage.setItem('heardle:stats:daily', '{corrupto')
    const api = mkApi({ createGame: vi.fn(async () => mkView({ mode: 'daily', date: TODAY })) })
    const store = createStore(localStorage)
    const ctl = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    await ctl.openDaily()
    expect(ctl.getState().phase).toBe('playing')
  })

  it('FE-NOF-04 la limpieza es idempotente y tampoco falla con el almacenamiento bloqueado', () => {
    createStore(localStorage)
    expect(() => createStore(localStorage)).not.toThrow()
    const broken = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') }, clear() {}, key: () => null, length: 0 } as unknown as Storage
    expect(() => createStore(broken)).not.toThrow()
  })
})

describe('FE-DRC DailyRecord se mantiene', () => {
  it('FE-DRC-01 al terminar un diario se guarda daily:<fecha> = { token, finished:true, view } con results y solution y sin campos de estadisticas', async () => {
    const final = mkFinished({ mode: 'daily', date: TODAY, token: 'fin', results: ['miss', 'hit'], attempt: 2 })
    const api = mkApi({ createGame: vi.fn(async () => mkView({ mode: 'daily', date: TODAY })), guess: vi.fn(async () => final) })
    const store = createStore(localStorage)
    const ctl = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    await ctl.openDaily()
    await ctl.guess('rse-littleroot-town')
    const raw = JSON.parse(localStorage.getItem('heardle:daily:' + TODAY)!)
    expect(Object.keys(raw).sort()).toEqual(['finished', 'token', 'view'])
    expect([raw.finished, raw.view.results, raw.view.solution.title]).toEqual([true, ['miss', 'hit'], 'Littleroot Town'])
    expect(JSON.stringify(raw)).not.toMatch(/distribution|\"played\"|\"current\"|streak|racha/)
  })

  it('FE-DRC-02 un diario terminado se muestra al reabrir: resultado visible, sin boton de jugar y 0 llamadas a la API', async () => {
    const api = mkApi()
    const store = createStore(localStorage)
    store.setDaily(TODAY, { token: 'old', finished: true, view: mkFinished({ mode: 'daily', date: TODAY }) })
    const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    render(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} />)
    expect((await screen.findAllByText('Littleroot Town')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /reproducir|cargar la partida|cargando audio/i })).toBeNull()
    expect([api.createGame, api.getState, api.guess, api.skip].map((f: any) => f.mock.calls.length)).toEqual([0, 0, 0, 0])
  })

  it('FE-EMB-10 diario terminado reabierto desde localStorage: boton visible, sin iframe y 0 llamadas a la API', async () => {
    const api = mkApi()
    const store = createStore(localStorage)
    store.setDaily(TODAY, { token: 'old', finished: true, view: mkFinished({ mode: 'daily', date: TODAY }) })
    const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    const { container } = render(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} />)
    expect(await screen.findByRole('button', { name: /escuchar la canci[oó]n completa/i })).toBeTruthy()
    expect(container.querySelectorAll('iframe').length).toBe(0)
    expect([api.createGame, api.getState].map((f: any) => f.mock.calls.length)).toEqual([0, 0])
  })

  it('FE-EMB-10 reabrir un diario antiguo sin youtubeId: solucion visible y sin boton', async () => {
    const api = mkApi()
    const store = createStore(localStorage)
    const { youtubeId: _y, ...legacy } = mkFinished().solution
    store.setDaily(TODAY, { token: 'old', finished: true, view: mkFinished({ mode: 'daily', date: TODAY, solution: legacy }) })
    const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    render(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} />)
    expect((await screen.findAllByText('Littleroot Town')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /escuchar la canci[oó]n completa/i })).toBeNull()
  })
})

describe('FE-EMB integracion con GameBoard', () => {
  it('FE-EMB-01 partida en curso en el tablero: ni boton ni iframe', async () => {
    const api = mkApi({ createGame: vi.fn(async () => mkView({ mode: 'daily', date: TODAY })), fetchClip: vi.fn(async () => new Blob([new Uint8Array(2)])) })
    const store = createStore(localStorage)
    const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    const { container } = render(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} />)
    await screen.findByRole('button', { name: /reproducir|cargando audio/i })
    expect(screen.queryByRole('button', { name: /escuchar la canci[oó]n completa/i })).toBeNull()
    expect(container.querySelectorAll('iframe').length).toBe(0)
  })

  it('FE-EMB-08 al pulsar el boton con el clip sonando, el reproductor se detiene (audio.pause)', async () => {
    const pause = vi.fn()
    ;(globalThis as any).Audio = class extends EventTarget {
      src = ''
      currentTime = 0
      play = vi.fn(() => Promise.resolve())
      pause = pause
    }
    const api = mkApi({
      createGame: vi.fn(async () => mkView({ mode: 'daily', date: TODAY })),
      guess: vi.fn(async () => mkFinished({ mode: 'daily', date: TODAY })),
      fetchClip: vi.fn(async () => new Blob([new Uint8Array(2)])),
    })
    const store = createStore(localStorage)
    const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    render(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} />)
    fireEvent.click(await screen.findByRole('button', { name: /reproducir 1 s/i }))
    await act(async () => controller.guess('rse-littleroot-town'))
    const before = pause.mock.calls.length
    fireEvent.click(await screen.findByRole('button', { name: /escuchar la canci[oó]n completa/i }))
    expect(pause.mock.calls.length).toBeGreaterThan(before)
    expect(YOUTUBE_ID.length).toBe(11)
  })

  it('FE-EMB-12 "Empezar partida" nueva desmonta el iframe abierto', async () => {
    const api = mkApi({
      createGame: vi.fn(async () => mkView()),
      getState: vi.fn(async () => mkFinished()),
      fetchClip: vi.fn(async () => new Blob([new Uint8Array(2)])),
    })
    const store = createStore(localStorage)
    store.setFilter(['rse'])
    store.setUnlimited({ token: 'u' })
    const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    const { container } = render(<GameBoard mode="unlimited" controller={controller} api={api} catalog={mkCatalog()} store={store} />)
    fireEvent.click(await screen.findByRole('button', { name: /escuchar la canci[oó]n completa/i }))
    expect(container.querySelectorAll('iframe').length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: /empezar partida/i }))
    await waitFor(() => expect(container.querySelectorAll('iframe').length).toBe(0))
  })
})
