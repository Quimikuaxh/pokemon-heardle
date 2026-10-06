import { useEffect, useRef, useState } from 'react'
import { PlayIcon } from './icons'

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const EMBED_PREFIX = 'https://www.youtube-nocookie.com/embed/'

/**
 * Cancion completa de YouTube (DEC-41). El iframe NO existe hasta pulsar el boton: asi no hay peticiones a
 * YouTube al terminar ni al reabrir un diario terminado. El id se valida antes de construir la URL.
 */
export function FullSongEmbed({ youtubeId, onOpen }: { youtubeId: string; onOpen?: () => void }) {
  const [opened, setOpened] = useState(false)
  const frameBox = useRef<HTMLDivElement>(null)
  // El boton desaparece al pulsarlo: se lleva el foco al contenedor para no perderlo (teclado y lectores).
  useEffect(() => {
    if (opened) frameBox.current?.focus()
  }, [opened])
  if (!YOUTUBE_ID_PATTERN.test(youtubeId)) return null

  if (opened) {
    return (
      <div ref={frameBox} tabIndex={-1} className="aspect-video w-full overflow-hidden rounded-lg border-2 border-edge outline-none">
        <iframe
          src={`${EMBED_PREFIX}${youtubeId}`}
          title="Canción completa en YouTube"
          className="h-full w-full"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    )
  }
  return (
    <button
      type="button"
      className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-[26px] border-[3px] border-edge bg-lamp-red px-4 text-base font-semibold text-white shadow-[0_4px_0_var(--edge)]"
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
