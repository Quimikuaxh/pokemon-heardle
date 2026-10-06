import type { AudioBufferLike } from './clipPlayer'

export const WAVEFORM_BARS = 48
export const WAVEFORM_SCALE_SECONDS = 16

/**
 * Picos (0..1) de las barras de la onda, calculados SOLO con las muestras del audio desbloqueado del intento
 * actual: ninguna muestra con indice >= unlockedSec * sampleRate se lee, y las barras posteriores valen null
 * (la pantalla las pinta planas). Devuelve null si el buffer no expone muestras (ruta <audio>): onda neutra.
 */
export function computePeaks(
  buffer: AudioBufferLike | null,
  unlockedSec: number,
  barCount = WAVEFORM_BARS,
  scaleSeconds = WAVEFORM_SCALE_SECONDS,
): Array<number | null> | null {
  if (!buffer?.getChannelData || !buffer.sampleRate || !buffer.numberOfChannels) return null
  const sampleRate = buffer.sampleRate
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData!(index))
  const readableSamples = Math.min(channels[0]?.length ?? 0, Math.floor(Math.max(0, unlockedSec) * sampleRate))
  const secondsPerBar = scaleSeconds / barCount

  const raw = Array.from({ length: barCount }, (_, bar): number | null => {
    const startSec = bar * secondsPerBar
    if (startSec >= unlockedSec) return null
    const from = Math.floor(startSec * sampleRate)
    const to = Math.min(Math.floor((startSec + secondsPerBar) * sampleRate), readableSamples)
    let peak = 0
    for (const data of channels) {
      for (let index = from; index < to; index++) {
        const value = Math.abs(data[index])
        if (value > peak) peak = value
      }
    }
    return peak
  })

  const loudest = Math.max(0, ...raw.filter((peak): peak is number => peak !== null))
  return raw.map((peak) => (peak === null ? null : loudest > 0 ? peak / loudest : 0))
}
