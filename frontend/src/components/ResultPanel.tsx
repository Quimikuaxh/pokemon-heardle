import type { GameView } from '../../../shared/api'
import { FullSongEmbed } from './FullSongEmbed'

export function ResultPanel({ view, onOpenFullSong }: { view: GameView; onOpenFullSong?: () => void }) {
  if (view.status === 'playing') return null
  const won = view.status === 'won'
  // Un registro diario antiguo puede no traer youtubeId: se muestra la solucion y no el boton.
  const youtubeId = view.solution?.youtubeId

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
      {youtubeId && <FullSongEmbed key={youtubeId} youtubeId={youtubeId} onOpen={onOpenFullSong} />}
      {view.mode === 'daily' && (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Vuelve mañana para la siguiente canción del día.</p>
      )}
    </section>
  )
}
