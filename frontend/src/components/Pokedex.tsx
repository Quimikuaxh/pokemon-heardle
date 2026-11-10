import type { ReactNode } from 'react'
import { Logo } from './Logo'

export type LensColor = 'playing' | 'won' | 'lost'

const LENS_CLASS: Record<LensColor, string> = {
  // Azul profundo como la lente del anime (DEC-59); verde o rojo al terminar.
  playing: 'bg-[#2366b8]',
  won: 'bg-lamp-green',
  lost: 'bg-lamp-red',
}

/** Armazon de la Pokedex abierta (DEC-58): hojas rojas y bisagra de fondo; el contenido va en las zonas `Dex*`. */
export function PokedexShell({ children }: { children: ReactNode }) {
  return (
    <div className="dex mx-auto w-full max-w-[1480px] drop-shadow-[0_24px_40px_rgba(0,0,0,0.55)]">
      <div aria-hidden="true" className="dex-page dex-bg-left" />
      <div aria-hidden="true" className="dex-bg-hinge" />
      <div aria-hidden="true" className="dex-page dex-bg-right" />
      {children}
    </div>
  )
}

/** Cabecera de la hoja izquierda: lente (color segun el estado), tres luces, logo y subtitulo. */
export function DexTop({ lens = 'playing', subtitle, blinking = false }: { lens?: LensColor; subtitle?: string; blinking?: boolean }) {
  return (
    <div className="dex-ltop mx-1 mt-1 flex items-center gap-3 border-b-4 border-edge px-3 pb-3.5 pt-3 lg:gap-[18px] lg:px-[26px] lg:pb-4 lg:pt-4">
      <span aria-hidden="true" className="grid size-12 flex-none place-items-center rounded-full border-[3px] border-edge bg-[#f4f4f2] lg:size-[86px] lg:border-4">
        <span
          data-lens={lens}
          data-blinking={blinking || undefined}
          className={`dex-lens relative size-[34px] rounded-full border-[3px] border-edge lg:size-[62px] lg:border-4 ${LENS_CLASS[lens]}`}
        >
          {/* Durante la reproducción la lente cambia de color (DEC-59): solo cambia la opacidad de esta capa. */}
          {blinking && <span className="dex-lens-glow absolute inset-0 rounded-full" />}
        </span>
      </span>
      <span aria-hidden="true" className="flex gap-1 self-start pt-1 lg:gap-2.5 lg:pt-1.5">
        <span data-light className="size-2.5 rounded-full border-2 border-edge lg:border-[3px] bg-lamp-red lg:size-[18px]" />
        <span data-light className="size-2.5 rounded-full border-2 border-edge lg:border-[3px] bg-lamp-yellow lg:size-[18px]" />
        <span data-light className="size-2.5 rounded-full border-2 border-edge lg:border-[3px] bg-lamp-green lg:size-[18px]" />
      </span>
      <div className="ml-auto min-w-0 text-right">
        <Logo />
        {subtitle && <p className="m-0 mt-2 font-mono text-[10px] tracking-[1px] text-dex-text lg:text-[13px] lg:tracking-[2px]">{subtitle}</p>}
      </div>
    </div>
  )
}

/** Zonas de contenido de la rejilla. Controles (pistas y modo) bajo la cabecera de la hoja izquierda (DEC-59). */
export function DexControls({ children }: { children: ReactNode }) {
  return <div className="dex-rtop flex flex-wrap items-center justify-between gap-3 px-4 pb-1 pt-3.5 lg:px-[30px] lg:pt-4">{children}</div>
}

export function DexLeftBody({ children }: { children: ReactNode }) {
  return <div className="dex-lbody flex flex-col gap-4 px-4 pb-5 pt-3.5 lg:gap-4 lg:px-[30px] lg:pb-6 lg:pt-4">{children}</div>
}

export function DexRightBody({ children }: { children: ReactNode }) {
  return <div className="dex-rbody flex flex-col gap-4 px-4 pb-5 pt-4 lg:gap-4 lg:px-[30px] lg:pb-6 lg:pt-6">{children}</div>
}

/** Pantalla de la hoja izquierda: marco claro con dos puntos rojos y pantalla oscura con cabecera (titulo y lectura). */
export function DexScreen({ title, label, labelClassName = 'text-played', children }: { title: string; label: ReactNode; labelClassName?: string; children: ReactNode }) {
  return (
    <div className="rounded-[12px_12px_12px_30px] border-4 border-edge bg-bezel px-3.5 pb-3.5 pt-3 lg:rounded-[14px_14px_14px_46px] lg:px-[26px] lg:pb-[22px] lg:pt-[18px]">
      <div aria-hidden="true" className="mb-3 flex justify-center gap-3">
        <span className="size-2.5 rounded-full border-2 border-edge bg-dex" />
        <span className="size-2.5 rounded-full border-2 border-edge bg-dex" />
      </div>
      <div className="dex-screen flex flex-col gap-3 rounded-lg border-4 border-edge px-3.5 pb-3.5 pt-3 text-screen-ink lg:px-5 lg:pb-4 lg:pt-[18px]">
        <div className="flex justify-between gap-3 font-mono text-[11px] tracking-[2px] text-screen-dim lg:text-[13px]">
          <span aria-hidden="true">{title}</span>
          <span className={`font-bold ${labelClassName}`}>{label}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Pantalla de la hoja derecha: cabecera en franja (titulo y contador) y contenido. */
export function DexPanel({ title, label, children, className = '' }: { title: string; label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`dex-screen overflow-hidden rounded-[10px] border-4 border-edge text-screen-ink ${className}`}>
      <div className="flex justify-between gap-3 bg-track px-4 py-3 font-mono text-[11px] font-bold tracking-[3px] text-played lg:px-[18px] lg:text-[13px]">
        <span>{title}</span>
        <span>{label}</span>
      </div>
      {children}
    </div>
  )
}

/** Nota en franja oscura de la carcasa (cuenta atras, avisos del modo libre). */
export function DexNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-[10px] border-[3px] border-edge bg-dex-deep px-[18px] py-3 text-[15px] text-dex-text">
      {children}
    </div>
  )
}

/** Rejilla de ranuras decorativas al pie de una hoja. */
export function DexVents() {
  return (
    <div aria-hidden="true" className="hidden gap-2 lg:flex">
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className="h-2.5 flex-1 rounded-full border-2 border-edge bg-dex-deep" />
      ))}
    </div>
  )
}
