import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HintSettings } from "../storage/store";
import { CheckIcon, CrossIcon, GearIcon } from "./icons";

interface SettingsPanelProps {
  settings: HintSettings;
  onChange(next: HintSettings): void;
}

const FOCUSABLE = 'button:not([disabled]), [role="switch"]:not([disabled])';

interface SwitchRowProps {
  label: string;
  description: string;
  checked: boolean;
  onToggle(): void;
}

function SwitchRow({ label, description, checked, onToggle }: SwitchRowProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className="dex-screen flex items-center gap-3 rounded-xl border-4 border-edge px-4 py-3.5 lg:px-[18px] lg:py-4">
      <div className="flex-1">
        <div id={labelId} className="text-[15px] font-semibold">
          {label}
        </div>
        <div
          id={descriptionId}
          className="mt-1 text-sm leading-snug text-screen-dim"
        >
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
        className={`flex min-h-11 min-w-[8.5rem] items-center justify-center gap-1.5 rounded-full border-[3px] border-edge px-3 text-sm font-bold ${
          checked ? "bg-hit text-white" : "bg-locked-bar text-screen-ink"
        }`}
      >
        {checked ? <CheckIcon /> : <CrossIcon />}
        <span aria-hidden="true">{checked ? "Activada" : "Desactivada"}</span>
      </button>
    </div>
  );
}

/** Engranaje y dialogo modal de ajustes (DEC-52). Controlado: los cambios se aplican al instante, cerrar no confirma nada. */
export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = () => {
    setIsOpen(false);
    gearRef.current?.focus();
  };

  useEffect(() => {
    if (isOpen)
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [isOpen]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={gearRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border-[3px] border-edge bg-dex-yellow px-4 text-sm font-bold text-ink hover:brightness-105 shadow-[0_4px_0_var(--edge)] lg:min-h-12 lg:text-base"
      >
        <GearIcon />
        Pistas
      </button>
      {/* Portal: la tecla vive en una zona de la Pokedex con su propio apilamiento; el dialogo debe quedar por encima de todo. */}
      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onKeyDown={handleKeyDown}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="dex-page flex w-full max-w-[560px] flex-col gap-3 rounded-[22px] p-4 text-screen-ink shadow-[0_20px_40px_rgba(0,0,0,0.5)] lg:p-[22px]"
            >
              <h2
                id={titleId}
                className="m-0 mb-1 flex items-center gap-3.5 font-display text-[26px] text-white lg:text-[30px]"
              >
                <span
                  aria-hidden="true"
                  className="dex-lens size-[34px] rounded-full border-[3px] border-edge bg-dex-yellow"
                />
                Pistas
              </h2>
              <SwitchRow
                label="Pista de consola"
                description="Tras un fallo, indica si la consola coincide con la de la canción buscada."
                checked={settings.consoleHint}
                onToggle={() =>
                  onChange({ ...settings, consoleHint: !settings.consoleHint })
                }
              />
              <SwitchRow
                label="Pista de fecha"
                description="Tras un fallo, indica si el juego buscado es anterior o posterior."
                checked={settings.dateHint}
                onToggle={() =>
                  onChange({ ...settings, dateHint: !settings.dateHint })
                }
              />
              <button
                type="button"
                onClick={close}
                className="mt-2 min-h-12 rounded-[10px] border-[3px] border-edge bg-[#f4f4f2] px-4 text-base font-bold text-ink shadow-[0_4px_0_var(--edge)]"
              >
                Cerrar
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
