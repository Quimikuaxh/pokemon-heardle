const MAX_ID_LENGTH = 56
const FALLBACK_ID = 'item'

/** Texto -> [a-z0-9-]+ sin acentos, sin guiones dobles ni en los extremos ('' si no queda nada). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Id libre derivado de `base` (recortado; nunca vacio) con sufijo -2, -3... si colisiona.
 * Anade el resultado a `taken`.
 */
export function uniqueId(base: string, taken: Set<string>): string {
  const root = base.slice(0, MAX_ID_LENGTH).replace(/-+$/g, '') || FALLBACK_ID
  let candidate = root
  for (let suffix = 2; taken.has(candidate); suffix++) candidate = `${root}-${suffix}`
  taken.add(candidate)
  return candidate
}
