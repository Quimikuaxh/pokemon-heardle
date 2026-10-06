import { ClipProgressBar } from './ClipProgressBar'
import { Lamps, SHELL_CLASS } from './Lamps'
import { PauseIcon, PlayIcon, SkipIcon, SpinnerIcon } from './icons'
import { Waveform } from './Waveform'
import { formatClock } from '../game/format'

export type AudioStatus = 'loading' | 'ready' | 'error'

interface PlayerProps {
  attempt: number
  maxAttempts: number
  clipSeconds: readonly number[]
  unlockedSec: number
  nextSeconds: number | undefined
  positionSec: number
  playing: boolean
  audioStatus: AudioStatus
  peaks: Array<number | null> | null
  skipDisabled: boolean
  onTogglePlay(): void
  onSkip(): void
  onRetryAudio(): void
}

/** Reproductor tipo Pokedex: carcasa con lente y luces, pantalla con la onda, barra segmentada y controles. */
export function Player(props: PlayerProps) {
  const { audioStatus, playing, nextSeconds } = props
  const unlockedSec = Number.isFinite(props.unlockedSec) ? props.unlockedSec : 0
  // Pausado a mitad de clip el boton dice "Reanudar"; en 0 (o tras acabar) "Reproducir N s", como en ClipPlayer (< 50 ms del final reinicia).
  const isPausedMidClip = !playing && props.positionSec > 0 && props.positionSec < unlockedSec - 0.05
  const playLabel =
    audioStatus === 'loading' ? 'Cargando audio...' : playing ? 'Pausar' : isPausedMidClip ? 'Reanudar' : `Reproducir ${unlockedSec} s`

  return (
    <section aria-label="Reproductor" className={SHELL_CLASS}>
      <Lamps label={`INTENTO ${props.attempt + 1}/${props.maxAttempts}`} />

      <div className="flex flex-col gap-2.5 rounded-md border-2 border-edge bg-screen px-3 pb-2.5 pt-3.5 lg:gap-3 lg:px-3.5 lg:pb-3 lg:pt-4">
        <Waveform peaks={props.peaks} unlockedSec={unlockedSec} positionSec={props.positionSec} />
        <ClipProgressBar clipSeconds={props.clipSeconds} unlockedSec={unlockedSec} positionSec={props.positionSec} playing={playing} />
        <div className="flex justify-between font-mono text-xs text-screen-dim">
          <span className="text-screen-ink">
            {formatClock(props.positionSec)} / {formatClock(unlockedSec)}
          </span>
          <span aria-hidden="true">
            {props.clipSeconds.map((seconds, index) => (
              <span key={seconds} className={seconds === unlockedSec ? 'text-screen-ink' : undefined}>
                {index > 0 && ' · '}
                {seconds}
              </span>
            ))}{' '}
            s
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          disabled={props.skipDisabled}
          onClick={props.onSkip}
          className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-edge bg-chip px-4 text-sm font-semibold text-ink disabled:opacity-40"
        >
          <SkipIcon />
          {nextSeconds ? `Saltar +${nextSeconds - unlockedSec} s` : 'Saltar (último intento)'}
        </button>
        <button
          type="button"
          aria-label={playLabel}
          disabled={audioStatus !== 'ready'}
          onClick={props.onTogglePlay}
          className="flex size-[76px] items-center justify-center rounded-full border-[3px] border-edge bg-lamp-red text-white shadow-[0_4px_0_var(--edge)] disabled:opacity-60 lg:size-20"
        >
          {audioStatus === 'loading' ? (
            <SpinnerIcon className="animate-spin motion-reduce:animate-none" />
          ) : playing ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </button>
      </div>

      {audioStatus === 'error' && (
        <button
          type="button"
          className="min-h-11 rounded-lg border-2 border-miss px-3 text-sm font-semibold text-ink"
          onClick={props.onRetryAudio}
        >
          No se pudo cargar el audio. Reintentar
        </button>
      )}
    </section>
  )
}
