import { CLIP_BYTE_OFFSETS, CLIP_TOTAL_BYTES } from '../../../shared/rules'

const FRAME_SYNC_FIRST_BYTE = 0xff
const FRAME_SYNC_SECOND_BYTE = 0xfb // MPEG-1 Layer III sin CRC

/**
 * Comprobacion barata del fichero de clip (DEC-44): tamano exacto y cabecera de trama en TODOS los offsets
 * intermedios (los de cualquier intento), no solo en el del intento pedido. Coste constante: 5 comparaciones.
 * Un fichero con un offset roto es un fichero incorrecto sea cual sea el intento, y asi falla pronto y entero.
 */
export function isValidClipFile(file: Buffer): boolean {
  if (file.length !== CLIP_TOTAL_BYTES) return false
  return CLIP_BYTE_OFFSETS.slice(0, -1).every(
    (offset) => file[offset] === FRAME_SYNC_FIRST_BYTE && file[offset + 1] === FRAME_SYNC_SECOND_BYTE,
  )
}
