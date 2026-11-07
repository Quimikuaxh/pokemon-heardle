import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { PublicCatalog } from '../../../shared/api'
import { shortGameName } from '../game/gameColors'
import { searchCatalog } from '../game/search'
import { GameSwatch } from './GameSwatch'
import { CrossIcon, SearchIcon } from './icons'

interface SongSearchProps {
  catalog: PublicCatalog
  guesses: string[]
  disabled?: boolean
  /** Bloquea la escritura sin perder el foco (peticion en vuelo). */
  readOnly?: boolean
  onSelect(songId: string): void
}

interface BubbleGame {
  id: string
  name: string
}

type Selectable = { key: string; kind: 'game'; game: BubbleGame } | { key: string; kind: 'song'; songId: string }

const IME_KEY_CODE = 229
const groupHeaderClass = 'px-1.5 pb-1 pt-2.5 font-mono text-[11px] font-bold tracking-[3px] text-lcd-dim uppercase'

/** Combobox ARIA 1.2 con grupos Juegos / Canciones y una burbuja de juego que acota las canciones (DEC-49). */
export const SongSearch = memo(function SongSearch({ catalog, guesses, disabled = false, readOnly = false, onSelect }: SongSearchProps) {
  const [query, setQuery] = useState('')
  const [bubble, setBubble] = useState<BubbleGame | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(true)
  const [bubbleNotice, setBubbleNotice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const baseId = useId()
  const listId = `${baseId}-list`
  const inputId = `${baseId}-input`
  const bubbleDescriptionId = `${baseId}-bubble`
  const gamesHeaderId = `${baseId}-games`
  const songsHeaderId = `${baseId}-songs`

  const { games, songs } = useMemo(() => searchCatalog(catalog, query, bubble?.id ?? null), [catalog, query, bubble])
  const attempted = useMemo(() => new Set(guesses), [guesses])
  const selectable = useMemo<Selectable[]>(
    () => [
      ...games.map((game): Selectable => ({ key: `g-${game.id}`, kind: 'game', game })),
      ...songs.filter((song) => !attempted.has(song.id)).map((song): Selectable => ({ key: `s-${song.id}`, kind: 'song', songId: song.id })),
    ],
    [games, songs, attempted],
  )
  const isOpen = listOpen && (query.trim().length > 0 || bubble !== null)
  const optionId = (key: string) => `${baseId}-${key}`
  const resultCount = games.length + songs.length

  // La opcion activa por teclado siempre queda visible dentro de la lista con scroll.
  useEffect(() => {
    if (!activeKey) return
    document.getElementById(`${baseId}-${activeKey}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeKey, baseId])

  const pickGame = (game: BubbleGame) => {
    setBubble(game)
    setBubbleNotice(`Filtro de juego: ${game.name}`)
    setQuery('')
    setActiveKey(null)
    setListOpen(true)
    inputRef.current?.focus()
  }

  const removeBubble = () => {
    setBubble(null)
    setBubbleNotice('Filtro de juego quitado')
    setActiveKey(null)
    inputRef.current?.focus()
  }

  const chooseSong = (songId: string) => {
    if (disabled || readOnly || attempted.has(songId)) return
    onSelect(songId)
    setQuery('')
    setActiveKey(null)
  }

  const activate = (option: Selectable) => {
    if (disabled || readOnly) return
    if (option.kind === 'game') pickGame(option.game)
    else chooseSong(option.songId)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setListOpen(true)
      if (selectable.length === 0) return
      const current = selectable.findIndex((option) => option.key === activeKey)
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next = current === -1 ? (step === 1 ? 0 : selectable.length - 1) : (current + step + selectable.length) % selectable.length
      setActiveKey(selectable[next].key)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const target = selectable.find((option) => option.key === activeKey) ?? selectable[0]
      if (target && isOpen) activate(target)
    } else if (event.key === 'Escape') {
      // Escape nunca quita la burbuja: primero cierra la lista y despues vacia el texto.
      if (isOpen) setListOpen(false)
      else setQuery('')
      setActiveKey(null)
    } else if (event.key === 'Backspace') {
      const isComposing = event.nativeEvent.isComposing || event.keyCode === IME_KEY_CODE
      if (query === '' && bubble && !isComposing && !disabled && !readOnly) {
        event.preventDefault()
        removeBubble()
      }
    }
  }

  const optionClass = (key: string, isAttempted: boolean) =>
    `flex min-h-11 items-center gap-3 border-b-2 border-dotted border-lcd-dim px-1.5 py-2 last:border-b-0 ${
      isAttempted ? 'cursor-not-allowed text-lcd-dim line-through' : 'cursor-pointer hover:bg-lcd-edge'
    } ${key === activeKey ? 'bg-lcd-ink text-lcd hover:bg-lcd-ink' : ''}`

  return (
    // Pantalla LCD de la hoja derecha (DEC-59): caja arriba y resultados debajo, en un hueco de alto fijo con scroll
    // propio, para no tener que desplazar la pagina para verlos.
    <section aria-label="Buscador" className="dex-lcd rounded-[12px] border-4 border-edge p-3 text-lcd-ink lg:p-4">
      <label htmlFor={inputId} className="mb-2 block px-0.5 font-mono text-xs font-bold uppercase tracking-[2px] lg:text-[13px]">
        ¿Qué canción es?
      </label>
      <div className="flex min-h-12 items-center gap-3 rounded-lg border-[3px] border-lcd-ink px-3 focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[#ffcb05] lg:min-h-[54px]">
        <SearchIcon className="flex-none text-lcd-ink" />
        {bubble && (
          <span className="inline-flex min-w-0 max-w-[45%] flex-none items-center gap-1 rounded-full bg-lcd-ink py-0.5 pl-2.5 pr-0.5 font-mono text-xs font-bold text-lcd">
            <span title={bubble.name} className="min-w-0 truncate">
              {bubble.name}
            </span>
            <button
              type="button"
              aria-label={`Quitar filtro de juego: ${bubble.name}`}
              disabled={disabled}
              onClick={removeBubble}
              // El ::before amplia el area tactil a 44 px sin cambiar el aspecto de la burbuja.
              className="relative flex size-6 flex-none items-center justify-center rounded-full bg-lcd text-lcd-ink before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] disabled:opacity-50"
            >
              <CrossIcon size={10} strokeWidth={2.75} />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={isOpen && activeKey ? optionId(activeKey) : undefined}
          aria-describedby={bubble ? bubbleDescriptionId : undefined}
          autoComplete="off"
          disabled={disabled}
          readOnly={readOnly}
          value={query}
          placeholder={bubble ? 'Canción de este juego…' : 'Canción o juego…'}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveKey(null)
            setListOpen(true)
          }}
          onKeyDown={onKeyDown}
          className="min-h-12 min-w-0 flex-1 border-0 bg-transparent text-base font-bold text-lcd-ink outline-none focus-visible:outline-none disabled:opacity-50 lg:text-[17px]"
        />
      </div>
      {bubble && (
        <span id={bubbleDescriptionId} className="sr-only">
          Filtrando por {bubble.name}
        </span>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {[bubbleNotice, isOpen ? `${resultCount} ${resultCount === 1 ? 'resultado' : 'resultados'}` : ''].filter(Boolean).join('. ')}
      </div>
      {!isOpen && (
        <p className="m-0 mt-3 grid h-48 place-items-center border-t-2 border-dotted border-lcd-dim px-4 text-center font-mono text-sm text-lcd-dim lg:h-[220px]">
          Escribe el nombre de una canción o de un juego.
        </p>
      )}
      {isOpen && (
        <div
          id={listId}
          role="listbox"
          aria-label="Sugerencias"
          // Mantiene el foco en el input al pulsar una opcion con el raton.
          onMouseDown={(event) => event.preventDefault()}
          className="dex-lcd-scroll mt-3 h-48 overflow-y-auto overscroll-contain border-t-2 border-dotted border-lcd-dim pr-1 lg:h-[220px]"
        >
          {resultCount === 0 && <div className="px-1.5 py-3 font-mono text-sm text-lcd-dim">Sin resultados</div>}
          {games.length > 0 && (
            <div role="group" aria-labelledby={gamesHeaderId}>
              <div id={gamesHeaderId} role="presentation" className={groupHeaderClass}>
                Juegos
              </div>
              {games.map((game) => (
                <div
                  key={game.id}
                  id={optionId(`g-${game.id}`)}
                  role="option"
                  aria-selected={activeKey === `g-${game.id}`}
                  onClick={() => activate({ key: `g-${game.id}`, kind: 'game', game })}
                  className={optionClass(`g-${game.id}`, false)}
                >
                  <GameSwatch gameId={game.id} />
                  <span className="text-[15px] font-bold lg:text-base">{game.name}</span>
                </div>
              ))}
            </div>
          )}
          {songs.length > 0 && (
            <div role="group" aria-labelledby={songsHeaderId}>
              <div id={songsHeaderId} role="presentation" className={groupHeaderClass}>
                Canciones
              </div>
              {songs.map((song) => {
                const isAttempted = attempted.has(song.id)
                const key = `s-${song.id}`
                return (
                  <div
                    key={song.id}
                    id={optionId(key)}
                    role="option"
                    aria-selected={key === activeKey}
                    aria-disabled={isAttempted}
                    onClick={() => chooseSong(song.id)}
                    className={optionClass(key, isAttempted)}
                  >
                    <GameSwatch gameId={song.games[0]?.id ?? ''} />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[15px] font-bold lg:text-base">{song.title}</span>
                      <span className="font-mono text-xs opacity-80">
                        {song.games.map((game) => shortGameName(game.name)).join(' · ')}
                        {isAttempted && ' — ya intentada'}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
})
