import { ClipProgressBar } from './ClipProgressBar'
import { DexScreen } from './Pokedex'
import { PauseIcon, PlayIcon, SkipIcon, SpinnerIcon } from './icons'
import { VolumeControl } from './VolumeControl'
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
  /** Volumen comun (DEC-55); sin `onVolumeChange` no se pinta el deslizador. */
  volume?: number
  onVolumeChange?(volume: number): void
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
    <section aria-label="Reproductor" className="flex flex-col gap-4">
      <DexScreen title="REPRODUCTOR" label={`INTENTO ${props.attempt + 1}/${props.maxAttempts}`}>
        <Waveform peaks={props.peaks} unlockedSec={unlockedSec} positionSec={props.positionSec} />
        <ClipProgressBar clipSeconds={props.clipSeconds} unlockedSec={unlockedSec} positionSec={props.positionSec} playing={playing} />
        <div className="flex justify-between font-mono text-xs text-screen-dim lg:text-[13px]">
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
      </DexScreen>

      <div className="flex items-center gap-4 lg:gap-[22px]">
        <DPad />
        <button
          type="button"
          disabled={props.skipDisabled}
          onClick={props.onSkip}
          className="flex min-h-11 items-center gap-2 rounded-[10px] border-[3px] border-edge bg-hit px-4 text-[15px] font-bold text-white hover:brightness-110 shadow-[0_4px_0_var(--edge)] disabled:opacity-50 lg:min-h-12 lg:px-[18px] lg:text-[17px]"
        >
          <SkipIcon />
          {nextSeconds ? `Saltar +${nextSeconds - unlockedSec} s` : 'Saltar (último intento)'}
        </button>
        <button
          type="button"
          aria-label={playLabel}
          disabled={audioStatus !== 'ready'}
          onClick={props.onTogglePlay}
          className="ml-auto flex size-[76px] flex-none items-center justify-center rounded-full border-4 border-edge bg-dex-blue text-white shadow-[0_6px_0_var(--edge)] hover:brightness-110 disabled:opacity-60 lg:size-[92px]"
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

      {props.onVolumeChange && (
        <div className="flex items-center gap-3">
          <SpeakerGrill />
          <div className="min-w-0 flex-1">
            <VolumeControl volume={props.volume ?? 1} onChange={props.onVolumeChange} />
          </div>
        </div>
      )}

      {audioStatus === 'error' && (
        <button
          type="button"
          className="min-h-11 rounded-[10px] border-[3px] border-edge bg-dex-deep px-3 text-sm font-semibold text-dex-text"
          onClick={props.onRetryAudio}
        >
          No se pudo cargar el audio. Reintentar
        </button>
      )}
    </section>
  )
}

/** Cruceta decorativa de la carcasa (solo escritorio). */
function DPad() {
  return (
    <span aria-hidden="true" className="relative hidden size-24 flex-none lg:block">
      <span className="absolute inset-x-0 top-8 h-8 rounded-md border-[3px] border-edge bg-[#26282d]" />
      <span className="absolute inset-y-0 left-8 w-8 rounded-md border-[3px] border-edge bg-[#26282d]" />
      <span className="absolute left-[35px] top-[35px] size-[26px] bg-[#26282d]" />
    </span>
  )
}

/** Rejilla del altavoz junto al volumen (solo escritorio). */
function SpeakerGrill() {
  return (
    <span aria-hidden="true" className="hidden grid-cols-6 gap-1.5 lg:grid">
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} className="size-2 rounded-full border border-[#5a0f09] bg-dex-deep" />
      ))}
    </span>
  )
}
