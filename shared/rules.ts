export const CLIP_SECONDS: readonly number[] = [1, 2, 4, 7, 11, 16]
export const MAX_ATTEMPTS = 6

// Formato del clip unico de 16 s (DEC-44): MPEG-1 Layer III, 128 kbps CBR, 44,1 kHz, estereo, sin Xing.
const SAMPLE_RATE = 44_100
const SAMPLES_PER_FRAME = 1_152
const ENCODER_DELAY_SAMPLES = 1_105 // 576 + 529
const FRAME_BYTES_NUMERATOR = 144 * 128_000 // bytes tras k tramas = floor(k * 144 * 128000 / 44100)
const FULL_CLIP_SECONDS = 16

const bytesAfterFrames = (frames: number) => Math.floor((frames * FRAME_BYTES_NUMERATOR) / SAMPLE_RATE)
const fullClipFrames = Math.ceil((FULL_CLIP_SECONDS * SAMPLE_RATE + ENCODER_DELAY_SAMPLES) / SAMPLES_PER_FRAME)

/**
 * Tramas del prefijo del intento: con floor el prefijo nunca contiene audio posterior a N s (le faltan hasta
 * 24 ms); el ultimo intento es el fichero entero.
 */
export const CLIP_FRAME_COUNTS: readonly number[] = CLIP_SECONDS.map((seconds) =>
  seconds >= FULL_CLIP_SECONDS
    ? fullClipFrames
    : Math.floor((seconds * SAMPLE_RATE + ENCODER_DELAY_SAMPLES) / SAMPLES_PER_FRAME),
)

/** Bytes del prefijo de cada intento: siempre un limite de trama. */
export const CLIP_BYTE_OFFSETS: readonly number[] = CLIP_FRAME_COUNTS.map(bytesAfterFrames)

/** Tamano de todo fichero de clip. */
export const CLIP_TOTAL_BYTES: number = CLIP_BYTE_OFFSETS[CLIP_BYTE_OFFSETS.length - 1]
