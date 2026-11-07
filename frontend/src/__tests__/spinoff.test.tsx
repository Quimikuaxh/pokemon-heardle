// DEC-60: diario de spin-offs, buscador por modo y filtro en dos secciones.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import App from '../App'
import { FilterGames } from '../components/FilterPanel'
import { createGameController } from '../game/controller'
import { gamesOfSeries, hasSpinoffs, scopeCatalog } from '../game/scope'
import { createStore } from '../storage/store'
import { mkApi, mkView, NOW_MS, TODAY } from './helpers'

const GAMES = [
  { id: 'rse', name: 'Pokémon Ruby / Sapphire / Emerald', series: 'main' },
  { id: 'dp', name: 'Pokémon Diamond / Pearl', series: 'main' },
  { id: 'md', name: 'Pokémon Mystery Dungeon', series: 'spinoff' },
  { id: 'xd', name: 'Pokémon XD', series: 'spinoff' },
]
const SONGS = [
  { id: 'rse-littleroot-town', title: 'Littleroot Town', games: ['rse'] },
  { id: 'dp-twinleaf-town', title: 'Twinleaf Town', games: ['dp'] },
  { id: 'md-treasure-town', title: 'Treasure Town', games: ['md'] },
  { id: 'xd-phenac-city', title: 'Phenac City', games: ['xd'] },
]
const catalog = (): any => ({ version: 1, games: GAMES, songs: SONGS })

beforeEach(() => localStorage.clear())

describe('game/scope (DEC-60)', () => {
  it('FE-SPO-01 hasSpinoffs, gamesOfSeries y scopeCatalog', () => {
    expect(hasSpinoffs(catalog())).toBe(true)
    expect(hasSpinoffs({ ...catalog(), games: GAMES.filter((g) => g.series === 'main') })).toBe(false)
    expect([...gamesOfSeries(catalog(), 'spinoff')]).toEqual(['md', 'xd'])
    const scoped = scopeCatalog(catalog(), new Set(['md']))
    expect([scoped.games.map((g) => g.id), scoped.songs.map((s) => s.id)]).toEqual([['md'], ['md-treasure-town']])
    expect(scopeCatalog(catalog(), null)).toEqual(catalog())
  })
})

describe('store y controlador por serie (DEC-60)', () => {
  it('FE-SPO-02 el diario spin-off pide series=spinoff y guarda su registro aparte (daily-spinoff:<fecha>)', async () => {
    const createGame = vi.fn(async () => mkView({ mode: 'daily', date: TODAY, series: 'spinoff', token: 'spin-1' }))
    const store = createStore(localStorage)
    const ctl = createGameController({ api: mkApi({ createGame }), store, catalog: catalog(), nowMs: () => NOW_MS, dailySeries: 'spinoff' })
    await ctl.openDaily()
    expect(createGame).toHaveBeenCalledWith({ mode: 'daily', series: 'spinoff' })
    expect(store.getDaily(TODAY, 'spinoff')?.token).toBe('spin-1')
    expect(store.getDaily(TODAY)).toBeNull()
  })

  it('FE-SPO-03 el diario principal sigue pidiendo { mode: daily } y usando daily:<fecha>', async () => {
    const createGame = vi.fn(async () => mkView({ mode: 'daily', date: TODAY, series: 'main', token: 'main-1' }))
    const store = createStore(localStorage)
    const ctl = createGameController({ api: mkApi({ createGame }), store, catalog: catalog(), nowMs: () => NOW_MS })
    await ctl.openDaily()
    expect(createGame).toHaveBeenCalledWith({ mode: 'daily' })
    expect(store.getDaily(TODAY)?.token).toBe('main-1')
    expect(store.getDaily(TODAY, 'spinoff')).toBeNull()
  })

  it('FE-SPO-04 la partida libre guarda los juegos con los que empezo y los recupera al reanudar', async () => {
    const store = createStore(localStorage)
    store.setFilter(['md', 'rse'])
    const createGame = vi.fn(async () => mkView({ token: 'u-1' }))
    const ctl = createGameController({ api: mkApi({ createGame }), store, catalog: catalog(), nowMs: () => NOW_MS })
    await ctl.startUnlimited()
    expect(ctl.getPool()).toEqual(['md', 'rse'])
    expect(store.getUnlimited()).toEqual({ token: 'u-1', games: ['md', 'rse'] })
    store.setFilter(['dp'])
    const ctl2 = createGameController({ api: mkApi({ getState: vi.fn(async () => mkView({ token: 'u-1' })) }), store, catalog: catalog(), nowMs: () => NOW_MS })
    await ctl2.resumeUnlimited()
    expect(ctl2.getPool()).toEqual(['md', 'rse'])
  })

  it('FE-SPO-05 la serie elegida se recuerda (heardle:dailySeries), principal por defecto', () => {
    const store = createStore(localStorage)
    expect(store.getDailySeries()).toBe('main')
    store.setDailySeries('spinoff')
    expect(createStore(localStorage).getDailySeries()).toBe('spinoff')
  })
})

describe('FilterGames con spin-offs (DEC-60)', () => {
  it('FE-SPO-06 dos secciones, cada una con su "Todos"; sin spin-offs, una sola lista sin secciones', () => {
    const onChange = vi.fn()
    const { rerender } = render(<FilterGames games={GAMES as any} selected={['rse']} onChange={onChange} />)
    const main = screen.getByRole('group', { name: 'Principales' })
    const spin = screen.getByRole('group', { name: 'Spin-offs' })
    expect(within(main).getAllByRole('checkbox').length).toBe(2)
    expect(within(spin).getAllByRole('checkbox').length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Todos los spin-offs' }))
    expect(new Set(onChange.mock.calls[0][0])).toEqual(new Set(['rse', 'md', 'xd']))
    rerender(<FilterGames games={GAMES.filter((g) => g.series === 'main') as any} selected={[]} onChange={onChange} />)
    expect(screen.queryByRole('group', { name: 'Spin-offs' })).toBeNull()
  })
})

describe('FilterGames: lista con scroll propio (DEC-59)', () => {
  it('FE-SPO-11 en escritorio la lista ocupa el hueco y hace scroll dentro de su pantalla (con muchos juegos no estira la Pokedex)', () => {
    render(<FilterGames games={GAMES as any} selected={[]} onChange={vi.fn()} />)
    const list = screen.getByRole('group', { name: 'Principales' }).parentElement!
    expect(list.className).toMatch(/lg:overflow-y-auto/)
    expect(list.className).toMatch(/lg:flex-1/)
    expect(list.className).toContain('dex-screen-scroll')
  })
})

describe('App con spin-offs (DEC-60)', () => {
  const route = (createGame = vi.fn(async (body: any) => mkView({ mode: 'daily', date: TODAY, series: body.series ?? 'main', token: `t-${body.series ?? 'main'}` }))) => {
    globalThis.fetch = vi.fn(async (u: any, init?: any) => {
      const url = String(u)
      const json = (b: any) => new Response(JSON.stringify(b), { status: 200 })
      if (url.endsWith('/health')) return json({ ok: true })
      if (url.endsWith('/catalog')) return json(catalog())
      if (url.endsWith('/games')) return json(await createGame(JSON.parse(init.body)))
      return new Response(new Uint8Array(2))
    }) as any
    return createGame
  }

  it('FE-SPO-07 conmutador Principal / Spin-off dentro de Diario; el diario spin-off no se crea hasta elegirlo', async () => {
    const createGame = route()
    render(<App />)
    await screen.findByRole('combobox')
    const group = screen.getByRole('group', { name: 'Serie del diario' })
    expect(within(group).getByRole('button', { name: 'Principal' }).getAttribute('aria-pressed')).toBe('true')
    expect(createGame.mock.calls.map((c: any) => c[0].series ?? 'main')).toEqual(['main'])
    fireEvent.click(within(group).getByRole('button', { name: 'Spin-off' }))
    await waitFor(() => expect(createGame.mock.calls.map((c: any) => c[0].series ?? 'main')).toEqual(['main', 'spinoff']))
    expect(await screen.findByText(/^SPIN-OFF DEL DÍA · /)).toBeTruthy()
    expect(localStorage.getItem('heardle:dailySeries')).toBe('"spinoff"')
  })

  it('FE-SPO-08 el buscador de cada diario solo ofrece canciones de su serie', async () => {
    route()
    render(<App />)
    const mainBoard = await screen.findByRole('region', { name: 'Partida diaria' })
    fireEvent.change(within(mainBoard).getByRole('combobox'), { target: { value: 'town' } })
    expect(within(mainBoard).getAllByRole('option').map((o) => o.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Littleroot'), expect.stringContaining('Twinleaf')]))
    expect(within(mainBoard).queryByText('Treasure Town')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Spin-off' }))
    const spinBoard = await screen.findByRole('region', { name: 'Partida diaria spin-off' })
    fireEvent.change(await within(spinBoard).findByRole('combobox'), { target: { value: 'town' } })
    const options = within(spinBoard).getAllByRole('option').map((o) => o.textContent)
    expect(options.some((t) => t?.includes('Treasure Town'))).toBe(true)
    expect(options.some((t) => t?.includes('Littleroot'))).toBe(false)
  })

  it('FE-SPO-10 el buscador del modo libre solo ofrece los juegos con los que empezo la partida', async () => {
    route(vi.fn(async (body: any) => (body.mode === 'unlimited' ? mkView({ token: 'u-1' }) : mkView({ mode: 'daily', date: TODAY, series: 'main' }))))
    render(<App />)
    await screen.findByRole('combobox')
    fireEvent.click(screen.getByRole('button', { name: 'Partida libre' }))
    const board = screen.getByRole('region', { name: 'Partida libre' })
    fireEvent.click(within(board).getByRole('checkbox', { name: /Mystery Dungeon/ }))
    fireEvent.click(within(board).getByRole('checkbox', { name: /Ruby/ }))
    fireEvent.click(within(board).getByRole('button', { name: 'Empezar partida' }))
    fireEvent.change(await within(board).findByRole('combobox'), { target: { value: 'town' } })
    const options = within(board).getAllByRole('option').map((o) => o.textContent ?? '')
    expect(options.some((t) => t.includes('Treasure Town'))).toBe(true)
    expect(options.some((t) => t.includes('Littleroot'))).toBe(true)
    expect(options.some((t) => t.includes('Twinleaf'))).toBe(false)
  })

  it('FE-SPO-09 sin spin-offs en el catalogo no hay conmutador', async () => {
    globalThis.fetch = vi.fn(async (u: any) => {
      const url = String(u)
      const json = (b: any) => new Response(JSON.stringify(b), { status: 200 })
      if (url.endsWith('/health')) return json({ ok: true })
      if (url.endsWith('/catalog')) return json({ version: 1, games: GAMES.filter((g) => g.series === 'main'), songs: SONGS.slice(0, 2) })
      if (url.endsWith('/games')) return json(mkView({ mode: 'daily', date: TODAY, series: 'main' }))
      return new Response(new Uint8Array(2))
    }) as any
    render(<App />)
    await screen.findByRole('combobox')
    expect(screen.queryByRole('group', { name: 'Serie del diario' })).toBeNull()
  })
})
