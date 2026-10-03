const CLIP_KEY_PATTERN = /^[0-9a-f]{16}$/
const MAX_CLIP_NUMBER = 6

/** Valida clipKey y numero de clip antes de construir cualquier ruta o clave de objeto (anti path traversal). */
export function isValidClipLocation(clipKey: string, clipNumber: number): boolean {
  return (
    typeof clipKey === 'string' &&
    CLIP_KEY_PATTERN.test(clipKey) &&
    Number.isInteger(clipNumber) &&
    clipNumber >= 1 &&
    clipNumber <= MAX_CLIP_NUMBER
  )
}
