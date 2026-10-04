import { ApiError } from '../api/client'

export interface ClipPlayerDeps {
  fetchClip(clipUrl: string): Promise<Blob>
  /** Pide una URL de clip nueva (el ticket anterior caduco o ya se uso). */
  refreshClipUrl(): Promise<string>
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
  createAudio(): HTMLAudioElement
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
  /** Sincrono: debe ejecutarse dentro del gesto del usuario (autoplay en iOS). */
  play(): void
  /** Detiene la reproduccion (p. ej. al abrir la cancion completa). */
  stop(): void
  /** Avisa de { playing, positionSec } en cada frame mientras suena y al parar o terminar. */
  subscribe(listener: (state: PlaybackState) => void): () => void
  dispose(): void
}

const TICKET_GONE_STATUSES = new Set([404, 410])

/** Descarga cada clip UNA vez a un Blob (la URL es de un solo uso) y lo reproduce desde un objectURL. */
export function createClipPlayer(deps: ClipPlayerDeps): ClipPlayer {
  const audio = deps.createAudio()
  const requestFrame = deps.requestFrame ?? ((callback) => requestAnimationFrame(callback))
  const cancelFrame = deps.cancelFrame ?? ((id) => cancelAnimationFrame(id))
  const listeners = new Set<(state: PlaybackState) => void>()
  let preparedKey: string | null = null
  let preparing: Promise<void> | null = null
  let objectUrl: string | null = null
  let playing = false
  let frameId: number | null = null

  function emit(state: PlaybackState) {
    for (const listener of [...listeners]) {
      try {
        listener(state)
      } catch {
        // un listener roto no debe afectar a los demas ni a la reproduccion
      }
    }
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
      emit({ playing: true, positionSec: audio.currentTime })
      scheduleFrame()
    })
  }

  function onPlaybackEnd() {
    playing = false
    cancelPendingFrame()
    emit({ playing: false, positionSec: audio.currentTime })
  }
  audio.addEventListener?.('pause', onPlaybackEnd)
  audio.addEventListener?.('ended', onPlaybackEnd)

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

  return {
    prepare(clipUrl, attemptKey) {
      if (attemptKey === preparedKey && preparing) return preparing
      preparedKey = attemptKey
      const job = (async () => {
        const blob = await download(clipUrl)
        if (preparedKey !== attemptKey) return
        releaseObjectUrl()
        objectUrl = deps.createObjectURL(blob)
        audio.src = objectUrl
        playing = false
        cancelPendingFrame()
        emit({ playing: false, positionSec: 0 })
      })()
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
      if (!objectUrl) return
      audio.currentTime = 0
      // Si el navegador rechaza la reproduccion no hay 'pause': se cierra aqui para no animar sin fin.
      void audio.play()?.catch(() => onPlaybackEnd())
      playing = true
      emit({ playing: true, positionSec: 0 })
      scheduleFrame()
    },

    stop() {
      audio.pause()
      playing = false
      cancelPendingFrame()
      emit({ playing: false, positionSec: audio.currentTime })
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
      playing = false
      cancelPendingFrame()
      audio.pause()
      listeners.clear()
      releaseObjectUrl()
      preparedKey = null
      preparing = null
    },
  }
}
