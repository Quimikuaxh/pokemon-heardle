/**
 * Script de inicio que instrumenta Web Audio SIN cambiar su comportamiento (DEC-45):
 * decodeAudioData (conteo y AudioBuffer resultante), AudioParam (llamadas de la rampa de fundido), start() de las
 * fuentes, resume() y el estado de cada contexto. Todo queda en `window.__wa`.
 */
export interface WebAudioLog {
  decodes: number
  buffers: AudioBuffer[]
  /** Llamadas a setValueAtTime / linearRampToValueAtTime en orden. */
  params: Array<{ fn: string; value: number; time: number }>
  /** `when` de cada source.start() y currentTime del contexto en ese momento. */
  starts: Array<{ when: number; now: number; offset: number }>
  /** Llamadas a source.stop(). */
  stops: number
  resumes: number
  contexts: AudioContext[]
}

export const INSTRUMENT_WEBAUDIO = () => {
  const w = window as any
  const log: WebAudioLog = { decodes: 0, buffers: [], params: [], starts: [], stops: 0, resumes: 0, contexts: [] }
  w.__wa = log
  const Ctx = w.AudioContext ?? w.webkitAudioContext
  if (!Ctx) return

  const decode = Ctx.prototype.decodeAudioData
  Ctx.prototype.decodeAudioData = function (this: AudioContext, data: ArrayBuffer, ...rest: unknown[]) {
    log.decodes++
    const result = decode.call(this, data, ...rest)
    if (result && typeof result.then === 'function') result.then((buffer: AudioBuffer) => log.buffers.push(buffer), () => {})
    return result
  }
  const resume = Ctx.prototype.resume
  Ctx.prototype.resume = function (this: AudioContext) {
    log.resumes++
    return resume.call(this)
  }
  const create = Ctx.prototype.createBufferSource
  Ctx.prototype.createBufferSource = function (this: AudioContext) {
    const ctx = this
    const source = create.call(this)
    const start = source.start
    source.start = function (when?: number, offset?: number, duration?: number) {
      log.starts.push({ when: when ?? 0, now: ctx.currentTime, offset: offset ?? 0 })
      return start.call(source, when, offset, duration)
    }
    const stop = source.stop
    source.stop = function (when?: number) {
      log.stops++
      return stop.call(source, when)
    }
    return source
  }
  const Param = w.AudioParam
  for (const fn of ['setValueAtTime', 'linearRampToValueAtTime'] as const) {
    const original = Param.prototype[fn]
    Param.prototype[fn] = function (this: AudioParam, value: number, time: number) {
      log.params.push({ fn, value, time })
      return original.call(this, value, time)
    }
  }
  // Registra cada contexto creado (para leer su `state` desde el test).
  w.AudioContext = new Proxy(Ctx, {
    construct(target, args) {
      const ctx = Reflect.construct(target, args) as AudioContext
      log.contexts.push(ctx)
      return ctx as object
    },
  })
  if (w.webkitAudioContext) w.webkitAudioContext = w.AudioContext
}

/** Deja la pagina sin Web Audio: fuerza la ruta de reserva <audio> (E2E-75). */
export const REMOVE_WEBAUDIO = () => {
  const w = window as any
  w.AudioContext = undefined
  w.webkitAudioContext = undefined
}

/** Energia de la senal a cada frecuencia candidata (Goertzel): devuelve la frecuencia dominante. */
export function dominantFrequency(samples: number[], sampleRate: number, candidates: number[]): number {
  let best = candidates[0]
  let bestPower = -1
  for (const f of candidates) {
    const w = (2 * Math.PI * f) / sampleRate
    const coeff = 2 * Math.cos(w)
    let s1 = 0
    let s2 = 0
    for (const x of samples) {
      const s0 = x + coeff * s1 - s2
      s2 = s1
      s1 = s0
    }
    const power = s1 * s1 + s2 * s2 - coeff * s1 * s2
    if (power > bestPower) {
      bestPower = power
      best = f
    }
  }
  return best
}

/**
 * Identifica la cancion objetivo por el tono del primer segundo del clip decodificado (cada cancion del fixture
 * tiene un tono base distinto). Sirve de oraculo en el modo libre cuando el pool tiene varias canciones.
 */
export async function identifyByTone<T extends { toneHz: number }>(page: import('@playwright/test').Page, candidates: T[]): Promise<T> {
  const clip = await page.evaluate(() => {
    const log = (window as any).__wa as WebAudioLog
    const buffer = log.buffers[log.buffers.length - 1]
    const data = buffer.getChannelData(0)
    return { samples: Array.from(data.subarray(2000, 2000 + 8820)), rate: buffer.sampleRate }
  })
  const found = dominantFrequency(clip.samples, clip.rate, candidates.map((candidate) => candidate.toneHz))
  return candidates.find((candidate) => candidate.toneHz === found)!
}
