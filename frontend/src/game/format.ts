const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

/** Segundos -> "m:ss" (se trunca, como un reproductor). */
export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** "2026-10-06" -> "06 OCT". */
export function formatDayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${day} ${MONTHS[Number(month) - 1] ?? ''}`.trim()
}
