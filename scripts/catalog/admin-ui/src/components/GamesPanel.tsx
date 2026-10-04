import { useState } from 'react'
import type { AdminGame } from '../api'

const inputClass = 'min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900'
const buttonClass = 'min-h-10 rounded-lg border border-slate-400 px-3 text-sm'

function GameRow({ game, onRename, onInvalid }: { game: AdminGame; onRename(id: string, name: string): Promise<boolean>; onInvalid(message: string): void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? game.name
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input aria-label={`Nombre del juego ${game.id}`} className={inputClass} value={value} onChange={(event) => setDraft(event.target.value)} />
      <button
        type="button"
        aria-label={`Renombrar ${game.id}`}
        className={buttonClass}
        onClick={async () => {
          if (value.trim() === '') return onInvalid('El nombre del juego no puede estar vacío.')
          if (await onRename(game.id, value.trim())) setDraft(null)
        }}
      >
        Renombrar
      </button>
      <span className="text-sm text-slate-600 dark:text-slate-300">{game.songCount} en este juego</span>
    </li>
  )
}

export function GamesPanel(props: {
  games: AdminGame[]
  totalSongs: number
  onCreate(name: string): Promise<boolean>
  onRename(id: string, name: string): Promise<boolean>
  onInvalid(message: string): void
}) {
  const [newName, setNewName] = useState('')
  return (
    <section aria-label="Juegos" className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <h2 className="mb-1 text-lg font-semibold">Juegos</h2>
      <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">{props.totalSongs} canciones</p>
      <ul className="mb-3 grid gap-2">
        {props.games.map((game) => (
          <GameRow key={game.id} game={game} onRename={props.onRename} onInvalid={props.onInvalid} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Nombre del juego nuevo" className={inputClass} value={newName} onChange={(event) => setNewName(event.target.value)} />
        <button
          type="button"
          className={buttonClass}
          onClick={async () => {
            if (newName.trim() === '') return props.onInvalid('El nombre del juego no puede estar vacío.')
            if (await props.onCreate(newName.trim())) setNewName('')
          }}
        >
          Crear juego
        </button>
      </div>
    </section>
  )
}
