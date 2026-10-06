import { describe, it, expect } from 'vitest'
import { computePeaks, WAVEFORM_BARS } from '../audio/waveform'

const RATE = 1000 // frecuencia baja: 1 muestra = 1 ms, tests rapidos

/** Buffer sintetico de `seconds` s con valores por segundo; registra los indices leidos. */
function bufferOf(valuePerSecond: number[], channels = 1) {
  const reads = new Set<number>()
  const make = () => {
    const data = new Float32Array(valuePerSecond.length * RATE)
    valuePerSecond.forEach((value, second) => data.fill(value, second * RATE, (second + 1) * RATE))
    return new Proxy(data, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads.add(Number(key))
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
  const data = Array.from({ length: channels }, make)
  return { reads, buffer: { duration: valuePerSecond.length, sampleRate: RATE, numberOfChannels: channels, getChannelData: (c: number) => data[c] } }
}

describe('audio/waveform computePeaks', () => {
  it('FE-WF-01 devuelve 48 barras; las del audio desbloqueado tienen pico y las posteriores son null', () => {
    const { buffer } = bufferOf([0.5, 0.5, 0.5, 0.5])
    const peaks = computePeaks(buffer, 4)!
    expect(peaks.length).toBe(WAVEFORM_BARS)
    expect(peaks.slice(0, 12).every((p) => typeof p === 'number')).toBe(true)
    expect(peaks.slice(12).every((p) => p === null)).toBe(true)
  })

  it('FE-WF-02 normaliza por el pico mas alto de lo desbloqueado (forma, no volumen)', () => {
    const { buffer } = bufferOf([0.1, 0.4, 0.2, 0.2])
    const peaks = computePeaks(buffer, 4)!
    expect(Math.max(...(peaks.filter((p) => p !== null) as number[]))).toBe(1)
    expect([peaks[0], peaks[3], peaks[6]].map((p) => Math.round(p! * 100) / 100)).toEqual([0.25, 1, 0.5]) // 0,1 / 0,4 / 0,2 sobre el maximo 0,4
  })

  it('FE-WF-03 SOLO LEE audio desbloqueado: ninguna muestra con indice >= unlockedSec * sampleRate', () => {
    const { buffer, reads } = bufferOf([0.2, 0.2, 0.9, 0.9, 0.9, 0.9, 0.9]) // lo fuerte esta mas alla de los 2 s
    const peaks = computePeaks(buffer, 2)!
    expect(Math.max(...reads)).toBeLessThan(2 * RATE)
    expect(peaks.filter((p) => p !== null).every((p) => p === 1)).toBe(true) // el 0,9 posterior no influye en la normalizacion
  })

  it('FE-WF-03 el audio posterior no cambia el resultado: dos buffers iguales hasta el corte dan la misma onda', () => {
    const a = computePeaks(bufferOf([0.3, 0.6, 0.1, 0.1, 0.1]).buffer, 2)
    const b = computePeaks(bufferOf([0.3, 0.6, 0.9, 0.0, 0.7]).buffer, 2)
    expect(a).toEqual(b)
  })

  it('FE-WF-04 un buffer mas corto que lo desbloqueado no lee fuera de limites ni da NaN', () => {
    const { buffer } = bufferOf([0.5, 0.5])
    const peaks = computePeaks(buffer, 4)!
    expect(peaks.some((p) => Number.isNaN(p as number))).toBe(false)
    expect(peaks.slice(0, 12).every((p) => typeof p === 'number')).toBe(true)
  })

  it('FE-WF-05 varios canales: el pico es el mayor de todos', () => {
    const left = bufferOf([0.1, 0.1]).buffer
    const right = bufferOf([0.1, 0.8]).buffer
    const stereo = { ...left, numberOfChannels: 2, getChannelData: (c: number) => (c === 0 ? left : right).getChannelData(0) }
    const peaks = computePeaks(stereo, 2)!
    expect(peaks[0]).toBeCloseTo(0.125, 5)
    expect(peaks[3]).toBe(1)
  })

  it('FE-WF-06 silencio total: ceros, sin dividir por cero', () => {
    const peaks = computePeaks(bufferOf([0, 0]).buffer, 2)!
    expect(peaks.filter((p) => p !== null).every((p) => p === 0)).toBe(true)
  })

  it('FE-WF-07 sin muestras disponibles (ruta <audio>, buffer nulo o sin getChannelData) -> null (onda neutra)', () => {
    expect(computePeaks(null, 4)).toBeNull()
    expect(computePeaks({ duration: 4 }, 4)).toBeNull()
    expect(computePeaks({ duration: 4, sampleRate: 44100, numberOfChannels: 2 }, 4)).toBeNull()
  })

  it('FE-WF-08 unlockedSec 0 o negativo: todo null', () => {
    expect(computePeaks(bufferOf([1]).buffer, 0)!.every((p) => p === null)).toBe(true)
    expect(computePeaks(bufferOf([1]).buffer, -3)!.every((p) => p === null)).toBe(true)
  })
})
