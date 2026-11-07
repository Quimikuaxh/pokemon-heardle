import { shortGameName } from '../game/gameColors'
import { GameSwatch } from './GameSwatch'
import { DexNote, DexPanel, DexScreen } from './Pokedex'
import { PlayIcon } from './icons'

interface FilterGamesProps {
  games: Array<{ id: string; name: string }>
  selected: string[]
  onChange(ids: string[]): void
  /** Canciones del catalogo publico: con ellas se muestran los contadores por juego y el total en juego. */
  songs?: Array<{ games: string[] }>
}

interface FilterPanelProps extends FilterGamesProps {
  onStart(): void
}

/** Total de canciones distintas en juego con la seleccion (null sin catalogo). */
function songsInPlay(selected: string[], songs?: Array<{ games: string[] }>): number | null {
  if (!songs) return null
  const selectedSet = new Set(selected)
  return songs.filter((song) => song.games.some((id) => selectedSet.has(id))).length
}

const pillClass =
  'min-h-11 flex-1 rounded-[10px] border-[3px] border-edge bg-[#f4f4f2] px-3 text-sm font-bold text-ink hover:bg-white shadow-[0_4px_0_var(--edge)]'

const startClass =
  'flex min-h-14 items-center justify-center gap-3 rounded-2xl border-4 border-edge bg-lamp-red px-4 text-[17px] font-bold text-white shadow-[0_6px_0_var(--edge)] hover:enabled:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-[68px] lg:text-xl'

const emptyAlert = (
  <p role="alert" className="m-0 rounded-[10px] border-[3px] border-edge bg-dex-yellow px-3.5 py-2.5 text-sm font-bold text-ink">
    Elige al menos un juego para poder empezar.
  </p>
)

/** Pantalla de juegos de la hoja derecha (DEC-58): casillas con color y contador, y "Todos" / "Ninguno". */
export function FilterGames({ games, selected, onChange, songs }: FilterGamesProps) {
  const selectedSet = new Set(selected)
  const counts = songs ? new Map(games.map((game) => [game.id, songs.filter((song) => song.games.includes(game.id)).length])) : null
  const toggle = (gameId: string) => onChange(selectedSet.has(gameId) ? selected.filter((id) => id !== gameId) : [...selected, gameId])

  return (
    <section aria-label="Elegir juegos" className="flex flex-col gap-4">
      <DexPanel title="JUEGOS" label={`${selected.length} DE ${games.length} JUEGOS`}>
        <div className="grid gap-x-[18px] px-3 py-2 lg:grid-cols-2 lg:px-[18px]">
          {games.map((game) => {
            const checked = selectedSet.has(game.id)
            return (
              <label key={game.id} className="flex min-h-11 cursor-pointer items-center gap-3 border-b-2 border-track py-1.5">
                <input type="checkbox" className="m-0 size-5 flex-none accent-played" checked={checked} onChange={() => toggle(game.id)} />
                <GameSwatch gameId={game.id} />
                <span className={`flex-1 text-[15px] ${checked ? 'font-semibold' : 'text-screen-dim'}`}>{shortGameName(game.name)}</span>
                {counts && <span className="font-mono text-xs text-screen-dim">{counts.get(game.id)}</span>}
              </label>
            )
          })}
        </div>
      </DexPanel>
      <div className="flex gap-2.5">
        <button type="button" className={pillClass} onClick={() => onChange(games.map((game) => game.id))}>
          Todos
        </button>
        <button type="button" className={pillClass} onClick={() => onChange([])}>
          Ninguno
        </button>
      </div>
    </section>
  )
}

/**
 * Hoja izquierda del modo libre sin partida en curso (DEC-58): canciones en juego y "Empezar partida". Tras una
 * partida (`compact`) va bajo el resultado y sin pantalla propia: dos pantallas seguidas recargaban la hoja.
 */
export function FilterStart({ games, selected, songs, onStart, compact = false }: FilterPanelProps & { compact?: boolean }) {
  const isEmpty = selected.length === 0
  const total = songsInPlay(selected, songs)
  const summary = `${total !== null ? `${total} canciones en juego` : `${selected.length} juegos elegidos`} · ${selected.length} de ${games.length} juegos`
  if (compact) {
    return (
      <section aria-label="Nueva partida libre" className="flex flex-col gap-4">
        {isEmpty && emptyAlert}
        <button type="button" disabled={isEmpty} onClick={() => !isEmpty && onStart()} className={startClass}>
          <PlayIcon size={20} />
          Empezar partida
        </button>
        {!isEmpty && <DexNote>{summary}</DexNote>}
      </section>
    )
  }
  return (
    <section aria-label="Nueva partida libre" className="flex flex-col gap-4 lg:gap-[22px]">
      <DexScreen title="PARTIDA LIBRE" label="NUEVA PARTIDA">
        <div className="grid min-h-36 place-items-center py-4 text-center lg:min-h-[212px]">
          <div>
            <div className="font-display text-5xl text-white lg:text-[64px]">{isEmpty ? '—' : (total ?? selected.length)}</div>
            <div className="text-sm text-screen-dim lg:text-base">
              {total !== null ? 'canciones en juego' : 'juegos elegidos'} · {selected.length} de {games.length} juegos
            </div>
          </div>
        </div>
      </DexScreen>
      {isEmpty && emptyAlert}
      <button type="button" disabled={isEmpty} onClick={() => !isEmpty && onStart()} className={startClass}>
        <PlayIcon size={20} />
        Empezar partida
      </button>
      <DexNote>Puedes jugar tantas partidas como quieras.</DexNote>
    </section>
  )
}

/** Juegos, aviso y "Empezar partida" juntos: el filtro para la proxima partida mientras se juega (DEC-10). */
export function FilterPanel({ games, selected, onChange, onStart, songs }: FilterPanelProps) {
  const isEmpty = selected.length === 0
  const total = songsInPlay(selected, songs)
  return (
    <div className="flex flex-col gap-4">
      <FilterGames games={games} selected={selected} onChange={onChange} songs={songs} />
      {isEmpty && emptyAlert}
      <button type="button" disabled={isEmpty} onClick={() => !isEmpty && onStart()} className={startClass}>
        <PlayIcon size={20} />
        Empezar partida
      </button>
      {total !== null && !isEmpty && (
        <p className="m-0 text-center text-sm text-dex-text">{total} canciones en juego. Puedes jugar tantas como quieras.</p>
      )}
    </div>
  )
}
