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
 * Separador: guion simple, en dash o em dash rodeado de espacios.
 * Un "juego" es un grupo de versiones con la misma banda sonora, p. ej. "Ruby/Sapphire/Emerald".
 */
export function parseTitle(videoTitle: string): ParsedTitle {
  const full = cleanText(String(videoTitle ?? ''))
  const separators = [...full.matchAll(SEPARATOR_G)]
  if (separators.length > 0) {
    const first = separators[0]
    const last = separators[separators.length - 1]
    const head = full.slice(0, first.index)
    const tail = full.slice(last.index! + last[0].length)
    if (SOUNDTRACK_SUFFIX.test(tail) || (GAME_HINT.test(tail) && !GAME_HINT.test(head))) {
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
