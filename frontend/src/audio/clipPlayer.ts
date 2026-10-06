import { ApiError } from '../api/client'

/** Lo minimo de AudioContext que usa el player (permite inyectar dobles en los tests). */
export interface AudioContextLike {
  state: string
  currentTime: number
  destination: unknown
  resume(): Promise<void>
  close(): Promise<void>
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>
  createBufferSource(): AudioSourceLike
  createGain(): AudioGainLike
  addEventListener(type: 'statechange', listener: () => void): void
  removeEventListener?(type: 'statechange', listener: () => void): void
}

export interface AudioBufferLike {
  duration: number
  sampleRate?: number
  numberOfChannels?: number
  getChannelData?(channel: number): Float32Array
}

export interface AudioSourceLike {
  buffer: AudioBufferLike | null
  onended: (() => void) | null
  connect(node: unknown): void
  disconnect(): void
  start(when?: number, offset?: number): void
  stop(when?: number): void
}

export interface AudioGainLike {
  gain: {
    cancelScheduledValues?(time: number): void
    setValueAtTime(value: number, time: number): void
    linearRampToValueAtTime(value: number, time: number): void
  }
  connect(node: unknown): void
  disconnect(): void
}

export interface ClipPlayerDeps {
  fetchClip(clipUrl: string): Promise<Blob>
  /** Pide una URL de clip nueva (el ticket anterior caduco o ya se uso). */
  refreshClipUrl(): Promise<string>
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
  createAudio(): HTMLAudioElement
  /** null fuerza la ruta de reserva <audio>. Por defecto AudioContext ?? webkitAudioContext. */
  createAudioContext?: () => AudioContextLike | null
  /**
   * Avisa del AudioBuffer decodificado del intento actual (para dibujar la onda) o de null cuando se suelta o no
   * hay buffer (ruta <audio>). Nunca se entrega el de un intento anterior.
   */
  onDecoded?(info: { attemptKey: string; buffer: AudioBufferLike | null }): void
  /** Por defecto requestAnimationFrame / cancelAnimationFrame (se resuelven en cada llamada). */
  requestFrame?(callback: (time: number) => void): number
  cancelFrame?(id: number): void
}

export interface PlaybackState {
  playing: boolean
  positionSec: number
}

export interface ClipPlayer {
  prepare(clipUrl: string, attemptKey: string): Promise<void>
  /** Sincrono: debe ejecutarse dentro del gesto del usuario (autoplay en iOS). Si estaba pausado, continua; si ya sonaba, reinicia. */
  play(): void
  /** Pausa en la posicion actual: el siguiente `play()` continua desde ahi (hasta que acabe el clip o cambie el intento). */
  pause(): void
  /** Detiene la reproduccion y vuelve a 0 (p. ej. al abrir la cancion completa). */
  stop(): void
  /** Avisa de { playing, positionSec } en cada frame mientras suena y al parar o terminar. */
  subscribe(listener: (state: PlaybackState) => void): () => void
  dispose(): void
}

const TICKET_GONE_STATUSES = new Set([404, 410])
const FADE_OUT_SECONDS = 0.05
/** Rampa de ganancia al pausar: sin ella, cortar la onda en seco suena a chasquido. */
const PAUSE_FADE_SECONDS = 0.01

function defaultAudioContext(): AudioContextLike | null {
  const scope = globalThis as unknown as Record<string, (new () => AudioContextLike) | undefined>
  const Constructor = scope.AudioContext ?? scope.webkitAudioContext
  return Constructor ? new Constructor() : null
}

/** Safari 16.4+: sin esto Web Audio calla con el interruptor de silencio de iOS activado. */
function useMediaPlaybackAudioSession() {
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'playback'
}

interface ActiveSource {
  source: AudioSourceLike
  gain: AudioGainLike
  startTime: number
  /** Segundos del buffer por los que empezo esta fuente (0, o el punto de una pausa). */
  offset: number
  /** Duracion del buffer entero. */
  duration: number
}

/**
 * Descarga cada clip UNA vez a un Blob (la URL es de un solo uso) y lo reproduce con Web Audio, que aplica el
 * fundido de salida de 50 ms de cada intento (DEC-45). Si no hay Web Audio o no puede decodificar, reproduce
 * con <audio> sin fundido. La decision se toma en `prepare`, no en `play`, para no perder el gesto.
 */
export function createClipPlayer(deps: ClipPlayerDeps): ClipPlayer {
  const audio = deps.createAudio()
  const requestFrame = deps.requestFrame ?? ((callback) => requestAnimationFrame(callback))
  const cancelFrame = deps.cancelFrame ?? ((id) => cancelAnimationFrame(id))
  const createContext = deps.createAudioContext ?? defaultAudioContext
  const listeners = new Set<(state: PlaybackState) => void>()

  let preparedKey: string | null = null
  let preparing: Promise<void> | null = null
  let mode: 'buffer' | 'element' | null = null
  let buffer: AudioBufferLike | null = null
  let objectUrl: string | null = null
  let context: AudioContextLike | null | undefined
  let contextClosed = false
  let active: ActiveSource | null = null
  let playing = false
  // Posicion al parar (Web Audio) y punto de reanudacion: solo `pause()` o una interrupcion dejan offset > 0.
  let heldPosition = 0
  let resumeOffset = 0
  let elementResumable = false
  let frameId: number | null = null
  let disposed = false

  function emit(state: PlaybackState) {
    if (disposed) return
    for (const listener of [...listeners]) {
      try {
        listener(state)
      } catch {
        // un listener roto no debe afectar a los demas ni a la reproduccion
      }
    }
  }

  function currentPosition(): number {
    if (mode === 'buffer') return active && context ? bufferPosition(active, context) : heldPosition
    return audio.currentTime
  }

  function bufferPosition(entry: ActiveSource, web: AudioContextLike): number {
    return Math.min(entry.offset + Math.max(web.currentTime - entry.startTime, 0), entry.duration)
  }

  function cancelPendingFrame() {
    if (frameId !== null) cancelFrame(frameId)
    frameId = null
  }

  function scheduleFrame() {
    if (frameId !== null || !playing || listeners.size === 0) return
    frameId = requestFrame(() => {
      frameId = null
      if (!playing) return
      emit({ playing: true, positionSec: currentPosition() })
      scheduleFrame()
    })
  }

  function markEnded() {
    const position = currentPosition()
    playing = false
    cancelPendingFrame()
    emit({ playing: false, positionSec: position })
  }

  // Para la fuente actual sin emitir; su 'ended' tardio se ignora porque ya no es la fuente activa.
  function detachActiveSource() {
    if (!active) return
    const { source, gain } = active
    if (context) heldPosition = bufferPosition(active, context)
    active = null
    source.onended = null
    try {
      source.stop()
    } catch {
      // ya parada
    }
    source.disconnect()
    gain.disconnect()
  }

  // Pausa sin chasquido: ganancia a 0 en ~10 ms y la fuente se para al final de la rampa. La posicion guardada es la
  // del momento de pulsar; la fuente que se apaga deja de ser la activa y su 'ended' solo libera los nodos.
  function fadeOutActiveSource(web: AudioContextLike) {
    if (!active) return
    const entry = active
    heldPosition = bufferPosition(entry, web)
    if (heldPosition >= entry.duration - FADE_OUT_SECONDS) {
      detachActiveSource() // ya esta en el fundido final: no hay nada que suavizar
      return
    }
    active = null
    const now = web.currentTime
    const { source, gain } = entry
    gain.gain.cancelScheduledValues?.(now)
    gain.gain.setValueAtTime(1, now)
    gain.gain.linearRampToValueAtTime(0, now + PAUSE_FADE_SECONDS)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
    }
    try {
      source.stop(now + PAUSE_FADE_SECONDS)
    } catch {
      // ya parada
    }
  }

  function onElementPlaybackEnd() {
    if (mode === 'element') markEnded()
  }
  function onElementEnded() {
    elementResumable = false
    onElementPlaybackEnd()
  }
  audio.addEventListener?.('pause', onElementPlaybackEnd)
  audio.addEventListener?.('ended', onElementEnded)

  function onContextStateChange() {
    if (context && context.state !== 'running' && mode === 'buffer' && playing) {
      // Una interrupcion del sistema (llamada, segundo plano) equivale a una pausa: el siguiente clic continua.
      detachActiveSource()
      resumeOffset = heldPosition
      markEnded()
    }
  }

  function ensureContext(): AudioContextLike | null {
    if (context === undefined) {
      try {
        context = createContext()
      } catch {
        context = null
      }
      context?.addEventListener('statechange', onContextStateChange)
      if (context) useMediaPlaybackAudioSession()
    }
    return context
  }

  function releaseObjectUrl() {
    if (objectUrl) deps.revokeObjectURL(objectUrl)
    objectUrl = null
  }

  async function download(clipUrl: string): Promise<Blob> {
    try {
      return await deps.fetchClip(clipUrl)
    } catch (error) {
      if (!(error instanceof ApiError) || !TICKET_GONE_STATUSES.has(error.status)) throw error
      return deps.fetchClip(await deps.refreshClipUrl())
    }
  }

  async function decode(blob: Blob): Promise<AudioBufferLike | null> {
    const web = ensureContext()
    if (!web) return null
    try {
      return await web.decodeAudioData(await blob.arrayBuffer())
    } catch {
      return null
    }
  }

  async function prepareClip(clipUrl: string, attemptKey: string) {
    // Un intento nuevo invalida lo anterior aunque este prepare falle: nunca suena el clip del intento previo.
    const hadPreviousClip = mode !== null
    if (playing) {
      // Sonando al cambiar de intento: la barra no debe seguir "sonando" (ni el rAF repintar) mientras se descarga el siguiente.
      playing = false
      cancelPendingFrame()
      emit({ playing: false, positionSec: 0 })
    }
    detachActiveSource()
    buffer = null
    mode = null
    heldPosition = 0
    resumeOffset = 0
    elementResumable = false
    deps.onDecoded?.({ attemptKey, buffer: null })
    const blob = await download(clipUrl)
    const decoded = await decode(blob)
    if (disposed || preparedKey !== attemptKey) return
    playing = false
    cancelPendingFrame()
    if (decoded) {
      releaseObjectUrl()
      buffer = decoded
      mode = 'buffer'
      deps.onDecoded?.({ attemptKey, buffer: decoded })
    } else {
      releaseObjectUrl()
      objectUrl = deps.createObjectURL(blob)
      audio.src = objectUrl
      mode = 'element'
    }
    // Quien escucha (la barra) vuelve a 0 al cambiar de intento; el primer clip no tiene nada que reiniciar.
    if (hadPreviousClip) emit({ playing: false, positionSec: 0 })
  }

  function playBuffer(web: AudioContextLike, decoded: AudioBufferLike, offset: number) {
    useMediaPlaybackAudioSession()
    detachActiveSource()
    if (web.state !== 'running') {
      web.resume().catch(() => {
        detachActiveSource()
        markEnded()
      })
    }
    const startTime = web.currentTime
    const duration = decoded.duration
    const source = web.createBufferSource()
    source.buffer = decoded
    const gain = web.createGain()
    source.connect(gain)
    gain.connect(web.destination)
    // El fundido de 50 ms va al final del tramo que queda por sonar (al reanudar, el resto del clip).
    const remaining = Math.max(duration - offset, 0)
    const fadeStart = Math.max(startTime, startTime + remaining - FADE_OUT_SECONDS)
    gain.gain.setValueAtTime(1, startTime)
    gain.gain.setValueAtTime(1, fadeStart)
    gain.gain.linearRampToValueAtTime(0, startTime + remaining)
    const entry: ActiveSource = { source, gain, startTime, offset, duration }
    source.onended = () => {
      if (active === entry) {
        active = null
        heldPosition = duration
        resumeOffset = 0
        markEnded()
      }
    }
    active = entry
    if (offset > 0) source.start(startTime, offset)
    else source.start(startTime)
  }

  return {
    prepare(clipUrl, attemptKey) {
      if (attemptKey === preparedKey && preparing) return preparing
      preparedKey = attemptKey
      const job = prepareClip(clipUrl, attemptKey)
      preparing = job
      job.catch(() => {
        if (preparedKey === attemptKey) {
          preparedKey = null
          preparing = null
        }
      })
      return job
    },

    play() {
      if (disposed) return
      // Si ya sonaba, play() reinicia desde 0; si estaba en pausa, continua desde donde quedo.
      const resumeFrom = playing ? 0 : resumeOffset
      resumeOffset = 0
      let startPosition = 0
      if (mode === 'buffer' && buffer && context) {
        startPosition = resumeFrom < buffer.duration - FADE_OUT_SECONDS ? resumeFrom : 0
        playBuffer(context, buffer, startPosition)
      } else if (mode === 'element') {
        if (playing || !elementResumable) audio.currentTime = 0
        startPosition = audio.currentTime
        elementResumable = false
        // Si el navegador rechaza la reproduccion no hay 'pause': se cierra aqui para no animar sin fin.
        void audio.play()?.catch(() => markEnded())
      } else {
        return
      }
      playing = true
      emit({ playing: true, positionSec: startPosition })
      scheduleFrame()
    },

    pause() {
      if (!playing) return
      if (mode === 'buffer') {
        if (context) fadeOutActiveSource(context)
        resumeOffset = heldPosition
      } else {
        elementResumable = true
        audio.pause()
      }
      markEnded()
    },

    stop() {
      resumeOffset = 0
      elementResumable = false
      if (mode === 'buffer') {
        detachActiveSource()
        heldPosition = 0
      } else audio.pause()
      markEnded()
    },

    subscribe(listener) {
      listeners.add(listener)
      scheduleFrame()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) cancelPendingFrame()
      }
    },

    dispose() {
      disposed = true
      playing = false
      cancelPendingFrame()
      detachActiveSource()
      audio.pause()
      listeners.clear()
      releaseObjectUrl()
      if (context && !contextClosed) {
        contextClosed = true
        context.removeEventListener?.('statechange', onContextStateChange)
        void context.close().catch(() => {})
      }
      preparedKey = null
      preparing = null
    },
  }
}
