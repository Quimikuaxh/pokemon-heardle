import { ApiError } from '../api/client'

export interface ClipPlayerDeps {
  fetchClip(clipUrl: string): Promise<Blob>
  /** Pide una URL de clip nueva (el ticket anterior caduco o ya se uso). */
  refreshClipUrl(): Promise<string>
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
  createAudio(): HTMLAudioElement
}

export interface ClipPlayer {
  prepare(clipUrl: string, attemptKey: string): Promise<void>
  /** Sincrono: debe ejecutarse dentro del gesto del usuario (autoplay en iOS). */
  play(): void
  dispose(): void
}

const TICKET_GONE_STATUSES = new Set([404, 410])

/** Descarga cada clip UNA vez a un Blob (la URL es de un solo uso) y lo reproduce desde un objectURL. */
export function createClipPlayer(deps: ClipPlayerDeps): ClipPlayer {
  const audio = deps.createAudio()
  let preparedKey: string | null = null
  let preparing: Promise<void> | null = null
  let objectUrl: string | null = null

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
      void audio.play()?.catch(() => {})
    },

    dispose() {
      audio.pause()
      releaseObjectUrl()
      preparedKey = null
      preparing = null
    },
  }
}
