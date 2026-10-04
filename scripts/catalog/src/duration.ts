import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

export type Runner = (
  command: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<{ stdout: string; stderr?: string }>

const execFileAsync = promisify(execFile)

export const defaultRunner: Runner = (command, args, options) =>
  execFileAsync(command, args, { cwd: options?.cwd, maxBuffer: 64 * 1024 * 1024 })

const DURATION_PATTERN = /^\d+(\.\d+)?$/

/** Salida de ffprobe -> segundos; null si no es medible (N/A, vacio, <= 0, no finito). */
export function parseFfprobeDuration(stdout: string): number | null {
  const text = stdout.trim()
  if (!DURATION_PATTERN.test(text)) return null
  const seconds = Number(text)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

/**
 * Mide la fuente con ffprobe. La ruta se resuelve a absoluta: 6 youtubeId empiezan por "-" y con ruta
 * relativa ffprobe los tomaria por una opcion.
 */
export async function measureDuration(file: string, run: Runner = defaultRunner): Promise<number | null> {
  const absolute = resolve(file)
  let stdout: string
  try {
    ;({ stdout } = await run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      absolute,
    ]))
  } catch (error) {
    const reason = (error as { code?: unknown }).code === 'ENOENT' ? 'no esta instalado' : 'ha fallado'
    throw new Error(`ffprobe ${reason} al medir ${absolute}. Instala ffmpeg (apt install ffmpeg).`)
  }
  return parseFfprobeDuration(stdout)
}

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const IGNORED_SUFFIXES = ['.part', '.ytdl', '.json']

/** Fuente descargada de un video (ruta absoluta) o undefined; ignora descargas a medias y metadatos. */
export function findSourceFile(workDir: string, youtubeId: string): string | undefined {
  // Con un id vacio o hostil el prefijo casaria con ficheros ocultos de work/.
  if (!YOUTUBE_ID_PATTERN.test(youtubeId)) return undefined
  let names: string[]
  try {
    names = readdirSync(workDir)
  } catch {
    return undefined
  }
  const name = names
    .filter((candidate) => candidate.startsWith(`${youtubeId}.`))
    .filter((candidate) => !IGNORED_SUFFIXES.some((suffix) => candidate.endsWith(suffix)))
    .sort()[0]
  return name ? join(resolve(workDir), name) : undefined
}
