interface FilterPanelProps {
  games: Array<{ id: string; name: string }>
  selected: string[]
  onChange(ids: string[]): void
  onStart(): void
}

export function FilterPanel({ games, selected, onChange, onStart }: FilterPanelProps) {
  const isEmpty = selected.length === 0

  const toggle = (gameId: string) =>
    onChange(selected.includes(gameId) ? selected.filter((id) => id !== gameId) : [...selected, gameId])

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-1 text-lg font-semibold">Partida libre</h2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Elige de qué juegos puede salir la canción. El filtro se guarda en este navegador.
      </p>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-600"
          onClick={() => onChange(games.map((game) => game.id))}
        >
          Todos
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-600"
          onClick={() => onChange([])}
        >
          Ninguno
        </button>
      </div>
      <ul className="mb-3 grid gap-1 sm:grid-cols-2">
        {games.map((game) => (
          <li key={game.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-slate-100 dark:hover:bg-slate-700">
              <input
                type="checkbox"
                className="h-5 w-5 accent-indigo-600"
                checked={selected.includes(game.id)}
                onChange={() => toggle(game.id)}
              />
              <span>{game.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {isEmpty && (
        <p role="alert" className="mb-3 text-sm font-medium text-amber-700 dark:text-amber-300">
          Elige al menos un juego para poder empezar.
        </p>
      )}
      <button
        type="button"
        disabled={isEmpty}
        onClick={() => {
          if (!isEmpty) onStart()
        }}
        className="min-h-11 w-full rounded-lg bg-indigo-600 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Empezar partida
      </button>
    </section>
  )
}
