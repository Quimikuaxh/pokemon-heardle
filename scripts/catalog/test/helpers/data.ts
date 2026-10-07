/**
 * Utilidades de los tests de la iteracion admin-catalogo. REGLA: todo test que arranque el admin, draft, build
 * o cualquier escritura de catalogo trabaja SIEMPRE en un directorio temporal (--data-dir); nunca en data/ real.
 *
 * CONTRATO (implementado en src/):
 *   ids.ts          slugify(text), uniqueId(base, taken: Set<string>)
 *   duration.ts     Runner = (cmd, args, opts?) => Promise<{ stdout }>;  parseFfprobeDuration(stdout): number|null;
 *                   measureDuration(file, run?): Promise<number|null> (ruta SIEMPRE absoluta; ffprobe ausente/!=0 -> rechaza con mensaje que nombra ffprobe);
 *                   findSourceFile(workDir, youtubeId): ruta absoluta o undefined (ignora .part, .ytdl, .json)
 *   catalogStore.ts createCatalogStore({file, fs?}): { file, readTolerant(), update(mutator), idle() };  nodeCatalogFs;
 *                   CatalogFs = { readFile, writeSynced(path,data) (write+fsync), rename, copyFile, unlink, exists }
 *   cli.ts          runCli(argv, io?, deps?: { run?: Runner; startServer?; adminUiDir?; waitForShutdown?() })
 *                   --data-dir <ruta> en fetch/draft/build/validate/upload/admin (por defecto scripts/catalog/data);
 *                   TODAS las ejecuciones de ffprobe/ffmpeg/vite pasan por deps.run
 *   admin/server.ts startAdminServer({dataDir, uiDir?, port?, token?}): Promise<{port,url,token,address(),close()}>
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterAll } from 'vitest'
import { runCli } from '../../src/cli'

const created: string[] = []
afterAll(() => created.forEach((d) => rmSync(d, { recursive: true, force: true })))

export function tmp(prefix = 'heardle-t-', parent: string = tmpdir()): string {
  const d = mkdtempSync(join(parent, prefix))
  created.push(d)
  return d
}

export interface SongSpec {
  id: string
  title?: string
  games?: string[]
  clipKey: string
  youtubeId: string
  enabled?: boolean
  reviewed?: boolean
  startSec?: number
  durationSec?: number
  videoTitle?: string
}

export function song(spec: SongSpec): any {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    games: spec.games ?? ['rse'],
    clipKey: spec.clipKey,
    startSec: spec.startSec ?? 0,
    enabled: spec.enabled ?? true,
    reviewed: spec.reviewed ?? false,
    source: {
      youtubeId: spec.youtubeId,
      videoTitle: spec.videoTitle ?? `Video ${spec.id}`,
      ...(spec.durationSec === undefined ? {} : { durationSec: spec.durationSec }),
    },
  }
}

export function catalogOf(songs: any[], games?: Array<{ id: string; name: string }>): any {
  return {
    version: 1,
    generatedAt: '2026-10-04T10:00:00Z',
    games: games ?? [
      { id: 'rse', name: 'Pokemon Ruby / Sapphire / Emerald', consoles: ['GBA'] },
      { id: 'dp', name: 'Pokemon Diamond / Pearl', consoles: ['DS'] },
    ],
    songs,
  }
}

export function writeJsonFile(file: string, value: unknown): string {
  mkdirSync(dirname(file), { recursive: true })
  const text = JSON.stringify(value, null, 2) + '\n'
  writeFileSync(file, text)
  return text
}

/** Crea un data-dir temporal con catalog.json, fuentes en work/ y (opcional) work/playlist.json. */
export function makeDataDir(options: {
  catalog?: any
  sources?: Record<string, { ext?: string; bytes?: number | Buffer }>
  playlist?: Array<{ youtubeId: string; title: string }>
  /** Directorio padre propio (por defecto el tmp del sistema, compartido con otros ficheros de test). */
  parent?: string
}): string {
  const dir = tmp('heardle-t-', options.parent)
  mkdirSync(join(dir, 'work'), { recursive: true })
  if (options.catalog) writeJsonFile(join(dir, 'catalog.json'), options.catalog)
  for (const [id, spec] of Object.entries(options.sources ?? {})) {
    const body = Buffer.isBuffer(spec.bytes) ? spec.bytes : Buffer.alloc(spec.bytes ?? 64, 7)
    writeFileSync(join(dir, 'work', `${id}.${spec.ext ?? 'webm'}`), body)
  }
  if (options.playlist) writeJsonFile(join(dir, 'work', 'playlist.json'), options.playlist)
  return dir
}

export const readCatalog = (dir: string): any => JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'))
export const catalogText = (dir: string): string => readFileSync(join(dir, 'catalog.json'), 'utf8')

export interface FakeRunner {
  run: (command: string, args: string[], options?: { cwd?: string }) => Promise<{ stdout: string }>
  calls: Array<{ command: string; args: string[] }>
  probed: () => string[] // ids (nombre sin extension) medidos con ffprobe, en orden
  ffmpegCalls: () => Array<{ command: string; args: string[] }>
}

/**
 * Runner simulado: ffprobe devuelve la duracion configurada por nombre de fichero (sin extension);
 * un valor Error hace rechazar; ffmpeg crea el fichero de salida (ultimo argumento).
 */
export function fakeRunner(durations: Record<string, number | Error>, fallback: number | Error = 100): FakeRunner {
  const calls: FakeRunner['calls'] = []
  const run: FakeRunner['run'] = async (command, args) => {
    calls.push({ command, args })
    if (command === 'ffprobe') {
      const file = args[args.length - 1]
      const id = basename(file).replace(/\.[^.]+$/, '')
      const value = id in durations ? durations[id] : fallback
      if (value instanceof Error) throw value
      return { stdout: `${value.toFixed(6)}\n` }
    }
    if (command === 'ffmpeg') {
      const out = args[args.length - 1]
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, 'fake-audio')
      return { stdout: '' }
    }
    return { stdout: '' }
  }
  return {
    run,
    calls,
    probed: () => calls.filter((c) => c.command === 'ffprobe').map((c) => basename(c.args[c.args.length - 1]).replace(/\.[^.]+$/, '')),
    ffmpegCalls: () => calls.filter((c) => c.command === 'ffmpeg'),
  }
}

/**
 * runCli protegido: si el codigo de src/cli.ts dejara de mencionar --data-dir, un comando como draft/build/validate/upload
 * operaria sobre el scripts/catalog/data REAL (ruta fija); en ese caso se rechaza SIN ejecutar nada.
 */
export async function runCliSafe(argv: string[], out: { log(m: string): void; error(m: string): void }, deps?: unknown): Promise<number> {
  if (argv.includes('--data-dir')) {
    const source = readFileSync(join(__dirname, '..', '..', 'src', 'cli.ts'), 'utf8')
    if (!/--data-dir|data-dir/.test(source)) throw new Error('src/cli.ts no soporta --data-dir (no se ejecuta para no tocar el data/ real)')
  }
  return runCli(argv, out, deps as any)
}

export const io = () => {
  const lines: string[] = []
  return { log: (m: string) => void lines.push(m), error: (m: string) => void lines.push(m), text: () => lines.join('\n') }
}

export { existsSync }
