import { memo, useEffect, useId, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { PublicCatalog } from '../../../shared/api'
import { shortGameName } from '../game/gameColors'
import { searchSongs } from '../game/search'
import { GameSwatch } from './GameSwatch'
import { SearchIcon } from './icons'

interface SongSearchProps {
  catalog: PublicCatalog
  guesses: string[]
  disabled?: boolean
  /** Bloquea la escritura sin perder el foco (peticion en vuelo). */
  readOnly?: boolean
  onSelect(songId: string): void
}

const MAX_VISIBLE_OPTIONS = 50

export const SongSearch = memo(function SongSearch({ catalog, guesses, disabled = false, readOnly = false, onSelect }: SongSearchProps) {
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const listId = useId()
  const inputId = `${listId}-input`

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
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold tracking-[0.5px] lg:text-[13px]">
        ¿Qué canción es?
      </label>
      <div className="flex min-h-[52px] items-center gap-2 rounded-lg border-2 border-edge bg-field px-3 focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[#2a75bb]">
        <SearchIcon className="flex-none text-ink" />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId ? `${listId}-${activeId}` : undefined}
          autoComplete="off"
          disabled={disabled}
          readOnly={readOnly}
          value={query}
          placeholder="Canción o juego…"
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveId(null)
          }}
          onKeyDown={onKeyDown}
          className="min-h-12 min-w-0 flex-1 border-0 bg-transparent text-base font-medium text-ink outline-none focus-visible:outline-none disabled:opacity-50"
        />
      </div>
      {isOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugerencias"
          className="absolute z-10 mt-1.5 max-h-72 w-full overflow-y-auto rounded-lg border-2 border-edge bg-field p-1"
        >
          {results.length === 0 && <li className="px-3 py-3 text-sm text-muted">Sin resultados</li>}
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
                className={`flex min-h-11 items-center gap-2.5 rounded px-2.5 py-1.5 ${
                  isAttempted ? 'cursor-not-allowed text-dim line-through' : 'cursor-pointer hover:bg-chip'
                } ${song.id === activeId ? 'bg-chip' : ''}`}
              >
                <GameSwatch gameId={song.games[0]?.id ?? ''} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-semibold">{song.title}</span>
                  <span className="text-xs text-muted">
                    {song.games.map((game) => shortGameName(game.name)).join(' · ')}
                    {isAttempted && ' — ya intentada'}
                  </span>
                </span>
              </li>
            )
          })}
          {hiddenCount > 0 && <li className="px-3 py-2 text-xs text-muted">y {hiddenCount} más… afina la búsqueda</li>}
        </ul>
      )}
    </div>
  )
})
