import type { GameView, PublicCatalog } from '../../../shared/api'
import { madridDate } from '../../../shared/date'
import { ApiError } from '../api/client'
import type { ApiClient } from '../api/client'
import type { Store } from '../storage/store'
import { recordDaily, recordUnlimited } from './stats'

export type NoticeKind =
  | 'already-guessed'
  | 'rate-limited'
  | 'invalid-token'
  | 'empty-filter'
  | 'unknown-game'
  | 'network'
  | 'server-error'

export interface Notice {
  kind: NoticeKind
  message: string
  retryAfterSec?: number
}

export type Phase = 'idle' | 'loading' | 'playing' | 'finished'

export interface GameState {
  phase: Phase
  mode: 'daily' | 'unlimited' | null
  view: GameView | null
  notice: Notice | null
  /** Hay una peticion en vuelo: la UI bloquea acciones. */
  busy: boolean
  /** Cambia cada vez que se carga una partida distinta (identifica el audio de cada intento). */
  gameSeq: number
}

export interface GameController {
  getState(): GameState
  subscribe(listener: () => void): () => void
  getFilter(): string[]
  setFilter(ids: string[]): void
  openDaily(): Promise<void>
  startUnlimited(): Promise<void>
  resumeUnlimited(): Promise<void>
  guess(songId: string): Promise<void>
  skip(): Promise<void>
  /** Pide el estado al servidor para obtener un clipUrl nuevo; devuelve ese clipUrl. */
  refreshClipUrl(): Promise<string>
}

const MESSAGES: Record<NoticeKind, string> = {
  'already-guessed': 'Ya has intentado esa canción. Elige otra o salta.',
  'rate-limited': 'Demasiadas acciones seguidas. Espera un momento.',
  'invalid-token': 'La partida había caducado. Empieza una nueva.',
  'empty-filter': 'El filtro no tiene canciones disponibles. Elige otros juegos.',
  'unknown-game': 'El filtro guardado incluye un juego que ya no existe. Revísalo.',
  network: 'No se pudo conectar con el servidor. Inténtalo de nuevo.',
  'server-error': 'El servidor ha tenido un problema. Inténtalo de nuevo.',
}

const makeNotice = (kind: NoticeKind, retryAfterSec?: number): Notice => ({
  kind,
  message: MESSAGES[kind],
  ...(retryAfterSec !== undefined ? { retryAfterSec } : {}),
})

function noticeFor(error: unknown): Notice {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'ALREADY_GUESSED':
        return makeNotice('already-guessed')
      case 'RATE_LIMITED':
        return makeNotice('rate-limited', error.retryAfterSec)
      case 'TOKEN_INVALID':
        return makeNotice('invalid-token')
      case 'EMPTY_FILTER':
        return makeNotice('empty-filter')
      case 'UNKNOWN_GAME':
        return makeNotice('unknown-game')
      case 'NETWORK':
        return makeNotice('network')
    }
    if (error.status >= 500) return makeNotice('server-error')
  }
  return makeNotice('network')
}

const isCode = (error: unknown, code: string) => error instanceof ApiError && error.code === code

export function createGameController(options: {
  api: Pick<ApiClient, 'createGame' | 'getState' | 'guess' | 'skip'>
  store: Store
  catalog: PublicCatalog
  nowMs?: () => number
}): GameController {
  const { api, store, catalog } = options
  const nowMs = options.nowMs ?? Date.now
  const listeners = new Set<() => void>()
  let state: GameState = { phase: 'idle', mode: null, view: null, notice: null, busy: false, gameSeq: 0 }

  function update(patch: Partial<GameState>) {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  function recordFinish(view: GameView) {
    const attempts = view.status === 'won' ? view.attempt : null
    if (view.mode === 'daily' && view.date) {
      store.setStats('daily', recordDaily(store.getStats('daily'), view.date, attempts))
    } else if (view.mode === 'unlimited') {
      store.setStats('unlimited', recordUnlimited(store.getStats('unlimited'), attempts))
    }
  }

  // Aplica una vista del servidor: persiste el ultimo token y, al terminar, estadisticas y resultado.
  function applyView(view: GameView, options: { newGame?: boolean } = {}) {
    const finished = view.status !== 'playing'
    if (view.mode === 'daily' && view.date) {
      store.setDaily(view.date, { token: view.token, finished, ...(finished ? { view } : {}) })
      if (finished) recordFinish(view)
    } else if (finished) {
      if (store.getUnlimited()) recordFinish(view)
      store.setUnlimited(null)
    } else {
      store.setUnlimited({ token: view.token })
    }
    update({
      phase: finished ? 'finished' : 'playing',
      mode: view.mode,
      view,
      notice: null,
      busy: false,
      gameSeq: options.newGame ? state.gameSeq + 1 : state.gameSeq,
    })
  }

  function showFinishedDaily(view: GameView) {
    update({ phase: 'finished', mode: 'daily', view, notice: null, busy: false, gameSeq: state.gameSeq + 1 })
  }

  async function createDaily(rejectedToken?: string) {
    const view = await api.createGame({ mode: 'daily' })
    const serverDate = view.date ?? madridDate(nowMs())
    const existing = store.getDaily(serverDate)
    if (existing?.finished && existing.view) {
      // Reloj del cliente desviado: esa fecha ya esta jugada, el token nuevo se descarta.
      showFinishedDaily(existing.view)
    } else if (existing && existing.token !== rejectedToken) {
      await resumeDaily(existing.token, view)
    } else {
      applyView(view, { newGame: true })
    }
  }

  async function resumeDaily(token: string, fallbackNewGame?: GameView) {
    try {
      applyView(await api.getState(token), { newGame: true })
    } catch (error) {
      if (!isCode(error, 'TOKEN_INVALID')) throw error
      if (fallbackNewGame) applyView(fallbackNewGame, { newGame: true })
      else await createDaily(token)
    }
  }

  async function run(action: () => Promise<void>, onError?: (error: unknown) => boolean | Promise<boolean>) {
    try {
      await action()
    } catch (error) {
      if (!(await onError?.(error))) update({ notice: noticeFor(error), busy: false, phase: state.view ? state.phase : 'idle' })
    }
  }

  function getFilter(): string[] {
    const known = new Set(catalog.games.map((game) => game.id))
    return store.getFilter().filter((id) => known.has(id))
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },

    getFilter,

    setFilter(ids) {
      store.setFilter([...new Set(ids)])
    },

    async openDaily() {
      update({ phase: 'loading', mode: 'daily', view: null, notice: null, busy: true })
      await run(async () => {
        const today = madridDate(nowMs())
        const record = store.getDaily(today)
        if (record?.finished && record.view) showFinishedDaily(record.view)
        else if (record) await resumeDaily(record.token)
        else await createDaily()
      })
    },

    async startUnlimited() {
      const filter = getFilter()
      if (filter.length === 0) {
        update({ notice: makeNotice('empty-filter') })
        return
      }
      update({ phase: 'loading', mode: 'unlimited', view: null, notice: null, busy: true })
      await run(async () => applyView(await api.createGame({ mode: 'unlimited', games: filter }), { newGame: true }))
      if (state.phase === 'loading') update({ phase: 'idle' })
    },

    async resumeUnlimited() {
      const record = store.getUnlimited()
      if (!record) return
      update({ phase: 'loading', mode: 'unlimited', view: null, notice: null, busy: true })
      await run(
        async () => applyView(await api.getState(record.token), { newGame: true }),
        (error) => {
          if (!isCode(error, 'TOKEN_INVALID')) return false
          store.setUnlimited(null)
          update({ phase: 'idle', view: null, notice: makeNotice('invalid-token'), busy: false })
          return true
        },
      )
      if (state.phase === 'loading') update({ phase: 'idle', busy: false })
    },

    async guess(songId) {
      const view = state.view
      if (state.phase !== 'playing' || !view || state.busy) return
      update({ busy: true, notice: null })
      await run(
        async () => applyView(await api.guess(view.token, songId)),
        (error) => handleActionError(error, view),
      )
    },

    async skip() {
      const view = state.view
      if (state.phase !== 'playing' || !view || state.busy) return
      update({ busy: true, notice: null })
      await run(
        async () => applyView(await api.skip(view.token)),
        (error) => handleActionError(error, view),
      )
    },

    async refreshClipUrl() {
      const view = state.view
      if (!view) throw new ApiError('NO_GAME', 0)
      const fresh = await api.getState(view.token)
      applyView(fresh)
      if (!fresh.clipUrl) throw new ApiError('NO_CLIP', 0)
      return fresh.clipUrl
    },
  }

  // Devuelve true si el error ya quedo gestionado con un estado propio (sin aviso generico).
  async function handleActionError(error: unknown, view: GameView): Promise<boolean> {
    if (isCode(error, 'ALREADY_GUESSED')) {
      update({ notice: makeNotice('already-guessed'), busy: false })
      return true
    }
    if (isCode(error, 'TOKEN_INVALID')) {
      if (view.mode === 'unlimited') store.setUnlimited(null)
      update({ phase: 'idle', view: null, notice: makeNotice('invalid-token'), busy: false })
      return true
    }
    if (isCode(error, 'GAME_OVER')) {
      try {
        applyView(await api.getState(view.token))
      } catch (refreshError) {
        update({ notice: noticeFor(refreshError), busy: false })
      }
      return true
    }
    return false
  }
}
