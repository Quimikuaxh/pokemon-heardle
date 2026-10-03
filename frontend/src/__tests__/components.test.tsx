import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AttemptList } from '../components/AttemptList'
import { ResultPanel } from '../components/ResultPanel'
import { GameBoard } from '../components/GameBoard'
import App from '../App'
import { ApiError } from '../api/client'
import { createGameController } from '../game/controller'
import { createStore } from '../storage/store'
import { mkApi, mkCatalog, mkView, mkFinished, NOW_MS, TODAY } from './helpers'

let audioPlay: ReturnType<typeof vi.fn>
beforeEach(() => {
  audioPlay = vi.fn(() => Promise.resolve())
  ;(globalThis as any).Audio = class {
    src = ''
    currentTime = 0
    play = audioPlay
    pause() {}
  }
  URL.createObjectURL = vi.fn(() => 'blob:x') as any
  URL.revokeObjectURL = vi.fn() as any
})
afterEach(() => vi.restoreAllMocks())

describe('AttemptList', () => {
  it('muestra titulos de las jugadas, "Saltado" y etiquetas de resultado', () => {
    const view = mkView({ attempt: 3, results: ['miss', 'skip', 'game'], guesses: ['dp-twinleaf-town', 'rse-oldale-town'] })
    render(<AttemptList view={view} catalog={mkCatalog()} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.length).toBe(6)
    expect(rows[0].textContent).toContain('Twinleaf Town')
    expect(rows[0].textContent).toMatch(/juego incorrecto/i)
    expect(rows[1].textContent).toContain('Saltado')
    expect(rows[2].textContent).toContain('Oldale Town')
    expect(rows[2].textContent).toMatch(/juego acertado/i)
    expect(rows[3].textContent).toContain('Intento 4')
  })
})

describe('ResultPanel', () => {
  it('victoria: muestra solucion y texto de compartir sin la cancion; copia al pulsar', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ResultPanel view={mkFinished({ mode: 'daily', date: TODAY })} />)
    expect(screen.getByText(/Acertaste en el intento 1/)).toBeTruthy()
    const share = document.querySelector('pre')!.textContent!
    expect(share).toContain(TODAY)
    expect(share).not.toContain('Littleroot')
    fireEvent.click(screen.getByRole('button', { name: /compartir/i }))
    await waitFor(() => screen.getByText(/Copiado/))
    expect(writeText).toHaveBeenCalledWith(share)
  })

  it('derrota sin portapapeles: aviso de copia manual', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    render(<ResultPanel view={mkFinished({ status: 'lost', attempt: 6, results: ['miss', 'miss', 'miss', 'miss', 'miss', 'skip'] })} />)
    expect(screen.getByText(/agotado los intentos/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /compartir/i }))
    await waitFor(() => screen.getByText(/No se pudo copiar/))
  })
})

function board(mode: 'daily' | 'unlimited', apiOver: Record<string, unknown> = {}, filter: string[] = []) {
  const api = mkApi({ fetchClip: vi.fn(async () => new Blob([new Uint8Array(2)])), ...apiOver })
  const store = createStore(localStorage)
  store.setFilter(filter)
  const catalog = mkCatalog()
  const controller = createGameController({ api, store, catalog, nowMs: () => Date.now() })
  render(<GameBoard mode={mode} controller={controller} api={api} catalog={catalog} store={store} />)
  return { api, store, controller }
}

describe('GameBoard: audio', () => {
  it('mientras carga el audio el boton esta deshabilitado; al estar listo reproduce en el clic', async () => {
    let release!: (b: Blob) => void
    const fetchClip = vi.fn(() => new Promise<Blob>((r) => (release = r)))
    board('daily', { createGame: vi.fn(async () => mkView({ mode: 'daily', date: TODAY })), fetchClip })
    const loading = await screen.findByRole('button', { name: /cargando audio/i })
    expect((loading as HTMLButtonElement).disabled).toBe(true)
    await act(async () => release(new Blob([new Uint8Array(2)])))
    const play = await screen.findByRole('button', { name: /reproducir 1 s/i })
    expect(audioPlay).not.toHaveBeenCalled()
    fireEvent.click(play)
    expect(audioPlay).toHaveBeenCalledTimes(1)
  })

  it('si el clip falla muestra el error y "Reintentar" vuelve a descargar', async () => {
    const fetchClip = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('STORAGE_ERROR', 502))
      .mockResolvedValue(new Blob([new Uint8Array(2)]))
    board('daily', { createGame: vi.fn(async () => mkView({ mode: 'daily', date: TODAY })), fetchClip })
    fireEvent.click(await screen.findByRole('button', { name: /no se pudo cargar el audio/i }))
    await screen.findByRole('button', { name: /reproducir 1 s/i })
    expect(fetchClip).toHaveBeenCalledTimes(2)
  })
})

describe('GameBoard: partida libre', () => {
  it('pide confirmacion antes de abandonar la partida en curso', async () => {
    const createGame = vi.fn(async () => mkView())
    const { store, controller } = board('unlimited', { createGame, getState: vi.fn(async () => mkView()) }, ['rse'])
    store.setUnlimited({ token: 'u' })
    await act(async () => controller.resumeUnlimited())
    await screen.findByRole('button', { name: /reproducir/i })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: /empezar partida/i }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(createGame).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: /empezar partida/i }))
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
  })

  it('sin partida muestra el filtro y "Empezar partida" sin confirmar', async () => {
    const createGame = vi.fn(async () => mkView())
    board('unlimited', { createGame }, ['rse'])
    const confirm = vi.spyOn(window, 'confirm')
    fireEvent.click(await screen.findByRole('button', { name: /empezar partida/i }))
    await waitFor(() => expect(createGame).toHaveBeenCalled())
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('GameBoard: cambio de dia', () => {
  it('al volver a primer plano en otro dia (Madrid) recarga el diario', async () => {
    const createGame = vi.fn(async () => mkView({ mode: 'daily', date: TODAY }))
    const now = vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)
    board('daily', { createGame })
    await screen.findByRole('button', { name: /reproducir|cargando audio/i })
    expect(createGame).toHaveBeenCalledTimes(1)
    now.mockReturnValue(Date.parse('2026-10-04T10:00:00Z'))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(mkCalls(createGame)).toBe(2))
  })

  it('el mismo dia no recarga', async () => {
    const createGame = vi.fn(async () => mkView({ mode: 'daily', date: TODAY }))
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)
    board('daily', { createGame })
    await screen.findByRole('button', { name: /reproducir|cargando audio/i })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(createGame).toHaveBeenCalledTimes(1)
  })
})
const mkCalls = (f: any) => f.mock.calls.length

describe('App', () => {
  it('muestra "Despertando el servidor" mientras /health falla y despues el juego', async () => {
    vi.useFakeTimers()
    let healthCalls = 0
    globalThis.fetch = vi.fn(async (u: any) => {
      const url = String(u)
      const json = (b: any) => new Response(JSON.stringify(b), { status: 200 })
      if (url.endsWith('/health')) return ++healthCalls < 2 ? new Response('x', { status: 503 }) : json({ ok: true })
      if (url.endsWith('/catalog')) return json(mkCatalog())
      if (url.endsWith('/games')) return json(mkView({ mode: 'daily', date: TODAY }))
      return new Response(new Uint8Array(2))
    }) as any
    render(<App />)
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
    expect(screen.getByText(/Despertando el servidor/)).toBeTruthy()
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)))
    vi.useRealTimers()
    await screen.findByRole('button', { name: /^Diario$/ })
    expect(screen.getByRole('button', { name: /partida libre/i })).toBeTruthy()
  })

  it('si /health no responde en ~90 s ofrece reintentar', async () => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn(async () => new Response('x', { status: 503 })) as any
    render(<App />)
    await act(async () => void (await vi.advanceTimersByTimeAsync(130_000)))
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeTruthy()
    vi.useRealTimers()
  })
})
