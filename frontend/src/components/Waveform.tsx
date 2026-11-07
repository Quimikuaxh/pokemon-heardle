import { WAVEFORM_BARS, WAVEFORM_SCALE_SECONDS } from '../audio/waveform'

interface WaveformProps {
  /** Picos 0..1 por barra del audio desbloqueado (null en las barras bloqueadas); null = sin datos (<audio>). */
  peaks: Array<number | null> | null
  unlockedSec: number
  positionSec: number
}

const MIN_BAR_PERCENT = 12
const NEUTRAL_BAR_PERCENT = 20

/** Forma de onda real del intento actual. Sin datos, barras planas: nunca se inventa una forma. */
export function Waveform({ peaks, unlockedSec, positionSec }: WaveformProps) {
  return (
    <div aria-hidden="true" data-waveform={peaks ? 'real' : 'neutral'} className="flex h-20 items-center gap-0.5 lg:h-[120px] lg:gap-[3px]">
      {Array.from({ length: WAVEFORM_BARS }, (_, bar) => {
        const centerSec = ((bar + 0.5) * WAVEFORM_SCALE_SECONDS) / WAVEFORM_BARS
        const locked = centerSec > unlockedSec
        const peak = peaks?.[bar]
        const height = locked ? MIN_BAR_PERCENT : peak == null ? NEUTRAL_BAR_PERCENT : MIN_BAR_PERCENT + peak * (100 - MIN_BAR_PERCENT)
        const color = locked ? 'bg-locked-bar' : centerSec <= positionSec ? 'bg-played' : peaks ? 'bg-screen-ink' : 'bg-unlocked'
        return <span key={bar} data-bar={bar} className={`min-w-0 flex-1 rounded-[1px] ${color}`} style={{ height: `${Math.round(height)}%` }} />
      })}
    </div>
  )
}
