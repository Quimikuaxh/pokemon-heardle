import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { tooShort, validateCatalog } from '../../../shared/catalog'
import type { Catalog, Song } from '../../../shared/catalog'
import { CLIP_SECONDS } from '../../../shared/rules'
import { startAdminServer } from './admin/server'
import type { AdminServer, AdminServerOptions } from './admin/server'
import { songsToBuild } from './build'
import type { BuildManifest } from './build'
import { createCatalogStore, nodeCatalogFs } from './catalogStore'
import { draftCatalog } from './draft'
import { defaultRunner, findSourceFile, measureDuration } from './duration'
import type { Runner } from './duration'
import { clipArgs, clipOutputPath, masterArgs } from './ffmpegArgs'
import { listAvailableVideos } from './playlist'
import { createS3ObjectStore, readS3Settings } from './s3ObjectStore'
import { runUpload } from './upload'
import { createFfprobeProbe, validateOutput } from './validate'

export interface Io {
  log(message: string): void
  error(message: string): void
}

export interface CliDeps {
  /** Ejecuta ffprobe, ffmpeg, yt-dlp y el build de la UI. */
  run?: Runner
  startServer?: (options: AdminServerOptions) => Promise<AdminServer>
  /** Carpeta del paquete admin-ui (con node_modules y, tras el build, dist). */
  adminUiDir?: string
  /** Resuelve cuando hay que cerrar el admin (por defecto, SIGINT/SIGTERM). */
  waitForShutdown?: () => Promise<void>
}

const DEFAULT_DATA_DIR = join(__dirname, '..', 'data')
const DEFAULT_ADMIN_UI_DIR = join(__dirname, '..', 'admin-ui')
const DEFAULT_ADMIN_PORT = 5180

const USAGE = `Uso: npm run cli -- <subcomando> [--data-dir <ruta>]
  fetch <playlistUrl>   lista la playlist y descarga el audio con yt-dlp
  draft                 anade al catalogo los videos nuevos y mide la duracion de las fuentes
  build                 genera los 6 clips de cada cancion activa con ffmpeg
  validate              comprueba clips, duraciones, metadatos y tamanos
  upload [--prune]      valida y sube clips y catalogo al bucket
  admin [--port 5180]   admin local del catalogo (servidor + UI en 127.0.0.1)
--data-dir (por defecto scripts/catalog/data) vale para todos los subcomandos.`

class UsageError extends Error {}

interface ParsedArgs {
  command: string | undefined
  positional: string[]
  dataDir: string
  prune: boolean
  port: number
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  let dataDir = DEFAULT_DATA_DIR
  let prune = false
  let port = DEFAULT_ADMIN_PORT
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--prune') prune = true
    else if (arg === '--data-dir' || arg === '--port') {
      const value = argv[++index]
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} necesita un valor.`)
      if (arg === '--data-dir') dataDir = resolve(value)
      else {
        if (!/^\d+$/.test(value) || Number(value) > 65535) throw new UsageError(`Puerto no valido: "${value}" (0-65535).`)
        port = Number(value)
      }
    } else if (arg.startsWith('--')) throw new UsageError(`Opcion desconocida: ${arg}.`)
    else positional.push(arg)
  }
  const [command, ...rest] = positional
  return { command, positional: rest, dataDir, prune, port }
}

const dataPaths = (dataDir: string) => ({
  catalog: join(dataDir, 'catalog.json'),
  work: join(dataDir, 'work'),
  playlist: join(dataDir, 'work', 'playlist.json'),
  archive: join(dataDir, 'work', 'download-archive.txt'),
  clips: join(dataDir, 'out', 'clips'),
  localStoreCatalog: join(dataDir, 'out', 'catalog', 'catalog.json'),
  manifest: join(dataDir, 'build-manifest.json'),
})
type DataPaths = ReturnType<typeof dataPaths>

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function readCatalogForCommand(paths: DataPaths): Catalog {
  if (!existsSync(paths.catalog)) throw new Error(`No existe ${paths.catalog}. Ejecuta "draft" primero.`)
  const catalog = JSON.parse(readFileSync(paths.catalog, 'utf8')) as Catalog
  const validation = validateCatalog(catalog)
  if (!validation.ok) throw new Error(`catalog.json no es valido:\n${validation.errors.join('\n')}`)
  return catalog
}

async function fetchPlaylist(paths: DataPaths, run: Runner, playlistUrl: string, io: Io): Promise<void> {
  if (!/^https?:\/\//.test(playlistUrl)) throw new Error('La URL de la playlist debe empezar por http:// o https://')
  mkdirSync(paths.work, { recursive: true })
  const { stdout } = await run('yt-dlp', ['--flat-playlist', '-J', '--', playlistUrl])
  const videos = listAvailableVideos(JSON.parse(stdout).entries ?? [])
  writeJson(paths.playlist, videos)
  io.log(`Playlist: ${videos.length} videos. Descargando audio nuevo...`)
  try {
    await run('yt-dlp', [
      '--ignore-errors',
      '-f',
      'bestaudio',
      '--download-archive',
      paths.archive,
      '-o',
      join(paths.work, '%(id)s.%(ext)s'),
      '--',
      ...videos.map((video) => `https://www.youtube.com/watch?v=${video.youtubeId}`),
    ])
  } catch (error) {
    // yt-dlp sale con 1 si algun video falla pero descarga el resto: se avisa y se sigue.
    if ((error as { code?: unknown }).code !== 1) throw error
    io.error('Aviso: yt-dlp termino con errores en algunos videos; se conservan las descargas parciales.')
  }
}

type Measurement = number | null | Error

/** Aplica una medicion ya hecha a `song`: guarda durationSec y desactiva la corta. Nunca activa nada. */
function applyMeasurement(song: Song, measurement: Measurement | undefined, io: Io): void {
  if (song.source.durationSec !== undefined || measurement === undefined) return
  if (measurement instanceof Error) {
    io.error(`Aviso: no se pudo medir ${song.id}: ${measurement.message}`)
    return
  }
  if (measurement === null) {
    io.error(`Aviso: no se pudo medir la duracion de ${song.id} (ffprobe no devolvio un valor).`)
    return
  }
  song.source.durationSec = measurement
  if (song.enabled && tooShort(measurement, song.startSec)) {
    song.enabled = false
    io.log(`Aviso: ${song.id} es demasiado corta (${measurement} s, hacen falta ${song.startSec + 16} s): desactivada.`)
  }
}

// ffprobe tarda: las mediciones se hacen ANTES de store.update. Dentro del mutator solo hay codigo sincrono,
// asi una edicion del admin hecha mientras se mide no se pierde (lectura-modificacion-escritura corta).
async function measureNewSources(
  existing: Catalog,
  videos: Array<{ youtubeId: string }>,
  paths: DataPaths,
  run: Runner,
): Promise<Map<string, Measurement>> {
  const alreadyMeasured = new Set(existing.songs.filter((song) => song.source.durationSec !== undefined).map((song) => song.source.youtubeId))
  const candidates = new Set([...videos.map((video) => video.youtubeId), ...existing.songs.map((song) => song.source.youtubeId)])
  const measurements = new Map<string, Measurement>()
  for (const youtubeId of candidates) {
    if (alreadyMeasured.has(youtubeId)) continue
    const file = findSourceFile(paths.work, youtubeId)
    if (!file) continue
    try {
      measurements.set(youtubeId, await measureDuration(file, run))
    } catch (error) {
      measurements.set(youtubeId, error as Error)
    }
  }
  return measurements
}

async function draft(paths: DataPaths, run: Runner, io: Io): Promise<void> {
  if (!existsSync(paths.playlist)) throw new Error('No hay playlist descargada. Ejecuta "fetch <playlistUrl>" primero.')
  const videos = JSON.parse(readFileSync(paths.playlist, 'utf8'))
  if (!existsSync(paths.catalog)) {
    const empty: Catalog = { version: 1, generatedAt: new Date().toISOString(), games: [], songs: [] }
    await nodeCatalogFs.writeSynced(paths.catalog, JSON.stringify(empty, null, 2) + '\n')
  }
  const store = createCatalogStore({ file: paths.catalog })
  const snapshot = (await store.readTolerant()).catalog as Catalog
  const measurements = await measureNewSources(snapshot, videos, paths, run)
  let songsBefore = 0
  const next: Catalog = await store.update((current: Catalog) => {
    songsBefore = current.songs.length
    const drafted = draftCatalog(current, videos)
    for (const song of drafted.songs) applyMeasurement(song, measurements.get(song.source.youtubeId), io)
    return drafted
  })
  io.log(`catalog.json: ${next.songs.length - songsBefore} canciones nuevas. Revisalo con "admin" o a mano.`)
  const validation = validateCatalog(next)
  if (!validation.ok) io.log(`Pendiente de corregir:\n${validation.errors.join('\n')}`)
}

function sourceFingerprint(song: Song, paths: DataPaths): string {
  const file = findSourceFile(paths.work, song.source.youtubeId)
  if (!file) return 'missing'
  const stats = statSync(file)
  return `${stats.size}-${Math.floor(stats.mtimeMs)}`
}

// Mide SIEMPRE las fuentes activas antes de cortar y desactiva las cortas. Las mediciones se completan
// antes de escribir: si ffprobe falla no se modifica el catalogo.
async function measureAndDisableShort(paths: DataPaths, run: Runner, io: Io): Promise<Catalog> {
  const store = createCatalogStore({ file: paths.catalog })
  const { catalog } = await store.readTolerant()
  const measured = new Map<string, number | null>()
  for (const song of (catalog.songs as Song[]).filter((candidate) => candidate.enabled)) {
    const file = findSourceFile(paths.work, song.source.youtubeId)
    if (!file) throw new Error(`No hay audio descargado para ${song.id} (${song.source.youtubeId})`)
    measured.set(song.clipKey, await measureDuration(file, run))
  }
  return store.update((current: Catalog) => {
    for (const song of current.songs.filter((candidate) => candidate.enabled)) {
      const seconds = measured.get(song.clipKey)
      if (seconds === undefined) continue
      if (seconds === null) {
        io.error(`Aviso: no se pudo medir la duracion de ${song.id}.`)
        continue
      }
      song.source.durationSec = seconds
      if (tooShort(seconds, song.startSec)) {
        song.enabled = false
        io.log(`Aviso: ${song.id} es demasiado corta (${seconds} s): desactivada, no se genera.`)
      }
    }
  })
}

async function build(paths: DataPaths, run: Runner, io: Io): Promise<void> {
  if (!existsSync(paths.catalog)) throw new Error(`No existe ${paths.catalog}. Ejecuta "draft" primero.`)
  const measuredCatalog = await measureAndDisableShort(paths, run, io)
  const validation = validateCatalog(measuredCatalog)
  if (!validation.ok) throw new Error(`catalog.json no es valido:\n${validation.errors.join('\n')}`)

  const manifest: BuildManifest = existsSync(paths.manifest) ? JSON.parse(readFileSync(paths.manifest, 'utf8')) : {}
  const pending = songsToBuild(measuredCatalog, manifest, (song) => sourceFingerprint(song, paths))
  const scratch = mkdtempSync(join(tmpdir(), 'heardle-build-'))
  try {
    for (const song of pending) {
      const source = findSourceFile(paths.work, song.source.youtubeId)!
      const master = join(scratch, `${song.clipKey}.wav`)
      await run('ffmpeg', masterArgs({ input: source, startSec: song.startSec, output: master }))
      mkdirSync(join(paths.clips, song.clipKey), { recursive: true })
      for (let clipNumber = 1; clipNumber <= CLIP_SECONDS.length; clipNumber++) {
        await run(
          'ffmpeg',
          clipArgs({
            input: master,
            seconds: CLIP_SECONDS[clipNumber - 1],
            output: clipOutputPath(paths.clips, song.clipKey, clipNumber),
          }),
        )
      }
      manifest[song.clipKey] = { startSec: song.startSec, source: sourceFingerprint(song, paths) }
      writeJson(paths.manifest, manifest)
      io.log(`Generado: ${song.id}`)
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  // El backend con STORAGE_DRIVER=fs lee <STORAGE_DIR>/catalog/catalog.json y <STORAGE_DIR>/clips/...
  mkdirSync(dirname(paths.localStoreCatalog), { recursive: true })
  copyFileSync(paths.catalog, paths.localStoreCatalog)
  io.log(`Build completo: ${pending.length} canciones procesadas.`)
}

async function validate(paths: DataPaths, run: Runner, io: Io): Promise<boolean> {
  if (!existsSync(paths.catalog)) throw new Error(`No existe ${paths.catalog}. Ejecuta "draft" primero.`)
  const { catalog } = await createCatalogStore({ file: paths.catalog }).readTolerant()
  const result = await validateOutput({ catalog, outDir: paths.clips, probe: createFfprobeProbe(run) })
  if (result.ok) io.log('Validacion correcta.')
  else io.error(`Validacion fallida:\n${result.errors.join('\n')}`)
  return result.ok
}

async function upload(paths: DataPaths, run: Runner, prune: boolean, io: Io): Promise<void> {
  const catalog = readCatalogForCommand(paths)
  const store = createS3ObjectStore(readS3Settings(process.env))
  const result = await runUpload({
    catalog,
    outDir: paths.clips,
    store,
    prune,
    validate: () => validateOutput({ catalog, outDir: paths.clips, probe: createFfprobeProbe(run) }),
  })
  io.log(`Subidos: ${result.uploaded.length}. Borrados: ${result.deleted.length}.`)
  io.log(
    prune
      ? 'Reinicia el backend en Render. Aviso: --prune ya ha borrado clips; hasta el reinicio el backend puede apuntar a clips borrados (conviene ejecutar --prune despues del reinicio).'
      : 'Reinicia el backend en Render para que recargue el catalogo.',
  )
}

function waitForSignal(): Promise<void> {
  return new Promise((done) => {
    const finish = () => done()
    process.once('SIGINT', finish)
    process.once('SIGTERM', finish)
  })
}

async function admin(args: ParsedArgs, deps: CliDeps, run: Runner, io: Io): Promise<number> {
  const adminUiDir = deps.adminUiDir ?? DEFAULT_ADMIN_UI_DIR
  if (!existsSync(join(adminUiDir, 'node_modules'))) {
    io.error('Faltan las dependencias de la UI del admin. Ejecuta: npm --prefix scripts/catalog/admin-ui install')
    return 1
  }
  try {
    await run('npm', ['--prefix', adminUiDir, 'run', 'build'])
  } catch (error) {
    io.error(`No se pudo compilar la UI del admin (vite build en admin-ui): ${(error as Error).message}`)
    return 1
  }
  let server: AdminServer
  try {
    server = await (deps.startServer ?? startAdminServer)({
      dataDir: args.dataDir,
      uiDir: join(adminUiDir, 'dist'),
      port: args.port,
    })
  } catch (error) {
    io.error(`No se pudo arrancar el admin en el puerto ${args.port}: ${(error as Error).message}`)
    return 1
  }
  io.log(`Admin del catalogo en ${server.url} (datos: ${args.dataDir}). Pulsa Ctrl+C para salir.`)
  await (deps.waitForShutdown ?? waitForSignal)()
  await server.close()
  return 0
}

export async function runCli(
  argv: string[],
  io: Io = { log: console.log, error: console.error },
  deps: CliDeps = {},
): Promise<number> {
  const run = deps.run ?? defaultRunner
  try {
    const args = parseArgs(argv)
    const paths = dataPaths(args.dataDir)
    switch (args.command) {
      case 'fetch':
        if (!args.positional[0]) break
        await fetchPlaylist(paths, run, args.positional[0], io)
        return 0
      case 'draft':
        await draft(paths, run, io)
        return 0
      case 'build':
        await build(paths, run, io)
        return 0
      case 'validate':
        return (await validate(paths, run, io)) ? 0 : 1
      case 'upload':
        await upload(paths, run, args.prune, io)
        return 0
      case 'admin':
        return await admin(args, deps, run, io)
    }
  } catch (error) {
    if (error instanceof UsageError) io.error(`${error.message}\n${USAGE}`)
    else io.error(`Error: ${(error as Error).message}`)
    return 1
  }
  io.error(USAGE)
  return 1
}
