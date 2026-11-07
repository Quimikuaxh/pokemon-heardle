import { VolumeIcon } from './icons'

interface VolumeControlProps {
  /** De 0 a 1. */
  volume: number
  onChange(volume: number): void
}

/** Deslizador de volumen comun al clip y al video de YouTube (DEC-55): el mismo valor en el reproductor y bajo el video. */
export function VolumeControl({ volume, onChange }: VolumeControlProps) {
  const percent = Math.round(volume * 100)
  return (
    <label className="flex min-h-11 items-center gap-2.5 px-1 text-dex-text">
      <VolumeIcon muted={percent === 0} />
      <span className="sr-only">Volumen</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-valuetext={`${percent} %`}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="h-11 flex-1 cursor-pointer accent-dex-yellow"
      />
      <span aria-hidden="true" className="w-10 text-right font-mono text-xs text-dex-text">
        {percent}%
      </span>
    </label>
  )
}
