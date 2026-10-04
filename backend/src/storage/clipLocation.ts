const CLIP_KEY_PATTERN = /^[0-9a-f]{16}$/

/** Valida el clipKey antes de construir cualquier ruta o clave de objeto (anti path traversal). */
export function isValidClipLocation(clipKey: string): boolean {
  return typeof clipKey === 'string' && CLIP_KEY_PATTERN.test(clipKey)
}
