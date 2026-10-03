import { execFile } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { validateCatalog } from '../../../shared/catalog'
import type { Catalog, Song } from '../../../shared/catalog'
import { CLIP_SECONDS } from '../../../shared/rules'
import { songsToBuild } from './build'
import type { BuildManifest } from './build'
import { draftCatalog } from './draft'
import { clipArgs, clipOutputPath, masterArgs } from './ffmpegArgs'
import { createS3ObjectStore, readS3Settings } from './s3ObjectStore'
import { listAvailableVideos } from './playlist'
import { runUpload } from './upload'
import { ffprobeProbe, validateOutput } from './validate'

export interface Io {
  log(message: string): void
  error(message: string): void
}

const execFileAsync = promisify(execFile)

const DATA_DIR = join(__dirname, '..', 'data')
const paths = {
  catalog: join(DATA_DIR, 'catalog.json'),
  work: join(DATA_DIR, 'work'),
  playlist: join(DATA_DIR, 'work', 'playlist.json'),
  archive: join(DATA_DIR, 'work', 'download-archive.txt'),
  clips: join(DATA_DIR, 'out', 'clips'),
  localStoreCatalog: join(DATA_DIR, 'out', 'catalog', 'catalog.json'),
  manifest: join(DATA_DIR, 'build-manifest.json'),
}

const USAGE = `Uso: npm run cli -- <subcomando>
  fetch <playlistUrl>   lista la playlist y descarga el audio con yt-dlp
  draft                 anade al catalogo los videos nuevos (no pisa lo revisado)
  build                 genera los 6 clips de cada cancion activa con ffmpeg
  validate              comprueba clips, duraciones, metadatos y tamanos
  upload [--prune]      valida y sube clips y catalogo al bucket`

function readCatalogFile(): Catalog | null {
  if (!existsSync(paths.catalog)) return null
  return JSON.parse(readFileSync(paths.catalog, 'utf8')) as Catalog
}

function requireCatalog(): Catalog {
  const catalog = readCatalogFile()
  if (!catalog) throw new Error(`No existe ${paths.catalog}. Ejecuta "draft" primero.`)
  const validation = validateCatalog(catalog)
  if (!validation.ok) throw new Error(`catalog.json no es valido:\n${validation.errors.join('\n')}`)
  return catalog
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function findSourceFile(song: Song): string | undefined {
  if (!existsSync(paths.work)) return undefined
  const name = readdirSync(paths.work).find(
    (file) => file.startsWith(`${song.source.youtubeId}.`) && !file.endsWith('.part'),
  )
  return name ? join(paths.work, name) : undefined
}

function sourceFingerprint(song: Song): string {
  const file = findSourceFile(song)
  if (!file) return 'missing'
  const stats = statSync(file)
  return `${stats.size}-${Math.floor(stats.mtimeMs)}`
}

async function fetchPlaylist(playlistUrl: string, io: Io): Promise<void> {
  if (!/^https?:\/\//.test(playlistUrl)) throw new Error('La URL de la playlist debe empezar por http:// o https://')
  mkdirSync(paths.work, { recursive: true })
  const { stdout } = await execFileAsync('yt-dlp', ['--flat-playlist', '-J', '--', playlistUrl], {
    maxBuffer: 64 * 1024 * 1024,
  })
  const videos = listAvailableVideos(JSON.parse(stdout).entries ?? [])
  writeJson(paths.playlist, videos)
  io.log(`Playlist: ${videos.length} videos. Descargando audio nuevo...`)
  try {
    await execFileAsync(
    'yt-dlp',
    [
      '--ignore-errors',
      '-f',
      'bestaudio',
      '--download-archive',
      paths.archive,
      '-o',
      join(paths.work, '%(id)s.%(ext)s'),
      '--',
      ...videos.map((video) => `https://www.youtube.com/watch?v=${video.youtubeId}`),
    ],
    { maxBuffer: 64 * 1024 * 1024 },
    )
  } catch (error) {
    // yt-dlp sale con 1 si algun video falla pero descarga el resto: se avisa y se sigue.
    if ((error as { code?: unknown }).code !== 1) throw error
    io.error('Aviso: yt-dlp termino con errores en algunos videos; se conservan las descargas parciales.')
  }
}

function draft(io: Io): void {
  if (!existsSync(paths.playlist)) throw new Error('No hay playlist descargada. Ejecuta "fetch <playlistUrl>" primero.')
  const videos = JSON.parse(readFileSync(paths.playlist, 'utf8'))
  const before = readCatalogFile()
  const catalog = draftCatalog(before, videos)
  writeJson(paths.catalog, catalog)
  io.log(`catalog.json: ${catalog.songs.length - (before?.songs.length ?? 0)} canciones nuevas. Revisalo a mano.`)
  const validation = validateCatalog(catalog)
  if (!validation.ok) io.log(`Pendiente de corregir:\n${validation.errors.join('\n')}`)
}

async function build(io: Io): Promise<void> {
  const catalog = requireCatalog()
  const manifest: BuildManifest = existsSync(paths.manifest) ? JSON.parse(readFileSync(paths.manifest, 'utf8')) : {}
  const pending = songsToBuild(catalog, manifest, sourceFingerprint)
  const scratch = mkdtempSync(join(tmpdir(), 'heardle-build-'))
  try {
    for (const song of pending) {
      const source = findSourceFile(song)
      if (!source) throw new Error(`No hay audio descargado para ${song.id} (${song.source.youtubeId})`)
      const master = join(scratch, `${song.clipKey}.wav`)
      await execFileAsync('ffmpeg', masterArgs({ input: source, startSec: song.startSec, output: master }))
      mkdirSync(join(paths.clips, song.clipKey), { recursive: true })
      for (let clipNumber = 1; clipNumber <= CLIP_SECONDS.length; clipNumber++) {
        await execFileAsync(
          'ffmpeg',
          clipArgs({
            input: master,
            seconds: CLIP_SECONDS[clipNumber - 1],
            output: clipOutputPath(paths.clips, song.clipKey, clipNumber),
          }),
        )
      }
      manifest[song.clipKey] = { startSec: song.startSec, source: sourceFingerprint(song) }
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

async function validate(io: Io): Promise<boolean> {
  const result = await validateOutput({ catalog: requireCatalog(), outDir: paths.clips, probe: ffprobeProbe })
  if (result.ok) io.log('Validacion correcta.')
  else io.error(`Validacion fallida:\n${result.errors.join('\n')}`)
  return result.ok
}

async function upload(prune: boolean, io: Io): Promise<void> {
  const catalog = requireCatalog()
  const store = createS3ObjectStore(readS3Settings(process.env))
  const result = await runUpload({
    catalog,
    outDir: paths.clips,
    store,
    prune,
    validate: () => validateOutput({ catalog, outDir: paths.clips, probe: ffprobeProbe }),
  })
  io.log(`Subidos: ${result.uploaded.length}. Borrados: ${result.deleted.length}.`)
  io.log(
    prune
      ? 'Reinicia el backend en Render. Aviso: --prune ya ha borrado clips; hasta el reinicio el backend puede apuntar a clips borrados (conviene ejecutar --prune despues del reinicio).'
      : 'Reinicia el backend en Render para que recargue el catalogo.',
  )
}

export async function runCli(
  argv: string[],
  io: Io = { log: console.log, error: console.error },
): Promise<number> {
  const [command, ...args] = argv
  try {
    switch (command) {
      case 'fetch':
        if (!args[0]) break
        await fetchPlaylist(args[0], io)
        return 0
      case 'draft':
        draft(io)
        return 0
      case 'build':
        await build(io)
        return 0
      case 'validate':
        return (await validate(io)) ? 0 : 1
      case 'upload':
        await upload(args.includes('--prune'), io)
        return 0
    }
  } catch (error) {
    io.error(`Error: ${(error as Error).message}`)
    return 1
  }
  io.error(USAGE)
  return 1
}
