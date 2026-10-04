import type { AdminGame } from '../api'
import type { SongFilters } from '../filters'

const controlClass = 'min-h-10 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900'

export function FilterBar({ games, filters, onChange }: { games: AdminGame[]; filters: SongFilters; onChange(filters: SongFilters): void }) {
  const update = (patch: Partial<SongFilters>) => onChange({ ...filters, ...patch })
  return (
    <section aria-label="Filtros" className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">
      <label className="grid gap-1 text-sm">
        <span>Juego</span>
        <select className={controlClass} value={filters.gameId ?? ''} onChange={(event) => update({ gameId: event.target.value || null })}>
          <option value="">Todos</option>
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {game.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>Estado</span>
        <select className={controlClass} value={filters.enabled ?? 'all'} onChange={(event) => update({ enabled: event.target.value as SongFilters['enabled'] })}>
          <option value="all">Todas</option>
          <option value="enabled">Activadas</option>
          <option value="disabled">Desactivadas</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span>Revisión</span>
        <select className={controlClass} value={filters.reviewed ?? 'all'} onChange={(event) => update({ reviewed: event.target.value as SongFilters['reviewed'] })}>
          <option value="all">Todas</option>
          <option value="reviewed">Revisadas</option>
          <option value="pending">Pendientes</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm sm:col-span-3">
        <span>Buscar</span>
        <input className={controlClass} value={filters.text ?? ''} placeholder="Título, juego o vídeo original" onChange={(event) => update({ text: event.target.value })} />
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={filters.onlyTooShort ?? false} onChange={(event) => update({ onlyTooShort: event.target.checked })} />
        Solo cortas
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={filters.onlyErrors ?? false} onChange={(event) => update({ onlyErrors: event.target.checked })} />
        Solo con errores
      </label>
    </section>
  )
}
