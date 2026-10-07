import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAdminApi } from './api'
import type { AdminCatalog } from './api'
import { filterSongs } from './filters'
import type { SongFilters } from './filters'
import { FilterBar } from './components/FilterBar'
import { GamesPanel } from './components/GamesPanel'
import { SongRow } from './components/SongRow'

export function AdminApp({ fetchFn }: { fetchFn?: typeof fetch }) {
  const api = useMemo(() => createAdminApi({ fetchFn }), [fetchFn])
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<SongFilters>({})
  const latestLoad = useRef(0)

  const reload = useCallback(async () => {
    const ticket = ++latestLoad.current
    try {
      const loaded = await api.loadCatalog()
      if (ticket === latestLoad.current) setCatalog(loaded)
    } catch (loadError) {
      if (ticket === latestLoad.current) setError((loadError as Error).message)
    }
  }, [api])

  useEffect(() => {
    void reload()
  }, [reload])

  // El catalogo puede cambiar fuera del admin (build, edicion a mano): se recarga al volver a la pestana.
  useEffect(() => {
    const reloadIfVisible = () => {
      if (document.visibilityState !== 'hidden') void reload()
    }
    window.addEventListener('focus', reloadIfVisible)
    document.addEventListener('visibilitychange', reloadIfVisible)
    return () => {
      window.removeEventListener('focus', reloadIfVisible)
      document.removeEventListener('visibilitychange', reloadIfVisible)
    }
  }, [reload])

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setError(null)
      let succeeded = true
      try {
        await action()
      } catch (actionError) {
        succeeded = false
        setError((actionError as Error).message)
      }
      await reload()
      return succeeded
    },
    [reload],
  )

  const visibleSongs = useMemo(() => (catalog ? filterSongs(catalog, filters) : []), [catalog, filters])

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Admin del catálogo</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Herramienta local: los cambios se guardan en data/catalog.json.</p>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">
          {error}
        </p>
      )}

      {!catalog && !error && <p role="status">Cargando catálogo...</p>}

      {catalog && (
        <>
          <GamesPanel
            games={catalog.games}
            totalSongs={catalog.songs.length}
            onCreate={(name) => run(() => api.createGame(name))}
            onPatchGame={(id, patch) => run(() => api.patchGame(id, patch))}
            onInvalid={setError}
          />
          <FilterBar games={catalog.games} filters={filters} onChange={setFilters} />
          <p className="my-3 text-sm text-slate-600 dark:text-slate-300">Mostrando {visibleSongs.length}</p>
          <ul className="grid gap-3">
            {visibleSongs.map((song) => (
              <SongRow
                key={song.id}
                song={song}
                games={catalog.games}
                onPatch={(patch) => run(() => api.patchSong(song.id, patch))}
                onInvalid={setError}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
