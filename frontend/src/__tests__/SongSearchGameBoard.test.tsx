// FE-CMB-14/15/19, FE-GRP-01/03 y FE-NOF-03 [MOD]: burbuja de juego dentro del tablero, grupos de seleccion fuera del cliente.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { GameBoard } from '../components/GameBoard'
import { FilterPanel } from '../components/FilterPanel'
import { createGameController } from '../game/controller'
import { createStore } from '../storage/store'
import { mkApi, mkCatalog, mkFinished, mkView, NOW_MS, TODAY } from './helpers'

beforeEach(() => {
  ;(globalThis as any).Audio = class extends EventTarget {
    src = ''
    currentTime = 0
    play = vi.fn(() => Promise.resolve())
    pause() {}
  }
  URL.createObjectURL = vi.fn(() => 'blob:x') as any
  URL.revokeObjectURL = vi.fn() as any
  ;(Element.prototype as any).scrollIntoView = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

function board(mode: 'daily' | 'unlimited', apiOver: Record<string, unknown> = {}, filter: string[] = ['rse'], seed?: (store: ReturnType<typeof createStore>) => void) {
  const api = mkApi({ fetchClip: vi.fn(async () => new Blob([new Uint8Array(2)])), ...apiOver })
  const store = createStore(localStorage)
  store.setFilter(filter)
  seed?.(store)
  const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
  render(<GameBoard mode={mode} controller={controller} api={api} catalog={mkCatalog()} store={store} />)
  return { api, store, controller }
}
const input = () => screen.findByRole('combobox')
const bubble = () => screen.queryByRole('button', { name: /quitar filtro de juego/i })

async function pickGame(query: string) {
  const el = (await input()) as HTMLInputElement
  fireEvent.change(el, { target: { value: query } })
  fireEvent.keyDown(el, { key: 'ArrowDown' })
  fireEvent.keyDown(el, { key: 'Enter' })
}

describe('burbuja de juego en el tablero', () => {
  it('FE-CMB-14 la burbuja se borra al empezar otra partida', async () => {
    const createGame = vi.fn(async () => mkView({ token: 'nueva' }))
    board('unlimited', { createGame, getState: vi.fn(async () => mkView({ token: 'vieja' })) }, ['rse'], (st) => st.setUnlimited({ token: 'vieja' }))
    await pickGame('ruby')
    expect(bubble()).not.toBeNull()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(await screen.findByRole('button', { name: /empezar partida/i }))
    await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(bubble()).toBeNull())
  })

  it('FE-CMB-14 no se guarda en localStorage: las claves no cambian al elegir y quitar la burbuja', async () => {
    const { store } = board('daily', { createGame: vi.fn(async () => mkView({ mode: 'daily', date: TODAY })) })
    await input()
    const before = Object.keys(localStorage).sort()
    await pickGame('ruby')
    fireEvent.click(bubble()!)
    expect(Object.keys(localStorage).sort()).toEqual(before)
    expect(JSON.stringify(Object.entries(localStorage))).not.toMatch(/ruby|burbuja|bubble/i)
    expect(store.getFilter()).toEqual(['rse'])
  })

  it('FE-CMB-15 la burbuja no toca heardle:filter ni el FilterPanel y admite juegos fuera del pool libre', async () => {
    const createGame = vi.fn(async () => mkView())
    const { store } = board('unlimited', { createGame, getState: vi.fn(async () => mkView({ token: 'u' })) }, ['rse'], (st) => st.setUnlimited({ token: 'u' }))
    const checks = () => screen.queryAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)
    await input()
    const before = checks()
    await pickGame('black') // bw esta fuera del pool libre {rse}
    expect(bubble()?.getAttribute('aria-label')).toContain('Black')
    expect(store.getFilter()).toEqual(['rse'])
    expect(checks()).toEqual(before)
  })

  it('FE-CMB-19 partida terminada: no queda un combobox activo ni burbuja interactiva', async () => {
    const api = mkApi()
    const store = createStore(localStorage)
    store.setDaily(TODAY, { token: 't', finished: true, view: mkFinished({ mode: 'daily', date: TODAY }) })
    const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    render(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} />)
    await screen.findAllByText('Littleroot Town')
    const combo = screen.queryByRole('combobox') as HTMLInputElement | null
    if (combo) expect(combo.disabled).toBe(true)
    const b = bubble()
    if (b) expect((b as HTMLButtonElement).disabled).toBe(true)
  })

  it('FE-CMB-07 elegir una cancion del buscador del tablero hace UNA llamada guess con el songId', async () => {
    const guess = vi.fn(async () => mkView({ token: 't2', attempt: 1, results: ['miss'], guesses: ['bw-castle'] }))
    board('daily', { createGame: vi.fn(async () => mkView({ mode: 'daily', date: TODAY })), guess })
    const el = (await input()) as HTMLInputElement
    fireEvent.change(el, { target: { value: 'castle' } })
    fireEvent.keyDown(el, { key: 'ArrowDown' })
    fireEvent.keyDown(el, { key: 'Enter' })
    await waitFor(() => expect(guess).toHaveBeenCalledTimes(1))
    expect(guess.mock.calls[0].slice(1)).toEqual(['bw-castle'])
  })

  it('FE-NOF-03 [MOD] settings solo aparece tras guardar ajustes; la burbuja no crea claves; nunca stats:*', async () => {
    const { store } = board('daily', { createGame: vi.fn(async () => mkView({ mode: 'daily', date: TODAY })) })
    await pickGame('ruby')
    const keys = () => Object.keys(localStorage).filter((k) => k.startsWith('heardle:')).sort()
    expect(keys().includes('heardle:settings')).toBe(false)
    act(() => store.setSettings({ consoleHint: true, dateHint: false }))
    expect(keys()).toContain('heardle:settings')
    expect(keys().filter((k) => /stats|bubble|burbuja/.test(k))).toEqual([])
  })
})

describe('grupos de seleccion fuera del cliente (FE-GRP)', () => {
  const games = [
    { id: 'bw', name: 'Pokémon Black / White' },
    { id: 'b2w2', name: 'Pokémon Black 2 / White 2' },
  ]
  const songs = [
    { id: 'bw-s', title: 'Castle', games: ['bw'] },
    { id: 'b2w2-s', title: 'Gear Station', games: ['b2w2'] },
  ]

  it('FE-GRP-01 FilterPanel muestra BW y B2W2 como casillas independientes', () => {
    const onChange = vi.fn()
    render(<FilterPanel games={games} songs={songs} selected={[]} onChange={onChange} onStart={() => {}} />)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes.length).toBe(2)
    fireEvent.click(boxes[0])
    expect(onChange).toHaveBeenLastCalledWith(['bw'])
  })

  it('FE-GRP-01 marcar B2W2 no marca BW', () => {
    const onChange = vi.fn()
    render(<FilterPanel games={games} songs={songs} selected={['bw']} onChange={onChange} onStart={() => {}} />)
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(onChange).toHaveBeenLastCalledWith(['bw', 'b2w2'])
  })

  it('FE-GRP-03 el catalogo publico con selectionGroup (aunque llegase) no cambia el filtro: dos casillas y sin usarlo', () => {
    const withGroup = games.map((g) => (g.id === 'b2w2' ? { ...g, selectionGroup: 'bw' } : g))
    render(<FilterPanel games={withGroup} songs={songs} selected={[]} onChange={() => {}} onStart={() => {}} />)
    expect(screen.getAllByRole('checkbox').length).toBe(2)
  })

  it('FE-GRP-03 el codigo del cliente no menciona selectionGroup (ni tipos, ni peticiones)', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (['__tests__', 'assets', 'node_modules'].includes(name)) continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name)) files.push(p)
      }
    }
    walk(join(__dirname, '..'))
    expect(files.filter((f) => readFileSync(f, 'utf8').includes('selectionGroup'))).toEqual([])
  })
})
