import { memo, useMemo } from 'react'
import type { AttemptHint, GameView, PublicCatalog, ResultName } from '../../../shared/api'
import { MAX_ATTEMPTS } from '../../../shared/rules'
import { shortGameName } from '../game/gameColors'
import { resultLabel } from '../game/view'
import { DEFAULT_SETTINGS } from '../storage/store'
import type { HintSettings } from '../storage/store'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CrossIcon, DotIcon, SkipIcon } from './icons'

const MARK_CLASS: Record<ResultName, string> = {
  hit: 'bg-hit text-white',
  game: 'bg-near text-[#17181b]',
  miss: 'bg-miss text-white',
  skip: 'bg-skipbg text-ink',
}

function ResultMark({ result }: { result: ResultName }) {
  const icon = result === 'hit' ? <CheckIcon /> : result === 'miss' ? <CrossIcon /> : result === 'game' ? <DotIcon /> : <SkipIcon size={12} />
  return (
    <span data-result={result} className={`flex size-[22px] flex-none items-center justify-center rounded ${MARK_CLASS[result]}`}>
      {icon}
      <span className="sr-only">{resultLabel(result)}</span>
    </span>
  )
}

function ConsoleBubble({ hint }: { hint: AttemptHint['console'] }) {
  if (!hint || typeof hint.label !== 'string') return null
  const match = hint.match === true
  return (
    <span
      aria-label={`Consola: ${hint.label}, ${match ? 'coincide' : 'no coincide'}`}
      className={`inline-flex h-6 w-[4.75rem] flex-none items-center justify-center gap-1 rounded-full text-[11px] font-semibold text-white ${match ? 'bg-hit' : 'bg-miss'}`}
    >
      {match ? <CheckIcon size={11} /> : <CrossIcon size={10} />}
      <span aria-hidden="true">{hint.label}</span>
    </span>
  )
}

function DateArrow({ order }: { order: AttemptHint['order'] }) {
  if (order !== 'earlier' && order !== 'later') return null
  const isEarlier = order === 'earlier'
  return (
    <span
      aria-label={`La canción buscada es de un juego ${isEarlier ? 'anterior' : 'posterior'}`}
      className="inline-flex h-6 w-[5.5rem] flex-none items-center justify-center gap-1 rounded-full border-2 border-edge bg-chip text-[11px] font-semibold text-ink"
    >
      {isEarlier ? <ArrowDownIcon size={10} /> : <ArrowUpIcon size={10} />}
      <span aria-hidden="true">{isEarlier ? 'Anterior' : 'Posterior'}</span>
    </span>
  )
}

const rowBase = 'flex items-center gap-3 border-b border-shell last:border-b-0'
const numberClass = 'w-[22px] font-mono text-[13px] font-bold'

/** Historial 01-06: icono por resultado, titulo y juego; los intentos pendientes muestran su duracion. */
export const AttemptList = memo(function AttemptList({ view, catalog, settings = DEFAULT_SETTINGS }: { view: GameView; catalog: PublicCatalog; settings?: HintSettings }) {
  // El tablero se repinta en cada frame de la reproduccion: los indices del catalogo se calculan una sola vez.
  const songs = useMemo(() => new Map(catalog.songs.map((song) => [song.id, song])), [catalog.songs])
  const gameNames = useMemo(() => new Map(catalog.games.map((game) => [game.id, shortGameName(game.name)])), [catalog.games])
  const playing = view.status === 'playing'
  const rowCount = playing ? MAX_ATTEMPTS : view.results.length
  let guessIndex = 0

  return (
    <ol aria-label="Intentos" className="m-0 list-none border-t-2 border-ink p-0">
      {Array.from({ length: rowCount }, (_, index) => {
        const number = String(index + 1).padStart(2, '0')
        const result = view.results[index]
        if (result) {
          const song = result === 'skip' ? undefined : songs.get(view.guesses[guessIndex++])
          const hint: Partial<AttemptHint> | null | undefined = result === 'skip' || result === 'hit' ? null : view.hints?.[index]
          const gameLabel = song?.games.map((id) => gameNames.get(id) ?? id).join(' · ')
          return (
            <li key={index} className={`${rowBase} min-h-11 py-2.5 lg:min-h-12`}>
              <span className={numberClass}>{number}</span>
              <ResultMark result={result} />
              {result === 'skip' ? (
                <span className="text-sm text-muted">Saltado</span>
              ) : (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold">{song?.title ?? 'Canción'}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                    <span className="min-w-0 max-w-full truncate">{gameLabel}</span>
                    {result === 'game' && (
                      <strong aria-hidden="true" className="flex-none text-amber-text">
                        · juego correcto
                      </strong>
                    )}
                  </span>
                </span>
              )}
              {hint && (settings.consoleHint || settings.dateHint) && (
                <span className="flex flex-none flex-col items-end gap-1 2xl:flex-row 2xl:items-center 2xl:gap-1.5">
                  {settings.consoleHint && <ConsoleBubble hint={hint.console ?? null} />}
                  {settings.dateHint && <DateArrow order={hint.order ?? null} />}
                </span>
              )}
            </li>
          )
        }
        const isCurrent = playing && index === view.attempt
        return isCurrent ? (
          <li key={index} className={`${rowBase} min-h-11 lg:min-h-12`}>
            <span className={numberClass}>{number}</span>
            <span aria-hidden="true" className="size-[22px] flex-none rounded border-2 border-dashed border-ink" />
            <span className="text-sm text-muted">Escuchando {view.clipSeconds[index]} s…</span>
          </li>
        ) : (
          <li key={index} className={`${rowBase} min-h-9 text-dim lg:min-h-10`}>
            <span className="w-[22px] font-mono text-[13px]">{number}</span>
            <span className="text-[13px]">{view.clipSeconds[index]} s</span>
          </li>
        )
      })}
    </ol>
  )
})
