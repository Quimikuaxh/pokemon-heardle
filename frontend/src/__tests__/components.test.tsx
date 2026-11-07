import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { within, render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AttemptList } from '../components/AttemptList'
import { SongSearch } from '../components/SongSearch'
import { GameBoard } from '../components/GameBoard'
import App from '../App'
import { ApiError } from '../api/client'
import { createGameController } from '../game/controller'
import { createStore } from '../storage/store'
import { mkApi, mkCatalog, mkFinished, mkView, NOW_MS, TODAY } from './helpers'

let audioPlay: ReturnType<typeof vi.fn>
beforeEach(() => {
  audioPlay = vi.fn(() => Promise.resolve())
  // Con la barra de reproduccion (DEC-42) el player escucha eventos del audio: el falso es un EventTarget.
  ;(globalThis as any).Audio = class extends EventTarget {
    src = ''
    currentTime = 0
    play = audioPlay
    pause() {}
  }
  URL.createObjectURL = vi.fn(() => 'blob:x') as any
  URL.revokeObjectURL = vi.fn() as any
})
afterEach(() => vi.restoreAllMocks())

describe('AttemptList (historial del diseno, DEC-46)', () => {
  const view = mkView({ attempt: 4, results: ['miss', 'skip', 'game', 'hit'], guesses: ['dp-twinleaf-town', 'rse-oldale-town', 'rse-littleroot-town'], status: 'won' })

  it('FE-DSN-10 una partida terminada solo lista los intentos usados, numerados 01..04', () => {
    render(<AttemptList view={mkFinished({ attempt: 4, results: ['miss', 'skip', 'game', 'hit'], guesses: view.guesses })} catalog={mkCatalog()} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.textContent?.slice(0, 2))).toEqual(['01', '02', '03', '04'])
  })

  it('FE-DSN-10 cada resultado tiene su icono y su etiqueta accesible', () => {
    const { container } = render(<AttemptList view={mkFinished({ attempt: 4, results: ['miss', 'skip', 'game', 'hit'], guesses: view.guesses })} catalog={mkCatalog()} />)
    expect([...container.querySelectorAll('[data-result]')].map((m) => m.getAttribute('data-result'))).toEqual(['miss', 'skip', 'game', 'hit'])
    expect([...container.querySelectorAll('[data-result] .sr-only')].map((m) => m.textContent)).toEqual(['Juego incorrecto', 'Saltado', 'Juego acertado', 'Acertada'])
  })

  it('FE-DSN-10 el juego se muestra sin el prefijo "Pokémon" y "juego correcto" solo en el ambar', () => {
    const { container } = render(<AttemptList view={mkFinished({ attempt: 4, results: ['miss', 'skip', 'game', 'hit'], guesses: view.guesses })} catalog={mkCatalog()} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0].textContent).toContain('Diamond / Pearl')
    expect(rows[0].textContent).not.toContain('Pokémon')
    expect(rows[2].textContent).toContain('juego correcto')
    expect(rows[3].textContent).not.toContain('juego correcto')
    expect(container.querySelectorAll('strong[aria-hidden="true"]').length).toBe(1)
  })

  it('FE-DSN-10 en curso: la fila actual dice "Escuchando N s…" y las pendientes solo su duracion', () => {
    render(<AttemptList view={mkView({ attempt: 1, results: ['miss'], guesses: ['dp-twinleaf-town'] })} catalog={mkCatalog()} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.length).toBe(6)
    expect(rows[1].textContent).toContain('Escuchando 2 s…')
    expect(rows.slice(2).map((row) => row.textContent)).toEqual(['034 s', '047 s', '0511 s', '0616 s'])
  })
})

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
    expect(rows[3].textContent).toContain('Escuchando 7 s')
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
  it('muestra "Conectando con el servidor" mientras /health falla y despues el juego', async () => {
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
    expect(screen.getByText(/Conectando con el servidor/)).toBeTruthy()
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

describe('App: cabecera y tablero (DEC-46)', () => {
  const route = () => {
    globalThis.fetch = vi.fn(async (u: any) => {
      const url = String(u)
      const json = (b: any) => new Response(JSON.stringify(b), { status: 200 })
      if (url.endsWith('/health')) return json({ ok: true })
      if (url.endsWith('/catalog')) return json(mkCatalog())
      if (url.endsWith('/games')) return json(mkView({ mode: 'daily', date: TODAY }))
      return new Response(new Uint8Array(2))
    }) as any
  }

  it('FE-DSN-11 la cabecera lleva el logo (h1), el subtitulo "RETO DEL DÍA · dd MES" y el conmutador Diario / Libre', async () => {
    route()
    render(<App />)
    await screen.findByRole('button', { name: /^Diario$/ })
    expect(screen.getByRole('heading', { level: 1, name: 'Pokémon Heardle' })).toBeTruthy()
    expect(screen.getByText(/^RETO DEL DÍA · \d{2} [A-Z]{3}$/)).toBeTruthy()
    const group = screen.getByRole('group', { name: 'Modo de juego' })
    expect(group.querySelectorAll('button').length).toBe(2)
    expect(screen.getByRole('button', { name: 'Partida libre' }).textContent).toBe('Libre')
  })

  it('FE-DSN-11 al cambiar a Libre el subtitulo pasa a "MODO LIBRE" y el boton queda pulsado', async () => {
    route()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Partida libre' }))
    expect(screen.getByText('MODO LIBRE')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Partida libre' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('FE-DSN-12 la leyenda (CLAVE) existe en el tablero, oculta en movil y visible desde lg en la hoja derecha (DEC-58)', async () => {
    route()
    render(<App />)
    await screen.findByRole('button', { name: /^Diario$/ })
    const legend = (await screen.findAllByRole('complementary', { hidden: true }))[0]
    expect(legend.className).toMatch(/\bhidden\b/)
    expect(legend.className).toMatch(/lg:flex/)
    expect(legend.textContent).toContain('CLAVE')
  })
})

describe('App: reparto de la Pokedex (DEC-59)', () => {
  const route = () => {
    globalThis.fetch = vi.fn(async (u: any) => {
      const url = String(u)
      const json = (b: any) => new Response(JSON.stringify(b), { status: 200 })
      if (url.endsWith('/health')) return json({ ok: true })
      if (url.endsWith('/catalog')) return json(mkCatalog())
      if (url.endsWith('/games')) return json(mkView({ mode: 'daily', date: TODAY }))
      return new Response(new Uint8Array(2))
    }) as any
  }

  it('FE-DEX-05 hoja izquierda: controles, reproductor y leyenda; hoja derecha: historial arriba y buscador debajo', async () => {
    route()
    render(<App />)
    const daily = await screen.findByRole('region', { name: 'Partida diaria' })
    await within(daily).findByRole('combobox')
    const controls = screen.getByRole('group', { name: 'Modo de juego' }).closest('.dex-rtop')
    expect(controls).toBeTruthy()
    const left = daily.querySelector('.dex-lbody')!
    const right = daily.querySelector('.dex-rbody')!
    expect(within(left as HTMLElement).getByRole('region', { name: 'Reproductor' })).toBeTruthy()
    expect(within(left as HTMLElement).getByRole('complementary', { name: 'Leyenda', hidden: true })).toBeTruthy()
    const history = within(right as HTMLElement).getByRole('list', { name: 'Intentos' })
    const search = within(right as HTMLElement).getByRole('region', { name: 'Buscador' })
    expect(history.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Rendimiento: el repintado por frame no recalcula indices (DEC-46)', () => {
  /** Catalogo cuyos `songs` cuentan cuantas veces se recorren con map / for..of. */
  function countingCatalog() {
    const base = mkCatalog()
    const counter = { reads: 0 }
    const songs = new Proxy(base.songs, {
      get(target, key, receiver) {
        if (key === 'map' || key === Symbol.iterator) counter.reads++
        return Reflect.get(target, key, receiver)
      },
    })
    return { catalog: { ...base, songs }, counter }
  }

  function Repainter({ children }: { children: (tick: number) => React.ReactNode }) {
    const [tick, setTick] = useState(0)
    return (
      <>
        <button onClick={() => setTick((n) => n + 1)}>repintar</button>
        {children(tick)}
      </>
    )
  }

  it('FE-DSN-14 AttemptList: con las mismas props, 20 repintados del padre no vuelven a recorrer el catalogo', () => {
    const { catalog, counter } = countingCatalog()
    const view = mkView({ attempt: 1, results: ['miss'], guesses: ['dp-twinleaf-town'] })
    render(<Repainter>{() => <AttemptList view={view} catalog={catalog} />}</Repainter>)
    const afterFirst = counter.reads
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByText('repintar'))
    expect(counter.reads).toBe(afterFirst)
  })

  it('FE-DSN-14 SongSearch: con las mismas props, los repintados del padre no repiten la busqueda', () => {
    const { catalog, counter } = countingCatalog()
    const guesses: string[] = []
    const onSelect = vi.fn()
    render(<Repainter>{() => <SongSearch catalog={catalog} guesses={guesses} onSelect={onSelect} />}</Repainter>)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'town' } })
    const afterSearch = counter.reads
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByText('repintar'))
    expect(counter.reads).toBe(afterSearch)
  })
})

describe('App: foco visible del conmutador (WCAG 2.4.7)', () => {
  it('FE-DSN-15 el grupo Diario/Libre no recorta el aro de foco: sin overflow-hidden y con extremos redondeados en los botones', async () => {
    globalThis.fetch = vi.fn(async (u: any) => {
      const url = String(u)
      const json = (b: any) => new Response(JSON.stringify(b), { status: 200 })
      if (url.endsWith('/health')) return json({ ok: true })
      if (url.endsWith('/catalog')) return json(mkCatalog())
      return json(mkView({ mode: 'daily', date: TODAY }))
    }) as any
    render(<App />)
    const daily = await screen.findByRole('button', { name: /^Diario$/ })
    const group = screen.getByRole('group', { name: 'Modo de juego' })
    expect(group.className).not.toMatch(/overflow-(hidden|clip)/)
    expect(daily.className).toMatch(/rounded-l/)
    expect(screen.getByRole('button', { name: 'Partida libre' }).className).toMatch(/rounded-r/)
  })

  it('FE-DSN-15 ningun ancestro del conmutador recorta el desbordamiento (overflow-hidden)', async () => {
    globalThis.fetch = vi.fn(async (u: any) => {
      const url = String(u)
      const json = (b: any) => new Response(JSON.stringify(b), { status: 200 })
      if (url.endsWith('/health')) return json({ ok: true })
      if (url.endsWith('/catalog')) return json(mkCatalog())
      return json(mkView({ mode: 'daily', date: TODAY }))
    }) as any
    render(<App />)
    let node: HTMLElement | null = (await screen.findByRole('button', { name: /^Diario$/ })).parentElement
    while (node && node !== document.body) {
      expect(node.className).not.toMatch(/overflow-(hidden|clip)/)
      node = node.parentElement
    }
  })
})
