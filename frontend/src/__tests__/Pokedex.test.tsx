import { act, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SongSearch } from '../components/SongSearch'
import { AttemptList } from '../components/AttemptList'
import { ResultPanel } from '../components/ResultPanel'
import { FilterStart } from '../components/FilterPanel'
import { NextDayCountdown } from '../components/NextDayNote'
import { DexTop } from '../components/Pokedex'
import { formatCountdown, msUntilNextMadridDay } from '../game/format'
import { GAMES, mkCatalog, mkFinished } from './helpers'

const HOUR = 3_600_000

describe('DexTop: cabecera de la Pokedex (DEC-58)', () => {
  it('FE-DEX-01 lleva el logo (h1), el subtitulo, la lente y tres luces', () => {
    const { container } = render(<DexTop subtitle="RETO DEL DÍA · 07 NOV" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Pokémon Heardle' })).toBeTruthy()
    expect(screen.getByText('RETO DEL DÍA · 07 NOV')).toBeTruthy()
    expect(container.querySelector('[data-lens="playing"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-light]').length).toBe(3)
  })

  it('FE-DEX-01 la lente parpadea solo mientras suena el clip (DEC-59)', () => {
    const { container, rerender } = render(<DexTop />)
    expect(container.querySelector('[data-blinking]')).toBeNull()
    expect(container.querySelector('.dex-lens-glow')).toBeNull()
    rerender(<DexTop blinking />)
    expect(container.querySelector('[data-lens][data-blinking]')).toBeTruthy()
    expect(container.querySelector('.dex-lens-glow')).toBeTruthy()
  })

  it('FE-DEX-01 la animacion del destello se desactiva con prefers-reduced-motion', () => {
    const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*{\s*\.dex-lens-glow\s*{[^}]*animation:\s*none/)
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
    expect(document.body.textContent).toContain('Canciones en juego · 2 de 3 juegos')
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

describe('Pantalla del buscador (DEC-59)', () => {
  it('FE-DEX-06 sin texto muestra el aviso en el hueco de resultados; al escribir, la lista ocupa ese hueco con scroll propio', () => {
    render(<SongSearch catalog={mkCatalog()} guesses={[]} onSelect={vi.fn()} />)
    const screenRegion = screen.getByRole('region', { name: 'Buscador' })
    expect(screenRegion.textContent).toContain('Escribe el nombre de una canción o de un juego.')
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'twinleaf' } })
    const list = screen.getByRole('listbox')
    expect(screenRegion.contains(list)).toBe(true)
    expect(list.className).toMatch(/overflow-y-auto/)
    expect(list.className, 'barra de scroll con los colores de la pantalla').toContain('dex-lcd-scroll')
    expect(list.className).not.toMatch(/\babsolute\b/)
    expect(screenRegion.textContent).not.toContain('Escribe el nombre')
  })
})

describe('Favicon (DEC-59)', () => {
  it('FE-DEX-07 index.html enlaza el favicon SVG y el fichero existe en public/', () => {
    const root = join(__dirname, '..', '..')
    expect(readFileSync(join(root, 'index.html'), 'utf8')).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
    const svg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8')
    expect(existsSync(join(root, 'public', 'favicon.svg'))).toBe(true)
    expect(svg).toMatch(/^<svg[^>]+viewBox="0 0 64 64"/)
  })
})

describe('Alto estable de la Pokedex (DEC-59)', () => {
  it('FE-DEX-08 el aviso de seleccion vacia ocupa un hueco fijo, este o no (sin pantalla: elegir juegos no cambia el alto)', () => {
    const songs = [{ games: ['rse'] }]
    const { container, rerender } = render(<FilterStart games={GAMES} songs={songs} selected={[]} onChange={vi.fn()} onStart={vi.fn()} />)
    const slot = () => container.querySelector('.min-h-12')
    expect(slot()!.querySelector('[role="alert"]')).toBeTruthy()
    rerender(<FilterStart games={GAMES} songs={songs} selected={['rse']} onChange={vi.fn()} onStart={vi.fn()} />)
    expect(slot()).toBeTruthy()
    expect(slot()!.querySelector('[role="alert"]')).toBeNull()
  })

  it('FE-DEX-08 tras una partida el aviso y el resumen comparten hueco', () => {
    const songs = [{ games: ['rse'] }]
    const { rerender } = render(<FilterStart compact games={GAMES} songs={songs} selected={[]} onChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(document.body.textContent).not.toContain('canciones en juego')
    rerender(<FilterStart compact games={GAMES} songs={songs} selected={['rse']} onChange={vi.fn()} onStart={vi.fn()} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).toContain('1 canciones en juego')
  })

  it('FE-DEX-08 todas las filas del historial miden lo mismo, jugadas o pendientes (no crece al saltar)', () => {
    const view = { mode: 'unlimited', status: 'playing', attempt: 2, maxAttempts: 6, clipSeconds: [1, 2, 4, 7, 11, 16], results: ['skip', 'skip'], guesses: [], hints: [] } as any
    render(<AttemptList view={view} catalog={mkCatalog()} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.length).toBe(6)
    for (const row of rows) expect(row.className).toMatch(/lg:h-\[60px\]/)
  })

  it('FE-DEX-08 alto minimo comun en escritorio y metricas fijas de la fuente del logo', () => {
    const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
    expect(css).toMatch(/\.dex \{[^}]*min-height: min\(860px, calc\(100dvh - 24px\)\)/)
    expect(css).toMatch(/font-family: 'Pokemon Solid';[^}]*ascent-override: 100%;[^}]*descent-override: 40%;[^}]*line-gap-override: 0%/)
  })
})

describe('Video de la cancion completa dentro de la pantalla (DEC-59)', () => {
  it('FE-DEX-09 al abrirlo, el video va dentro de la pantalla del resultado, la solucion sigue a la vista y el volumen ocupa el sitio del boton', () => {
    render(<ResultPanel view={mkFinished()} showNextDayNote={false} volume={0.5} onVolumeChange={vi.fn()} />)
    expect(document.querySelectorAll('iframe').length).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Escuchar la canción completa' }))
    const frames = document.querySelectorAll('iframe')
    expect(frames.length).toBe(1)
    const screenEl = document.querySelector('.dex-screen')!
    expect(screenEl.contains(frames[0])).toBe(true)
    expect(screen.getByText('Littleroot Town')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Escuchar la canción completa' })).toBeNull()
    expect(screen.getByRole('slider', { name: 'Volumen' })).toBeTruthy()
    expect(screenEl.contains(screen.getByRole('slider', { name: 'Volumen' }))).toBe(false)
  })
})
