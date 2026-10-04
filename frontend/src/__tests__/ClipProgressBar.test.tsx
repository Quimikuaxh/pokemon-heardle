// DEC-42. DOM asumido: raiz role="progressbar" (aria-valuemin/max/now); una marca [data-mark="<s>"] por cada clipSeconds con
// style left:<%>; zona [data-zone="unlocked"] (width:<%>, data-locked="false") y [data-zone="locked"] (data-locked="true");
// cabezal [data-playhead] (left:<%>).
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ClipProgressBar } from '../components/ClipProgressBar'

const SECONDS = [1, 2, 4, 7, 11, 16]
const pct = (el: Element | null, prop: 'left' | 'width'): number => {
  if (!el) return NaN
  const m = new RegExp(`${prop}:\\s*([0-9.]+)%`).exec(el.getAttribute('style') ?? '')
  return m ? Number(m[1]) : NaN
}

function bar(props: Partial<{ clipSeconds: readonly number[]; unlockedSec: number; positionSec: number; playing: boolean }> = {}) {
  const all = { clipSeconds: SECONDS, unlockedSec: 7, positionSec: 0, playing: true, ...props }
  const utils = render(<ClipProgressBar {...all} />)
  const root = utils.container.querySelector('[role="progressbar"]') as HTMLElement
  return { ...utils, root, props: all }
}

describe('ClipProgressBar', () => {
  it('FE-BAR-01 marcas en 6,25 %, 12,5 %, 25 %, 43,75 %, 68,75 % y 100 % (escala lineal de 16 s)', () => {
    const { container } = bar()
    const marks = [...container.querySelectorAll('[data-mark]')].map((m) => pct(m, 'left'))
    const expected = [6.25, 12.5, 25, 43.75, 68.75, 100]
    expect(marks.length).toBe(6)
    marks.forEach((p, i) => expect(Math.abs(p - expected[i])).toBeLessThan(0.1))
  })

  it('FE-BAR-01 cada marca indica los segundos que representa', () => {
    const { container } = bar()
    expect([...container.querySelectorAll('[data-mark]')].map((m) => m.getAttribute('data-mark'))).toEqual(['1', '2', '4', '7', '11', '16'])
  })

  for (const [attempt, expected] of [[0, 6.25], [1, 12.5], [2, 25], [3, 43.75], [4, 68.75], [5, 100]] as Array<[number, number]>) {
    it(`FE-BAR-02 intento ${attempt}: zona desbloqueada = ${expected} %`, () => {
      const { container } = bar({ unlockedSec: SECONDS[attempt] })
      expect(Math.abs(pct(container.querySelector('[data-zone="unlocked"]'), 'width') - expected)).toBeLessThan(0.1)
    })
  }

  it('FE-BAR-03 la parte bloqueada se distingue de la desbloqueada (data-locked)', () => {
    const { container } = bar({ unlockedSec: 4 })
    const unlocked = container.querySelector('[data-zone="unlocked"]')!
    const locked = container.querySelector('[data-zone="locked"]')!
    expect([unlocked.getAttribute('data-locked'), locked.getAttribute('data-locked')]).toEqual(['false', 'true'])
    expect(unlocked.className).not.toBe(locked.className)
  })

  it('FE-BAR-03 con todo desbloqueado (16 s) no queda zona bloqueada visible o mide 0', () => {
    const { container } = bar({ unlockedSec: 16 })
    const locked = container.querySelector('[data-zone="locked"]')
    if (locked) expect(pct(locked, 'width') || 0).toBeLessThan(0.1)
  })

  it('FE-BAR-04 cabezal en positionSec dentro de la zona: 3 s con 7 s desbloqueados -> 18,75 %', () => {
    const { container } = bar({ unlockedSec: 7, positionSec: 3 })
    expect(Math.abs(pct(container.querySelector('[data-playhead]'), 'left') - 18.75)).toBeLessThan(0.1)
  })

  it('FE-BAR-05 el cabezal se limita a la zona desbloqueada (retardo del codificador: 1,04 con 1 s -> 6,25 %)', () => {
    const { container } = bar({ unlockedSec: 1, positionSec: 1.04 })
    expect(Math.abs(pct(container.querySelector('[data-playhead]'), 'left') - 6.25)).toBeLessThan(0.1)
  })

  it('FE-BAR-05 muy por encima del tope tambien se limita', () => {
    const { container } = bar({ unlockedSec: 4, positionSec: 15 })
    expect(Math.abs(pct(container.querySelector('[data-playhead]'), 'left') - 25)).toBeLessThan(0.1)
  })

  for (const [label, value, expectedPct] of [
    ['negativo', -3, 0],
    ['NaN', NaN, 0],
    ['0', 0, 0],
    ['Infinity', Infinity, 43.75],
    ['-Infinity', -Infinity, 0],
  ] as Array<[string, number, number]>) {
    it(`FE-BAR-06 positionSec ${label}: cabezal en ${expectedPct} % y sin NaN en estilos`, () => {
      const { container } = bar({ unlockedSec: 7, positionSec: value })
      expect(Math.abs(pct(container.querySelector('[data-playhead]'), 'left') - expectedPct)).toBeLessThan(0.1)
      expect(container.innerHTML).not.toContain('NaN')
    })
  }

  it('FE-BAR-07 role=progressbar con aria-valuemin=0, aria-valuemax=unlockedSec y aria-valuenow=posicion limitada', () => {
    const { root } = bar({ unlockedSec: 4, positionSec: 2.5 })
    expect([root.getAttribute('aria-valuemin'), root.getAttribute('aria-valuemax'), Number(root.getAttribute('aria-valuenow'))]).toEqual(['0', '4', 2.5])
  })

  it('FE-BAR-07 aria-valuenow no supera aria-valuemax', () => {
    const { root } = bar({ unlockedSec: 1, positionSec: 1.04 })
    expect(Number(root.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(1)
  })

  it('FE-BAR-07 tiene nombre accesible en espanol', () => {
    const { root } = bar()
    expect((root.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0)
  })

  it('FE-BAR-08 playing=false: sin animacion y el cabezal en reposo (0 o ultima posicion)', () => {
    const { container, root } = bar({ playing: false, positionSec: 3 })
    expect(root.getAttribute('data-playing')).toBe('false')
    expect(root.className + container.innerHTML).not.toMatch(/animate-|transition-all/)
    expect([0, 18.75].some((p) => Math.abs(pct(container.querySelector('[data-playhead]'), 'left') - p) < 0.1)).toBe(true)
  })

  it('FE-BAR-08 playing=true marca data-playing="true"', () => {
    expect(bar({ playing: true }).root.getAttribute('data-playing')).toBe('true')
  })

  it('FE-BAR-09 solo usa datos publicos: aunque reciba solution o token no los pinta', () => {
    const extra: any = { solution: { title: 'SECRETO-TITULO', youtubeId: 'SECRETO-YT' }, token: 'TOKEN-SECRETO' }
    const { container } = render(<ClipProgressBar clipSeconds={SECONDS} unlockedSec={1} positionSec={0} playing={false} {...extra} />)
    for (const s of ['SECRETO-TITULO', 'SECRETO-YT', 'TOKEN-SECRETO']) expect(container.innerHTML).not.toContain(s)
  })

  it('FE-BAR-10 al cambiar de intento la zona desbloqueada crece y el cabezal se reinicia', () => {
    const { container, rerender, props } = bar({ unlockedSec: 1, positionSec: 1 })
    rerender(<ClipProgressBar {...props} unlockedSec={2} positionSec={0} />)
    expect(Math.abs(pct(container.querySelector('[data-zone="unlocked"]'), 'width') - 12.5)).toBeLessThan(0.1)
    expect(pct(container.querySelector('[data-playhead]'), 'left')).toBeLessThan(0.1)
  })

  it('FE-BAR-11 con la partida terminada (unlockedSec indefinido, clipSeconds[6]) no lanza ni pinta NaN', () => {
    expect(() => {
      const { container } = render(<ClipProgressBar clipSeconds={SECONDS} unlockedSec={undefined as any} positionSec={0} playing={false} />)
      expect(container.innerHTML).not.toContain('NaN')
    }).not.toThrow()
  })

  it('FE-BAR-12 sin anchos fijos en px (se adapta a movil) y con clases de tema', () => {
    const { container } = bar()
    const styles = [...container.querySelectorAll('[style]')].map((e) => e.getAttribute('style') ?? '').join(';')
    expect(styles).not.toMatch(/(width|min-width)\s*:\s*[0-9.]+px/)
    expect(container.innerHTML).toMatch(/dark:|bg-|var\(--/)
  })

  it('con clipSeconds personalizados las marcas siguen la escala fija de 16 s', () => {
    const { container } = bar({ clipSeconds: [2, 8, 16], unlockedSec: 2 })
    expect([...container.querySelectorAll('[data-mark]')].map((m) => pct(m, 'left'))).toEqual([12.5, 50, 100])
  })
})
