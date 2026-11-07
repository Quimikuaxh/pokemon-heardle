import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterStart } from '../components/FilterPanel'
import { NextDayCountdown } from '../components/NextDayNote'
import { DexTop } from '../components/Pokedex'
import { formatCountdown, msUntilNextMadridDay } from '../game/format'
import { GAMES } from './helpers'

const HOUR = 3_600_000

describe('DexTop: cabecera de la Pokedex (DEC-58)', () => {
  it('FE-DEX-01 lleva el logo (h1), el subtitulo, la lente y tres luces', () => {
    const { container } = render(<DexTop subtitle="RETO DEL DÍA · 07 NOV" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Pokémon Heardle' })).toBeTruthy()
    expect(screen.getByText('RETO DEL DÍA · 07 NOV')).toBeTruthy()
    expect(container.querySelector('[data-lens="playing"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-light]').length).toBe(3)
  })

  it('FE-DEX-01 la lente cambia de color con el resultado: verde al acertar, roja al perder', () => {
    const { container, rerender } = render(<DexTop lens="won" />)
    expect(container.querySelector('[data-lens="won"]')!.className).toContain('bg-lamp-green')
    rerender(<DexTop lens="lost" />)
    expect(container.querySelector('[data-lens="lost"]')!.className).toContain('bg-lamp-red')
  })
})

describe('Cuenta atras a la siguiente cancion del dia (DEC-58)', () => {
  it('FE-DEX-02 dia normal: a las 11:00 de Madrid quedan 13 h', () => {
    expect(msUntilNextMadridDay(Date.parse('2026-11-07T10:00:00Z'))).toBe(13 * HOUR)
  })

  it('FE-DEX-02 descuenta los milisegundos del segundo en curso', () => {
    expect(msUntilNextMadridDay(Date.parse('2026-11-07T10:00:00.250Z'))).toBe(13 * HOUR - 250)
  })

  it('FE-DEX-02 dia de 23 h (cambio a horario de verano): a las 00:30 quedan 22 h 30 min', () => {
    expect(msUntilNextMadridDay(Date.parse('2026-03-28T23:30:00Z'))).toBe(22.5 * HOUR)
  })

  it('FE-DEX-02 dia de 25 h (cambio a horario de invierno): a las 00:30 quedan 24 h 30 min', () => {
    expect(msUntilNextMadridDay(Date.parse('2026-10-24T22:30:00Z'))).toBe(24.5 * HOUR)
  })

  it('FE-DEX-02 formato HH:MM:SS redondeando hacia arriba y nunca negativo', () => {
    expect(formatCountdown(13 * HOUR)).toBe('13:00:00')
    expect(formatCountdown(61_001)).toBe('00:01:02')
    expect(formatCountdown(-5)).toBe('00:00:00')
  })

  describe('NextDayCountdown', () => {
    afterEach(() => vi.useRealTimers())

    it('FE-DEX-03 muestra el tiempo que queda y avisa una vez al pasar la medianoche', () => {
      vi.useFakeTimers()
      let now = Date.parse('2026-11-07T22:59:58Z') // 23:59:58 en Madrid
      const onExpire = vi.fn()
      render(<NextDayCountdown now={() => now} onExpire={onExpire} />)
      expect(screen.getByRole('timer').textContent).toBe('00:00:02')
      now += 1000
      act(() => vi.advanceTimersByTime(1000))
      expect(screen.getByRole('timer').textContent).toBe('00:00:01')
      expect(onExpire).not.toHaveBeenCalled()
      now += 2000
      act(() => vi.advanceTimersByTime(1000))
      expect(onExpire).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('timer').textContent).toBe('00:00:00')
      now += 1000
      act(() => vi.advanceTimersByTime(3000))
      expect(onExpire).toHaveBeenCalledTimes(1)
    })
  })
})

describe('FilterStart: hoja izquierda del modo libre (DEC-58)', () => {
  const songs = [{ games: ['rse'] }, { games: ['rse', 'dp'] }, { games: ['dp'] }, { games: ['bw'] }]

  it('FE-DEX-04 sin partida: pantalla con las canciones en juego y "Empezar partida"', () => {
    const onStart = vi.fn()
    render(<FilterStart games={GAMES} songs={songs} selected={['rse', 'dp']} onChange={vi.fn()} onStart={onStart} />)
    expect(screen.getByText('3')).toBeTruthy()
    expect(document.body.textContent).toContain('canciones en juego · 2 de 3 juegos')
    fireEvent.click(screen.getByRole('button', { name: 'Empezar partida' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('FE-DEX-04 tras una partida (compact): sin pantalla, solo el boton y el resumen', () => {
    render(<FilterStart compact games={GAMES} songs={songs} selected={['bw']} onChange={vi.fn()} onStart={vi.fn()} />)
    expect(document.body.textContent).not.toContain('NUEVA PARTIDA')
    expect(document.body.textContent).toContain('1 canciones en juego · 1 de 3 juegos')
  })

  it('FE-DEX-04 seleccion vacia: boton deshabilitado y aviso', () => {
    const onStart = vi.fn()
    render(<FilterStart games={GAMES} songs={songs} selected={[]} onChange={vi.fn()} onStart={onStart} />)
    const start = screen.getByRole('button', { name: 'Empezar partida' }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
