import type { GameView, ResultName } from '../../../shared/api'

/** Segundos del clip del intento en curso; null si la partida ha terminado. */
export function currentClipSeconds(view: Pick<GameView, 'status' | 'attempt' | 'clipSeconds'>): number | null {
  if (view.status !== 'playing') return null
  return view.clipSeconds[view.attempt] ?? null
}

const LABELS: Record<ResultName, string> = {
  hit: 'Acertada',
  game: 'Juego acertado',
  miss: 'Juego incorrecto',
  skip: 'Saltado',
}

export function resultLabel(result: string): string {
  return LABELS[result as ResultName] ?? result
}
