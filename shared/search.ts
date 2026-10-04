/** Minusculas sin acentos ni espacios extremos, para comparar texto de busqueda. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Busqueda por palabras: cada palabra de `query` debe aparecer (texto literal, sin regex) en
 * alguno de los `fields`. Asi "ruby battle" encuentra "Trainer Battle" de Ruby/Sapphire/Emerald.
 * Una consulta vacia no coincide con nada.
 */
export function matchesAllWords(query: string, fields: readonly string[]): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return false
  const haystack = fields.map(normalizeText)
  return words.every((word) => haystack.some((field) => field.includes(word)))
}
