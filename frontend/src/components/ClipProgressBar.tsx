// Escala fija de 16 s (DEC-42): solo usa datos publicos (clipSeconds y el intento), no revela nada.
const SCALE_SECONDS = 16

interface ClipProgressBarProps {
  clipSeconds: readonly number[]
  /** Segundos desbloqueados del intento actual (clipSeconds[attempt]). */
  unlockedSec: number
  positionSec: number
  playing: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const percent = (seconds: number) => `${(seconds / SCALE_SECONDS) * 100}%`

export function ClipProgressBar({ clipSeconds, unlockedSec, positionSec, playing }: ClipProgressBarProps) {
  const unlocked = Number.isFinite(unlockedSec) ? clamp(unlockedSec, 0, SCALE_SECONDS) : 0
  const position = Number.isNaN(positionSec) ? 0 : clamp(positionSec, 0, unlocked)

  return (
    <div
      role="progressbar"
      aria-label="Progreso de la reproducción"
      aria-valuemin={0}
      aria-valuemax={unlocked}
      aria-valuenow={position}
      data-playing={String(playing)}
      className="relative h-2.5 w-full rounded-sm bg-track"
    >
      <div
        data-zone="unlocked"
        data-locked="false"
        className="absolute inset-y-0 rounded-sm bg-unlocked"
        style={{ left: '0%', width: percent(unlocked) }}
      />
      <div
        data-zone="locked"
        data-locked="true"
        className="absolute inset-y-0 rounded-sm bg-track"
        style={{ left: percent(unlocked), width: percent(SCALE_SECONDS - unlocked) }}
      />
      <div data-played className="absolute inset-y-0 left-0 rounded-sm bg-screen-ink" style={{ width: percent(position) }} />
      {clipSeconds.map((seconds) => (
        <div
          key={seconds}
          data-mark={seconds}
          className="absolute -inset-y-[3px] w-0.5 bg-screen"
          style={{ left: percent(seconds) }}
        />
      ))}
      <div data-playhead className="absolute -inset-y-px w-0.5 bg-played" style={{ left: percent(position) }} />
    </div>
  )
}
