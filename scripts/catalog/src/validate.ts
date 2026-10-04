import { existsSync, statSync } from 'node:fs'
import type { Catalog } from '../../../shared/catalog'
import { validateCatalog } from '../../../shared/catalog'
import { CLIP_SECONDS } from '../../../shared/rules'
import { defaultRunner } from './duration'
import type { Runner } from './duration'
import { clipOutputPath } from './ffmpegArgs'

export type Probe = (file: string) => Promise<{ durationSec: number; tags: Record<string, string> }>

// Sin cabecera Xing (-write_xing 0, necesario para que no haya huella por cancion) ffprobe estima la
// duracion por tramas y mide de 0.04 a 0.05 s de mas (1.045, 2.038, 4.049, 7.027, 11.050, 16.039 s).
// El clip nunca debe ser mas corto de lo esperado (revelaria menos) ni exceder dos tramas MP3 (~26 ms c/u).
const MAX_SHORTFALL_SEC = 0.03
const MAX_EXCESS_SEC = 0.06
// "encoder" es la firma del muxer, igual para todas las canciones: no identifica nada.
const HARMLESS_TAGS = new Set(['encoder'])

/**
 * Comprueba los clips generados: 6 por cancion activa, duracion esperada (-30 ms / +60 ms, ver MAX_EXCESS_SEC), sin etiquetas y,
 * para cada intento, mismo tamano en bytes en todas las canciones (con CBR el tamano no debe delatar la cancion).
 */
export async function validateOutput(options: {
  catalog: Catalog
  outDir: string
  probe: Probe
}): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = []
  const structure = validateCatalog(options.catalog)
  if (!structure.ok) errors.push(...structure.errors.map((message) => `catalogo: ${message}`))

  const sizesByClip: Array<Map<number, string[]>> = CLIP_SECONDS.map(() => new Map())

  for (const song of options.catalog.songs.filter((candidate) => candidate.enabled)) {
    for (let clipNumber = 1; clipNumber <= CLIP_SECONDS.length; clipNumber++) {
      const file = clipOutputPath(options.outDir, song.clipKey, clipNumber)
      const label = `${song.clipKey}/${clipNumber}.mp3`
      if (!existsSync(file)) {
        errors.push(`${label}: falta el clip (cancion ${song.id})`)
        continue
      }
      const bytes = statSync(file).size
      const owners = sizesByClip[clipNumber - 1].get(bytes) ?? []
      owners.push(song.clipKey)
      sizesByClip[clipNumber - 1].set(bytes, owners)

      try {
        const { durationSec, tags } = await options.probe(file)
        const expected = CLIP_SECONDS[clipNumber - 1]
        const deviation = durationSec - expected
        if (deviation < -MAX_SHORTFALL_SEC - 1e-9 || deviation > MAX_EXCESS_SEC + 1e-9) {
          errors.push(
            `${label}: dura ${durationSec.toFixed(3)} s y deberia durar entre ${expected - MAX_SHORTFALL_SEC} y ${expected + MAX_EXCESS_SEC} s`,
          )
        }
        const foundTags = Object.keys(tags).filter((tag) => !HARMLESS_TAGS.has(tag.toLowerCase()))
        if (foundTags.length > 0) errors.push(`${label}: tiene metadatos (${foundTags.join(', ')})`)
      } catch (error) {
        errors.push(`${label}: no se pudo analizar con ffprobe (${(error as Error).message})`)
      }
    }
  }

  sizesByClip.forEach((sizes, index) => {
    if (sizes.size > 1) {
      const detail = [...sizes].map(([bytes, keys]) => `${bytes} bytes: ${keys.join(', ')}`).join(' | ')
      errors.push(`clip ${index + 1}: el tamano en bytes difiere entre canciones (${detail})`)
    }
  })

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
