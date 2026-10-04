// La barra (DEC-42) dentro del tablero y la limpieza al desmontar (FE-PLY-08).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GameBoard } from '../components/GameBoard'
import { createGameController } from '../game/controller'
import { createStore } from '../storage/store'
import { mkApi, mkCatalog, mkView, mkFinished, NOW_MS, TODAY } from './helpers'

let audioInstances: any[]
let pending: Map<number, () => void>
let nextId: number

beforeEach(() => {
  audioInstances = []
  pending = new Map()
  nextId = 1
  ;(globalThis as any).Audio = class extends EventTarget {
    src = ''
    currentTime = 0
    play = vi.fn(() => Promise.resolve())
    pause = vi.fn(() => void this.dispatchEvent(new Event('pause')))
    constructor() {
      super()
      audioInstances.push(this)
    }
  }
  ;(globalThis as any).requestAnimationFrame = vi.fn((cb: () => void) => {
    const id = nextId++
    pending.set(id, cb)
    return id
  })
  ;(globalThis as any).cancelAnimationFrame = vi.fn((id: number) => void pending.delete(id))
  URL.createObjectURL = vi.fn(() => 'blob:x') as any
  URL.revokeObjectURL = vi.fn() as any
})
afterEach(() => vi.restoreAllMocks())

function board(view: any, finalView?: any) {
  const api = mkApi({
    createGame: vi.fn(async () => view),
    guess: vi.fn(async () => finalView ?? view),
    skip: vi.fn(async () => mkView({ mode: 'daily', date: TODAY, attempt: 1, results: ['skip'], token: 'tok-1' })),
    fetchClip: vi.fn(async () => new Blob([new Uint8Array(2)])),
  })
  const store = createStore(localStorage)
  const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
  const utils = render(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} />)
  return { api, controller, ...utils }
}

const tick = () => {
  const batch = [...pending.values()]
  pending.clear()
  batch.forEach((cb) => cb())
}

describe('GameBoard con barra de reproduccion', () => {
  it('FE-BAR-02 en curso muestra la barra con aria-valuemax = segundos del intento actual', async () => {
    board(mkView({ mode: 'daily', date: TODAY, attempt: 2, results: ['skip', 'skip'] }))
    const bar = await screen.findByRole('progressbar')
    expect(bar.getAttribute('aria-valuemax')).toBe('4')
  })

  it('FE-BAR-10 al saltar la zona desbloqueada crece (1 s -> 2 s)', async () => {
    const { controller } = board(mkView({ mode: 'daily', date: TODAY }))
    expect((await screen.findByRole('progressbar')).getAttribute('aria-valuemax')).toBe('1')
    await act(async () => controller.skip())
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('2')
  })

  it('FE-BAR-01 la barra tiene las 6 marcas de los fragmentos', async () => {
    const { container } = board(mkView({ mode: 'daily', date: TODAY }))
    await screen.findByRole('progressbar')
    expect(container.querySelectorAll('[data-mark]').length).toBe(6)
  })

  it('FE-BAR-04 al reproducir, el cabezal sigue a audio.currentTime (aria-valuenow) en cada frame', async () => {
    board(mkView({ mode: 'daily', date: TODAY, attempt: 3, results: ['skip', 'skip', 'skip'] }))
    fireEvent.click(await screen.findByRole('button', { name: /reproducir 7 s/i }))
    audioInstances[0].currentTime = 3
    await act(async () => tick())
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBe(3)
  })

  it('FE-BAR-11 con la partida terminada no hay barra o queda en estado final, sin NaN ni excepcion', async () => {
    const { container, controller } = board(mkView({ mode: 'daily', date: TODAY }), mkFinished({ mode: 'daily', date: TODAY }))
    await screen.findByRole('progressbar')
    await act(async () => controller.guess('rse-littleroot-town'))
    expect((await screen.findAllByText('Littleroot Town')).length).toBeGreaterThan(0)
    expect(container.innerHTML).not.toContain('NaN')
  })

  it('FE-PLY-08 desmontar el tablero cancela la suscripcion y el frame pendiente', async () => {
    const { unmount } = board(mkView({ mode: 'daily', date: TODAY }))
    fireEvent.click(await screen.findByRole('button', { name: /reproducir 1 s/i }))
    expect(pending.size).toBe(1)
    unmount()
    expect(pending.size).toBe(0)
    expect(() => tick()).not.toThrow()
  })

  it('FE-PLY-08 sin reproducir no hay ningun frame activo (la barra no consume CPU en reposo)', async () => {
    board(mkView({ mode: 'daily', date: TODAY }))
    await screen.findByRole('button', { name: /reproducir 1 s/i })
    expect(pending.size).toBe(0)
  })
})
