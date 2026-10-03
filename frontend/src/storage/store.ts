import type { GameView } from '../../../shared/api'
import { emptyDailyStats, emptyUnlimitedStats } from '../game/stats'
import type { DailyStats, UnlimitedStats } from '../game/stats'

export interface DailyRecord {
  token: string
  finished: boolean
  view?: GameView
}

export interface UnlimitedRecord {
  token: string
}

type StatsKind = 'daily' | 'unlimited'

export interface Store {
  /** true tras un fallo de escritura (cuota excedida o almacenamiento bloqueado). */
  readonly writeFailed: boolean
  getFilter(): string[]
  setFilter(ids: string[]): void
  getDaily(date: string): DailyRecord | null
  setDaily(date: string, record: DailyRecord): void
  getUnlimited(): UnlimitedRecord | null
  setUnlimited(record: UnlimitedRecord | null): void
  getStats(kind: 'daily'): DailyStats
  getStats(kind: 'unlimited'): UnlimitedStats
  getStats(kind: StatsKind): DailyStats | UnlimitedStats
  setStats(kind: StatsKind, stats: DailyStats | UnlimitedStats): void
}

const PREFIX = 'heardle:'
const DISTRIBUTION_KEYS = ['1', '2', '3', '4', '5', '6', 'X']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

const isDistribution = (value: unknown) =>
  isRecord(value) && DISTRIBUTION_KEYS.every((key) => isCount(value[key]))

const isDailyStats = (value: unknown): value is DailyStats =>
  isRecord(value) &&
  isCount(value.played) &&
  isCount(value.current) &&
  isCount(value.max) &&
  (value.lastDate === null || typeof value.lastDate === 'string') &&
  isDistribution(value.distribution)

const isUnlimitedStats = (value: unknown): value is UnlimitedStats =>
  isRecord(value) && isCount(value.played) && isDistribution(value.distribution)

const isDailyRecord = (value: unknown): value is DailyRecord =>
  isRecord(value) &&
  typeof value.token === 'string' &&
  typeof value.finished === 'boolean' &&
  (value.view === undefined || isRecord(value.view))

const isUnlimitedRecord = (value: unknown): value is UnlimitedRecord => isRecord(value) && typeof value.token === 'string'

/** Ninguna operacion lanza: si localStorage falla, la app sigue sin persistir (FE-STA-11). */
export function createStore(storage: Storage): Store {
  let writeFailed = false

  function read<T>(key: string, isValid: (value: unknown) => value is T): T | null {
    try {
      const raw = storage.getItem(PREFIX + key)
      if (raw === null) return null
      const parsed: unknown = JSON.parse(raw)
      return isValid(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  function write(key: string, value: unknown): void {
    try {
      storage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      writeFailed = true
    }
  }

  function remove(key: string): void {
    try {
      storage.removeItem(PREFIX + key)
    } catch {
      writeFailed = true
    }
  }

  return {
    get writeFailed() {
      return writeFailed
    },
    getFilter: () => read('filter', (v): v is string[] => Array.isArray(v) && v.every((id) => typeof id === 'string')) ?? [],
    setFilter: (ids) => write('filter', ids),
    getDaily: (date) => read(`daily:${date}`, isDailyRecord),
    setDaily: (date, record) => write(`daily:${date}`, record),
    getUnlimited: () => read('unlimited', isUnlimitedRecord),
    setUnlimited: (record) => (record ? write('unlimited', record) : remove('unlimited')),
    getStats: ((kind: StatsKind) =>
      kind === 'daily'
        ? (read('stats:daily', isDailyStats) ?? emptyDailyStats())
        : (read('stats:unlimited', isUnlimitedStats) ?? emptyUnlimitedStats())) as Store['getStats'],
    setStats: (kind, stats) => write(`stats:${kind}`, stats),
  }
}
