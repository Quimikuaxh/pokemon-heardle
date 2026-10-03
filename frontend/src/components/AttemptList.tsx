import type { GameView, PublicCatalog } from '../../../shared/api'
import { MAX_ATTEMPTS } from '../../../shared/rules'
import { resultLabel } from '../game/view'

const ROW_STYLE: Record<string, string> = {
  hit: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950',
  game: 'border-amber-500 bg-amber-50 dark:bg-amber-950',
  miss: 'border-rose-500 bg-rose-50 dark:bg-rose-950',
  skip: 'border-slate-400 bg-slate-100 dark:bg-slate-800',
}

export function AttemptList({ view, catalog }: { view: GameView; catalog: PublicCatalog }) {
  const titles = new Map(catalog.songs.map((song) => [song.id, song.title]))
  let guessIndex = 0

  return (
    <ol className="grid gap-2" aria-label="Intentos">
      {Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
        const result = view.results[index]
        const title = result && result !== 'skip' ? titles.get(view.guesses[guessIndex++]) : undefined
        const isCurrent = view.status === 'playing' && index === view.attempt
        const style = result
          ? ROW_STYLE[result]
          : isCurrent
            ? 'border-indigo-500 bg-white dark:bg-slate-900'
            : 'border-slate-200 bg-transparent dark:border-slate-700'
        return (
          <li
            key={index}
            className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border-2 px-3 py-1 text-sm ${style}`}
          >
            <span className="min-w-0 truncate font-medium">
              {result ? (result === 'skip' ? 'Saltado' : (title ?? 'Canción')) : isCurrent ? `Intento ${index + 1}` : '—'}
            </span>
            {result && result !== 'skip' && (
              <span className="shrink-0 text-xs text-slate-600 dark:text-slate-300">{resultLabel(result)}</span>
            )}
            {!result && (
              <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{view.clipSeconds[index]} s</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
