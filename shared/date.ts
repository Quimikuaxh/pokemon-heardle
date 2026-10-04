const MADRID_TIME_ZONE = 'Europe/Madrid'

const madridFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MADRID_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function madridDate(instant: Date | number): string {
  const parts = madridFormatter.formatToParts(instant)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

// Aritmetica de calendario en UTC: evita los dias de 23/25 h del cambio de hora.
function toUtcDayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function addDays(date: string, days: number): string {
  const shifted = new Date((toUtcDayNumber(date) + days) * 86_400_000)
  return shifted.toISOString().slice(0, 10)
}
