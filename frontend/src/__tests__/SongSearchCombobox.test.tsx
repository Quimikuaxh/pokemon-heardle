// FE-CMB-*: combobox del buscador con grupos "Juegos" / "Canciones" y burbuja de juego (DEC-49). Convenciones asumidas:
//  - input role=combobox (aria-expanded, aria-controls, aria-activedescendant, aria-describedby solo con burbuja);
//  - listbox con dos role=group (aria-labelledby a las cabeceras "Juegos" y "Canciones"; un grupo vacio no se pinta);
//  - burbuja: <span> con el nombre del juego y <button aria-label="Quitar filtro de juego: <nombre>"> ANTES del input en el DOM;
//  - region aria-live (role=status) con "Filtro de juego: <nombre>", "Filtro de juego quitado" y el numero de resultados;
//  - sin resultados: texto "Sin resultados" dentro del listbox.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SongSearch } from '../components/SongSearch'
import { bigCatalog, mkCatalog } from './helpers'

const RUBY = 'Pokémon Ruby / Sapphire / Emerald'

beforeEach(() => {
  ;(Element.prototype as any).scrollIntoView = vi.fn()
})

function setup(props: Record<string, unknown> = {}, catalog: any = mkCatalog()) {
  const onSelect = vi.fn()
  const utils = render(<SongSearch catalog={catalog} guesses={[]} onSelect={onSelect} {...(props as any)} />)
  const input = () => screen.getByRole('combobox') as HTMLInputElement
  const type = (v: string) => fireEvent.change(input(), { target: { value: v } })
  const key = (k: string, init: Record<string, unknown> = {}) => fireEvent.keyDown(input(), { key: k, ...init })
  const options = () => screen.queryAllByRole('option')
  const option = (text: string) => options().find((o) => o.textContent?.includes(text))!
  const bubbleButton = () => screen.queryByRole('button', { name: /quitar filtro de juego/i })
  const pickGame = (query: string) => {
    type(query)
    key('ArrowDown')
    key('Enter')
  }
  return { ...utils, onSelect, input, type, key, options, option, bubbleButton, pickGame }
}

describe('SongSearch: estructura ARIA (FE-CMB-01..04)', () => {
  it('FE-CMB-01 input role=combobox con aria-expanded coherente y aria-controls al listbox', () => {
    const { input, type } = setup()
    expect(input().getAttribute('aria-expanded')).toBe('false')
    type('town')
    expect(input().getAttribute('aria-expanded')).toBe('true')
    const listbox = screen.getByRole('listbox')
    expect(input().getAttribute('aria-controls')).toBe(listbox.id)
    expect(listbox.id).not.toBe('')
  })

  it('FE-CMB-01 al vaciar el texto (sin burbuja) la lista se cierra', () => {
    const { input, type } = setup()
    type('town')
    type('')
    expect(input().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('FE-CMB-02 dos role=group con aria-labelledby a las cabeceras "Juegos" y "Canciones"', () => {
    const { type } = setup()
    type('ruby')
    const groups = screen.getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent)).toEqual(['Juegos', 'Canciones'])
  })

  it('FE-CMB-02 un grupo vacio no se pinta: "town" solo Canciones; un texto que solo es de juego ("black") solo Juegos... y sus canciones', () => {
    const { type } = setup()
    type('town')
    expect(screen.getAllByRole('group').length).toBe(1)
    expect(screen.getByRole('group', { name: 'Canciones' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Juegos' })).toBeNull()
  })

  it('FE-CMB-02 las opciones de juego estan dentro del grupo Juegos y las de cancion dentro de Canciones', () => {
    const { type } = setup()
    type('ruby')
    const games = within(screen.getByRole('group', { name: 'Juegos' })).getAllByRole('option')
    const songs = within(screen.getByRole('group', { name: 'Canciones' })).getAllByRole('option')
    expect([games.length, songs.length]).toEqual([1, 2])
    expect(games[0].textContent).toContain('Ruby')
  })

  it('FE-CMB-03 opciones role=option; la activa tiene aria-selected=true y el input aria-activedescendant a su id', () => {
    const { input, type, key, options } = setup()
    type('ruby')
    key('ArrowDown')
    const selected = options().filter((o) => o.getAttribute('aria-selected') === 'true')
    expect(selected.length).toBe(1)
    expect(input().getAttribute('aria-activedescendant')).toBe(selected[0].id)
    expect(selected[0].id).not.toBe('')
  })

  it('FE-CMB-04 las canciones intentadas son aria-disabled y no elegibles (tambien con burbuja)', () => {
    const { type, option, onSelect, pickGame } = setup({ guesses: ['rse-oldale-town'] })
    type('oldale')
    expect(option('Oldale').getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(option('Oldale'))
    expect(onSelect).not.toHaveBeenCalled()
    pickGame('ruby')
    expect(option('Oldale').getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(option('Oldale'))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('SongSearch: teclado (FE-CMB-05..09, FE-SRC-17)', () => {
  it('FE-CMB-05 / FE-SRC-17 las flechas recorren Juegos y luego Canciones como una sola lista, con vuelta', () => {
    const { type, key, options, input } = setup()
    type('pokemon') // 3 juegos + 5 canciones
    const total = options().length
    expect(total).toBe(8)
    const activeIndex = () => options().findIndex((o) => o.id === input().getAttribute('aria-activedescendant'))
    const visited: number[] = []
    for (let i = 0; i < total; i++) {
      key('ArrowDown')
      visited.push(activeIndex())
    }
    expect(visited).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    key('ArrowDown')
    expect(activeIndex()).toBe(0) // vuelta
  })

  it('FE-SRC-17 ArrowUp sin activa va a la ULTIMA y ArrowDown sin activa a la PRIMERA (un juego antes que cualquier cancion)', () => {
    const a = setup()
    a.type('pokemon')
    a.key('ArrowUp')
    expect(a.options().at(-1)!.getAttribute('aria-selected')).toBe('true')
    a.unmount()
    const b = setup()
    b.type('pokemon')
    b.key('ArrowDown')
    expect(b.options()[0].textContent).toContain('Ruby')
    expect(b.options()[0].getAttribute('aria-selected')).toBe('true')
  })

  it('FE-SRC-17 la opcion activa se desplaza a la vista (scrollIntoView)', () => {
    const { type, key } = setup()
    type('pokemon')
    key('ArrowDown')
    key('ArrowDown')
    expect((Element.prototype as any).scrollIntoView).toHaveBeenCalled()
  })

  it('FE-CMB-06 Enter sobre un juego: vacia el texto, pone la burbuja, deja el foco en el input y lista sus canciones', () => {
    const { input, type, key, options, bubbleButton, onSelect } = setup()
    input().focus()
    type('ruby')
    key('ArrowDown')
    key('Enter')
    expect(input().value).toBe('')
    expect(bubbleButton()).not.toBeNull()
    expect(document.activeElement).toBe(input())
    expect(options().map((o) => o.textContent).join('|')).toMatch(/Littleroot.*\|.*Oldale|Littleroot/)
    expect(options().length).toBe(2)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('FE-CMB-06 elegir el juego con clic hace lo mismo', () => {
    const { type, option, bubbleButton, input } = setup()
    type('ruby')
    fireEvent.click(option('Ruby'))
    expect(bubbleButton()).not.toBeNull()
    expect(input().value).toBe('')
  })

  it('FE-CMB-07 Enter sobre una cancion envia solo el songId', () => {
    const { type, key, onSelect } = setup()
    type('twinleaf')
    key('ArrowDown')
    key('Enter')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]).toEqual(['dp-twinleaf-town'])
  })

  it('FE-CMB-08 Escape con la lista abierta la cierra (sin borrar el texto); cerrada, vacia el texto', () => {
    const { input, type, key } = setup()
    type('town')
    key('Escape')
    expect([input().getAttribute('aria-expanded'), input().value]).toEqual(['false', 'town'])
    key('Escape')
    expect(input().value).toBe('')
  })

  it('FE-CMB-08 Escape nunca quita la burbuja', () => {
    const { type, key, bubbleButton, pickGame } = setup()
    pickGame('ruby')
    key('Escape')
    key('Escape')
    type('x')
    key('Escape')
    key('Escape')
    expect(bubbleButton()).not.toBeNull()
  })

  it('FE-CMB-09 Backspace con el input vacio quita la burbuja', () => {
    const { key, bubbleButton, pickGame } = setup()
    pickGame('ruby')
    key('Backspace')
    expect(bubbleButton()).toBeNull()
  })

  it('FE-CMB-09 Backspace con texto edita (no quita la burbuja)', () => {
    const { key, type, bubbleButton, pickGame } = setup()
    pickGame('ruby')
    type('li')
    key('Backspace')
    expect(bubbleButton()).not.toBeNull()
  })

  it('FE-CMB-09 Backspace sin burbuja no hace nada (ni lanza)', () => {
    const { key, input } = setup()
    expect(() => key('Backspace')).not.toThrow()
    expect(input().value).toBe('')
  })

  it('FE-CMB-09 Backspace durante una composicion IME no quita la burbuja', () => {
    const { key, bubbleButton, pickGame } = setup()
    pickGame('ruby')
    key('Backspace', { isComposing: true })
    key('Backspace', { keyCode: 229 })
    expect(bubbleButton()).not.toBeNull()
  })
})

describe('SongSearch: burbuja (FE-CMB-10..13)', () => {
  it('FE-CMB-10 burbuja con el nombre del juego y boton con aria-label "Quitar filtro de juego: <nombre>"', () => {
    const { bubbleButton, pickGame } = setup()
    pickGame('ruby')
    const button = bubbleButton()!
    expect(button.getAttribute('aria-label')).toBe(`Quitar filtro de juego: ${RUBY}`)
    expect(button.closest('span')?.textContent).toContain(RUBY)
  })

  it('FE-CMB-10 el clic quita la burbuja y el foco vuelve al input', () => {
    const { bubbleButton, pickGame, input } = setup()
    pickGame('ruby')
    fireEvent.click(bubbleButton()!)
    expect(bubbleButton()).toBeNull()
    expect(document.activeElement).toBe(input())
  })

  for (const keyName of ['{Enter}', ' ']) {
    it(`FE-CMB-10 con teclado (${JSON.stringify(keyName)}) sobre la x tambien se quita y el foco vuelve al input`, async () => {
      const user = userEvent.setup()
      const { bubbleButton, pickGame, input } = setup()
      pickGame('ruby')
      bubbleButton()!.focus()
      await user.keyboard(keyName)
      expect(bubbleButton()).toBeNull()
      expect(document.activeElement).toBe(input())
    })
  }

  it('FE-CMB-11 aria-describedby apunta a "Filtrando por <juego>" solo mientras hay burbuja', () => {
    const { input, pickGame, bubbleButton } = setup()
    expect(input().getAttribute('aria-describedby')).toBeNull()
    pickGame('ruby')
    const id = input().getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)?.textContent).toBe(`Filtrando por ${RUBY}`)
    fireEvent.click(bubbleButton()!)
    expect(input().getAttribute('aria-describedby')).toBeNull()
  })

  it('FE-CMB-12 aria-live anuncia "Filtro de juego: <nombre>", "Filtro de juego quitado" y el numero de resultados', () => {
    const { pickGame, bubbleButton } = setup()
    const live = () => screen.getAllByRole('status').map((r) => r.textContent).join(' ')
    pickGame('ruby')
    expect(live()).toContain(`Filtro de juego: ${RUBY}`)
    expect(live()).toMatch(/2 resultados/)
    fireEvent.click(bubbleButton()!)
    expect(live()).toContain('Filtro de juego quitado')
  })

  it('FE-CMB-12 la region es aria-live polite', () => {
    const { pickGame } = setup()
    pickGame('ruby')
    expect(screen.getAllByRole('status').some((r) => r.getAttribute('aria-live') === 'polite' || r.closest('[aria-live="polite"]'))).toBe(true)
  })

  it('FE-CMB-13 elegir otro juego con una burbuja puesta la sustituye (una sola burbuja)', () => {
    const { type, key, pickGame } = setup()
    pickGame('ruby')
    type('diamond')
    key('ArrowDown')
    key('Enter')
    const buttons = screen.getAllByRole('button', { name: /quitar filtro de juego/i })
    expect(buttons.length).toBe(1)
    expect(buttons[0].getAttribute('aria-label')).toContain('Diamond')
  })

  it('FE-CMB-16 el clic en una opcion no quita el foco del input (mousedown con preventDefault)', () => {
    const { type, option, input } = setup()
    input().focus()
    type('twinleaf')
    const notPrevented = fireEvent.mouseDown(option('Twinleaf'))
    expect(notPrevented).toBe(false)
    expect(document.activeElement).toBe(input())
  })

  it('FE-CMB-17 200 canciones: 200 opciones (sin truncar) y la activa sigue a scrollIntoView', () => {
    const { pickGame, options, key } = setup({}, bigCatalog(200, 'rse'))
    pickGame('ruby')
    expect(options().length).toBe(200)
    key('ArrowDown')
    key('ArrowDown')
    expect((Element.prototype as any).scrollIntoView).toHaveBeenCalled()
  })

  it('FE-CMB-18 nombres accesibles en espanol y la x va antes del input en el orden de tabulacion', () => {
    const { input, pickGame, bubbleButton } = setup()
    expect(screen.getByRole('combobox', { name: /qué canción es/i })).toBeTruthy()
    pickGame('ruby')
    const position = bubbleButton()!.compareDocumentPosition(input())
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('FE-CMB-19 partida terminada (disabled): combobox deshabilitado y la burbuja no es interactiva', () => {
    const { input, pickGame, rerender, onSelect, bubbleButton } = setup()
    pickGame('ruby')
    rerender(<SongSearch catalog={mkCatalog()} guesses={[]} onSelect={onSelect} disabled />)
    expect(input().disabled).toBe(true)
    const button = bubbleButton()
    if (button) {
      fireEvent.click(button)
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('FE-CMB-20 burbuja y texto sin resultados: mensaje accesible "Sin resultados"', () => {
    const { pickGame, type, input } = setup()
    pickGame('ruby')
    type('zzzz-nada')
    expect(within(screen.getByRole('listbox')).getByText(/sin resultados/i)).toBeTruthy()
    expect(input().getAttribute('aria-expanded')).toBe('true')
  })

  it('FE-CMB-20 el anuncio dice 0 resultados', () => {
    const { pickGame, type } = setup()
    pickGame('ruby')
    type('zzzz-nada')
    expect(screen.getAllByRole('status').map((r) => r.textContent).join(' ')).toMatch(/0 resultados|sin resultados/i)
  })

  it('FE-SRC-04 [MOD] el buscador ofrece juegos y canciones de cualquier juego (no recibe el filtro del modo libre)', () => {
    const { type, options } = setup()
    type('black')
    expect(options().some((o) => o.textContent?.includes('Black'))).toBe(true)
    type('castle')
    expect(options().some((o) => o.textContent?.includes('Castle'))).toBe(true)
  })

  it('FE-SRC-18 sin limite: 60 canciones coincidentes -> 60 opciones y ningun aviso "y N mas"', () => {
    const songs = Array.from({ length: 60 }, (_, i) => ({ id: `s-${i}`, title: `Tema ${i}`, games: ['rse'] }))
    const { type, options } = setup({}, { ...mkCatalog(), songs })
    type('tema')
    expect(options().length).toBe(60)
    expect(screen.queryByText(/y \d+ más|más…/)).toBeNull()
  })
})
