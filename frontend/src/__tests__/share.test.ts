import { describe, it, expect, vi } from 'vitest'
import { buildShareText, copyToClipboard } from '../game/share'

const rowOf = (text: string) => text.split('\n').find((l) => /^[🟩🟨🟥⬛⬜]+$/u.test(l))

describe('game/share buildShareText', () => {
  it('FE-SHR-01 mapea hit 🟩, game 🟨, miss 🟥, skip ⬛ y no usados ⬜ en una fila de 6', () => {
    const t = buildShareText({ mode: 'unlimited', results: ['miss', 'game', 'skip', 'hit'] })
    expect(rowOf(t)).toBe('🟥🟨⬛🟩⬜⬜')
  })

  it('FE-SHR-02 victoria en el intento 1: 🟩⬜⬜⬜⬜⬜', () => {
    expect(rowOf(buildShareText({ mode: 'unlimited', results: ['hit'] }))).toBe('🟩⬜⬜⬜⬜⬜')
  })

  it('FE-SHR-02 victoria en el intento 6', () => {
    expect(rowOf(buildShareText({ mode: 'unlimited', results: ['skip', 'skip', 'miss', 'game', 'miss', 'hit'] }))).toBe('⬛⬛🟥🟨🟥🟩')
  })

  it('FE-SHR-02 derrota: 6 resultados sin 🟩', () => {
    const row = rowOf(buildShareText({ mode: 'unlimited', results: ['miss', 'miss', 'skip', 'game', 'miss', 'skip'] }))
    expect(row).toBe('🟥🟥⬛🟨🟥⬛')
  })

  it('FE-SHR-03 el diario incluye la fecha', () => {
    expect(buildShareText({ mode: 'daily', date: '2026-10-03', results: ['hit'] })).toContain('2026-10-03')
  })

  it('FE-SHR-03 el ilimitado no incluye fecha', () => {
    expect(buildShareText({ mode: 'unlimited', date: '2026-10-03', results: ['hit'] })).not.toContain('2026-10-03')
  })

  it('FE-SHR-03 la cabecera distingue el modo diario del ilimitado', () => {
    const d = buildShareText({ mode: 'daily', date: '2026-10-03', results: ['hit'] }).split('\n')[0]
    const u = buildShareText({ mode: 'unlimited', results: ['hit'] }).split('\n')[0]
    expect(d).not.toBe(u)
  })

  it('FE-SHR-04 nunca incluye titulo, id ni juego de la solucion aunque este en el estado', () => {
    const state: any = {
      mode: 'daily',
      date: '2026-10-03',
      results: ['hit'],
      solution: { id: 'rse-littleroot-town', title: 'Littleroot Town', games: [{ id: 'rse', name: 'Pokémon Ruby' }] },
    }
    const t = buildShareText(state)
    for (const s of ['Littleroot', 'rse-littleroot-town', 'Ruby', 'rse']) expect(t).not.toContain(s)
  })

  it('FE-SHR-05 la firma recibe un unico objeto (solo results y modo/fecha)', () => {
    expect(buildShareText.length).toBe(1)
  })

  it('FE-SHR-05 con results vacio no lanza y produce 6 casillas sin usar', () => {
    expect(rowOf(buildShareText({ mode: 'unlimited', results: [] }))).toBe('⬜⬜⬜⬜⬜⬜')
  })
})

describe('game/share copyToClipboard (FE-SHR-06)', () => {
  it('copia con navigator.clipboard.writeText', async () => {
    const writeText = vi.fn(async () => {})
    expect(await copyToClipboard('hola', { clipboard: { writeText } } as any)).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hola')
  })

  it('fallback si navigator.clipboard no existe', async () => {
    expect(await copyToClipboard('hola', {} as any)).toBe('fallback')
  })

  it('fallback si writeText rechaza', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denegado')
    })
    expect(await copyToClipboard('hola', { clipboard: { writeText } } as any)).toBe('fallback')
  })
})
