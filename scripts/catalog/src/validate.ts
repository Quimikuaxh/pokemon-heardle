import { existsSync, readFileSync } from 'node:fs'
import type { Catalog } from '../../../shared/catalog'
import { validateCatalog } from '../../../shared/catalog'
import { CLIP_BYTE_OFFSETS, CLIP_FRAME_COUNTS, CLIP_SECONDS, CLIP_TOTAL_BYTES } from '../../../shared/rules'
import { defaultRunner } from './duration'
import type { Runner } from './duration'
import { clipOutputPath } from './ffmpegArgs'

export type Probe = (file: string) => Promise<{ durationSec: number; tags: Record<string, string> }>

// Sin cabecera Xing (-write_xing 0, necesario para que no haya huella por cancion) ffprobe estima la
// duracion por tramas y mide ~40-50 ms de mas (16,039 s para el fichero de 16 s). El clip no debe ser mas
// corto de lo esperado ni exceder dos tramas MP3 (~26 ms cada una).
const FULL_CLIP_SECONDS = CLIP_SECONDS[CLIP_SECONDS.length - 1]
const MAX_SHORTFALL_SEC = 0.03
const MAX_EXCESS_SEC = 0.06
// "encoder" es la firma del muxer, igual para todas las canciones: no identifica nada.
const HARMLESS_TAGS = new Set(['encoder'])

const SYNC_FIRST_BYTE = 0xff
const SYNC_SECOND_BYTE = 0xfb // MPEG-1 Layer III sin CRC
const BITRATE_128K_INDEX = 9
const SAMPLE_RATE_44100_INDEX = 0
const JOINT_OR_STEREO_MONO_BITS = 3 // canal "mono" en los 2 bits altos del cuarto byte
const MIN_FRAME_BYTES = 417

/**
 * Recorre el fichero trama a trama (DEC-44): MPEG-1 Layer III 128 kbps 44,1 kHz estereo, sin ID3 ni Xing/Info,
 * `main_data_begin` = 0 (sin bit reservoir), 614 tramas y todos los offsets de los intentos en limite de trama.
 * Devuelve los problemas encontrados (vacio si el fichero es correcto).
 */
export function checkClipFormat(file: Buffer): string[] {
  const problems: string[] = []
  if (file.length !== CLIP_TOTAL_BYTES) {
    problems.push(`mide ${file.length} bytes y deberia medir ${CLIP_TOTAL_BYTES}`)
    return problems
  }
  if (file.subarray(0, 3).toString('latin1') === 'ID3') problems.push('empieza por una etiqueta ID3')
  const firstFrameHead = file.subarray(0, 64).toString('latin1')
  if (firstFrameHead.includes('Xing') || firstFrameHead.includes('Info')) problems.push('la primera trama es una cabecera Xing/Info')

  const starts = new Set<number>()
  let position = 0
  let frame = 0
  while (position < file.length) {
    starts.add(position)
    const bitrateIndex = file[position + 2] >> 4
    const sampleRateIndex = (file[position + 2] >> 2) & 3
    const padding = (file[position + 2] >> 1) & 1
    const isMono = file[position + 3] >> 6 === JOINT_OR_STEREO_MONO_BITS
    if (
      file[position] !== SYNC_FIRST_BYTE ||
      file[position + 1] !== SYNC_SECOND_BYTE ||
      bitrateIndex !== BITRATE_128K_INDEX ||
      sampleRateIndex !== SAMPLE_RATE_44100_INDEX ||
      isMono
    ) {
      problems.push(`la trama ${frame} (byte ${position}) no es MPEG-1 Layer III 128 kbps 44,1 kHz estereo`)
      return problems
    }
    const mainDataBegin = (file[position + 4] << 1) | (file[position + 5] >> 7)
    if (mainDataBegin !== 0) {
      problems.push(`la trama ${frame} (byte ${position}) usa bit reservoir (main_data_begin = ${mainDataBegin}); codifica con -reservoir 0`)
      return problems
    }
    position += MIN_FRAME_BYTES + padding
    frame += 1
  }
  if (position !== file.length) problems.push(`el recorrido de tramas acaba en el byte ${position} y el fichero mide ${file.length}`)
  if (frame !== CLIP_FRAME_COUNTS[CLIP_FRAME_COUNTS.length - 1]) problems.push(`tiene ${frame} tramas y deberia tener ${CLIP_FRAME_COUNTS[CLIP_FRAME_COUNTS.length - 1]}`)
  for (const offset of CLIP_BYTE_OFFSETS.slice(0, -1)) {
    if (!starts.has(offset)) problems.push(`el offset ${offset} no es limite de trama`)
  }
  return problems
}

/** `draft` crea los juegos sin consolas (DEC-51): hay que asignarlas antes de publicar un juego con canciones activas. */
function gamesMissingConsoles(catalog: Catalog): string[] {
  const gamesWithActiveSongs = new Set(catalog.songs.filter((song) => song.enabled).flatMap((song) => song.games))
  return catalog.games
    .filter((game) => gamesWithActiveSongs.has(game.id) && !(Array.isArray(game.consoles) && game.consoles.length > 0))
    .map((game) => `juego ${game.id}: faltan las consolas (consoles); asignalas en el admin o en catalog.json`)
}

/**
 * Comprueba los clips generados: un `<clipKey>.mp3` por cancion activa con el formato de DEC-44, duracion de
 * 16 s (-30 ms / +60 ms, ver MAX_EXCESS_SEC) y sin etiquetas de metadatos.
 */
export async function validateOutput(options: {
  catalog: Catalog
  outDir: string
  probe: Probe
}): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = []
  const structure = validateCatalog(options.catalog)
  if (!structure.ok) errors.push(...structure.errors.map((message) => `catalogo: ${message}`))

  errors.push(...gamesMissingConsoles(options.catalog))

  for (const song of options.catalog.songs.filter((candidate) => candidate.enabled)) {
    const file = clipOutputPath(options.outDir, song.clipKey)
    const label = `${song.id} (${song.clipKey}.mp3)`
    if (!existsSync(file)) {
      errors.push(`${label}: falta el clip; ejecuta build (el layout antiguo <clipKey>/<n>.mp3 ya no vale)`)
      continue
    }
    errors.push(...checkClipFormat(readFileSync(file)).map((problem) => `${label}: ${problem}`))

    try {
      const { durationSec, tags } = await options.probe(file)
      const deviation = durationSec - FULL_CLIP_SECONDS
      if (deviation < -MAX_SHORTFALL_SEC - 1e-9 || deviation > MAX_EXCESS_SEC + 1e-9) {
        errors.push(
          `${label}: dura ${durationSec.toFixed(3)} s y deberia durar entre ${FULL_CLIP_SECONDS - MAX_SHORTFALL_SEC} y ${FULL_CLIP_SECONDS + MAX_EXCESS_SEC} s`,
        )
      }
      const foundTags = Object.keys(tags).filter((tag) => !HARMLESS_TAGS.has(tag.toLowerCase()))
      if (foundTags.length > 0) errors.push(`${label}: tiene metadatos (${foundTags.join(', ')})`)
    } catch (error) {
      errors.push(`${label}: no se pudo analizar con ffprobe (${(error as Error).message})`)
    }
  }

  return { ok: errors.length === 0, errors }
}

export function createFfprobeProbe(run: Runner = defaultRunner): Probe {
  return async (file) => {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', file])
    const format = JSON.parse(stdout).format ?? {}
    return { durationSec: Number(format.duration), tags: format.tags ?? {} }
  }
}

export const ffprobeProbe: Probe = createFfprobeProbe()
