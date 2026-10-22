import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

/**
 * Detecta canciones que suenan igual (la misma pista subida por dos canales, o una reversion) comparando su
 * cromagrama: energia por clase de tono (12 semitonos) en ventanas de ~0,1 s. Dos audios de la misma pista
 * dan una correlacion alta en algun desfase aunque cambien el volumen, la calidad o el punto de inicio.
 * Calibrado con Sun/Moon y Legends Arceus: misma pista 0,82-0,98; pistas distintas del mismo juego <= 0,79.
 */
export const SAMPLE_RATE = 11025
const FRAME = 2048
const HOP = 1024
const MIN_HZ = 60
const MAX_HZ = 4000
export const FRAMES_PER_SECOND = SAMPLE_RATE / HOP
/** Segundos de cada fuente que se analizan, desde su startSec. */
export const ANALYSIS_SECONDS = 90
export const DEFAULT_THRESHOLD = 0.8

/** Un vector de 12 valores (norma 1, o todo 0 si el tramo no tiene tono) por ventana. */
export type Chroma = Float64Array[]

const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)))

/** FFT compleja in situ (radix-2, longitud potencia de 2). `inverse` no divide por n. */
function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)
    for (let start = 0; start < n; start += size) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < size / 2; k++) {
        const a = start + k
        const b = a + size / 2
        const tRe = re[b] * curRe - im[b] * curIm
        const tIm = re[b] * curIm + im[b] * curRe
        re[b] = re[a] - tRe
        im[b] = im[a] - tIm
        re[a] += tRe
        im[a] += tIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

/** Clase de tono de cada bin de la FFT (0 = La), o -1 fuera de [MIN_HZ, MAX_HZ]. */
function pitchClasses(sampleRate: number): Int8Array {
  const classes = new Int8Array(FRAME / 2 + 1).fill(-1)
  for (let bin = 1; bin <= FRAME / 2; bin++) {
    const hz = (bin * sampleRate) / FRAME
    if (hz > MIN_HZ && hz < MAX_HZ) classes[bin] = ((Math.round(12 * Math.log2(hz / 440)) % 12) + 12) % 12
  }
  return classes
}

export function chromagram(samples: Float32Array, sampleRate = SAMPLE_RATE): Chroma {
  const classes = pitchClasses(sampleRate)
  const window = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)))
  const frames: Chroma = []
  const re = new Float64Array(FRAME)
  const im = new Float64Array(FRAME)
  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = samples[start + i] * window[i]
      im[i] = 0
    }
    fft(re, im)
    const energy = new Float64Array(12)
    for (let bin = 1; bin <= FRAME / 2; bin++) {
      if (classes[bin] >= 0) energy[classes[bin]] += Math.hypot(re[bin], im[bin])
    }
    let mean = 0
    for (let c = 0; c < 12; c++) mean += (energy[c] = Math.log1p(energy[c])) / 12
    let norm = 0
    for (let c = 0; c < 12; c++) norm += (energy[c] -= mean) ** 2
    norm = Math.sqrt(norm)
    for (let c = 0; c < 12; c++) energy[c] = norm > 1e-3 ? energy[c] / norm : 0
    frames.push(energy)
  }
  return frames
}

interface Spectrum {
  length: number
  re: Float64Array[]
  im: Float64Array[]
}

function spectrum(chroma: Chroma, size: number): Spectrum {
  const re: Float64Array[] = []
  const im: Float64Array[] = []
  for (let c = 0; c < 12; c++) {
    const r = new Float64Array(size)
    chroma.forEach((frame, t) => (r[t] = frame[c]))
    const i = new Float64Array(size)
    fft(r, i)
    re.push(r)
    im.push(i)
  }
  return { length: chroma.length, re, im }
}

/** Solape minimo para comparar: 20 s, o el 70 % de la mas corta si dura menos; nunca menos de 3 s. */
function minOverlap(a: number, b: number): number {
  const floor = Math.round(3 * FRAMES_PER_SECOND)
  return Math.max(floor, Math.min(Math.round(20 * FRAMES_PER_SECOND), Math.floor(0.7 * Math.min(a, b))))
}

/** Maxima similitud media (coseno por ventana) entre `a` y `b` sobre los desfases con solape suficiente. */
function compareSpectra(a: Spectrum, b: Spectrum): number {
  const minimum = minOverlap(a.length, b.length)
  if (a.length < minimum || b.length < minimum) return 0
  const size = a.re[0].length
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  for (let c = 0; c < 12; c++) {
    for (let k = 0; k < size; k++) {
      // B * conj(A): correlacion de a desplazada sobre b.
      re[k] += b.re[c][k] * a.re[c][k] + b.im[c][k] * a.im[c][k]
      im[k] += b.im[c][k] * a.re[c][k] - b.re[c][k] * a.im[c][k]
    }
  }
  fft(re, im, true)
  let best = 0
  for (let index = 0; index < size; index++) {
    const lag = index >= b.length ? index - size : index
    const overlap = Math.min(a.length, b.length - lag) - Math.max(0, -lag)
    if (overlap < minimum) continue
    best = Math.max(best, re[index] / size / overlap)
  }
  return best
}

export function similarity(a: Chroma, b: Chroma): number {
  const size = nextPow2(a.length + b.length)
  return compareSpectra(spectrum(a, size), spectrum(b, size))
}

export interface SimilarEntry<T> {
  item: T
  chroma: Chroma
}

export interface SimilarPair<T> {
  a: T
  b: T
  score: number
}

/** Todas las parejas con similitud >= threshold, de mayor a menor. */
export function findSimilarPairs<T>(entries: Array<SimilarEntry<T>>, threshold = DEFAULT_THRESHOLD): Array<SimilarPair<T>> {
  const size = nextPow2(2 * Math.max(0, ...entries.map((entry) => entry.chroma.length)))
  const spectra = entries.map((entry) => spectrum(entry.chroma, size))
  const pairs: Array<SimilarPair<T>> = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const score = compareSpectra(spectra[i], spectra[j])
      if (score >= threshold) pairs.push({ a: entries[i].item, b: entries[j].item, score })
    }
  }
  return pairs.sort((x, y) => y.score - x.score)
}

/** Devuelve `seconds` de audio mono a SAMPLE_RATE desde `startSec`. */
export type AudioDecoder = (file: string, startSec: number, seconds: number) => Promise<Float32Array>

const execFileAsync = promisify(execFile)

/** Decodifica con ffmpeg a PCM float. Ruta absoluta: hay youtubeId que empiezan por "-". */
export const ffmpegDecoder: AudioDecoder = async (file, startSec, seconds) => {
  let stdout: Buffer
  try {
    ;({ stdout } = await execFileAsync(
      'ffmpeg',
      ['-v', 'error', '-ss', String(startSec), '-t', String(seconds), '-i', resolve(file), '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
    ))
  } catch (error) {
    throw new Error(`ffmpeg no pudo decodificar ${file}: ${(error as Error).message}`)
  }
  const samples = new Float32Array(Math.floor(stdout.length / 4))
  for (let i = 0; i < samples.length; i++) samples[i] = stdout.readFloatLE(i * 4)
  return samples
}
