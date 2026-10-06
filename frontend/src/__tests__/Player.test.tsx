import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Player } from '../components/Player'
import type { AudioStatus } from '../components/Player'

const base: Parameters<typeof Player>[0] = {
  attempt: 2,
  maxAttempts: 6,
  clipSeconds: [1, 2, 4, 7, 11, 16],
  unlockedSec: 4,
  nextSeconds: 7,
  positionSec: 0,
  playing: false,
  audioStatus: 'ready' as AudioStatus,
  peaks: null,
  skipDisabled: false,
  onTogglePlay: vi.fn(),
  onSkip: vi.fn(),
  onRetryAudio: vi.fn(),
}
const setup = (over: Partial<Parameters<typeof Player>[0]> = {}) => render(<Player {...base} {...over} />)

describe('Player (reproductor tipo Pokedex)', () => {
  it('FE-DSN-06 muestra "INTENTO n/6", la lectura m:ss / duracion y la escala 1 · 2 · 4 · 7 · 11 · 16 s', () => {
    const { container } = setup({ positionSec: 2.4 })
    expect(screen.getByText('INTENTO 3/6')).toBeTruthy()
    expect(screen.getByText('0:02 / 0:04')).toBeTruthy()
    expect(container.textContent).toContain('1 · 2 · 4 · 7 · 11 · 16 s')
  })

  it('FE-DSN-06 tiene lente y tres luces, la onda y la barra segmentada', () => {
    const { container } = setup()
    expect(container.querySelector('[data-lens]')).toBeTruthy()
    expect(container.querySelectorAll('[data-lens] ~ span.rounded-full').length).toBe(3)
    expect(container.querySelector('[data-waveform]')).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })

  it('FE-DSN-07 boton de play: nombre "Reproducir N s" y alterna a "Pausar" mientras suena', () => {
    const { rerender } = setup()
    expect(screen.getByRole('button', { name: 'Reproducir 4 s' })).toBeTruthy()
    rerender(<Player {...base} playing />)
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy()
  })

  it('FE-DSN-07 el boton principal y "Saltar" miden al menos 44 px (clases de altura tactil)', () => {
    setup()
    expect(screen.getByRole('button', { name: /saltar/i }).className).toMatch(/min-h-11/)
    expect(screen.getByRole('button', { name: 'Reproducir 4 s' }).className).toMatch(/size-\[76px\]/)
  })

  it('FE-DSN-07 "Saltar +N s" muestra los segundos que se ganan; en el ultimo intento "Saltar (último intento)"', () => {
    const { rerender } = setup()
    expect(screen.getByRole('button', { name: 'Saltar +3 s' })).toBeTruthy()
    rerender(<Player {...base} attempt={5} unlockedSec={16} nextSeconds={undefined} />)
    expect(screen.getByRole('button', { name: /último intento/ })).toBeTruthy()
  })

  it('FE-DSN-07 los clics llaman a los callbacks; con skipDisabled el salto no responde', () => {
    const onTogglePlay = vi.fn()
    const onSkip = vi.fn()
    const { rerender } = setup({ onTogglePlay, onSkip })
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir 4 s' }))
    fireEvent.click(screen.getByRole('button', { name: /saltar/i }))
    expect([onTogglePlay.mock.calls.length, onSkip.mock.calls.length]).toEqual([1, 1])
    rerender(<Player {...base} onSkip={onSkip} skipDisabled />)
    fireEvent.click(screen.getByRole('button', { name: /saltar/i }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('FE-DSN-07 cargando: el boton esta deshabilitado y se llama "Cargando audio..."', () => {
    setup({ audioStatus: 'loading' })
    const button = screen.getByRole('button', { name: /cargando audio/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('FE-DSN-07 error de audio: aparece "Reintentar" y el boton de play queda deshabilitado', () => {
    const onRetryAudio = vi.fn()
    setup({ audioStatus: 'error', onRetryAudio })
    fireEvent.click(screen.getByRole('button', { name: /no se pudo cargar el audio/i }))
    expect(onRetryAudio).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Reproducir 4 s' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('FE-DSN-08 la onda recibe picos reales cuando los hay y neutra cuando no', () => {
    const { container, rerender } = setup({ peaks: Array(48).fill(0.5) })
    expect(container.querySelector('[data-waveform]')!.getAttribute('data-waveform')).toBe('real')
    rerender(<Player {...base} peaks={null} />)
    expect(container.querySelector('[data-waveform]')!.getAttribute('data-waveform')).toBe('neutral')
  })

  it('FE-DSN-08 la lectura no pinta NaN con posiciones invalidas', () => {
    const { container } = setup({ positionSec: NaN, unlockedSec: NaN })
    expect(container.innerHTML).not.toContain('NaN')
  })

  it('FE-DSN-16 pausado a mitad de clip el boton se llama "Reanudar"; en 0 "Reproducir N s"; sonando "Pausar"', () => {
    const { rerender } = setup({ positionSec: 0 })
    expect(screen.getByRole('button', { name: 'Reproducir 4 s' })).toBeTruthy()
    rerender(<Player {...base} positionSec={1.5} />)
    expect(screen.getByRole('button', { name: 'Reanudar' })).toBeTruthy()
    rerender(<Player {...base} positionSec={1.5} playing />)
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy()
  })

  it('FE-DSN-16 al acabar el fragmento (posicion al final) el boton vuelve a "Reproducir N s": el siguiente play empieza en 0', () => {
    setup({ positionSec: 4 })
    expect(screen.getByRole('button', { name: 'Reproducir 4 s' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reanudar' })).toBeNull()
  })
})
