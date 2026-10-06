import { useEffect, useMemo, useState } from 'react'
import type { PublicCatalog } from '../../shared/api'
import { createApiClient } from './api/client'
import { useBackendWarmup } from './api/warmup'
import { madridDate } from '../../shared/date'
import { GameBoard } from './components/GameBoard'
import { Logo } from './components/Logo'
import { formatDayLabel } from './game/format'
import { API_BASE_URL } from './config'
import { createGameController } from './game/controller'
import { createStore } from './storage/store'

type Tab = 'daily' | 'unlimited'

// Sin overflow-hidden en el grupo (recortaria el aro de foco): los extremos se redondean en cada boton.
const toggleButton = (active: boolean, position: 'first' | 'last') =>
  `min-h-11 border-0 px-3.5 text-[13px] font-semibold lg:px-[18px] lg:text-sm ${position === 'first' ? 'rounded-l-[6px]' : 'rounded-r-[6px]'} ${active ? 'bg-ink text-paper' : 'bg-transparent text-ink'}`

function Header({ tab, onTab }: { tab?: Tab; onTab?: (tab: Tab) => void }) {
  const subtitle = tab === 'unlimited' ? 'MODO LIBRE' : `RETO DEL DÍA · ${formatDayLabel(madridDate(Date.now()))}`
  return (
    <header className="mx-auto mb-3.5 flex min-h-11 w-full max-w-[460px] items-center justify-between gap-3 lg:mb-10 lg:max-w-[1040px]">
      <div className="flex min-w-0 flex-col lg:flex-row lg:items-baseline lg:gap-4">
        <Logo />
        {tab && <span className="font-mono text-[11px] tracking-[1px] text-muted lg:text-xs">{subtitle}</span>}
      </div>
      {tab && onTab && (
        <div role="group" aria-label="Modo de juego" className="flex flex-none rounded-lg border-2 border-edge">
          <button type="button" className={toggleButton(tab === 'daily', 'first')} aria-pressed={tab === 'daily'} onClick={() => onTab('daily')}>
            Diario
          </button>
          <button
            type="button"
            className={toggleButton(tab === 'unlimited', 'last')}
            aria-label="Partida libre"
            aria-pressed={tab === 'unlimited'}
            onClick={() => onTab('unlimited')}
          >
            Libre
          </button>
        </div>
      )}
    </header>
  )
}

const messageButton = 'min-h-11 rounded-full border-[3px] border-edge bg-lamp-red px-5 font-semibold text-white shadow-[0_4px_0_var(--edge)]'

function LoadedApp({ catalog, api }: { catalog: PublicCatalog; api: ReturnType<typeof createApiClient> }) {
  const [tab, setTab] = useState<Tab>('daily')
  const store = useMemo(() => createStore(window.localStorage), [])
  const dailyController = useMemo(() => createGameController({ api, store, catalog }), [api, store, catalog])
  const unlimitedController = useMemo(() => createGameController({ api, store, catalog }), [api, store, catalog])

  return (
    <>
      <Header tab={tab} onTab={setTab} />
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

  const ready = status === 'ready' && catalog

  return (
    <div className="min-h-dvh bg-paper px-4 pb-6 pt-4 text-ink lg:px-12 lg:py-8">
      {!ready && <Header />}
      <main>
        {status === 'waking' && (
          <p role="status" className="text-center">
            Despertando el servidor... puede tardar hasta un minuto la primera vez.
          </p>
        )}
        {status === 'error' && (
          <div className="grid justify-items-center gap-3 text-center" role="alert">
            <p>No se pudo conectar con el servidor.</p>
            <button type="button" className={messageButton} onClick={retry}>
              Reintentar
            </button>
          </div>
        )}
        {status === 'ready' && !catalog && !catalogFailed && <p role="status" className="text-center">Cargando catálogo...</p>}
        {status === 'ready' && catalogFailed && (
          <div className="grid justify-items-center gap-3 text-center" role="alert">
            <p>No se pudo cargar el catálogo.</p>
            <button type="button" className={messageButton} onClick={() => setCatalogAttempt((count) => count + 1)}>
              Reintentar
            </button>
          </div>
        )}
        {ready && <LoadedApp catalog={catalog} api={api} />}
      </main>
    </div>
  )
}
