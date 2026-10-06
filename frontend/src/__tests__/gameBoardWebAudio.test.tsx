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

describe('GameBoard: onda real y pausa (DEC-46)', () => {
  function stubRealBuffer() {
    const data = new Float32Array(44100 * 2)
    data.forEach((_, i) => (data[i] = i < 44100 ? 0.2 : 0.9))
    const buffer = { duration: 2, sampleRate: 44100, numberOfChannels: 1, getChannelData: () => data }
    class Real extends FakeContext {
      constructor() {
        super()
        this.decodeAudioData = vi.fn(async () => buffer) as any
      }
    }
    vi.stubGlobal('AudioContext', Real)
  }

  it('FE-WF-14 con un buffer decodificado la onda es real y solo usa el audio desbloqueado del intento (1 s)', async () => {
    stubRealBuffer()
    const { container } = board()
    await screen.findByRole('button', { name: /reproducir 1 s/i })
    expect(container.querySelector('[data-waveform]')!.getAttribute('data-waveform')).toBe('real')
    const bars = [...container.querySelectorAll('[data-bar]')] as HTMLElement[]
    // el segundo de audio (0,9) posterior al corte no existe en la onda: normaliza con lo desbloqueado (0,2)
    expect(new Set(bars.slice(0, 3).map((b) => b.style.height))).toEqual(new Set(['100%']))
    expect(new Set(bars.slice(3).map((b) => b.style.height)).size).toBe(1)
  })

  it('FE-WF-14 sin AudioBuffer con muestras (jsdom) la onda es neutra', async () => {
    const { container } = board()
    await screen.findByRole('button', { name: /reproducir 1 s/i })
    expect(container.querySelector('[data-waveform]')!.getAttribute('data-waveform')).toBe('neutral')
  })

  it('FE-DSN-07 pulsar play y luego "Pausar" detiene la fuente sin cerrar el contexto', async () => {
    board()
    fireEvent.click(await screen.findByRole('button', { name: /reproducir 1 s/i }))
    const ctx = FakeContext.instances[0]
    fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }))
    expect(ctx.sources[0].stop).toHaveBeenCalled()
    expect(ctx.close).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /reproducir 1 s/i })).toBeTruthy()
  })
})

describe('GameBoard: pausa y reanudacion con el boton rojo (DEC-46)', () => {
  it('FE-PLY-17 Pausar deja la barra y la lectura en la posicion pausada y Reproducir continua desde ahi', async () => {
    board()
    fireEvent.click(await screen.findByRole('button', { name: /reproducir 1 s/i }))
    const ctx = FakeContext.instances[0]
    const t0 = ctx.currentTime
    ctx.currentTime = t0 + 0.4
    await act(async () => frames.tick())
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeCloseTo(0.4, 5)
    expect(screen.getByText('0:00 / 0:01')).toBeTruthy()
    ctx.currentTime = t0 + 5
    fireEvent.click(screen.getByRole('button', { name: 'Reanudar' }))
    expect(ctx.sources[1].start).toHaveBeenCalledWith(t0 + 5, expect.closeTo(0.4, 5))
  })

  it('FE-PLY-17 el nombre accesible alterna Reproducir N s / Pausar / Reproducir N s', async () => {
    board()
    fireEvent.click(await screen.findByRole('button', { name: /reproducir 1 s/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }))
    expect(await screen.findByRole('button', { name: /reproducir 1 s/i })).toBeTruthy()
  })
})
