/** Iconos SVG en linea (sin dependencia de iconos): todos decorativos, el nombre accesible lo pone el boton. */
interface IconProps {
  size?: number
  className?: string
}

const base = { viewBox: '0 0 24 24', 'aria-hidden': true as const, focusable: false as const }

export function SearchIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

export function PlayIcon({ size = 32, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="currentColor">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

export function PauseIcon({ size = 30, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

export function SkipIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4l10 8-10 8z" />
      <path d="M19 5v14" />
    </svg>
  )
}

export function CheckIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

export function CrossIcon({ size = 12, className, strokeWidth = 3.5 }: IconProps & { strokeWidth?: number }) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function DotIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="3.5">
      <circle cx="12" cy="12" r="6" />
    </svg>
  )
}

export function SpinnerIcon({ size = 28, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}

export function GearIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function ArrowUpIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V5M5.5 11.5L12 5l6.5 6.5" />
    </svg>
  )
}

export function ArrowDownIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v15M5.5 12.5L12 19l6.5-6.5" />
    </svg>
  )
}
