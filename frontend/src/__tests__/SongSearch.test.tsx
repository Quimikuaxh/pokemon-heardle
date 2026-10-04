import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongSearch } from '../components/SongSearch'
import { mkCatalog } from './helpers'

function setup(guesses: string[] = [], onSelect = vi.fn(), disabled = false) {
  const utils = render(<SongSearch catalog={mkCatalog()} guesses={guesses} onSelect={onSelect} disabled={disabled} />)
  const input = screen.getByRole('combobox') as HTMLInputElement
  const type = (v: string) => fireEvent.change(input, { target: { value: v } })
  const option = (title: string) => screen.getAllByRole('option').find((o) => o.textContent?.includes(title))!
  return { ...utils, input, type, option, onSelect }
}

describe('components/SongSearch', () => {
  it('FE-SRC-05 cada opcion muestra el titulo y los juegos de la cancion', () => {
    const { type, option } = setup()
    type('cafe')
    expect(option('Café Théme').textContent).toContain('Ruby')
    expect(option('Café Théme').textContent).toContain('Diamond')
  })

  it('FE-SRC-07 seleccionar una opcion llama a onSelect solo con el songId', () => {
    const { type, option, onSelect } = setup()
    type('twinleaf')
    fireEvent.click(option('Twinleaf'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]).toEqual(['dp-twinleaf-town'])
  })

  it('FE-SRC-12 la cancion intentada esta marcada aria-disabled y las demas no', () => {
    const { type, option } = setup(['rse-oldale-town'])
    type('town')
    expect(option('Oldale').getAttribute('aria-disabled')).toBe('true')
    expect(option('Twinleaf').getAttribute('aria-disabled')).not.toBe('true')
  })

  it('FE-SRC-12 clic en una cancion intentada no emite peticion', () => {
    const { type, option, onSelect } = setup(['rse-oldale-town'])
    type('town')
    fireEvent.click(option('Oldale'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('FE-SRC-12 las demas siguen seleccionables por clic', () => {
    const { type, option, onSelect } = setup(['rse-oldale-town'])
    type('town')
    fireEvent.click(option('Littleroot'))
    expect(onSelect).toHaveBeenCalledWith('rse-littleroot-town')
  })

  it('FE-SRC-12 por teclado (flecha + Enter, y Enter solo) no se elige una intentada', () => {
    const { type, input, onSelect } = setup(['rse-oldale-town'])
    type('oldale')
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('FE-SRC-17 flechas: abajo empieza por la primera, arriba por la ultima y ambas dan la vuelta', () => {
    const { type, input } = setup()
    type('town')
    const options = () => screen.getAllByRole('option')
    const active = () => options().find((o) => o.getAttribute('aria-selected') === 'true')?.textContent
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(active()).toBe(options()[options().length - 1].textContent)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(active()).toBe(options()[0].textContent)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(active()).toBe(options()[1].textContent)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(active()).toBe(options()[0].textContent)
  })

  it('FE-SRC-17 la opcion activa por teclado se desplaza a la vista (scrollIntoView nearest)', () => {
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      const { type, input } = setup()
      type('town')
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      expect(scrollIntoView).toHaveBeenCalledTimes(2)
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getAllByRole('option')[1])
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('FE-SRC-13 una cancion intentada sigue visible al buscar su titulo', () => {
    const { type } = setup(['rse-oldale-town'])
    type('oldale town')
    expect(screen.getAllByRole('option').some((o) => o.textContent?.includes('Oldale Town'))).toBe(true)
  })

  it('FE-SRC-14 se deshabilita por songId: otra cancion del mismo juego no se ve afectada', () => {
    const { type, option } = setup(['rse-littleroot-town'])
    type('ruby')
    expect(option('Littleroot').getAttribute('aria-disabled')).toBe('true')
    expect(option('Oldale').getAttribute('aria-disabled')).not.toBe('true')
  })

  it('FE-SRC-15 tras skip (guesses sin cambios) no hay marcadas; tras un guess nuevo se anade', () => {
    const { type, rerender, option } = setup([])
    type('town')
    expect(screen.getAllByRole('option').every((o) => o.getAttribute('aria-disabled') !== 'true')).toBe(true)
    rerender(<SongSearch catalog={mkCatalog()} guesses={['dp-twinleaf-town']} onSelect={vi.fn()} />)
    expect(option('Twinleaf').getAttribute('aria-disabled')).toBe('true')
  })

  it('FE-SRC-11 Enter con texto libre que no es una cancion no emite nada', () => {
    const { type, input, onSelect } = setup()
    type('texto libre sin cancion')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('FE-GAM-02 con disabled (partida terminada) el buscador esta deshabilitado', () => {
    const { input } = setup([], vi.fn(), true)
    expect(input.disabled).toBe(true)
  })

  it('FE-SRC-04 muestra canciones de cualquier juego (sin filtro en el componente)', () => {
    const { type } = setup()
    type('castle')
    expect(screen.getAllByRole('option').length).toBe(1)
  })
})
