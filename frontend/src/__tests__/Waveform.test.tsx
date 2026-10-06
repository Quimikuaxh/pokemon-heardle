import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Waveform } from '../components/Waveform'

const heights = (container: HTMLElement) => [...container.querySelectorAll('[data-bar]')].map((bar) => parseInt((bar as HTMLElement).style.height, 10))

describe('Waveform', () => {
  it('FE-WF-09 con picos reales: 48 barras, las desbloqueadas siguen los picos y las bloqueadas son planas', () => {
    const peaks = Array.from({ length: 48 }, (_, i) => (i < 12 ? (i % 3) / 2 : null))
    const { container } = render(<Waveform peaks={peaks} unlockedSec={4} positionSec={0} />)
    const h = heights(container)
    expect(h.length).toBe(48)
    expect(container.querySelector('[data-waveform]')!.getAttribute('data-waveform')).toBe('real')
    expect(new Set(h.slice(0, 12)).size).toBeGreaterThan(1)
    expect(new Set(h.slice(12)).size).toBe(1)
  })

  it('FE-WF-10 sin datos (peaks null): onda neutra, todas las barras iguales (nada inventado)', () => {
    const { container } = render(<Waveform peaks={null} unlockedSec={7} positionSec={0} />)
    expect(container.querySelector('[data-waveform]')!.getAttribute('data-waveform')).toBe('neutral')
    const h = heights(container)
    expect(new Set(h.slice(0, 21)).size).toBe(1)
  })

  it('FE-WF-11 las barras ya reproducidas se distinguen de las pendientes y de las bloqueadas', () => {
    const { container } = render(<Waveform peaks={Array(48).fill(0.5)} unlockedSec={4} positionSec={2} />)
    const classes = [...container.querySelectorAll('[data-bar]')].map((bar) => bar.className)
    expect(classes[0]).toContain('bg-played')
    expect(classes[10]).not.toContain('bg-played')
    expect(classes[30]).toContain('bg-locked-bar')
  })

  it('FE-WF-12 es decorativa (aria-hidden) y no pinta NaN con posiciones raras', () => {
    const { container } = render(<Waveform peaks={null} unlockedSec={NaN} positionSec={NaN} />)
    expect(container.querySelector('[data-waveform]')!.getAttribute('aria-hidden')).toBe('true')
    expect(container.innerHTML).not.toContain('NaN')
  })
})
