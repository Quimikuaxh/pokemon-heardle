import { useEffect, useId, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { PublicCatalog } from '../../../shared/api'
import { searchSongs } from '../game/search'

interface SongSearchProps {
  catalog: PublicCatalog
  guesses: string[]
  disabled?: boolean
  /** Bloquea la escritura sin perder el foco (peticion en vuelo). */
  readOnly?: boolean
  onSelect(songId: string): void
}

const MAX_VISIBLE_OPTIONS = 50

export function SongSearch({ catalog, guesses, disabled = false, readOnly = false, onSelect }: SongSearchProps) {
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const listId = useId()

  const allResults = useMemo(() => searchSongs(catalog, query), [catalog, query])
  const results = allResults.slice(0, MAX_VISIBLE_OPTIONS)
  const hiddenCount = allResults.length - results.length
  const attempted = useMemo(() => new Set(guesses), [guesses])
  const selectable = results.filter((song) => !attempted.has(song.id))
  const isOpen = query.trim().length > 0

  // La opcion activa por teclado siempre queda visible dentro de la lista con scroll.
  useEffect(() => {
    if (!activeId) return
    document.getElementById(`${listId}-${activeId}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId, listId])

  const choose = (songId: string) => {
    if (disabled || readOnly || attempted.has(songId)) return
    onSelect(songId)
    setQuery('')
    setActiveId(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (selectable.length === 0) return
      const current = selectable.findIndex((song) => song.id === activeId)
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next =
        current === -1 ? (step === 1 ? 0 : selectable.length - 1) : (current + step + selectable.length) % selectable.length
      setActiveId(selectable[next].id)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const target = activeId ?? selectable[0]?.id
      if (target) choose(target)
    } else if (event.key === 'Escape') {
      setQuery('')
      setActiveId(null)
    }
  }

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId ? `${listId}-${activeId}` : undefined}
        autoComplete="off"
        disabled={disabled}
        readOnly={readOnly}
        value={query}
        placeholder="Busca una canción o un juego..."
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveId(null)
        }}
        onKeyDown={onKeyDown}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900"
      />
      {isOpen && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {results.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Sin resultados</li>}
          {results.map((song) => {
            const isAttempted = attempted.has(song.id)
            return (
              <li
                key={song.id}
                id={`${listId}-${song.id}`}
                role="option"
                aria-selected={song.id === activeId}
                aria-disabled={isAttempted}
                onClick={() => choose(song.id)}
                className={`min-h-11 px-3 py-2 ${
                  isAttempted
                    ? 'cursor-not-allowed text-slate-400 line-through dark:text-slate-500'
                    : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700'
                } ${song.id === activeId ? 'bg-indigo-100 dark:bg-indigo-900' : ''}`}
              >
                <div className="font-medium">{song.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {song.games.map((game) => game.name).join(' · ')}
                  {isAttempted && ' — ya intentada'}
                </div>
              </li>
            )
          })}
          {hiddenCount > 0 && (
            <li className="px-3 py-2 text-xs text-slate-500">y {hiddenCount} más… afina la búsqueda</li>
          )}
        </ul>
      )}
    </div>
  )
}
