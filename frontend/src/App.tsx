import { useEffect, useMemo, useState } from 'react'
import type { PublicCatalog } from '../../shared/api'
import { createApiClient } from './api/client'
import { useBackendWarmup } from './api/warmup'
import { GameBoard } from './components/GameBoard'
import { DexLeftBody, DexPanel, DexRightBody, DexControls, DexScreen, DexTop, PokedexShell } from './components/Pokedex'
import { SettingsPanel } from './components/SettingsPanel'
import { API_BASE_URL } from './config'
import { createGameController } from './game/controller'
import { createStore } from './storage/store'
import { hasSpinoffs } from './game/scope'
import type { Series } from '../../shared/rules'
import type { HintSettings } from './storage/store'

type Tab = 'daily' | 'unlimited'

// Sin overflow-hidden en el grupo (recortaria el aro de foco): los extremos se redondean en cada boton.
const toggleButton = (active: boolean, position: 'first' | 'last') =>
  // pt-0.5 en movil: Rubik a 14 px deja el texto 1 px alto en el boton (medido: 15,5 / 17,5 px arriba / abajo).
  `min-h-11 border-0 px-4 pt-0.5 text-sm font-bold lg:min-h-12 lg:px-[18px] lg:pt-0 lg:text-base ${position === 'first' ? 'rounded-l-[7px]' : 'rounded-r-[7px]'} ${active ? 'bg-ink text-white' : 'bg-[#f4f4f2] text-ink'}`

interface ControlsProps {
  tab: Tab
  onTab: (tab: Tab) => void
  settings: HintSettings
  onSettingsChange: (settings: HintSettings) => void
  /** Serie del diario y su cambio (DEC-60); sin `onSeries` no hay spin-offs y no se pinta el conmutador. */
  series: Series
  onSeries?: (series: Series) => void
}

/** Controles bajo la cabecera de la hoja izquierda (DEC-59): tecla de pistas, serie del diario (DEC-60) y modo. */
function Controls({ tab, onTab, settings, onSettingsChange, series, onSeries }: ControlsProps) {
  return (
    <DexControls>
      <SettingsPanel settings={settings} onChange={onSettingsChange} />
      {onSeries && tab === 'daily' && (
        // Movil: segunda fila a todo el ancho, bajo Pistas y Diario/Libre; escritorio: en la misma fila, antes del modo.
        <div
          role="group"
          aria-label="Serie del diario"
          className="order-last flex basis-full rounded-[10px] border-[3px] border-edge shadow-[0_4px_0_var(--edge)] lg:order-none lg:ml-auto lg:basis-auto lg:flex-none"
        >
          <button type="button" className={`flex-1 lg:flex-none ${toggleButton(series === 'main', 'first')}`} aria-pressed={series === 'main'} onClick={() => onSeries('main')}>
            Principal
          </button>
          <button type="button" className={`flex-1 lg:flex-none ${toggleButton(series === 'spinoff', 'last')}`} aria-pressed={series === 'spinoff'} onClick={() => onSeries('spinoff')}>
            Spin-off
          </button>
        </div>
      )}
      <div role="group" aria-label="Modo de juego" className="flex flex-none rounded-[10px] border-[3px] border-edge shadow-[0_4px_0_var(--edge)]">
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
    </DexControls>
  )
}

const messageButton = 'min-h-12 rounded-[10px] border-[3px] border-edge bg-dex-blue px-5 font-bold text-white shadow-[0_4px_0_var(--edge)]'

function LoadedApp({ catalog, api }: { catalog: PublicCatalog; api: ReturnType<typeof createApiClient> }) {
  const [tab, setTab] = useState<Tab>('daily')
  const store = useMemo(() => createStore(window.localStorage), [])
  const [settings, setSettings] = useState(() => store.getSettings())
  const [volume, setVolume] = useState(() => store.getVolume())
  const dailyController = useMemo(() => createGameController({ api, store, catalog }), [api, store, catalog])
  const spinoffController = useMemo(() => createGameController({ api, store, catalog, dailySeries: 'spinoff' }), [api, store, catalog])
  const unlimitedController = useMemo(() => createGameController({ api, store, catalog }), [api, store, catalog])
  // Diario spin-off (DEC-60): solo con juegos spin-off en el catalogo; su tablero se monta la primera vez que se elige
  // (montarlo crea la partida del dia).
  const spinoffs = useMemo(() => hasSpinoffs(catalog), [catalog])
  const [series, setSeries] = useState<Series>(() => (spinoffs ? store.getDailySeries() : 'main'))
  const [spinoffMounted, setSpinoffMounted] = useState(series === 'spinoff')
  const changeSeries = (next: Series) => {
    store.setDailySeries(next)
    setSeries(next)
    if (next === 'spinoff') setSpinoffMounted(true)
  }

  const changeSettings = (next: HintSettings) => {
    store.setSettings(next)
    setSettings(next)
  }

  const changeVolume = (next: number) => {
    store.setVolume(next)
    setVolume(store.getVolume())
  }

  return (
    <>
      <Controls tab={tab} onTab={setTab} settings={settings} onSettingsChange={changeSettings} series={series} onSeries={spinoffs ? changeSeries : undefined} />
      {spinoffMounted && (
        <div hidden={tab !== 'daily' || series !== 'spinoff'} className="contents">
          <GameBoard mode="daily" series="spinoff" controller={spinoffController} api={api} catalog={catalog} store={store} settings={settings} volume={volume} onVolumeChange={changeVolume} />
        </div>
      )}
      <div hidden={tab !== 'daily' || series !== 'main'} className="contents">
        <GameBoard mode="daily" controller={dailyController} api={api} catalog={catalog} store={store} settings={settings} volume={volume} onVolumeChange={changeVolume} />
      </div>
      <div hidden={tab !== 'unlimited'} className="contents">
        <GameBoard mode="unlimited" controller={unlimitedController} api={api} catalog={catalog} store={store} settings={settings} volume={volume} onVolumeChange={changeVolume} />
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

  const statusText = 'm-0 font-mono text-sm tracking-[1px]'
  return (
    <div className="flex min-h-dvh flex-col px-3 py-3 lg:justify-center lg:px-12">
      <main>
        <PokedexShell>
          {ready ? (
            <LoadedApp catalog={catalog} api={api} />
          ) : (
            <>
              <DexTop />
              <DexLeftBody>
                <DexScreen title="REPRODUCTOR" label="——">
                  <div className="grid min-h-36 place-items-center text-center text-played lg:min-h-[212px]">
                    {status === 'waking' && (
                      <p role="status" className={statusText}>
                        Conectando con el servidor…
                      </p>
                    )}
                    {status === 'ready' && !catalog && !catalogFailed && (
                      <p role="status" className={statusText}>
                        Cargando catálogo…
                      </p>
                    )}
                    {status === 'error' && (
                      <div className="grid justify-items-center gap-3" role="alert">
                        <p className={`${statusText} text-lost-text`}>No se pudo conectar con el servidor.</p>
                        <button type="button" className={messageButton} onClick={retry}>
                          Reintentar
                        </button>
                      </div>
                    )}
                    {status === 'ready' && catalogFailed && (
                      <div className="grid justify-items-center gap-3" role="alert">
                        <p className={`${statusText} text-lost-text`}>No se pudo cargar el catálogo.</p>
                        <button type="button" className={messageButton} onClick={() => setCatalogAttempt((count) => count + 1)}>
                          Reintentar
                        </button>
                      </div>
                    )}
                  </div>
                </DexScreen>
              </DexLeftBody>
              <DexRightBody>
                <DexPanel title="ENTRADAS" label="— / 6">
                  <div aria-hidden="true" className="grid min-h-40 place-items-center font-mono text-sm tracking-[2px] text-[#8a8c93] lg:min-h-[330px]">
                    ● ● ●
                  </div>
                </DexPanel>
              </DexRightBody>
            </>
          )}
        </PokedexShell>
      </main>
    </div>
  )
}
