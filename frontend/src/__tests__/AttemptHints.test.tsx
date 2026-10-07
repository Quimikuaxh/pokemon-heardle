// FE-HNT-01..14: pistas en AttemptList (DEC-50, DEC-52). Contrato: <AttemptList view catalog settings={{ consoleHint, dateHint }} />;
//  - burbuja de consola con aria-label "Consola: <LABEL>, coincide" / "Consola: <LABEL>, no coincide", con icono (svg) y el nombre visible;
//  - flecha de fecha con aria-label "La cancion buscada es de un juego anterior" / "... posterior";
//  - GameBoard recibe `settings` como prop (el engranaje vive en la App, que persiste en store.setSettings).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AttemptList as AttemptListReal } from '../components/AttemptList'
import { GameBoard } from '../components/GameBoard'
import { createGameController } from '../game/controller'
import { createStore } from '../storage/store'
import { mkApi, mkCatalog, mkFinished, mkView, NOW_MS, TODAY } from './helpers'

// AttemptList aun no declara la prop `settings` (contrato nuevo): se tipa como any para que el fichero compile
const AttemptList: any = AttemptListReal

const ON = { consoleHint: true, dateHint: true }
const OFF = { consoleHint: false, dateHint: false }
const consoleOnly = { consoleHint: true, dateHint: false }
const dateOnly = { consoleHint: false, dateHint: true }

const green = { console: { label: 'DS', match: true }, order: null }
const redEarlier = { console: { label: 'GBA', match: false }, order: 'earlier' }
const redLater = { console: { label: 'DS', match: false }, order: 'later' }

function viewWith(hints: any[], results: string[] = ['miss', 'game', 'miss'], extra: Record<string, unknown> = {}) {
  return mkView({
    attempt: results.length,
    results,
    guesses: ['bw-castle', 'dp-twinleaf-town', 'rse-oldale-town'].slice(0, results.filter((r) => r !== 'skip' && r !== 'hit').length),
    hints,
    ...extra,
  })
}
const list = (view: any, settings: any) => render(<AttemptList view={view} catalog={mkCatalog()} settings={settings} />)
const consoleLabels = () => screen.queryAllByLabelText(/^Consola: /)
const arrows = () => screen.queryAllByLabelText(/La canci[oó]n buscada es de un juego/i)

describe('AttemptList: pistas', () => {
  it('FE-HNT-01 pistas desactivadas: sin burbujas ni flechas aunque hints traiga datos', () => {
    list(viewWith([redEarlier, green, redLater]), OFF)
    expect([consoleLabels().length, arrows().length]).toEqual([0, 0])
  })

  it('FE-HNT-02 consola activada: una burbuja por fallo con su consola', () => {
    list(viewWith([redEarlier, green, redLater]), consoleOnly)
    expect(consoleLabels().map((e) => e.getAttribute('aria-label'))).toEqual(['Consola: GBA, no coincide', 'Consola: DS, coincide', 'Consola: DS, no coincide'])
  })

  it('FE-HNT-02 el nombre de la consola es visible en la burbuja', () => {
    list(viewWith([redEarlier, green, redLater]), consoleOnly)
    expect(consoleLabels()[0].textContent).toContain('GBA')
    expect(consoleLabels()[1].textContent).toContain('DS')
  })

  it('FE-HNT-03 el estado no depende solo del color: cada burbuja lleva un icono (svg o check/cruz) distinto para coincide y no coincide', () => {
    list(viewWith([redEarlier, green, redLater]), consoleOnly)
    const [no, yes] = consoleLabels()
    const iconOf = (e: Element) => e.querySelector('svg')?.outerHTML ?? e.textContent?.replace(/[A-Za-z0-9 ]/g, '') ?? ''
    expect(iconOf(yes)).not.toBe('')
    expect(iconOf(no)).not.toBe('')
    expect(iconOf(yes)).not.toBe(iconOf(no))
  })

  it('FE-HNT-04 fecha activada: flecha anterior/posterior con su texto accesible; sin flecha si order es null', () => {
    list(viewWith([redEarlier, green, redLater]), dateOnly)
    expect(arrows().map((e) => e.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/juego anterior/i),
      expect.stringMatching(/juego posterior/i),
    ])
  })

  it('FE-HNT-05 skips y acierto no llevan pistas', () => {
    const v = mkView({ attempt: 3, results: ['skip', 'miss', 'hit'], guesses: ['bw-castle', 'rse-littleroot-town'], hints: [null, redEarlier, null], status: 'won' })
    render(<AttemptList view={v} catalog={mkCatalog()} settings={ON} />)
    expect([consoleLabels().length, arrows().length]).toEqual([1, 1])
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).queryAllByLabelText(/Consola:|juego/i).length).toBe(0)
    expect(within(rows[2]).queryAllByLabelText(/Consola:|buscada es de un juego/i).length).toBe(0)
  })

  it('FE-HNT-06 los interruptores son independientes: solo consola -> sin flechas; solo fecha -> sin burbujas', () => {
    const a = list(viewWith([redEarlier, green, redLater]), consoleOnly)
    expect([consoleLabels().length, arrows().length]).toEqual([3, 0])
    a.unmount()
    list(viewWith([redEarlier, green, redLater]), dateOnly)
    expect([consoleLabels().length, arrows().length]).toEqual([0, 2])
  })

  it('FE-HNT-07 activar a mitad de partida pinta tambien los fallos anteriores sin ninguna peticion; desactivar las oculta', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const view = viewWith([redEarlier, green, redLater])
    const { rerender } = render(<AttemptList view={view} catalog={mkCatalog()} settings={OFF} />)
    expect(consoleLabels().length).toBe(0)
    rerender(<AttemptList view={view} catalog={mkCatalog()} settings={consoleOnly} />)
    expect(consoleLabels().length).toBe(3)
    rerender(<AttemptList view={view} catalog={mkCatalog()} settings={ON} />)
    expect([consoleLabels().length, arrows().length]).toEqual([3, 2])
    rerender(<AttemptList view={view} catalog={mkCatalog()} settings={OFF} />)
    expect([consoleLabels().length, arrows().length]).toEqual([0, 0])
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('FE-HNT-08 console null no pinta burbuja (la flecha de fecha si, si order existe)', () => {
    list(viewWith([{ console: null, order: 'later' }, null, null], ['miss', 'skip', 'skip']), ON)
    expect([consoleLabels().length, arrows().length]).toEqual([0, 1])
  })

  it('FE-HNT-10 vistas guardadas sin hints (versiones anteriores): sin excepcion ni pistas', () => {
    const v = viewWith([], ['miss', 'miss'])
    delete v.hints
    expect(() => list(v, ON)).not.toThrow()
    expect([consoleLabels().length, arrows().length]).toEqual([0, 0])
  })

  it('FE-HNT-11 hints mas cortos o mas largos que results no rompen la lista', () => {
    expect(() => list(viewWith([redEarlier], ['miss', 'miss', 'miss']), ON)).not.toThrow()
    expect(screen.getAllByRole('listitem').length).toBe(6)
    expect(consoleLabels().length).toBe(1)
  })

  it('FE-HNT-11 hints con mas elementos que results', () => {
    expect(() => list(viewWith([redEarlier, redLater, green, green, green], ['miss']), ON)).not.toThrow()
    expect(consoleLabels().length).toBeLessThanOrEqual(1)
  })

  it('FE-HNT-11 hints con elementos corruptos (objetos incompletos) no lanzan', () => {
    expect(() => list(viewWith([{}, { console: {} }, { console: { label: 5 }, order: 'raro' }]), ON)).not.toThrow()
  })

  it('FE-HNT-12 las mismas pistas se pintan en diario e ilimitado', () => {
    const daily = list(viewWith([redEarlier, green, redLater], undefined, { mode: 'daily', date: TODAY }), ON)
    const dailyLabels = consoleLabels().map((e) => e.getAttribute('aria-label'))
    daily.unmount()
    list(viewWith([redEarlier, green, redLater], undefined, { mode: 'unlimited' }), ON)
    expect(consoleLabels().map((e) => e.getAttribute('aria-label'))).toEqual(dailyLabels)
  })

  it('FE-HNT-13 las pistas no alteran el texto accesible del resultado ni el feedback de juego', () => {
    const view = viewWith([redEarlier, green, redLater])
    const textWithout = (() => {
      const r = list(view, OFF)
      const t = screen.getAllByRole('listitem').map((li) => li.querySelector('[data-result]')?.textContent)
      r.unmount()
      return t
    })()
    list(view, ON)
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('[data-result]')?.textContent)).toEqual(textWithout)
    expect(screen.getByText(/juego correcto/i)).toBeTruthy() // el feedback "game" sigue
  })

  it('FE-HNT-14 desactivadas, las pistas no quedan en el DOM como texto oculto', () => {
    const { container } = list(viewWith([redEarlier, green, redLater]), OFF)
    expect(container.innerHTML).not.toMatch(/Consola:|GBA|anterior|posterior|coincide/)
  })
})

describe('GameBoard: pistas y ajustes', () => {
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

  it('FE-HNT-09 diario terminado guardado con hints y pistas activas: se pintan sin llamar a la API', async () => {
    const api = mkApi()
    const store = createStore(localStorage)
    const view = mkFinished({
      mode: 'daily',
      date: TODAY,
      status: 'lost',
      attempt: 3,
      results: ['miss', 'game', 'miss'],
      guesses: ['bw-castle', 'dp-twinleaf-town', 'rse-oldale-town'],
      hints: [redEarlier, green, redLater],
    })
    store.setDaily(TODAY, { token: 't', finished: true, view })
    const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    render(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} {...({ settings: ON } as any)} />)
    expect((await screen.findAllByLabelText(/^Consola: /)).length).toBe(3)
    expect([api.createGame, api.getState, api.guess, api.skip].map((f: any) => f.mock.calls.length)).toEqual([0, 0, 0, 0])
  })

  it('FE-HNT-01 / FE-SET-10 el mismo tablero con ajustes desactivados no pinta pistas y cambiar settings no hace peticiones', async () => {
    const api = mkApi()
    const store = createStore(localStorage)
    const view = mkFinished({ mode: 'daily', date: TODAY, status: 'lost', attempt: 1, results: ['miss'], guesses: ['bw-castle'], hints: [redEarlier] })
    store.setDaily(TODAY, { token: 't', finished: true, view })
    const controller = createGameController({ api, store, catalog: mkCatalog(), nowMs: () => NOW_MS })
    const { rerender } = render(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} {...({ settings: OFF } as any)} />)
    await screen.findAllByText('Littleroot Town')
    expect(consoleLabels().length).toBe(0)
    rerender(<GameBoard mode="daily" controller={controller} api={api} catalog={mkCatalog()} store={store} {...({ settings: ON } as any)} />)
    expect(consoleLabels().length).toBe(1)
    expect([api.createGame, api.getState].map((f: any) => f.mock.calls.length)).toEqual([0, 0])
  })
})
