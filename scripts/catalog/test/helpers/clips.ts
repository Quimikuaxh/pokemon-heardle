/**
 * Clips sinteticos del layout nuevo (DEC-44): <outDir>/<clipKey>.mp3 de 256.626 bytes (614 tramas MPEG-1 L3 128k 44,1 kHz
 * estereo, patron 417/418, main_data_begin=0). Generador compartido con shared/ y backend (shared/test/helpers/mp3.ts),
 * independiente de las constantes de produccion.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMp3 } from '../../../../shared/test/helpers/mp3'

export { buildMp3 }
export const TOTAL_BYTES = 256626
export const OFFSETS = [16300, 32182, 64365, 112013, 176378, 256626]

/** Escribe el clip nuevo de una cancion. */
export function writeClip(outDir: string, clipKey: string, options?: Parameters<typeof buildMp3>[1]): string {
  mkdirSync(outDir, { recursive: true })
  const file = join(outDir, `${clipKey}.mp3`)
  writeFileSync(file, buildMp3(clipKey, options))
  return file
}

/** Layout antiguo: <outDir>/<clipKey>/<n>.mp3 (6 ficheros). */
export function writeOldLayout(outDir: string, clipKey: string): string {
  const dir = join(outDir, clipKey)
  mkdirSync(dir, { recursive: true })
  for (let n = 1; n <= 6; n++) writeFileSync(join(dir, `${n}.mp3`), `antiguo-${clipKey}-${n}`)
  return dir
}
