import { addDays, diffDays } from '../../../shared/date'

export type Distribution = Record<'1' | '2' | '3' | '4' | '5' | '6' | 'X', number>

export interface DailyStats {
  played: number
  current: number
  max: number
  lastDate: string | null
  distribution: Distribution
}

export interface UnlimitedStats {
  played: number
  distribution: Distribution
}

const emptyDistribution = (): Distribution => ({ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, X: 0 })

const bucketOf = (attempts: number | null): keyof Distribution => (attempts === null ? 'X' : (String(attempts) as keyof Distribution))

export function emptyDailyStats(): DailyStats {
  return { played: 0, current: 0, max: 0, lastDate: null, distribution: emptyDistribution() }
}

export function emptyUnlimitedStats(): UnlimitedStats {
  return { played: 0, distribution: emptyDistribution() }
}

/** `attempts` null = derrota. Registrar dos veces la misma fecha (recarga) no cambia nada. */
export function recordDaily(stats: DailyStats, date: string, attempts: number | null): DailyStats {
  if (stats.lastDate !== null && diffDays(stats.lastDate, date) <= 0) return stats
  const continuesStreak = stats.lastDate !== null && stats.lastDate === addDays(date, -1)
  const current = attempts === null ? 0 : continuesStreak ? stats.current + 1 : 1
  const distribution = { ...stats.distribution }
  distribution[bucketOf(attempts)] += 1
  return { played: stats.played + 1, current, max: Math.max(stats.max, current), lastDate: date, distribution }
}

export function recordUnlimited(stats: UnlimitedStats, attempts: number | null): UnlimitedStats {
  const distribution = { ...stats.distribution }
  distribution[bucketOf(attempts)] += 1
  return { played: stats.played + 1, distribution }
}
