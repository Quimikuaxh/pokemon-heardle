import { useEffect, useId, useRef, useState } from 'react'
import type { HintSettings } from '../storage/store'
import { CheckIcon, CrossIcon, GearIcon } from './icons'

interface SettingsPanelProps {
  settings: HintSettings
  onChange(next: HintSettings): void
}

const FOCUSABLE = 'button:not([disabled]), [role="switch"]:not([disabled])'

interface SwitchRowProps {
  label: string
  description: string
  checked: boolean
  onToggle(): void
}

function SwitchRow({ label, description, checked, onToggle }: SwitchRowProps) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div id={labelId} className="text-[15px] font-semibold">
          {label}
        </div>
        <div id={descriptionId} className="text-sm text-screen-dim">
          {description}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        onClick={onToggle}
        className={`flex min-h-11 min-w-20 items-center justify-center gap-1.5 rounded-full border-2 border-edge px-3 text-sm font-semibold ${
          checked ? 'bg-hit text-white' : 'bg-track text-screen-ink'
        }`}
      >
        {checked ? <CheckIcon /> : <CrossIcon />}
        <span aria-hidden="true">{checked ? 'Activada' : 'Desactivada'}</span>
      </button>
    </div>
  )
}

/** Engranaje y dialogo modal de ajustes (DEC-52). Controlado: los cambios se aplican al instante, cerrar no confirma nada. */
export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const gearRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  const close = () => {
    setIsOpen(false)
    gearRef.current?.focus()
  }

  useEffect(() => {
    if (isOpen) dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
  }, [isOpen])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const focusables = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <button
        ref={gearRef}
        type="button"
        aria-label="Ajustes"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="flex size-11 items-center justify-center rounded-full border-2 border-edge bg-chip text-ink"
      >
        <GearIcon />
      </button>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onKeyDown={handleKeyDown}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex w-full max-w-sm flex-col gap-4 rounded-xl border-[3px] border-edge bg-screen p-4 text-screen-ink shadow-[0_4px_0_var(--edge)]"
          >
            <h2 id={titleId} className="m-0 font-display text-xl">
              Ajustes
            </h2>
            <SwitchRow
              label="Pista de consola"
              description="Tras un fallo, indica si la consola coincide con la de la canción buscada."
              checked={settings.consoleHint}
              onToggle={() => onChange({ ...settings, consoleHint: !settings.consoleHint })}
            />
            <SwitchRow
              label="Pista de fecha"
              description="Tras un fallo, indica si el juego buscado es anterior o posterior."
              checked={settings.dateHint}
              onToggle={() => onChange({ ...settings, dateHint: !settings.dateHint })}
            />
            <button type="button" onClick={close} className="min-h-11 rounded-full border-2 border-edge bg-chip px-4 text-sm font-semibold text-ink">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
