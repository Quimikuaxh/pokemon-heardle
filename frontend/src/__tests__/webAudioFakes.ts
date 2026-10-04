/**
 * Dobles de Web Audio para los tests de ClipPlayer (DEC-45). Contrato asumido:
 *  - ClipPlayerDeps.createAudioContext?: () => AudioContextLike | null   (null fuerza el fallback <audio>;
 *    si se omite, se usa globalThis.AudioContext ?? globalThis.webkitAudioContext)
 *  - La fuente notifica el fin con `source.onended` (propiedad), el contexto con el evento 'statechange'.
 *  - Se decodifica con decodeAudioData(arrayBuffer) -> Promise<AudioBuffer> (variante con promesa).
 */
import { vi } from 'vitest'

export class FakeBuffer {
  numberOfChannels = 2
  sampleRate = 44100
  constructor(public duration: number) {}
}

export class FakeSource extends EventTarget {
  buffer: FakeBuffer | null = null
  onended: (() => void) | null = null
  connect = vi.fn()
  disconnect = vi.fn()
  start = vi.fn()
  // como en el navegador, parar una fuente dispara 'ended' de forma asincrona
  stop = vi.fn(() => {
    queueMicrotask(() => this.onended?.())
  })
}

export class FakeGain {
  gain = { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() }
  connect = vi.fn()
  disconnect = vi.fn()
}

export class FakeContext extends EventTarget {
  static instances: FakeContext[] = []
  state: string = 'suspended'
  currentTime = 0
  destination = { fake: 'destination' }
  sources: FakeSource[] = []
  gains: FakeGain[] = []
  durations: number[] = []
  buffers: FakeBuffer[] = []
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  close = vi.fn(async () => {
    this.state = 'closed'
  })
  decodeAudioData = vi.fn(async (_data: ArrayBuffer) => {
    const buffer = new FakeBuffer(this.durations.shift() ?? 16.0392)
    this.buffers.push(buffer)
    return buffer
  })
  createBufferSource = vi.fn(() => {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  })
  createGain = vi.fn(() => {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  })
  constructor() {
    super()
    FakeContext.instances.push(this)
  }
  /** Simula que el sistema cambia el estado del contexto (llamada, segundo plano en iOS...). */
  setState(state: string) {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}

export class FakeAudio extends EventTarget {
  src = ''
  currentTime = 0
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn(() => void this.dispatchEvent(new Event('pause')))
}

export function fakeFrames() {
  let next = 1
  const pending = new Map<number, (t: number) => void>()
  return {
    requestFrame: vi.fn((cb: (t: number) => void) => {
      const id = next++
      pending.set(id, cb)
      return id
    }),
    cancelFrame: vi.fn((id: number) => void pending.delete(id)),
    tick() {
      const batch = [...pending.values()]
      pending.clear()
      batch.forEach((cb) => cb(0))
    },
    pending: () => pending.size,
  }
}

export const blob = (bytes = 8) => new Blob([new Uint8Array(bytes)])
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
