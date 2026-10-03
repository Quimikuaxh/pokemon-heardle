import { useState } from 'react'
import type { GameView } from '../../../shared/api'
import { buildShareText, copyToClipboard } from '../game/share'

export function ResultPanel({ view }: { view: GameView }) {
  const [copyOutcome, setCopyOutcome] = useState<'copied' | 'fallback' | null>(null)
  const won = view.status === 'won'
  const shareText = buildShareText({ mode: view.mode, date: view.date, results: view.results })

  return (
    <section
      aria-live="polite"
      className={`rounded-xl border-2 p-4 ${
        won ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950' : 'border-rose-500 bg-rose-50 dark:bg-rose-950'
      }`}
    >
      <h2 className="text-lg font-bold">{won ? `¡Acertaste en el intento ${view.attempt}!` : 'Has agotado los intentos'}</h2>
      {view.solution && (
        <p className="mt-1">
          La canción era <strong>{view.solution.title}</strong>
          <span className="block text-sm text-slate-600 dark:text-slate-300">
            {view.solution.games.map((game) => game.name).join(' · ')}
          </span>
        </p>
      )}
      <pre className="my-3 whitespace-pre-wrap font-sans text-sm">{shareText}</pre>
      <button
        type="button"
        className="min-h-11 rounded-lg bg-indigo-600 px-4 font-semibold text-white"
        onClick={async () => setCopyOutcome(await copyToClipboard(shareText))}
      >
        Compartir resultado
      </button>
      {copyOutcome === 'copied' && <p className="mt-2 text-sm">Copiado al portapapeles.</p>}
      {copyOutcome === 'fallback' && (
        <p className="mt-2 text-sm">No se pudo copiar automáticamente: selecciona y copia el texto de arriba.</p>
      )}
      {view.mode === 'daily' && (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Vuelve mañana para la siguiente canción del día.</p>
      )}
    </section>
  )
}
