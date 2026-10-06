import { shortGameName } from '../game/gameColors'
import { GameSwatch } from './GameSwatch'
import { Lamps, SHELL_CLASS } from './Lamps'
import { PlayIcon } from './icons'

interface FilterPanelProps {
  games: Array<{ id: string; name: string }>
  selected: string[]
  onChange(ids: string[]): void
  onStart(): void
  /** Canciones del catalogo publico: con ellas se muestran los contadores por juego y el total en juego. */
  songs?: Array<{ games: string[] }>
}

const pillClass = 'min-h-11 flex-1 rounded-full border-2 border-edge bg-chip px-3 text-sm font-semibold text-ink'

export function FilterPanel({ games, selected, onChange, onStart, songs }: FilterPanelProps) {
  const isEmpty = selected.length === 0
  const selectedSet = new Set(selected)
  const counts = songs ? new Map(games.map((game) => [game.id, songs.filter((song) => song.games.includes(game.id)).length])) : null
  const songsInPlay = songs ? songs.filter((song) => song.games.some((id) => selectedSet.has(id))).length : null

  const toggle = (gameId: string) =>
    onChange(selectedSet.has(gameId) ? selected.filter((id) => id !== gameId) : [...selected, gameId])

  return (
    <div className="flex flex-col gap-3.5">
      <section aria-label="Elegir juegos" className={SHELL_CLASS}>
        <Lamps label={`${selected.length} DE ${games.length} JUEGOS`} />
        <div className="flex flex-col gap-0.5 rounded-md border-2 border-edge bg-screen p-2 text-screen-ink">
          {games.map((game) => {
            const checked = selectedSet.has(game.id)
            return (
              <label
                key={game.id}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded px-2 ${checked ? 'bg-track' : ''}`}
              >
                <input
                  type="checkbox"
                  className="m-0 size-5 accent-played"
                  checked={checked}
                  onChange={() => toggle(game.id)}
                />
                <GameSwatch gameId={game.id} />
                <span className={`flex-1 text-[15px] ${checked ? 'font-semibold' : 'text-screen-dim'}`}>{shortGameName(game.name)}</span>
                {counts && <span className="font-mono text-xs text-screen-dim">{counts.get(game.id)}</span>}
              </label>
            )
          })}
        </div>
        <div className="flex gap-2">
          <button type="button" className={pillClass} onClick={() => onChange(games.map((game) => game.id))}>
            Todos
          </button>
          <button type="button" className={pillClass} onClick={() => onChange([])}>
            Ninguno
          </button>
        </div>
        {isEmpty && (
          <p role="alert" className="m-0 text-sm font-medium text-amber-text">
            Elige al menos un juego para poder empezar.
          </p>
        )}
        <button
          type="button"
          disabled={isEmpty}
          onClick={() => {
            if (!isEmpty) onStart()
          }}
          className="flex min-h-14 items-center justify-center gap-2.5 rounded-[28px] border-[3px] border-edge bg-lamp-red px-4 text-[17px] font-semibold text-white shadow-[0_4px_0_var(--edge)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlayIcon size={20} />
          Empezar partida
        </button>
      </section>
      {songsInPlay !== null && !isEmpty && (
        <p className="m-0 text-center text-sm text-muted">{songsInPlay} canciones en juego. Puedes jugar tantas como quieras.</p>
      )}
    </div>
  )
}
