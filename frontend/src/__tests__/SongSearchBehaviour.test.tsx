import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongSearch } from '../components/SongSearch'
import { mkCatalog } from './helpers'

const setup = (props: Record<string, unknown> = {}, catalog: any = mkCatalog()) => {
  const onSelect = vi.fn()
  render(<SongSearch catalog={catalog} guesses={[]} onSelect={onSelect} {...(props as any)} />)
  const input = screen.getByRole('combobox') as HTMLInputElement
  return { input, onSelect, type: (v: string) => fireEvent.change(input, { target: { value: v } }) }
}

describe('SongSearch: Enter, readOnly y truncado', () => {
  it('Enter sin opcion marcada elige la primera seleccionable', () => {
    const { input, onSelect, type } = setup({ guesses: ['rse-littleroot-town'] })
    type('ruby')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('rse-oldale-town')
  })

  it('readOnly mantiene el input habilitado (conserva el foco) pero no deja elegir', () => {
    const { input, onSelect, type } = setup({ readOnly: true })
    expect([input.disabled, input.readOnly]).toEqual([false, true])
    type('twinleaf')
    fireEvent.click(screen.getAllByRole('option')[0])
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('al truncar a 50 resultados avisa con "y N mas"', () => {
    const songs = Array.from({ length: 60 }, (_, i) => ({ id: `s-${i}`, title: `Tema ${i}`, games: ['rse'] }))
    const { type } = setup({}, { ...mkCatalog(), songs })
    type('tema')
    expect(screen.getAllByRole('option').length).toBe(50)
    expect(screen.getByText(/y 10 más/)).toBeTruthy()
  })
})
