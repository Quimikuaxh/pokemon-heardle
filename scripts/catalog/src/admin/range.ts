export type ByteRange = { kind: 'full' } | { kind: 'partial'; start: number; end: number } | { kind: 'unsatisfiable' }

/**
 * Interpreta una cabecera Range de un solo tramo sobre un fichero de `size` bytes.
 * Un Range mal formado o con varios tramos se ignora (respuesta completa); fuera del fichero -> insatisfacible.
 */
export function parseRange(header: string | undefined, size: number): ByteRange {
  if (!header) return { kind: 'full' }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return { kind: 'full' }

  if (match[1] === '') {
    const suffix = Number(match[2])
    if (suffix === 0 || size === 0) return { kind: 'unsatisfiable' }
    return { kind: 'partial', start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(match[1])
  const requestedEnd = match[2] === '' ? size - 1 : Number(match[2])
  if (match[2] !== '' && requestedEnd < start) return { kind: 'full' }
  if (start >= size) return { kind: 'unsatisfiable' }
  return { kind: 'partial', start, end: Math.min(requestedEnd, size - 1) }
}
