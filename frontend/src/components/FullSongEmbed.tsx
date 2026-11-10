import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PlayIcon } from './icons'
import { VolumeControl } from './VolumeControl'

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const EMBED_ORIGIN = 'https://www.youtube-nocookie.com'
const EMBED_PREFIX = `${EMBED_ORIGIN}/embed/`
/** `enablejsapi=1` permite fijar el volumen del video con postMessage, sin cargar el script de la IFrame API (DEC-55). */
const EMBED_QUERY = '?enablejsapi=1'
const YOUTUBE_PLAYING = 1

interface FullSongEmbedProps {
  youtubeId: string
  onOpen?: () => void
  onPlaybackChange?(playing: boolean): void
  /** Volumen comun (DEC-55), de 0 a 1; sin `onVolumeChange` no se pinta el deslizador ni se toca el volumen del video. */
  volume?: number
  onVolumeChange?(volume: number): void
  /**
   * Hueco dentro de la pantalla del resultado donde va el video al abrirlo (DEC-60/59): asi la Pokedex no crece y el
   * volumen ocupa el sitio del boton. Sin hueco (uso suelto, tests), el video va aqui mismo.
   */
  frameTarget?: HTMLElement | null
}

/**
 * Cancion completa de YouTube (DEC-41). El iframe NO existe hasta pulsar el boton: asi no hay peticiones a
 * YouTube al terminar ni al reabrir un diario terminado. El id se valida antes de construir la URL.
 */
export function FullSongEmbed({ youtubeId, onOpen, onPlaybackChange, volume = 1, onVolumeChange, frameTarget }: FullSongEmbedProps) {
  const [opened, setOpened] = useState(false)
  const frameBox = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const controlsVolume = onVolumeChange !== undefined
  const usesPlayerApi = controlsVolume || onPlaybackChange !== undefined
  const ready = useRef(false)
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  // El boton desaparece al pulsarlo: se lleva el foco al contenedor para no perderlo (teclado y lectores).
  useEffect(() => {
    if (opened) frameBox.current?.focus()
  }, [opened])

  const sendVolume = () => {
    if (!controlsVolume) return
    const message = { event: 'command', func: 'setVolume', args: [Math.round(volumeRef.current * 100)] }
    frame.current?.contentWindow?.postMessage(JSON.stringify(message), EMBED_ORIGIN)
  }
  useEffect(sendVolume, [volume, controlsVolume])
  // El reproductor de YouTube ignora las ordenes hasta estar listo: se repite el volumen con cada mensaje suyo
  // (el primero llega al terminar de cargar) hasta que confirma estar listo.
  useEffect(() => {
    if (!opened || !usesPlayerApi) return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== EMBED_ORIGIN || event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return
      let message: { event?: string; data?: unknown; info?: { playerState?: unknown } } | null
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (!message || typeof message !== 'object') return
      if (!ready.current) {
        ready.current = message.event === 'onReady'
        sendVolume()
      }
      // El iframe también incluye el estado en las actualizaciones que envía tras "listening".
      const state = message.event === 'onStateChange' ? message.data
        : message.event === 'infoDelivery' || message.event === 'initialDelivery' ? message.info?.playerState
        : undefined
      if (typeof state === 'number') onPlaybackChange?.(state === YOUTUBE_PLAYING)
      if (message.event === 'onError') onPlaybackChange?.(false)
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      onPlaybackChange?.(false)
    }
    // sendVolume lee el volumen de volumeRef: no hace falta volver a suscribirse al cambiarlo
  }, [opened, usesPlayerApi, controlsVolume, onPlaybackChange])
  // Sin este aviso el reproductor no manda eventos al padre.
  const startListening = () => {
    if (!usesPlayerApi) return
    ready.current = false
    onPlaybackChange?.(false)
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), EMBED_ORIGIN)
    if (onPlaybackChange) {
      for (const event of ['onStateChange', 'onError']) {
        const message = { event: 'command', func: 'addEventListener', args: [event] }
        frame.current?.contentWindow?.postMessage(JSON.stringify(message), EMBED_ORIGIN)
      }
    }
    sendVolume()
  }

  if (!YOUTUBE_ID_PATTERN.test(youtubeId)) return null

  if (opened) {
    const frameElement = (
        <div
          ref={frameBox}
          tabIndex={-1}
          className={`aspect-video w-full overflow-hidden outline-none ${frameTarget ? 'rounded-md border-2 border-track' : 'rounded-xl border-4 border-edge'}`}
        >
          <iframe
            ref={frame}
            src={`${EMBED_PREFIX}${youtubeId}${usesPlayerApi ? EMBED_QUERY : ''}`}
            title="Canción completa en YouTube"
            className="h-full w-full"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={startListening}
          />
        </div>
    )
    if (frameTarget) {
      return (
        <>
          {createPortal(frameElement, frameTarget)}
          {/* Mismo alto que el boton al que sustituye. */}
          <div className="flex min-h-14 items-center lg:min-h-[68px]">
            {onVolumeChange && (
              <div className="w-full">
                <VolumeControl volume={volume} onChange={onVolumeChange} />
              </div>
            )}
          </div>
        </>
      )
    }
    return (
      <div className="flex flex-col gap-2">
        {frameElement}
        {onVolumeChange && <VolumeControl volume={volume} onChange={onVolumeChange} />}
      </div>
    )
  }
  return (
    <button
      type="button"
      className="flex min-h-14 items-center justify-center gap-3 rounded-2xl border-4 border-edge bg-dex-blue px-4 text-[17px] font-bold text-white hover:brightness-110 shadow-[0_6px_0_var(--edge)] lg:min-h-[68px] lg:text-xl"
      onClick={() => {
        setOpened(true)
        onOpen?.()
      }}
    >
      <PlayIcon size={20} />
      Escuchar la canción completa
    </button>
  )
}
