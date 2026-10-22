// SC-SIM: deteccion de canciones que suenan igual por cromagrama (src/similar.ts).
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { chromagram, ffmpegDecoder, findSimilarPairs, SAMPLE_RATE, similarity } from '../src/similar'
import { melody } from './helpers/audio'
import { tmp } from './helpers/data'

const tone = (hz: number, seconds: number) =>
  Float32Array.from({ length: Math.round(seconds * SAMPLE_RATE) }, (_, i) => Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE))

describe('SC-SIM chromagram', () => {
  it('SC-SIM-01 un La de 440 Hz concentra la energia en la clase 0 y cada ventana tiene norma 1', () => {
    const frames = chromagram(tone(440, 2))
    expect(frames.length).toBeGreaterThan(10)
    for (const frame of frames) {
      expect(frame.indexOf(Math.max(...frame))).toBe(0)
      expect(Math.hypot(...frame)).toBeCloseTo(1, 6)
    }
  })

  it('SC-SIM-02 el silencio da ventanas a cero (sin NaN)', () => {
    const frames = chromagram(new Float32Array(SAMPLE_RATE * 2))
    expect(frames.every((frame) => frame.every((value) => value === 0))).toBe(true)
  })
})

describe('SC-SIM similarity', () => {
  const a = chromagram(melody(1, 40))

  it('SC-SIM-03 la misma pista da ~1 aunque cambie el volumen', () => {
    expect(similarity(a, chromagram(melody(1, 40, 0.05)))).toBeGreaterThan(0.95)
  })

  it('SC-SIM-04 la misma pista con otro punto de inicio (8 s despues) sigue por encima de 0,9', () => {
    const shifted = chromagram(melody(1, 40).subarray(8 * SAMPLE_RATE))
    expect(similarity(a, shifted)).toBeGreaterThan(0.9)
    expect(similarity(shifted, a)).toBeGreaterThan(0.9)
  })

  it('SC-SIM-05 melodias distintas quedan por debajo del umbral por defecto', () => {
    expect(similarity(a, chromagram(melody(2, 40)))).toBeLessThan(0.5)
  })

  it('SC-SIM-06 un audio de menos de 3 s no se compara (0)', () => {
    expect(similarity(a, chromagram(melody(1, 2)))).toBe(0)
  })
})

describe('SC-SIM findSimilarPairs', () => {
  it('SC-SIM-07 devuelve solo las parejas por encima del umbral, de mayor a menor', () => {
    const entries = [
      { item: 'a', chroma: chromagram(melody(1, 30)) },
      { item: 'b', chroma: chromagram(melody(2, 30)) },
      { item: 'a-copia', chroma: chromagram(melody(1, 30, 0.1)) },
      { item: 'a-recorte', chroma: chromagram(melody(1, 30).subarray(5 * SAMPLE_RATE)) },
    ]
    const pairs = findSimilarPairs(entries, 0.8)
    expect(pairs.map((p) => [p.a, p.b].sort().join('+')).sort()).toEqual(['a+a-copia', 'a+a-recorte', 'a-copia+a-recorte'])
    expect(pairs.map((p) => p.score)).toEqual([...pairs.map((p) => p.score)].sort((x, y) => y - x))
    expect(findSimilarPairs(entries, 0.999).length).toBeLessThan(3)
  })

  it('SC-SIM-08 sin entradas o con una sola no hay parejas', () => {
    expect(findSimilarPairs([])).toEqual([])
    expect(findSimilarPairs([{ item: 1, chroma: chromagram(melody(1, 30)) }])).toEqual([])
  })
})

function hasFfmpeg(): boolean {
  return spawnSync('ffmpeg', ['-version']).status === 0
}

describe.skipIf(!hasFfmpeg())('SC-SIM-09 decodificacion real con ffmpeg', () => {
  it('devuelve los segundos pedidos desde startSec, mono a SAMPLE_RATE, con nombre que empieza por "-"', async () => {
    const dir = tmp()
    const file = join(dir, '-tono 440.wav')
    expect(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', file]).status).toBe(0)
    const samples = await ffmpegDecoder(file, 1, 3)
    expect(Math.abs(samples.length - 3 * SAMPLE_RATE)).toBeLessThan(SAMPLE_RATE * 0.05)
    expect(chromagram(samples)[5].indexOf(Math.max(...chromagram(samples)[5]))).toBe(0)
  })

  it('un fichero inexistente rechaza nombrando ffmpeg', async () => {
    await expect(ffmpegDecoder(join(tmp(), 'no-existe.m4a'), 0, 1)).rejects.toThrow(/ffmpeg/)
  })
})
