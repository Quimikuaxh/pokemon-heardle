import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PublicCatalog } from '../../../shared/api'
import { CLIP_SECONDS } from '../../../shared/rules'
import { createClipPlayer } from '../audio/clipPlayer'
import type { ApiClient } from '../api/client'
import type { GameController } from '../game/controller'
import { madridDate } from '../../../shared/date'
import { currentClipSeconds } from '../game/view'
import { useGameState } from '../hooks/useGameState'
import { DEFAULT_SETTINGS, DEFAULT_VOLUME } from '../storage/store'
import type { HintSettings, Store } from '../storage/store'
import { AttemptList } from './AttemptList'
import { FilterPanel } from './FilterPanel'
import { NoticeBanner } from './NoticeBanner'
import { ResultPanel } from './ResultPanel'
import { SongSearch } from './SongSearch'
import { Legend } from './Legend'
import { NextDayNote } from './NextDayNote'
import { Player } from './Player'
import type { AudioStatus } from './Player'
import { computePeaks } from '../audio/waveform'
import type { AudioBufferLike } from '../audio/clipPlayer'

interface GameBoardProps {
  mode: 'daily' | 'unlimited'
  controller: GameController
  api: Pick<ApiClient, 'fetchClip'>
  catalog: PublicCatalog
  store: Store
  /** Pistas visibles (DEC-52). Las guarda y edita la App; el tablero solo las aplica. */
  settings?: HintSettings
  /** Volumen comun del clip y del video (DEC-55). Lo guarda la App: es el mismo en diario y libre. */
  volume?: number
  onVolumeChange?(volume: number): void
}

export function GameBoard({ mode, controller, api, catalog, store, settings = DEFAULT_SETTINGS, volume = DEFAULT_VOLUME, onVolumeChange }: GameBoardProps) {
  const state = useGameState(controller)
  const { view, phase, notice, busy, gameSeq } = state
  const [filter, setFilter] = useState(() => controller.getFilter())
  const [audio, setAudio] = useState<{ key: string; status: AudioStatus } | null>(null)
  const [audioRetry, setAudioRetry] = useState(0)
  const [playback, setPlayback] = useState({ playing: false, positionSec: 0 })
  const [decoded, setDecoded] = useState<{ attemptKey: string; buffer: AudioBufferLike | null } | null>(null)

  const player = useMemo(
    () =>
      createClipPlayer({
        fetchClip: (clipUrl) => api.fetchClip(clipUrl),
        refreshClipUrl: () => controller.refreshClipUrl(),
        createObjectURL: (blob) => URL.createObjectURL(blob),
        revokeObjectURL: (url) => URL.revokeObjectURL(url),
        createAudio: () => new Audio(),
        onDecoded: setDecoded,
      }),
    [api, controller],
  )
  useEffect(() => player.setVolume(volume), [player, volume])
  useEffect(() => {
    const unsubscribe = player.subscribe(setPlayback)
    return () => {
      unsubscribe()
      player.dispose()
    }
  }, [player])

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

  // La onda usa solo el buffer del intento actual y solo su audio desbloqueado (nada de lo posterior).
  const peaks = useMemo(
    () => (decoded && decoded.attemptKey === attemptKey && seconds ? computePeaks(decoded.buffer, seconds) : null),
    [decoded, attemptKey, seconds],
  )

  const selectSong = useCallback((songId: string) => void controller.guess(songId), [controller])
  const togglePlay = () => (playback.playing ? player.pause() : player.play())

  return (
    <section
      aria-label={mode === 'daily' ? 'Partida diaria' : 'Partida libre'}
      className="mx-auto flex w-full max-w-[460px] flex-col gap-3.5 lg:grid lg:max-w-[1360px] lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:items-start lg:justify-center lg:gap-8 xl:grid-cols-[200px_460px_minmax(0,1fr)] xl:gap-12"
    >
      <Legend />

      <div className="flex min-w-0 flex-col gap-3.5 lg:gap-[18px]">
        <NoticeBanner notice={notice} />
        {store.writeFailed && (
          <p role="status" className="m-0 text-sm font-medium text-amber-text">
            Este navegador no permite guardar datos: no se conservará tu progreso al recargar.
          </p>
        )}

        {phase === 'loading' && (
          <p role="status" className="m-0 text-center text-muted">
            Cargando partida...
          </p>
        )}

        {phase === 'idle' && mode === 'daily' && (
          <button
            type="button"
            className="min-h-11 rounded-full border-[3px] border-edge bg-lamp-red px-4 font-semibold text-white shadow-[0_4px_0_var(--edge)]"
            onClick={() => void controller.openDaily()}
          >
            Cargar la partida de hoy
          </button>
        )}

        {isPlaying && view && (
          <>
            <Player
              attempt={view.attempt}
              maxAttempts={view.maxAttempts}
              clipSeconds={view.clipSeconds}
              unlockedSec={seconds ?? 0}
              nextSeconds={nextSeconds}
              positionSec={playback.positionSec}
              playing={playback.playing}
              audioStatus={audioStatus}
              peaks={peaks}
              skipDisabled={busy}
              onTogglePlay={togglePlay}
              onSkip={() => void controller.skip()}
              onRetryAudio={() => setAudioRetry((count) => count + 1)}
              volume={volume}
              onVolumeChange={onVolumeChange}
            />
            <SongSearch key={gameSeq} catalog={catalog} guesses={view.guesses} readOnly={busy} onSelect={selectSong} />
          </>
        )}

        {phase === 'finished' && view && (
          <ResultPanel view={view} showNextDayNote={false} onOpenFullSong={() => player.stop()} volume={volume} onVolumeChange={onVolumeChange} />
        )}

        {mode === 'unlimited' && phase !== 'loading' && !view && (
          <FilterPanel games={catalog.games} songs={catalog.songs} selected={filter} onChange={changeFilter} onStart={startUnlimited} />
        )}
        {mode === 'unlimited' && phase !== 'loading' && view && (
          <details open={!isPlaying} className="rounded-xl">
            <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">
              {isPlaying ? 'Filtro para la próxima partida' : 'Nueva partida'}
            </summary>
            <FilterPanel games={catalog.games} songs={catalog.songs} selected={filter} onChange={changeFilter} onStart={startUnlimited} />
          </details>
        )}
      </div>

      {view && <AttemptList view={view} catalog={catalog} settings={settings} />}
      {phase === 'finished' && view?.mode === 'daily' && (
        <div className="lg:col-start-2">
          <NextDayNote />
        </div>
      )}
    </section>
  )
}
