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

describe('FilterPanel: diseno Libre (DEC-46)', () => {
  const songs = [{ games: ['rse'] }, { games: ['rse', 'dp'] }, { games: ['dp'] }, { games: ['bw'] }]

  it('FE-DSN-13 muestra "n DE m JUEGOS" y los juegos sin el prefijo Pokémon', () => {
    render(<FilterPanel games={GAMES} selected={['rse', 'dp']} onChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.getByText('2 DE 3 JUEGOS')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /Ruby/ })).toBeTruthy()
    expect(document.body.textContent).not.toContain('Pokémon Ruby')
  })

  it('FE-DSN-13 con el catalogo: contador por juego y total de canciones distintas en juego', () => {
    render(<FilterPanel games={GAMES} selected={['rse', 'dp']} songs={songs} onChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.getByText('3 canciones en juego. Puedes jugar tantas como quieras.')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /Ruby/ }).closest('label')!.textContent).toMatch(/2$/)
  })

  it('FE-DSN-13 cada juego lleva su cuadradito de color del mapa unico', () => {
    render(<FilterPanel games={GAMES} selected={[]} onChange={vi.fn()} onStart={vi.fn()} />)
    expect(document.querySelectorAll('[data-game-swatch]').length).toBe(3)
  })

  it('FE-DSN-13 filtro vacio: sin el total de canciones y con el aviso', () => {
    render(<FilterPanel games={GAMES} selected={[]} songs={songs} onChange={vi.fn()} onStart={vi.fn()} />)
    expect(document.body.textContent).not.toMatch(/canciones en juego/)
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
