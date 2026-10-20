import type { GameView, ResultName } from '../../../shared/api'
import { FullSongEmbed } from './FullSongEmbed'
import { GameSwatch } from './GameSwatch'
import { Lamps, SHELL_CLASS } from './Lamps'
import { NextDayNote } from './NextDayNote'
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
  /** El tablero pinta la nota del diario al final de la pagina; sueltos (tests, otros usos) la lleva el panel. */
  showNextDayNote?: boolean
  /** Volumen comun (DEC-55) para el video de la cancion completa. */
  volume?: number
  onVolumeChange?(volume: number): void
}

export function ResultPanel({ view, onOpenFullSong, showNextDayNote = true, volume, onVolumeChange }: ResultPanelProps) {
  if (view.status === 'playing') return null
  const won = view.status === 'won'
  // Un registro diario antiguo puede no traer youtubeId: se muestra la solucion y no el boton.
  const youtubeId = view.solution?.youtubeId
  const firstGameId = view.solution?.games[0]?.id ?? ''
  const statusLabel = won ? (view.mode === 'daily' ? 'REGISTRADA' : 'RESUELTA') : 'SIN INTENTOS'
  const marksDescription = `Intentos: ${view.results.map((result) => resultLabel(result).toLowerCase()).join(', ')}`

  return (
    <>
      <section aria-label="Resultado" aria-live="polite" className={SHELL_CLASS}>
        <Lamps lens={won ? 'won' : 'lost'} label={statusLabel} />
        <div className="flex flex-col gap-3.5 rounded-md border-2 border-edge bg-screen px-4 pb-4 pt-[18px] text-screen-ink">
          <h2 className={`m-0 font-mono text-xs font-normal tracking-[1px] ${won ? 'text-played' : 'text-lost-text'}`}>
            {won ? `¡ACERTASTE EN EL INTENTO ${view.attempt}!` : '¡LA CANCIÓN SE ESCAPÓ!'}
          </h2>
          {view.solution && (
            <div className="flex flex-col gap-1.5">
              {!won && <span className="text-[13px] text-screen-dim">Era…</span>}
              <span className="font-display text-[34px] leading-[1.05]">{view.solution.title}</span>
              <span className="inline-flex items-center gap-2 self-start rounded bg-track py-1 pl-2 pr-2.5 text-[13px]">
                <GameSwatch gameId={firstGameId} />
                {view.solution.games.map((game) => game.name).join(' · ')}
              </span>
            </div>
          )}
          <div role="img" aria-label={marksDescription} className="flex gap-1.5">
            {Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
              const result = view.results[index]
              return <span key={index} className={`h-2.5 w-9 rounded-sm ${result ? MARK_BAR_CLASS[result] : 'bg-track'}`} />
            })}
          </div>
        </div>
        {youtubeId && <FullSongEmbed key={youtubeId} youtubeId={youtubeId} onOpen={onOpenFullSong} volume={volume} onVolumeChange={onVolumeChange} />}
      </section>
      {showNextDayNote && view.mode === 'daily' && <NextDayNote />}
    </>
  )
}

