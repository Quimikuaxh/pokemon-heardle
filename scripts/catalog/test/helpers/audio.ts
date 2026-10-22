// Audio sintetico para los tests de similar (SC-SIM).
import { SAMPLE_RATE } from '../../src/similar'

/** Generador pseudoaleatorio determinista (mulberry32). */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Notas de 0,4 s (fundamental + armonico) sacadas de la escala cromatica con la semilla dada. */
export function melody(seed: number, seconds: number, gain = 0.3): Float32Array {
  const next = rng(seed)
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  const noteLength = Math.round(0.4 * SAMPLE_RATE)
  let hz = 0
  for (let i = 0; i < samples.length; i++) {
    if (i % noteLength === 0) hz = 220 * 2 ** (Math.floor(next() * 24) / 12)
    const t = i / SAMPLE_RATE
    samples[i] = gain * (Math.sin(2 * Math.PI * hz * t) + 0.4 * Math.sin(4 * Math.PI * hz * t))
  }
  return samples
}
