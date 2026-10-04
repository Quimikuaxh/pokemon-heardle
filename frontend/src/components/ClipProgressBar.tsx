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
      className="relative h-6 w-full overflow-hidden rounded-md border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
    >
      <div
        data-zone="unlocked"
        data-locked="false"
        className="absolute inset-y-0 bg-indigo-200 dark:bg-indigo-900"
        style={{ left: '0%', width: percent(unlocked) }}
      />
      <div
        data-zone="locked"
        data-locked="true"
        className="absolute inset-y-0 bg-slate-300/60 dark:bg-slate-700/60"
        style={{ left: percent(unlocked), width: percent(SCALE_SECONDS - unlocked) }}
      />
      {clipSeconds.map((seconds) => (
        <div
          key={seconds}
          data-mark={seconds}
          className="absolute inset-y-0 w-px bg-slate-500 dark:bg-slate-400"
          style={{ left: percent(seconds) }}
        />
      ))}
      <div data-playhead className="absolute inset-y-0 w-0.5 bg-indigo-600 dark:bg-indigo-300" style={{ left: percent(position) }} />
    </div>
  )
}
