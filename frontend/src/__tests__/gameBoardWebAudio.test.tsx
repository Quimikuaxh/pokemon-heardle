// GameBoard con Web Audio real-por-defecto (AudioContext global simulado): FE-WA-19 / FE-PLY-08 al desmontar, FE-WA-03 en el clic.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GameBoard } from '../components/GameBoard'
import { createGameController } from '../game/controller'
import { createStore } from '../storage/store'
import { mkApi, mkCatalog, mkView, NOW_MS, TODAY } from './helpers'
import { FakeAudio, FakeContext, fakeFrames } from './webAudioFakes'

let frames: ReturnType<typeof fakeFrames>

beforeEach(() => {
  FakeContext.instances = []
  frames = fakeFrames()
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('requestAnimationFrame', frames.requestFrame)
  vi.stubGlobal('cancelAnimationFrame', frames.cancelFrame)
  URL.createObjectURL = vi.fn(() => 'blob:x') as any
  URL.revokeObjectURL = vi.fn() as any
})
afterEach(() => vi.unstubAllGlobals())

function board() {
  const api = mkApi({
    createGame: vi.fn(async () => mkView({ mode: 'daily', date: TODAY })),
    fetchClip: vi.fn(async () => new Blob([new Uint8Array(8)])),
  })
  const store = createStore(localStorage)
  const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
  return render(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} />)
}

describe('GameBoard + Web Audio', () => {
  it('FE-WA-01 el contexto se crea al preparar el clip y el boton reproduce con resume() y start() en el propio clic', async () => {
    board()
    const play = await screen.findByRole('button', { name: /reproducir 1 s/i })
    const ctx = FakeContext.instances[0]
    expect(FakeContext.instances.length).toBe(1)
    expect(ctx.resume).not.toHaveBeenCalled()
    fireEvent.click(play)
    expect(ctx.resume).toHaveBeenCalledTimes(1)
    expect(ctx.sources[0].start).toHaveBeenCalledTimes(1)
  })

  it('FE-WA-19 / FE-PLY-08 al desmontar el tablero se cierra el contexto una vez y no queda ningun frame pendiente', async () => {
    const { unmount } = board()
    fireEvent.click(await screen.findByRole('button', { name: /reproducir 1 s/i }))
    const ctx = FakeContext.instances[0]
    expect(frames.pending()).toBe(1)
    unmount()
    expect(ctx.close).toHaveBeenCalledTimes(1)
    expect(frames.pending()).toBe(0)
    expect(() => frames.tick()).not.toThrow()
  })

  it('FE-PLY-01 la barra sigue a ctx.currentTime - t0 mientras suena (aria-valuenow)', async () => {
    board()
    fireEvent.click(await screen.findByRole('button', { name: /reproducir 1 s/i }))
    const ctx = FakeContext.instances[0]
    ctx.currentTime = 0.4
    await act(async () => frames.tick())
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeCloseTo(0.4, 5)
  })

  it('FE-WA-09 si el contexto se interrumpe, la barra queda en reposo (data-playing=false) y el boton sigue disponible', async () => {
    board()
    fireEvent.click(await screen.findByRole('button', { name: /reproducir 1 s/i }))
    const ctx = FakeContext.instances[0]
    await act(async () => ctx.setState('interrupted'))
    expect(screen.getByRole('progressbar').getAttribute('data-playing')).toBe('false')
    expect(screen.getByRole('button', { name: /reproducir 1 s/i })).toBeTruthy()
  })
})
