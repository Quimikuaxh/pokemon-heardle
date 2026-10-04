/**
 * Generador sintetico de MP3 y recorrido de tramas PARA TESTS (DEC-44). Es independiente de la produccion:
 * NO importa shared/rules ni nada de src; recalcula todo desde la formula de tamano de trama.
 *
 * Formato: MPEG-1 Layer III, 128 kbps CBR, 44,1 kHz, estereo, sin CRC. Trama = 1152 muestras, 417 o 418 bytes
 * (417,959... de media: el padding sigue bytesTrasTramas(k) = floor(k * 144 * 128000 / 44100)).
 * Cabecera: FF FB | 0x90 (+0x02 si padding) | 0x00 (estereo). Informacion lateral de 32 bytes (bytes 4..35);
 * main_data_begin son los 9 primeros bits de la informacion lateral (byte 4 y MSB del byte 5).
 */
import { createHash } from 'node:crypto'

export const SAMPLE_RATE = 44100
export const SAMPLES_PER_FRAME = 1152
export const ENCODER_DELAY = 1105 // 576 + 529 (DEC-44)
export const TOTAL_FRAMES = 614

/** Bytes que ocupan las k primeras tramas. */
export const bytesAfterFrames = (k: number): number => Math.floor((k * 144 * 128000) / SAMPLE_RATE)
export const frameSize = (index: number): number => bytesAfterFrames(index + 1) - bytesAfterFrames(index)
export const TOTAL_BYTES = bytesAfterFrames(TOTAL_FRAMES)

/** Tramas del prefijo para N segundos: floor((N*44100+1105)/1152) y 614 para N=16. */
export const framesFor = (seconds: number): number => (seconds >= 16 ? TOTAL_FRAMES : Math.floor((seconds * SAMPLE_RATE + ENCODER_DELAY) / SAMPLES_PER_FRAME))
export const framesForCeil = (seconds: number): number => Math.ceil((seconds * SAMPLE_RATE + ENCODER_DELAY) / SAMPLES_PER_FRAME)
/** Milisegundos de audio real (sin retardo del codificador) que contienen k tramas. */
export const audioMs = (frames: number): number => ((frames * SAMPLES_PER_FRAME - ENCODER_DELAY) / SAMPLE_RATE) * 1000

export interface Mp3Options {
  /** Cambia el desplazamiento del patron de padding (rompe los limites de trama de los offsets). */
  patternShift?: number
  /** main_data_begin por indice de trama (por defecto 0 = sin reservoir). */
  mainDataBegin?: Record<number, number>
  /** 'mpeg2' -> cabecera MPEG-2 Layer III (FF F3). */
  version?: 'mpeg1' | 'mpeg2'
  /** Indice de bitrate (4 bits) de la cabecera; por defecto 9 = 128 kbps. */
  bitrateIndex?: number
  /** Modo de canal: 'stereo' (por defecto) o 'mono'. */
  channels?: 'stereo' | 'mono'
  /** Frecuencia: 0 = 44,1 kHz (por defecto), 1 = 48 kHz. */
  sampleRateIndex?: number
  /** Escribe una trama Xing/Info en la primera trama. */
  xing?: 'Xing' | 'Info'
  /** Escribe "ID3" al inicio del fichero. */
  id3?: boolean
  /** Destruye la cabecera (sync) de la trama indicada. */
  breakHeaderAtFrame?: number
  /** Numero de tramas (por defecto 614). */
  frames?: number
}

/** Posiciones (byte inicial) de cada trama segun el patron 417/418, con desplazamiento opcional. */
export function frameStarts(frames: number, shift = 0): number[] {
  const starts: number[] = []
  let pos = 0
  for (let i = 0; i < frames; i++) {
    starts.push(pos)
    pos += frameSize(i + shift)
  }
  return starts
}

/** Fichero sintetico: `seed` hace distintos los bytes de datos entre canciones sin tocar cabeceras. */
export function buildMp3(seed = 'seed', options: Mp3Options = {}): Buffer {
  const frames = options.frames ?? TOTAL_FRAMES
  const shift = options.patternShift ?? 0
  const sizes = Array.from({ length: frames }, (_, i) => frameSize(i + shift))
  // con desplazamiento se compensa en la ultima trama para conservar el tamano total del fichero
  if (shift !== 0) sizes[frames - 1] += bytesAfterFrames(frames) - sizes.reduce((a, b) => a + b, 0)
  const out = Buffer.alloc(sizes.reduce((a, b) => a + b, 0))
  let pos = 0
  let counter = 0
  for (let i = 0; i < frames; i++) {
    const size = sizes[i]
    const padding = size === 418 ? 1 : 0
    out[pos] = 0xff
    out[pos + 1] = options.version === 'mpeg2' ? 0xf3 : 0xfb
    out[pos + 2] = ((options.bitrateIndex ?? 9) << 4) | ((options.sampleRateIndex ?? 0) << 2) | (padding << 1)
    out[pos + 3] = options.channels === 'mono' ? 0xc0 : 0x00
    // informacion lateral (32 B en estereo, 17 B en mono): ceros salvo main_data_begin
    const mdb = options.mainDataBegin?.[i] ?? 0
    out[pos + 4] = (mdb >> 1) & 0xff
    out[pos + 5] = (mdb & 1) << 7
    // datos principales deterministas y distintos por semilla
    let off = pos + 36
    while (off < pos + size) {
      const h = createHash('sha256').update(`${seed}:${counter++}`).digest()
      off += h.copy(out, off, 0, Math.min(h.length, pos + size - off))
    }
    pos += size
  }
  if (options.xing) out.write(options.xing, 36, 'latin1')
  if (options.id3) out.write('ID3', 0, 'latin1')
  if (options.breakHeaderAtFrame !== undefined) {
    const start = frameStarts(frames, shift)[options.breakHeaderAtFrame]
    out[start] = 0x00
    out[start + 1] = 0x00
  }
  return out
}

export interface WalkResult {
  starts: number[]
  errors: string[]
}

/** Recorre cabeceras MPEG-1 L3 128 kbps 44,1 kHz estereo desde el byte 0 usando el campo de padding. */
export function walkFrames(buf: Buffer): WalkResult {
  const starts: number[] = []
  const errors: string[] = []
  let pos = 0
  while (pos < buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xfe) !== 0xfa) {
      errors.push(`sin sync en ${pos}`)
      break
    }
    const bitrateIndex = buf[pos + 2] >> 4
    const rateIndex = (buf[pos + 2] >> 2) & 3
    const padding = (buf[pos + 2] >> 1) & 1
    const mono = (buf[pos + 3] >> 6) === 3
    if (bitrateIndex !== 9 || rateIndex !== 0 || mono) {
      errors.push(`formato inesperado en ${pos}`)
      break
    }
    starts.push(pos)
    pos += 417 + padding
  }
  if (pos !== buf.length) errors.push(`el recorrido acaba en ${pos} y el fichero mide ${buf.length}`)
  return { starts, errors }
}
