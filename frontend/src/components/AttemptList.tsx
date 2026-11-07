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
  skip: 'bg-locked-bar text-screen-ink',
}

function ResultMark({ result }: { result: ResultName }) {
  const icon = result === 'hit' ? <CheckIcon /> : result === 'miss' ? <CrossIcon /> : result === 'game' ? <DotIcon /> : <SkipIcon size={12} />
  return (
    <span data-result={result} className={`flex size-[26px] flex-none items-center justify-center rounded-md lg:size-[30px] ${MARK_CLASS[result]}`}>
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
      className={`inline-flex h-6 w-[4.75rem] flex-none items-center justify-center gap-1 rounded-full pt-px text-[11px] font-bold text-white ${match ? 'bg-hit' : 'bg-miss'}`}
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
      className="inline-flex h-6 w-[5.5rem] flex-none items-center justify-center gap-1 rounded-full border-2 border-screen-ink pt-px text-[11px] font-bold text-screen-ink"
    >
      {isEarlier ? <ArrowDownIcon size={10} /> : <ArrowUpIcon size={10} />}
      <span aria-hidden="true">{isEarlier ? 'Anterior' : 'Posterior'}</span>
    </span>
  )
}

// Columnas: numero, marca, texto y (en escritorio) pistas; en movil las pistas bajan a una segunda linea bajo el texto.
// Todas las filas miden lo mismo (60 px en escritorio), jugadas o pendientes: el historial no crece al saltar (DEC-59).
const rowBase =
  'grid min-h-14 grid-cols-[26px_26px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-t-2 border-track px-3 first:border-t-0 lg:h-[60px] lg:grid-cols-[34px_30px_minmax(0,1fr)_auto] lg:px-[18px] lg:py-0'
const numberClass = 'font-mono text-[13px] font-bold text-screen-dim lg:text-[15px]'

/** Historial 01-06: icono por resultado, titulo y juego; los intentos pendientes muestran su duracion. */
export const AttemptList = memo(function AttemptList({ view, catalog, settings = DEFAULT_SETTINGS }: { view: GameView; catalog: PublicCatalog; settings?: HintSettings }) {
  // El tablero se repinta en cada frame de la reproduccion: los indices del catalogo se calculan una sola vez.
  const songs = useMemo(() => new Map(catalog.songs.map((song) => [song.id, song])), [catalog.songs])
  const gameNames = useMemo(() => new Map(catalog.games.map((game) => [game.id, shortGameName(game.name)])), [catalog.games])
  const playing = view.status === 'playing'
  const rowCount = playing ? MAX_ATTEMPTS : view.results.length
  let guessIndex = 0

  return (
    <ol aria-label="Intentos" className="m-0 list-none p-0 text-screen-ink">
      {Array.from({ length: rowCount }, (_, index) => {
        const number = String(index + 1).padStart(2, '0')
        const result = view.results[index]
        if (result) {
          const song = result === 'skip' ? undefined : songs.get(view.guesses[guessIndex++])
          const hint: Partial<AttemptHint> | null | undefined = result === 'skip' || result === 'hit' ? null : view.hints?.[index]
          const gameLabel = song?.games.map((id) => gameNames.get(id) ?? id).join(' · ')
          return (
            <li key={index} className={`${rowBase} py-3`}>
              <span className={numberClass}>{number}</span>
              <ResultMark result={result} />
              {result === 'skip' ? (
                <span className="text-sm text-screen-dim lg:text-base">Saltado</span>
              ) : (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold lg:text-[17px]">{song?.title ?? 'Canción'}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-screen-dim lg:text-[13px]">
                    <span className="min-w-0 max-w-full truncate">{gameLabel}</span>
                    {result === 'game' && (
                      <strong aria-hidden="true" className="flex-none text-[#f0b754]">
                        · juego correcto
                      </strong>
                    )}
                  </span>
                </span>
              )}
              {hint && (settings.consoleHint || settings.dateHint) && (
                <span className="col-start-3 flex flex-wrap gap-1.5 lg:col-start-4 lg:row-start-1 lg:justify-end">
                  {settings.consoleHint && <ConsoleBubble hint={hint.console ?? null} />}
                  {settings.dateHint && <DateArrow order={hint.order ?? null} />}
                </span>
              )}
            </li>
          )
        }
        const isCurrent = playing && index === view.attempt
        return isCurrent ? (
          <li key={index} className={rowBase}>
            <span className={`${numberClass} text-played`}>{number}</span>
            <span aria-hidden="true" className="size-[26px] flex-none rounded-md border-[3px] border-dashed border-played lg:size-[30px]" />
            <span className="text-sm text-played lg:text-base">Escuchando {view.clipSeconds[index]} s…</span>
          </li>
        ) : (
          <li key={index} className={`${rowBase} text-[#8a8c93]`}>
            <span className="font-mono text-[13px] lg:text-[15px]">{number}</span>
            <span aria-hidden="true" />
            <span className="text-[13px] lg:text-[15px]">{view.clipSeconds[index]} s</span>
          </li>
        )
      })}
    </ol>
  )
})
