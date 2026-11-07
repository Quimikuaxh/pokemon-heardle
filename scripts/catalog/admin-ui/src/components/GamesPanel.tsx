import { useState } from 'react'
import { CONSOLES } from '../../../../../shared/rules'
import type { ConsoleName } from '../../../../../shared/rules'
import type { AdminGame, GamePatch } from '../api'

const inputClass = 'min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900'
const buttonClass = 'min-h-10 rounded-lg border border-slate-400 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40'
const OWN_GROUP = ''

interface GameRowProps {
  game: AdminGame
  games: AdminGame[]
  onPatchGame(id: string, patch: GamePatch): Promise<boolean>
  onInvalid(message: string): void
}

/**
 * Un juego puede unirse al grupo de otro solo si no es cabeza de nadie, el destino debe ser cabeza (DEC-54) y de la
 * misma serie (DEC-60).
 */
function groupOptions(game: AdminGame, games: AdminGame[]): AdminGame[] {
  const isHeadOfOthers = games.some((other) => other.id !== game.id && other.selectionGroup === game.id)
  if (isHeadOfOthers) return []
  return games.filter((other) => other.id !== game.id && other.selectionGroup === other.id && other.series === game.series)
}

function GameRow({ game, games, onPatchGame, onInvalid }: GameRowProps) {
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [consolesDraft, setConsolesDraft] = useState<ConsoleName[] | null>(null)
  const name = nameDraft ?? game.name
  const selectedConsoles = consolesDraft ?? game.consoles
  const currentGroup = game.selectionGroup === game.id ? OWN_GROUP : game.selectionGroup

  const toggleConsole = (consoleName: ConsoleName) =>
    setConsolesDraft(selectedConsoles.includes(consoleName) ? selectedConsoles.filter((c) => c !== consoleName) : [...selectedConsoles, consoleName])

  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
      <input aria-label={`Nombre del juego ${game.id}`} className={inputClass} value={name} onChange={(event) => setNameDraft(event.target.value)} />
      <button
        type="button"
        aria-label={`Renombrar ${game.id}`}
        className={buttonClass}
        onClick={async () => {
          if (name.trim() === '') return onInvalid('El nombre del juego no puede estar vacío.')
          if (await onPatchGame(game.id, { name: name.trim() })) setNameDraft(null)
        }}
      >
        Renombrar
      </button>
      <span className="text-sm text-slate-600 dark:text-slate-300">{game.songCount} en este juego</span>
      {game.consoles.length === 0 &&
        (game.missingConsoles ? (
          <strong className="text-sm text-amber-700 dark:text-amber-300">Sin consola</strong>
        ) : (
          <span className="text-sm text-slate-600 dark:text-slate-300">Sin consola</span>
        ))}

      <div role="group" aria-label={`Consolas del juego ${game.id}`} className="flex basis-full flex-wrap items-center gap-x-4 gap-y-1">
        {CONSOLES.map((consoleName) => (
          <label key={consoleName} className="flex min-h-8 items-center gap-2 text-sm">
            <input type="checkbox" checked={selectedConsoles.includes(consoleName)} onChange={() => toggleConsole(consoleName)} />
            {consoleName}
          </label>
        ))}
        <button
          type="button"
          aria-label={`Guardar consolas ${game.id}`}
          className={buttonClass}
          disabled={selectedConsoles.length === 0}
          onClick={async () => {
            // Se descarta el borrador con o sin exito: tras un error las casillas vuelven al estado del servidor.
            await onPatchGame(game.id, { consoles: CONSOLES.filter((c) => selectedConsoles.includes(c)) })
            setConsolesDraft(null)
          }}
        >
          Guardar consolas
        </button>
      </div>

      <label className="flex basis-full flex-wrap items-center gap-2 text-sm">
        Serie
        <select
          aria-label={`Serie ${game.id}`}
          className={inputClass}
          value={game.series}
          onChange={(event) => void onPatchGame(game.id, { series: event.target.value as AdminGame['series'] })}
        >
          <option value="main">Principal</option>
          <option value="spinoff">Spin-off</option>
        </select>
      </label>

      <label className="flex basis-full flex-wrap items-center gap-2 text-sm">
        Grupo de selección
        <select
          aria-label={`Grupo de selección ${game.id}`}
          className={inputClass}
          value={currentGroup}
          onChange={(event) => void onPatchGame(game.id, { selectionGroup: event.target.value === OWN_GROUP ? null : event.target.value })}
        >
          <option value={OWN_GROUP}>Su propio grupo</option>
          {groupOptions(game, games).map((head) => (
            <option key={head.id} value={head.id}>
              {head.name}
            </option>
          ))}
        </select>
      </label>
    </li>
  )
}

export function GamesPanel(props: {
  games: AdminGame[]
  totalSongs: number
  onCreate(name: string): Promise<boolean>
  onPatchGame(id: string, patch: GamePatch): Promise<boolean>
  onInvalid(message: string): void
}) {
  const [newName, setNewName] = useState('')
  return (
    <section aria-label="Juegos" className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <h2 className="mb-1 text-lg font-semibold">Juegos</h2>
      <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">{props.totalSongs} canciones</p>
      <ul className="mb-3 grid gap-2">
        {props.games.map((game) => (
          <GameRow key={game.id} game={game} games={props.games} onPatchGame={props.onPatchGame} onInvalid={props.onInvalid} />
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
