import { useState } from 'react'
import type { AdminGame, AdminSong } from '../api'

const inputClass = 'min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900'
const buttonClass = 'min-h-10 rounded-lg border border-slate-400 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40'

const formatSeconds = (seconds: number) => seconds.toFixed(1).replace('.', ',')

interface SongRowProps {
  song: AdminSong
  games: AdminGame[]
  /** Resuelve true si el servidor acepto el cambio. */
  onPatch(patch: Record<string, unknown>): Promise<boolean>
  onInvalid(message: string): void
}

export function SongRow({ song, games, onPatch, onInvalid }: SongRowProps) {
  // Borradores locales: una recarga del catalogo no debe pisar lo que se esta escribiendo.
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  const [gameDraft, setGameDraft] = useState<string | null>(null)
  const title = titleDraft ?? song.title
  const selectedGame = gameDraft ?? song.games[0] ?? null

  return (
    <li data-song-id={song.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{song.title}</h3>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {song.enabled ? 'Activada' : 'Desactivada'} · {song.reviewed ? 'Revisada' : 'Pendiente'}
          {song.durationSec !== undefined && ` · Duración ${formatSeconds(song.durationSec)} s`}
        </p>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Vídeo original: {song.source.videoTitle}</p>
      {song.tooShort && (
        <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">Demasiado corta ({formatSeconds(song.durationSec ?? 0)} s)</p>
      )}
      {song.errors.map((message) => (
        <p key={message} className="mt-1 text-sm text-rose-700 dark:text-rose-300">
          {message}
        </p>
      ))}

      {song.hasSource ? (
        <audio controls preload="none" src={`/api/songs/${encodeURIComponent(song.id)}/audio`} className="my-2 w-full" />
      ) : (
        <p className="my-2 text-sm text-slate-500">Sin fuente descargada</p>
      )}

      <div className="mb-2 flex flex-wrap gap-2">
        <input aria-label={`Título de ${song.title}`} className={inputClass} value={title} onChange={(event) => setTitleDraft(event.target.value)} />
        <button
          type="button"
          className={buttonClass}
          onClick={async () => {
            if (title.trim() === '') return onInvalid('El título no puede estar vacío.')
            // El borrador solo se descarta si el servidor lo acepta: si falla, no se pierde lo escrito.
            if (await onPatch({ title: title.trim() })) setTitleDraft(null)
          }}
        >
          Guardar título
        </button>
      </div>

      <div role="group" aria-label="Juego" className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {games.map((game) => (
          <label key={game.id} className="flex min-h-8 items-center gap-2 text-sm">
            <input type="radio" name={`game-${song.id}`} checked={selectedGame === game.id} onChange={() => setGameDraft(game.id)} />
            {game.name}
          </label>
        ))}
        <button
          type="button"
          className={buttonClass}
          onClick={async () => {
            if (selectedGame === null) return onInvalid('Elige el juego de la canción.')
            if (await onPatch({ games: [selectedGame] })) setGameDraft(null)
          }}
        >
          Guardar juego
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {song.enabled ? (
          <button type="button" className={buttonClass} onClick={() => onPatch({ enabled: false })}>
            Desactivar
          </button>
        ) : (
          <button type="button" className={buttonClass} disabled={song.tooShort} onClick={() => onPatch({ enabled: true })}>
            Activar
          </button>
        )}
        <button type="button" className={buttonClass} onClick={() => onPatch({ reviewed: !song.reviewed })}>
          {song.reviewed ? 'Marcar pendiente' : 'Marcar revisada'}
        </button>
      </div>
    </li>
  )
}
