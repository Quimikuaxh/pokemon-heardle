import type { Store } from '../storage/store'
import type { Distribution } from '../game/stats'

const BUCKETS: Array<keyof Distribution> = ['1', '2', '3', '4', '5', '6', 'X']

function DistributionBars({ distribution }: { distribution: Distribution }) {
  const peak = Math.max(1, ...BUCKETS.map((bucket) => distribution[bucket]))
  return (
    <div className="grid gap-1" role="list" aria-label="Distribución de aciertos">
      {BUCKETS.map((bucket) => (
        <div key={bucket} role="listitem" className="flex items-center gap-2 text-xs">
          <span className="w-4 text-right font-mono">{bucket}</span>
          <div
            className="h-5 rounded bg-indigo-600 px-1 text-right text-white"
            style={{ width: `${Math.max(8, (distribution[bucket] / peak) * 100)}%` }}
          >
            {distribution[bucket]}
          </div>
        </div>
      ))}
    </div>
  )
}

export function StatsPanel({ store, mode }: { store: Store; mode: 'daily' | 'unlimited' }) {
  const daily = mode === 'daily' ? store.getStats('daily') : null
  const unlimited = mode === 'unlimited' ? store.getStats('unlimited') : null
  const played = daily?.played ?? unlimited?.played ?? 0
  const distribution = (daily ?? unlimited)!.distribution

  return (
    <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">Estadísticas</summary>
      <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Partidas</dt>
          <dd className="text-xl font-bold">{played}</dd>
        </div>
        {daily && (
          <>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Racha</dt>
              <dd className="text-xl font-bold">{daily.current}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Mejor racha</dt>
              <dd className="text-xl font-bold">{daily.max}</dd>
            </div>
          </>
        )}
      </dl>
      <DistributionBars distribution={distribution} />
    </details>
  )
}
