import { useState } from 'react'
import type { GameView, ResultName } from '../../../shared/api'
import { FullSongEmbed } from './FullSongEmbed'
import { GameSwatch } from './GameSwatch'
import { DexScreen } from './Pokedex'
import { NextDayCountdown } from './NextDayNote'
import { MAX_ATTEMPTS } from '../../../shared/rules'
import { resultLabel } from '../game/view'

const MARK_BAR_CLASS: Record<ResultName, string> = {
  hit: 'bg-played',
  game: 'bg-near',
  miss: 'bg-miss-bar',
  skip: 'bg-skip-bar',
}

interface ResultPanelProps {
  view: GameView
  onOpenFullSong?: () => void
  onFullSongPlaybackChange?(playing: boolean): void
  /** El tablero pinta la nota del diario al final de la pagina; sueltos (tests, otros usos) la lleva el panel. */
  showNextDayNote?: boolean
  /** Volumen comun (DEC-55) para el video de la cancion completa. */
  volume?: number
  onVolumeChange?(volume: number): void
}

export function ResultPanel({ view, onOpenFullSong, onFullSongPlaybackChange, showNextDayNote = true, volume, onVolumeChange }: ResultPanelProps) {
  // Video abierto (DEC-59): va dentro de la pantalla, en el sitio del titulo grande; asi la Pokedex no crece.
  const [videoOpen, setVideoOpen] = useState(false)
  const [videoSlot, setVideoSlot] = useState<HTMLDivElement | null>(null)
  if (view.status === 'playing') return null
  const won = view.status === 'won'
  // Un registro diario antiguo puede no traer youtubeId: se muestra la solucion y no el boton.
  const youtubeId = view.solution?.youtubeId
  const firstGameId = view.solution?.games[0]?.id ?? ''
  const statusLabel = won ? (view.mode === 'daily' ? 'REGISTRADA' : 'RESUELTA') : 'SIN INTENTOS'
  const marksDescription = `Intentos: ${view.results.map((result) => resultLabel(result).toLowerCase()).join(', ')}`

  return (
    <>
      <section aria-label="Resultado" aria-live="polite" className="flex flex-col gap-4">
        <DexScreen title="RESULTADO" label={statusLabel} labelClassName={won ? 'text-played' : 'text-lost-text'}>
          <div className="flex flex-col gap-3.5 pb-1">
            <h2
              className={`m-0 font-mono text-xs font-normal tracking-[2px] lg:text-sm lg:tracking-[3px] ${won ? 'text-played' : 'text-lost-text'} ${videoOpen ? 'sr-only' : ''}`}
            >
              {won ? `¡ACERTASTE EN EL INTENTO ${view.attempt}!` : '¡LA CANCIÓN SE ESCAPÓ!'}
            </h2>
            {/* Con el video abierto, la solucion sigue a la vista en una linea (RQ 8) y el video ocupa el resto. */}
            {view.solution && videoOpen && (
              <div className="flex min-w-0 items-center gap-2.5">
                <GameSwatch gameId={firstGameId} />
                <span className="font-display truncate text-xl leading-tight text-white lg:text-2xl">{view.solution.title}</span>
                <span className="truncate text-[13px] text-screen-dim lg:text-sm">{view.solution.games.map((game) => game.name).join(' · ')}</span>
              </div>
            )}
            {/* El hueco existe desde el principio: si apareciera al abrir, el iframe se crearia dos veces. */}
            <div ref={setVideoSlot} className={videoOpen ? 'mx-auto w-full lg:max-w-[360px]' : 'hidden'} />
            {view.solution && !videoOpen && (
              <div className="flex flex-col gap-2">
                {!won && <span className="text-[13px] text-screen-dim">Era…</span>}
                <span className="font-display text-[34px] leading-[1.05] text-balance text-white lg:text-[52px]">{view.solution.title}</span>
                <span className="mt-1 inline-flex items-center gap-2.5 self-start rounded-lg bg-track px-3.5 py-2 text-[13px] lg:text-[15px]">
                  <GameSwatch gameId={firstGameId} />
                  {view.solution.games.map((game) => game.name).join(' · ')}
                </span>
              </div>
            )}
            <div role="img" aria-label={marksDescription} className={`mt-1 flex gap-2 ${videoOpen ? 'hidden' : ''}`}>
              {Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
                const result = view.results[index]
                return <span key={index} className={`h-3 w-10 rounded-md lg:w-14 ${result ? MARK_BAR_CLASS[result] : 'bg-track'}`} />
              })}
            </div>
          </div>
        </DexScreen>
        {youtubeId && (
          <FullSongEmbed
            key={youtubeId}
            youtubeId={youtubeId}
            onOpen={() => {
              setVideoOpen(true)
              onOpenFullSong?.()
            }}
            onPlaybackChange={won ? onFullSongPlaybackChange : undefined}
            volume={volume}
            onVolumeChange={onVolumeChange}
            frameTarget={videoSlot}
          />
        )}
      </section>
      {showNextDayNote && view.mode === 'daily' && <NextDayCountdown />}
    </>
  )
}
