import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLIP_SECONDS, MAX_ATTEMPTS, CLIP_FRAME_COUNTS, CLIP_BYTE_OFFSETS, CLIP_TOTAL_BYTES } from '../rules'
import { audioMs, bytesAfterFrames, frameSize, framesFor, framesForCeil, frameStarts, TOTAL_FRAMES } from './helpers/mp3'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

describe('shared/rules', () => {
  it('SH-RUL-01 CLIP_SECONDS son exactamente 1,2,4,7,11,16', () => {
    expect([...CLIP_SECONDS]).toEqual([1, 2, 4, 7, 11, 16])
  })

  it('SH-RUL-01 MAX_ATTEMPTS es 6', () => {
    expect(MAX_ATTEMPTS).toBe(6)
  })

  it('SH-RUL-01 hay un tramo por intento', () => {
    expect(CLIP_SECONDS.length).toBe(MAX_ATTEMPTS)
  })

  it('SH-RUL-01 exporta CLIP_FRAME_COUNTS (6), CLIP_BYTE_OFFSETS (6) y CLIP_TOTAL_BYTES (1 valor numerico)', () => {
    expect([CLIP_FRAME_COUNTS.length, CLIP_BYTE_OFFSETS.length, typeof CLIP_TOTAL_BYTES]).toEqual([6, 6, 'number'])
    expect(CLIP_FRAME_COUNTS.length).toBe(CLIP_SECONDS.length)
  })

  it('SH-RUL-02 CLIP_FRAME_COUNTS = [39,77,154,268,422,614]', () => {
    expect([...CLIP_FRAME_COUNTS]).toEqual([39, 77, 154, 268, 422, 614])
  })

  it('SH-RUL-02 CLIP_BYTE_OFFSETS = [16300,32182,64365,112013,176378,256626]', () => {
    expect([...CLIP_BYTE_OFFSETS]).toEqual([16300, 32182, 64365, 112013, 176378, 256626])
  })

  it('SH-RUL-02 CLIP_TOTAL_BYTES = 256626', () => {
    expect(CLIP_TOTAL_BYTES).toBe(256626)
  })

  it('SH-RUL-03 las tramas se recalculan con floor((N*44100+1105)/1152) para N<16 y 614 para N=16', () => {
    expect(CLIP_SECONDS.map((n) => framesFor(n))).toEqual([...CLIP_FRAME_COUNTS])
  })

  it('SH-RUL-03 la formula da 39, 77, 154, 268 y 422 sin importar nada de produccion', () => {
    expect([1, 2, 4, 7, 11].map((n) => Math.floor((n * 44100 + 1105) / 1152))).toEqual([39, 77, 154, 268, 422])
  })

  it('SH-RUL-04 los offsets salen del patron 417/418 construido en el test (bytes tras k tramas)', () => {
    expect([...CLIP_FRAME_COUNTS].map((k) => bytesAfterFrames(k))).toEqual([...CLIP_BYTE_OFFSETS])
  })

  it('SH-RUL-04 cada trama mide 417 o 418 bytes y 614 tramas suman el total', () => {
    const sizes = Array.from({ length: TOTAL_FRAMES }, (_, i) => frameSize(i))
    expect(sizes.every((s) => s === 417 || s === 418)).toBe(true)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(CLIP_TOTAL_BYTES)
  })

  it('SH-RUL-04 todos los offsets caen en el inicio de una trama (limite de trama)', () => {
    const starts = new Set(frameStarts(TOTAL_FRAMES + 1))
    for (const offset of CLIP_BYTE_OFFSETS) expect(starts.has(offset)).toBe(true)
  })

  it('SH-RUL-05 offsets estrictamente crecientes y el ultimo es el total', () => {
    const offsets = [...CLIP_BYTE_OFFSETS]
    offsets.slice(1).forEach((o, i) => expect(o).toBeGreaterThan(offsets[i]))
    expect(offsets.at(-1)).toBe(CLIP_TOTAL_BYTES)
  })

  it('SH-RUL-05 con floor el audio real nunca rebasa N (para N<16 queda por debajo, y a menos de 25 ms)', () => {
    for (const [i, n] of CLIP_SECONDS.slice(0, 5).entries()) {
      const deficitMs = n * 1000 - audioMs(CLIP_FRAME_COUNTS[i])
      expect(deficitMs, `N=${n}`).toBeGreaterThan(0)
      expect(deficitMs, `N=${n}`).toBeLessThan(25)
    }
  })

  it('SH-RUL-05 el audio real de cada prefijo coincide con la tabla de DEC-44 (993,7 / 1986,4 / 3997,8 / 6975,8 / 10998,6 ms)', () => {
    const real = [...CLIP_FRAME_COUNTS].slice(0, 5).map((k) => Math.round(audioMs(k) * 10) / 10)
    expect(real).toEqual([993.7, 1986.4, 3997.8, 6975.8, 10998.6])
  })

  it('SH-RUL-05 con ceil se rebasaria N en algun intento (incumple el requisito 2)', () => {
    const overshoots = [1, 2, 4, 7, 11].filter((n) => audioMs(framesForCeil(n)) > n * 1000)
    expect(overshoots.length).toBeGreaterThan(0)
  })

  it('SH-RUL-05 el ultimo intento es el fichero entero: 614 tramas', () => {
    expect(CLIP_FRAME_COUNTS.at(-1)).toBe(TOTAL_FRAMES)
  })
})

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'coverage', 'test', 'test-results', 'playwright-report', '__tests__'].includes(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe('shared/rules: un solo origen (SH-RUL-06)', () => {
  const sources = ['backend/src', 'scripts/catalog/src', 'frontend/src', 'e2e/scripts', 'e2e/support', 'e2e/fixtures'].flatMap((d) => walk(join(ROOT, d)))

  it('SH-RUL-06 ningun literal de las constantes fuera de shared/rules.ts', () => {
    const offenders: string[] = []
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      for (const literal of ['256626', '256_626', '16300', '32182', '64365', '112013', '176378']) if (text.includes(literal)) offenders.push(`${relative(ROOT, file)}: ${literal}`)
    }
    expect(offenders).toEqual([])
  })

  it('SH-RUL-06 el backend (servicio de clips) importa las constantes de shared/rules', () => {
    const files = walk(join(ROOT, 'backend/src')).filter((f) => /CLIP_BYTE_OFFSETS|CLIP_TOTAL_BYTES/.test(readFileSync(f, 'utf8')))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(readFileSync(f, 'utf8')).toMatch(/shared\/rules/)
  })

  it('SH-RUL-06 validate del script importa las constantes de shared/rules', () => {
    const text = readFileSync(join(ROOT, 'scripts/catalog/src/validate.ts'), 'utf8')
    expect(text).toMatch(/CLIP_TOTAL_BYTES|CLIP_BYTE_OFFSETS/)
    expect(text).toMatch(/shared\/rules/)
  })

  it('SH-RUL-06 generate-fixtures de e2e importa las constantes de shared/rules', () => {
    const file = join(ROOT, 'e2e/scripts/generate-fixtures.ts')
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf8')
    expect(text).toMatch(/CLIP_TOTAL_BYTES|CLIP_BYTE_OFFSETS/)
    expect(text).toMatch(/shared\/rules/)
  })
})
