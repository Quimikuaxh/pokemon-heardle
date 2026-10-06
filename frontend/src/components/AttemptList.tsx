import { memo, useMemo } from 'react'
import type { GameView, PublicCatalog, ResultName } from '../../../shared/api'
import { MAX_ATTEMPTS } from '../../../shared/rules'
import { shortGameName } from '../game/gameColors'
import { resultLabel } from '../game/view'
import { CheckIcon, CrossIcon, DotIcon, SkipIcon } from './icons'

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

const rowBase = 'flex items-center gap-3 border-b border-shell last:border-b-0'
const numberClass = 'w-[22px] font-mono text-[13px] font-bold'

/** Historial 01-06: icono por resultado, titulo y juego; los intentos pendientes muestran su duracion. */
export const AttemptList = memo(function AttemptList({ view, catalog }: { view: GameView; catalog: PublicCatalog }) {
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
          const gameLabel = song?.games.map((id) => gameNames.get(id) ?? id).join(' · ')
          return (
            <li key={index} className={`${rowBase} min-h-11 lg:min-h-12`}>
              <span className={numberClass}>{number}</span>
              <ResultMark result={result} />
              {result === 'skip' ? (
                <span className="text-sm text-muted">Saltado</span>
              ) : (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold">{song?.title ?? 'Canción'}</span>
                  <span className="text-xs text-muted">
                    {gameLabel}
                    {result === 'game' && (
                      <>
                        {' · '}
                        <strong aria-hidden="true" className="text-amber-text">
                          juego correcto
                        </strong>
                      </>
                    )}
                  </span>
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
