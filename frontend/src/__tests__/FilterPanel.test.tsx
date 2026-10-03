import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterPanel } from '../components/FilterPanel'
import { GAMES } from './helpers'

function setup(selected: string[]) {
  const onChange = vi.fn()
  const onStart = vi.fn()
  render(<FilterPanel games={GAMES} selected={selected} onChange={onChange} onStart={onStart} />)
  return { onChange, onStart, start: screen.getByRole('button', { name: /empezar/i }) as HTMLButtonElement }
}

describe('components/FilterPanel', () => {
  it('FE-FIL-01 filtro vacio: "Empezar" deshabilitado', () => {
    expect(setup([]).start.disabled).toBe(true)
  })

  it('FE-FIL-01 filtro vacio: muestra aviso', () => {
    setup([])
    expect(screen.queryByRole('alert') ?? screen.queryByText(/al menos/i)).not.toBeNull()
  })

  it('FE-FIL-01 filtro vacio: pulsar "Empezar" no llama a onStart', () => {
    const { start, onStart } = setup([])
    fireEvent.click(start)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('con al menos un juego "Empezar" esta habilitado y llama a onStart', () => {
    const { start, onStart } = setup(['rse'])
    expect(start.disabled).toBe(false)
    fireEvent.click(start)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('un checkbox por juego, marcado segun selected', () => {
    setup(['dp'])
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([false, true, false])
  })

  it('marcar un juego llama a onChange con la seleccion ampliada', () => {
    const { onChange } = setup(['rse'])
    fireEvent.click(screen.getByRole('checkbox', { name: /Black/ }))
    expect(new Set(onChange.mock.calls[0][0])).toEqual(new Set(['rse', 'bw']))
  })

  it('desmarcar el ultimo juego llama a onChange con []', () => {
    const { onChange } = setup(['rse'])
    fireEvent.click(screen.getByRole('checkbox', { name: /Ruby/ }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
