export type LensColor = 'playing' | 'won' | 'lost'

const LENS_CLASS: Record<LensColor, string> = {
  playing: 'bg-lens',
  won: 'bg-lamp-green',
  lost: 'bg-lamp-red',
}

/** Cabecera de la carcasa tipo Pokedex: lente, tres luces y la lectura de estado a la derecha. */
export function Lamps({ lens = 'playing', label }: { lens?: LensColor; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" data-lens={lens} className={`size-[22px] rounded-full border-[3px] border-paper shadow-[0_0_0_2px_var(--edge)] lg:size-6 ${LENS_CLASS[lens]}`} />
      <span aria-hidden="true" className="size-2 rounded-full border-[1.5px] border-edge bg-lamp-red lg:size-[9px]" />
      <span aria-hidden="true" className="size-2 rounded-full border-[1.5px] border-edge bg-lamp-yellow lg:size-[9px]" />
      <span aria-hidden="true" className="size-2 rounded-full border-[1.5px] border-edge bg-lamp-green lg:size-[9px]" />
      <span className="ml-auto font-mono text-xs font-bold lg:text-[13px]">{label}</span>
    </div>
  )
}

/** Carcasa gris con la esquina inferior izquierda muy redondeada (como la maqueta). */
export const SHELL_CLASS =
  'flex flex-col gap-3 rounded-[18px_18px_18px_48px] border-2 border-edge bg-shell p-3.5 pb-[18px] lg:gap-3.5 lg:rounded-[20px_20px_20px_56px] lg:p-4 lg:pb-[22px]'
