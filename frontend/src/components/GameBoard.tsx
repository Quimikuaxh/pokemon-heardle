import { useEffect, useMemo, useRef, useState } from 'react'
import type { PublicCatalog } from '../../../shared/api'
import { CLIP_SECONDS } from '../../../shared/rules'
import { createClipPlayer } from '../audio/clipPlayer'
import type { ApiClient } from '../api/client'
import type { GameController } from '../game/controller'
import { madridDate } from '../../../shared/date'
import { currentClipSeconds } from '../game/view'
import { useGameState } from '../hooks/useGameState'
import type { Store } from '../storage/store'
import { AttemptList } from './AttemptList'
import { FilterPanel } from './FilterPanel'
import { NoticeBanner } from './NoticeBanner'
import { ResultPanel } from './ResultPanel'
import { SongSearch } from './SongSearch'
import { StatsPanel } from './StatsPanel'

interface GameBoardProps {
  mode: 'daily' | 'unlimited'
  controller: GameController
  api: Pick<ApiClient, 'fetchClip'>
  catalog: PublicCatalog
  store: Store
}

type AudioStatus = 'loading' | 'ready' | 'error'

export function GameBoard({ mode, controller, api, catalog, store }: GameBoardProps) {
  const state = useGameState(controller)
  const { view, phase, notice, busy, gameSeq } = state
  const [filter, setFilter] = useState(() => controller.getFilter())
  const [audio, setAudio] = useState<{ key: string; status: AudioStatus } | null>(null)
  const [audioRetry, setAudioRetry] = useState(0)

  const player = useMemo(
    () =>
      createClipPlayer({
        fetchClip: (clipUrl) => api.fetchClip(clipUrl),
        refreshClipUrl: () => controller.refreshClipUrl(),
        createObjectURL: (blob) => URL.createObjectURL(blob),
        revokeObjectURL: (url) => URL.revokeObjectURL(url),
        createAudio: () => new Audio(),
      }),
    [api, controller],
  )
  useEffect(() => () => player.dispose(), [player])

  useEffect(() => {
    if (mode === 'daily') void controller.openDaily()
    else void controller.resumeUnlimited()
  }, [mode, controller])

  // Si la pestaña vuelve a primer plano tras medianoche (Madrid), el diario cargado ya no es el de hoy.
  const loadedDate = view?.date
  useEffect(() => {
    if (mode !== 'daily' || !loadedDate) return
    const reloadIfNewDay = () => {
      if (document.visibilityState === 'visible' && madridDate(Date.now()) !== loadedDate) void controller.openDaily()
    }
    document.addEventListener('visibilitychange', reloadIfNewDay)
    return () => document.removeEventListener('visibilitychange', reloadIfNewDay)
  }, [mode, loadedDate, controller])

  const latestClipUrl = useRef<string | undefined>(undefined)
  latestClipUrl.current = view?.clipUrl
  const attemptKey = view?.status === 'playing' ? `${gameSeq}:${view.attempt}` : null

  useEffect(() => {
    const clipUrl = latestClipUrl.current
    if (!attemptKey || !clipUrl) return
    setAudio({ key: attemptKey, status: 'loading' })
    player.prepare(clipUrl, attemptKey).then(
      () => setAudio((current) => (current?.key === attemptKey ? { key: attemptKey, status: 'ready' } : current)),
      () => setAudio((current) => (current?.key === attemptKey ? { key: attemptKey, status: 'error' } : current)),
    )
  }, [attemptKey, audioRetry, player])

  const audioStatus = audio && audio.key === attemptKey ? audio.status : 'loading'
  const seconds = view ? currentClipSeconds(view) : null
  const nextSeconds = view ? CLIP_SECONDS[view.attempt + 1] : undefined
  const isPlaying = phase === 'playing' && view !== null

  const changeFilter = (ids: string[]) => {
    controller.setFilter(ids)
    setFilter(controller.getFilter())
  }

  const startUnlimited = () => {
    if (isPlaying && !window.confirm('¿Abandonar la partida en curso y empezar otra?')) return
    void controller.startUnlimited()
  }

  return (
    <section className="grid gap-4" aria-label={mode === 'daily' ? 'Partida diaria' : 'Partida libre'}>
      {mode === 'daily' && view?.date && <p className="text-sm text-slate-600 dark:text-slate-300">Canción del día {view.date}</p>}
      <NoticeBanner notice={notice} />
      {store.writeFailed && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
          Este navegador no permite guardar datos: no se conservará tu progreso al recargar.
        </p>
      )}

      {phase === 'loading' && <p role="status">Cargando partida...</p>}

      {phase === 'idle' && mode === 'daily' && (
        <button
          type="button"
          className="min-h-11 rounded-lg bg-indigo-600 px-4 font-semibold text-white"
          onClick={() => void controller.openDaily()}
        >
          Cargar la partida de hoy
        </button>
      )}

      {view && <AttemptList view={view} catalog={catalog} />}

      {isPlaying && (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={audioStatus !== 'ready'}
              onClick={() => player.play()}
              className="min-h-11 min-w-32 rounded-full bg-indigo-600 px-5 font-semibold text-white disabled:opacity-40"
            >
              {audioStatus === 'loading' ? 'Cargando audio...' : `▶ Reproducir ${seconds} s`}
            </button>
            {audioStatus === 'error' && (
              <button
                type="button"
                className="min-h-11 rounded-lg border border-rose-500 px-3 text-sm"
                onClick={() => setAudioRetry((count) => count + 1)}
              >
                No se pudo cargar el audio. Reintentar
              </button>
            )}
          </div>
          <SongSearch catalog={catalog} guesses={view.guesses} readOnly={busy} onSelect={(songId) => void controller.guess(songId)} />
          <button
            type="button"
            disabled={busy}
            onClick={() => void controller.skip()}
            className="min-h-11 rounded-lg border border-slate-400 px-4 font-medium disabled:opacity-40"
          >
            {nextSeconds ? `Saltar (+${nextSeconds - (seconds ?? 0)} s)` : 'Saltar (último intento)'}
          </button>
        </>
      )}

      {phase === 'finished' && view && <ResultPanel view={view} />}

      {mode === 'unlimited' && phase !== 'loading' && (
        <details open={!isPlaying} className="rounded-xl">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            {isPlaying ? 'Filtro para la próxima partida' : 'Nueva partida'}
          </summary>
          <FilterPanel games={catalog.games} selected={filter} onChange={changeFilter} onStart={startUnlimited} />
        </details>
      )}

      <StatsPanel store={store} mode={mode} />
    </section>
  )
}
