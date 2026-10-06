import { resolve } from 'node:path'
import type { Song } from '../../../shared/catalog'
import { defaultRunner } from './duration'
import type { Runner } from './duration'

/** Umbral de "silencio" (dB) y duracion minima (s) de silencedetect, y tramo analizado de la fuente (DEC-47). */
export const SILENCE_NOISE_DB = -50
export const SILENCE_MIN_SECONDS = 0.1
export const SILENCE_ANALYZED_SECONDS = 10
/** El clip empieza un poco antes de la musica para no recortar el ataque de la primera nota. */
export const START_MARGIN_SECONDS = 0.05
/** Un silencio que "empieza" antes de este segundo cuenta como silencio inicial (ffmpeg puede dar -0,001). */
const LEADING_SILENCE_START_TOLERANCE = 0.05

const NULL_OUTPUT = process.platform === 'win32' ? 'NUL' : '/dev/null'

/** Argumentos de ffmpeg para medir el silencio inicial (la ruta se resuelve a absoluta: hay ids que empiezan por "-"). */
export function silenceDetectArgs(file: string): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-t',
    String(SILENCE_ANALYZED_SECONDS),
    '-i',
    resolve(file),
    '-af',
    `silencedetect=noise=${SILENCE_NOISE_DB}dB:d=${SILENCE_MIN_SECONDS}`,
    '-f',
    'null',
    NULL_OUTPUT,
  ]
}

/**
 * Silencio inicial (s) a partir de la salida de silencedetect (stderr de ffmpeg): el primer silencio solo cuenta si
 * empieza al principio; si no termina dentro del tramo analizado, vale el tramo entero.
 */
export function parseLeadingSilence(log: string): number {
  const start = /silence_start:\s*(-?\d+(?:\.\d+)?)/.exec(log)
  if (!start || Number(start[1]) > LEADING_SILENCE_START_TOLERANCE) return 0
  const end = /silence_end:\s*(-?\d+(?:\.\d+)?)/.exec(log.slice(start.index))
  if (!end) return SILENCE_ANALYZED_SECONDS
  return Math.min(Math.max(Number(end[1]), 0), SILENCE_ANALYZED_SECONDS)
}

/** Mide el silencio inicial con ffmpeg. Rechaza (nombrando ffmpeg) si no se puede ejecutar. */
export async function measureLeadingSilence(file: string, run: Runner = defaultRunner): Promise<number> {
  let output: { stdout: string; stderr?: string }
  try {
    output = await run('ffmpeg', silenceDetectArgs(file))
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr
    // silencedetect escribe en stderr; con codigo != 0 no hay medida fiable.
    const reason = (error as { code?: unknown }).code === 'ENOENT' ? 'no esta instalado' : 'ha fallado'
    throw new Error(`ffmpeg ${reason} al medir el silencio inicial de ${resolve(file)}${typeof stderr === 'string' && stderr ? ` (${stderr.trim().split('\n').pop()})` : ''}.`)
  }
  return parseLeadingSilence(output.stderr ?? '')
}

/** startSec automatico: silencio inicial redondeado hacia abajo a 0,01 s menos el margen (nunca negativo). */
export function autoStartSec(leadingSilenceSec: number): number {
  const floored = Math.floor(leadingSilenceSec * 100 + 1e-9) / 100
  return Number(Math.max(0, floored - START_MARGIN_SECONDS).toFixed(2))
}

/**
 * Guarda la medida y, si el inicio no lo fijo una persona, mueve startSec a donde arranca la musica.
 * Automatico = sin `startSecManual` y con startSec 0 (un startSec != 0 sin marca ya estaba puesto a mano).
 * Se mide una sola vez: con `leadingSilenceSec` ya guardado no se vuelve a tocar nada.
 */
export function applyLeadingSilence(song: Song, leadingSilenceSec: number): void {
  if (song.source.leadingSilenceSec !== undefined) return
  song.source.leadingSilenceSec = leadingSilenceSec
  if (song.startSecManual !== true && song.startSec === 0) song.startSec = autoStartSec(leadingSilenceSec)
}
