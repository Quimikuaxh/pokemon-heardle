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
import { FilterGames, FilterPanel, FilterStart } from './FilterPanel'
import { NoticeBanner } from './NoticeBanner'
import { ResultPanel } from './ResultPanel'
import { SongSearch } from './SongSearch'
import { Legend } from './Legend'
import { NextDayCountdown } from './NextDayNote'
import { DexLeftBody, DexPanel, DexRightBody, DexTop, DexVents } from './Pokedex'
import { formatDayLabel } from '../game/format'
import { gamesOfSeries, scopeCatalog } from '../game/scope'
import type { Series } from '../../../shared/rules'
import { Player } from './Player'
import type { AudioStatus } from './Player'
import { computePeaks } from '../audio/waveform'
import type { AudioBufferLike } from '../audio/clipPlayer'

interface GameBoardProps {
  mode: 'daily' | 'unlimited'
  /** Serie del diario (DEC-60); por defecto la principal. */
  series?: Series
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

export function GameBoard({ mode, series = 'main', controller, api, catalog, store, settings = DEFAULT_SETTINGS, volume = DEFAULT_VOLUME, onVolumeChange }: GameBoardProps) {
  const state = useGameState(controller)
  const { view, phase, notice, busy, gameSeq } = state
  const [filter, setFilter] = useState(() => controller.getFilter())
  const [audio, setAudio] = useState<{ key: string; status: AudioStatus } | null>(null)
  const [audioRetry, setAudioRetry] = useState(0)
  const [fullSongPlaying, setFullSongPlaying] = useState(false)
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

  const openDaily = useCallback(() => void controller.openDaily(), [controller])
  const lens = view?.status === 'won' ? 'won' : view?.status === 'lost' ? 'lost' : 'playing'
  const dayLabel = formatDayLabel(view?.date ?? madridDate(Date.now()))
  const subtitle = mode === 'unlimited' ? 'MODO LIBRE' : series === 'spinoff' ? `SPIN-OFF DEL DÍA · ${dayLabel}` : `RETO DEL DÍA · ${dayLabel}`
  // Buscador por modo (DEC-60): cada diario, solo su serie; el libre, solo los juegos de la partida en curso.
  const pool = mode === 'unlimited' ? controller.getPool() : null
  const poolKey = pool?.join(',') ?? ''
  const searchScope = useMemo(
    () => scopeCatalog(catalog, mode === 'daily' ? gamesOfSeries(catalog, series) : pool ? new Set(pool) : null),
    // poolKey resume el contenido del pool (el array cambia de identidad en cada partida)
    [catalog, mode, series, poolKey, gameSeq],
  )
  const filterProps = { games: catalog.games, songs: catalog.songs, selected: filter, onChange: changeFilter }
  // Selector de juegos abierto sobre el historial (modo libre con partida, DEC-59); se cierra al empezar otra partida.
  const [filterOpen, setFilterOpen] = useState(false)
  useEffect(() => setFilterOpen(false), [gameSeq])
  const showFilter = mode === 'unlimited' && view !== null && filterOpen

  // `contents`: la seccion no crea caja propia; sus hijos se colocan en las zonas de la Pokedex (DEC-58).
  return (
    <section aria-label={mode === 'unlimited' ? 'Partida libre' : series === 'spinoff' ? 'Partida diaria spin-off' : 'Partida diaria'} className="contents">
      <DexTop lens={lens} subtitle={subtitle} blinking={(isPlaying && playback.playing) || (lens === 'won' && fullSongPlaying)} />

      <DexLeftBody>
        <NoticeBanner notice={notice} />
        {store.writeFailed && (
          <p role="status" className="m-0 rounded-[10px] border-[3px] border-edge bg-dex-yellow px-3.5 py-2.5 text-sm font-semibold text-ink">
            Este navegador no permite guardar datos: no se conservará tu progreso al recargar.
          </p>
        )}

        {phase === 'loading' && (
          <p role="status" className="m-0 text-center font-mono text-sm tracking-[1px] text-dex-text">
            Cargando partida...
          </p>
        )}

        {phase === 'idle' && mode === 'daily' && (
          <button
            type="button"
            className="min-h-14 rounded-2xl border-4 border-edge bg-dex-blue px-4 text-[17px] font-bold text-white shadow-[0_6px_0_var(--edge)]"
            onClick={openDaily}
          >
            Cargar la partida de hoy
          </button>
        )}

        {isPlaying && view && (
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
        )}

        {phase === 'finished' && view && (
          <ResultPanel
            view={view}
            showNextDayNote={false}
            onOpenFullSong={() => player.stop()}
            onFullSongPlaybackChange={setFullSongPlaying}
            volume={volume}
            onVolumeChange={onVolumeChange}
          />
        )}
        {phase === 'finished' && view?.mode === 'daily' && <NextDayCountdown onExpire={openDaily} />}

        {mode === 'unlimited' && phase !== 'loading' && !view && <FilterStart {...filterProps} onStart={startUnlimited} />}
        {view && <Legend />}
      </DexLeftBody>

      <DexRightBody>
        {/* Con el filtro abierto (modo libre con partida), el selector de juegos ocupa el sitio del historial y del
            buscador, que se ocultan sin desmontarse; al cerrarlo vuelven (DEC-59): abierto debajo estiraba la Pokedex. */}
        {view && (
          <div hidden={showFilter} className="contents">
            <DexPanel title="ENTRADAS" label={`${view.results.length} / ${view.maxAttempts} USADAS`}>
              <AttemptList view={view} catalog={catalog} settings={settings} />
            </DexPanel>
            {isPlaying && <SongSearch key={gameSeq} catalog={searchScope} guesses={view.guesses} readOnly={busy} onSelect={selectSong} />}
            {mode === 'unlimited' && phase === 'finished' && <FilterStart {...filterProps} onStart={startUnlimited} compact />}
          </div>
        )}
        {mode === 'unlimited' && phase !== 'loading' && !view && <FilterGames {...filterProps} />}
        {showFilter && <FilterPanel {...filterProps} onStart={startUnlimited} />}
        {mode === 'unlimited' && phase !== 'loading' && view && (
          <button
            type="button"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((open) => !open)}
            className="flex min-h-12 items-center justify-between gap-3 rounded-[10px] border-[3px] border-edge bg-dex-deep px-4 py-2.5 text-left font-bold text-dex-text hover:brightness-125"
          >
            <span>{isPlaying ? 'Filtro para la próxima partida' : 'Nueva partida'}</span>
            <span aria-hidden="true" className={`text-sm transition-transform motion-reduce:transition-none ${filterOpen ? 'rotate-180' : ''}`}>
              ▲
            </span>
          </button>
        )}
        <DexVents />
      </DexRightBody>
    </section>
  )
}
