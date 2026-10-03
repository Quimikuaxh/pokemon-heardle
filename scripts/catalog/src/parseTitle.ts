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
  return cleanText(text).replace(/\s+OST$/i, '').trim()
}

/**
 * "<Juego> - <Cancion>" -> { title, games: [Juego] }. Se parte por el PRIMER separador
 * (guion simple, en dash o em dash rodeado de espacios): el resto es el titulo.
 * Un "juego" es un grupo de versiones con la misma banda sonora, p. ej. "Ruby/Sapphire/Emerald".
 */
export function parseTitle(videoTitle: string): ParsedTitle {
  const full = cleanText(String(videoTitle ?? ''))
  const separator = SEPARATOR.exec(full)
  if (separator) {
    const game = cleanGameName(full.slice(0, separator.index))
    const title = cleanText(full.slice(separator.index + separator[0].length))
    if (game && title) return { title, games: [game], needsReview: false }
  }
  return { title: full, games: [], needsReview: true }
}
