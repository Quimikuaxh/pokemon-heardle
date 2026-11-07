import { madridDate } from '../../../shared/date'

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

const madridClockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Milisegundos hasta el primer instante del dia siguiente en Europe/Madrid (cambia la cancion del dia). */
export function msUntilNextMadridDay(nowMs: number): number {
  const parts = madridClockFormatter.formatToParts(nowMs)
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const elapsedSec = part('hour') * 3600 + part('minute') * 60 + part('second')
  const candidate = nowMs - (((nowMs % 1000) + 1000) % 1000) + (86_400 - elapsedSec) * 1000
  // Los dias del cambio de hora duran 23 o 25 h: se corrige una hora si la medianoche de reloj no es el cambio de fecha.
  const today = madridDate(nowMs)
  for (const shift of [0, -3_600_000, 3_600_000]) {
    const instant = candidate + shift
    if (madridDate(instant) !== today && madridDate(instant - 1000) === today) return instant - nowMs
  }
  return candidate - nowMs
}

/** Milisegundos -> "HH:MM:SS" (nunca negativo). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}
