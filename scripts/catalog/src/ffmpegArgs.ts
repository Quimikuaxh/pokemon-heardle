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

export function clipArgs(options: { input: string; seconds: number; output: string }): string[] {
  const fadeStart = Math.max(0, options.seconds - FADE_OUT_SECONDS)
  return [
    '-y',
    '-fflags',
    '+bitexact',
    '-i',
    options.input,
    '-t',
    String(options.seconds),
    '-af',
    `afade=t=out:st=${Number(fadeStart.toFixed(3))}:d=${FADE_OUT_SECONDS}`,
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
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

export function clipOutputPath(outDir: string, clipKey: string, clipNumber: number): string {
  return join(outDir, clipKey, `${clipNumber}.mp3`)
}
