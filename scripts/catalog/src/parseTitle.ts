export interface ParsedTitle {
  title: string
  games: string[]
  needsReview: boolean
}

const SEPARATOR = /\s+[-–—]\s+/
const NOISE_TAG = /^(extended|remaster(ed)?|hd|hq|ost|official|loop(ed)?|\d+\s*hours?.*)$/i
const BRACKET_GROUP = /\(([^()]*)\)|\[([^\[\]]*)\]|【([^【】]*)】/g

function cleanText(text: string): string {
  return text
    .replace(BRACKET_GROUP, (group, round, square, fullwidth) =>
      NOISE_TAG.test((round ?? square ?? fullwidth ?? '').trim()) ? ' ' : group,
    )
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanGameName(text: string): string {
  return cleanText(text).replace(/\s+(OST|Soundtrack|Music)$/i, '').trim()
}

const GAME_HINT = /pok[eé]mon|\b(OST|Soundtrack)\b/i
const SOUNDTRACK_SUFFIX = /\b(OST|Soundtrack)$/i
const SEPARATOR_G = new RegExp(SEPARATOR.source, 'g')

/**
 * Admite los dos ordenes habituales y devuelve { title, games: [Juego] }:
 * - "<Juego> - <Cancion>": se parte por el PRIMER separador; el resto es el titulo.
 * - "<Cancion> - <Juego> Soundtrack": el ULTIMO tramo es el juego si termina en "OST" o
 *   "Soundtrack", o si es el unico extremo que menciona "Pokemon"/"OST"/"Soundtrack".
 *   Lo anterior es el titulo (una cancion puede llamarse "Wild Pokemon Battle").
 * - `knownGameTails`: ultimos tramos que se tratan siempre como juego (los calcula `draft`
 *   a partir de los tramos finales repetidos en la playlist).
 * Separador: guion simple, en dash o em dash rodeado de espacios.
 * Un "juego" es un grupo de versiones con la misma banda sonora, p. ej. "Ruby/Sapphire/Emerald".
 */
export function parseTitle(videoTitle: string, knownGameTails: ReadonlySet<string> = new Set()): ParsedTitle {
  const full = cleanText(String(videoTitle ?? ''))
  const separators = [...full.matchAll(SEPARATOR_G)]
  if (separators.length > 0) {
    const first = separators[0]
    const last = separators[separators.length - 1]
    const head = full.slice(0, first.index)
    const tail = full.slice(last.index! + last[0].length)
    if (
      knownGameTails.has(tail) ||
      SOUNDTRACK_SUFFIX.test(tail) ||
      (GAME_HINT.test(tail) && !GAME_HINT.test(head))
    ) {
      const game = cleanGameName(tail)
      const title = cleanText(full.slice(0, last.index))
      if (game && title) return { title, games: [game], needsReview: false }
    }
    const game = cleanGameName(head)
    const title = cleanText(full.slice(first.index! + first[0].length))
    if (game && title) return { title, games: [game], needsReview: false }
  }
  return { title: full, games: [], needsReview: true }
}

/** Ultimo tramo (tras el ultimo separador) ya limpio, o null si el titulo no tiene separador. */
export function lastSegment(videoTitle: string): string | null {
  const full = cleanText(String(videoTitle ?? ''))
  const separators = [...full.matchAll(SEPARATOR_G)]
  if (separators.length === 0) return null
  const last = separators[separators.length - 1]
  return full.slice(last.index! + last[0].length) || null
}

/**
 * Tramos finales que se repiten en al menos el 30 % de los titulos (y en 3 o mas): en una
 * playlist de una banda sonora son el nombre del juego ("Cancion - Pokemon Diamond and Pearl").
 */
export function commonGameTails(videoTitles: readonly string[]): Set<string> {
  const counts = new Map<string, number>()
  for (const title of videoTitles) {
    const tail = lastSegment(title)
    if (tail) counts.set(tail, (counts.get(tail) ?? 0) + 1)
  }
  const threshold = Math.max(3, Math.ceil(videoTitles.length * 0.3))
  return new Set([...counts].filter(([, count]) => count >= threshold).map(([tail]) => tail))
}
