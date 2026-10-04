import { join } from 'node:path'

const MASTER_SECONDS = 16
const FADE_OUT_SECONDS = 0.05

/** Todos los builders devuelven un array para execFile: nunca pasan por un shell. */
export function masterArgs(options: { input: string; startSec: number; output: string }): string[] {
  return [
    '-y',
    '-ss',
    String(options.startSec),
    '-t',
    String(MASTER_SECONDS),
    '-i',
    options.input,
    '-af',
    'loudnorm',
    '-ar',
    '44100',
    '-ac',
    '2',
    options.output,
  ]
}

/**
 * UN clip de 16 s por cancion (DEC-44): MP3 CBR sin bit reservoir (cada trama es autocontenida, asi un prefijo
 * cortado en limite de trama no arrastra audio posterior) y con el unico fundido de 50 ms al final del fichero.
 * El fundido de cada intento lo hace el navegador (DEC-45).
 */
export function clipArgs(options: { input: string; output: string }): string[] {
  return [
    '-y',
    '-fflags',
    '+bitexact',
    '-i',
    options.input,
    '-t',
    String(MASTER_SECONDS),
    '-af',
    `afade=t=out:st=${Number((MASTER_SECONDS - FADE_OUT_SECONDS).toFixed(3))}:d=${FADE_OUT_SECONDS}`,
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    '-reservoir',
    '0',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-map_metadata',
    '-1',
    '-id3v2_version',
    '0',
    '-write_xing',
    '0',
    options.output,
  ]
}

export function clipOutputPath(outDir: string, clipKey: string): string {
  return join(outDir, `${clipKey}.mp3`)
}
