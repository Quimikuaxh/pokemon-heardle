import { useEffect, useMemo, useState } from 'react'
import type { PublicCatalog } from '../../shared/api'
import { createApiClient } from './api/client'
import { useBackendWarmup } from './api/warmup'
import { GameBoard } from './components/GameBoard'
import { API_BASE_URL } from './config'
import { createGameController } from './game/controller'
import { createStore } from './storage/store'

type Tab = 'daily' | 'unlimited'

function LoadedApp({ catalog, api }: { catalog: PublicCatalog; api: ReturnType<typeof createApiClient> }) {
  const [tab, setTab] = useState<Tab>('daily')
  const store = useMemo(() => createStore(window.localStorage), [])
  const dailyController = useMemo(() => createGameController({ api, store, catalog }), [api, store, catalog])
  const unlimitedController = useMemo(() => createGameController({ api, store, catalog }), [api, store, catalog])

  const tabClass = (name: Tab) =>
    `min-h-11 flex-1 rounded-lg px-4 font-semibold ${
      tab === name ? 'bg-indigo-600 text-white' : 'border border-slate-300 dark:border-slate-600'
    }`

  return (
    <>
      <nav className="mb-4 flex gap-2" aria-label="Modo de juego">
        <button type="button" className={tabClass('daily')} aria-pressed={tab === 'daily'} onClick={() => setTab('daily')}>
          Diario
        </button>
        <button type="button" className={tabClass('unlimited')} aria-pressed={tab === 'unlimited'} onClick={() => setTab('unlimited')}>
          Partida libre
        </button>
      </nav>
      <div hidden={tab !== 'daily'}>
        <GameBoard mode="daily" controller={dailyController} api={api} catalog={catalog} store={store} />
      </div>
      <div hidden={tab !== 'unlimited'}>
        <GameBoard mode="unlimited" controller={unlimitedController} api={api} catalog={catalog} store={store} />
      </div>
    </>
  )
}

export default function App() {
  const api = useMemo(() => createApiClient({ baseUrl: API_BASE_URL }), [])
  const { status, retry } = useBackendWarmup(api)
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null)
  const [catalogFailed, setCatalogFailed] = useState(false)
  const [catalogAttempt, setCatalogAttempt] = useState(0)

  useEffect(() => {
    if (status !== 'ready') return
    setCatalogFailed(false)
    api.catalog().then(setCatalog, () => setCatalogFailed(true))
  }, [status, api, catalogAttempt])

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 py-6">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Pokémon Heardle</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Adivina la canción con fragmentos cada vez más largos.</p>
      </header>
      <main>
        {status === 'waking' && (
          <p role="status" className="text-center">
            Despertando el servidor... puede tardar hasta un minuto la primera vez.
          </p>
        )}
        {status === 'error' && (
          <div className="grid justify-items-center gap-3 text-center" role="alert">
            <p>No se pudo conectar con el servidor.</p>
            <button type="button" className="min-h-11 rounded-lg bg-indigo-600 px-4 font-semibold text-white" onClick={retry}>
              Reintentar
            </button>
          </div>
        )}
        {status === 'ready' && !catalog && !catalogFailed && <p role="status" className="text-center">Cargando catálogo...</p>}
        {status === 'ready' && catalogFailed && (
          <div className="grid justify-items-center gap-3 text-center" role="alert">
            <p>No se pudo cargar el catálogo.</p>
            <button
              type="button"
              className="min-h-11 rounded-lg bg-indigo-600 px-4 font-semibold text-white"
              onClick={() => setCatalogAttempt((count) => count + 1)}
            >
              Reintentar
            </button>
          </div>
        )}
        {status === 'ready' && catalog && <LoadedApp catalog={catalog} api={api} />}
      </main>
    </div>
  )
}
