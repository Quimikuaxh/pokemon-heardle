import type { ResultName } from '../../../shared/api'
import { MAX_ATTEMPTS } from '../../../shared/rules'

const EMOJI: Record<ResultName, string> = { hit: '🟩', game: '🟨', miss: '🟥', skip: '⬛' }
const UNUSED = '⬜'

/** Recibe solo modo, fecha y resultados: la solucion no puede colarse en el texto. */
export function buildShareText(options: { mode: 'daily' | 'unlimited'; date?: string; results: string[] }): string {
  const row = Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
    const result = options.results[index] as ResultName | undefined
    return result ? (EMOJI[result] ?? UNUSED) : UNUSED
  }).join('')
  const won = options.results[options.results.length - 1] === 'hit'
  const score = `${won ? options.results.length : 'X'}/${MAX_ATTEMPTS}`
  const header =
    options.mode === 'daily' ? `Pokémon Heardle diario ${options.date ?? ''}`.trim() : 'Pokémon Heardle (partida libre)'
  return `${header}\n${score}\n${row}`
}

export async function copyToClipboard(text: string, nav: Navigator = navigator): Promise<'copied' | 'fallback'> {
  try {
    if (!nav.clipboard) return 'fallback'
    await nav.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'fallback'
  }
}
