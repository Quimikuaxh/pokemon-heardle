// DEC-47: silencio inicial de la fuente -> startSec automatico.
import { describe, it, expect, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { isAbsolute, join, basename } from 'node:path'
import {
  SILENCE_ANALYZED_SECONDS,
  SILENCE_MIN_SECONDS,
  SILENCE_NOISE_DB,
  applyLeadingSilence,
  autoStartSec,
  measureLeadingSilence,
  parseLeadingSilence,
  silenceDetectArgs,
} from '../src/silence'
import { catalogOf, fakeRunner, io, makeDataDir, readCatalog, runCliSafe, song, tmp } from './helpers/data'
import type { FakeRunner } from './helpers/data'

const log = (start: string, end?: string) =>
  `[silencedetect @ 0x5581] silence_start: ${start}\n` + (end ? `[silencedetect @ 0x5581] silence_end: ${end} | silence_duration: ${end}\n` : '')

describe('silence: parseLeadingSilence', () => {
  it('SC-SIL-01 silencio que empieza en 0: devuelve su silence_end', () => {
    expect(parseLeadingSilence(log('0', '0.464'))).toBeCloseTo(0.464, 6)
  })

  it('SC-SIL-01 silence_start ligeramente negativo (ffmpeg real: -0.00103628) cuenta como inicial', () => {
    expect(parseLeadingSilence(log('-0.00103628', '0.4623'))).toBeCloseTo(0.4623, 6)
  })

  it('SC-SIL-01 un silencio que NO empieza al principio no es silencio inicial (0)', () => {
    expect(parseLeadingSilence(log('3.2', '3.9'))).toBe(0)
  })

  it('SC-SIL-01 sin silencedetect en la salida (la musica empieza ya): 0', () => {
    expect(parseLeadingSilence('size=N/A time=00:00:10.00 bitrate=N/A speed=300x')).toBe(0)
    expect(parseLeadingSilence('')).toBe(0)
  })

  it('SC-SIL-01 silencio que no termina dentro del tramo analizado: vale el tramo entero (10 s)', () => {
    expect(parseLeadingSilence(log('0'))).toBe(SILENCE_ANALYZED_SECONDS)
  })

  it('SC-SIL-01 solo se usa el PRIMER silencio inicial aunque haya otros despues', () => {
    expect(parseLeadingSilence(log('0', '0.5') + log('4', '5'))).toBeCloseTo(0.5, 6)
  })

  it('SC-SIL-01 nunca devuelve mas del tramo analizado ni negativos', () => {
    expect(parseLeadingSilence(log('0', '42'))).toBe(SILENCE_ANALYZED_SECONDS)
    expect(parseLeadingSilence(log('0', '-1'))).toBe(0)
  })
})

describe('silence: argumentos y medicion', () => {
  it('SC-SIL-02 silencedetect con -50 dB y 0,1 s sobre los primeros 10 s, ruta absoluta y salida nula', () => {
    expect([SILENCE_NOISE_DB, SILENCE_MIN_SECONDS, SILENCE_ANALYZED_SECONDS]).toEqual([-50, 0.1, 10])
    const args = silenceDetectArgs('-BRQ_XVwg-M.webm')
    expect(args.join(' ')).toContain('silencedetect=noise=-50dB:d=0.1')
    expect(args[args.indexOf('-t') + 1]).toBe('10')
    const input = args[args.indexOf('-i') + 1]
    expect([isAbsolute(input), input.startsWith('-')]).toEqual([true, false])
    expect(args.slice(-3)).toEqual(['-f', 'null', expect.stringMatching(/^(\/dev\/null|NUL)$/)])
  })

  it('SC-SIL-02 la ruta viaja como un unico argumento aunque tenga espacios, comillas y ;', () => {
    const evil = `/tmp/it's a "weird"; rm -rf ~ $(whoami).webm`
    expect(silenceDetectArgs(evil).filter((a) => a === evil).length).toBe(1)
  })

  it('SC-SIL-03 measureLeadingSilence lee stderr del runner', async () => {
    const run = vi.fn(async () => ({ stdout: '', stderr: log('0', '0.47') }))
    expect(await measureLeadingSilence('/abs/a.webm', run)).toBeCloseTo(0.47, 6)
    expect((run.mock.calls[0] as unknown[])[0]).toBe('ffmpeg')
  })

  it('SC-SIL-03 ffmpeg no instalado -> error que nombra ffmpeg', async () => {
    const run = vi.fn(async () => {
      throw Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' })
    })
    await expect(measureLeadingSilence('/abs/a.webm', run)).rejects.toThrow(/ffmpeg.*no esta instalado/)
  })
})

describe('silence: startSec automatico', () => {
  for (const [leading, expected] of [
    [0.47, 0.42],
    [0.464, 0.41],
    [0.46, 0.41],
    [2.46, 2.41],
    [0.05, 0],
    [0.03, 0],
    [0, 0],
    [10, 9.95],
  ] as Array<[number, number]>) {
    it(`SC-SIL-04 silencio ${leading} s -> startSec ${expected} (redondeo hacia abajo a 0,01 s menos 0,05 s, nunca negativo)`, () => {
      expect(autoStartSec(leading)).toBe(expected)
    })
  }

  const withSong = (over: Record<string, unknown> = {}): any => ({ ...song({ id: 'a', clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAAA' }), ...over })

  it('SC-SIL-05 startSec 0 sin marca pasa a automatico y guarda la medida', () => {
    const s = withSong()
    applyLeadingSilence(s, 0.47)
    expect([s.startSec, s.source.leadingSilenceSec]).toEqual([0.42, 0.47])
  })

  it('SC-SIL-05 startSecManual: true conserva el startSec (incluso 0) y guarda la medida', () => {
    const s = withSong({ startSecManual: true })
    applyLeadingSilence(s, 0.47)
    expect([s.startSec, s.source.leadingSilenceSec]).toEqual([0, 0.47])
  })

  it('SC-SIL-05 un startSec distinto de 0 sin marca ya estaba puesto a mano: no se toca', () => {
    const s = withSong({ startSec: 12.5 })
    applyLeadingSilence(s, 0.47)
    expect(s.startSec).toBe(12.5)
  })

  it('SC-SIL-05 se mide una sola vez: con leadingSilenceSec guardado no cambia nada', () => {
    const s = withSong()
    s.source.leadingSilenceSec = 1
    applyLeadingSilence(s, 0.47)
    expect([s.startSec, s.source.leadingSilenceSec]).toEqual([0, 1])
  })
})

/** Runner simulado cuyo silencedetect devuelve el silencio configurado por id de video. */
function runnerWithSilence(silence: Record<string, number | Error>, durations: Record<string, number> = {}, fallbackDuration = 100) {
  const base: FakeRunner = fakeRunner(durations, fallbackDuration)
  const detectCalls: string[] = []
  const run = async (command: string, args: string[], options?: { cwd?: string }) => {
    if (command === 'ffmpeg' && args.includes('-hide_banner')) {
      const id = basename(args[args.indexOf('-i') + 1]).replace(/\.[^.]+$/, '')
      detectCalls.push(id)
      const value = silence[id]
      if (value instanceof Error) throw value
      return { stdout: '', stderr: value === undefined || value === 0 ? '' : log('0', String(value)) }
    }
    return base.run(command, args, options)
  }
  return { run, base, detectCalls }
}

const A = { youtubeId: 'AAAAAAAAAAA', title: 'Pokemon Ruby/Sapphire/Emerald - Littleroot Town' }
const B = { youtubeId: 'BBBBBBBBBBB', title: 'Pokemon Ruby/Sapphire/Emerald - Oldale Town' }

describe('draft: silencio inicial (DEC-47)', () => {
  it('SC-SIL-06 draft mide el silencio de las nuevas y fija startSec = silencio - margen', async () => {
    const dir = makeDataDir({ playlist: [A, B], sources: { AAAAAAAAAAA: {}, BBBBBBBBBBB: {} } })
    const r = runnerWithSilence({ AAAAAAAAAAA: 0.47, BBBBBBBBBBB: 0 })
    expect(await runCliSafe(['draft', '--data-dir', dir], io(), { run: r.run })).toBe(0)
    const byId = (id: string) => readCatalog(dir).songs.find((s: any) => s.source.youtubeId === id)
    expect([byId('AAAAAAAAAAA').startSec, byId('AAAAAAAAAAA').source.leadingSilenceSec]).toEqual([0.42, 0.47])
    expect([byId('BBBBBBBBBBB').startSec, byId('BBBBBBBBBBB').source.leadingSilenceSec]).toEqual([0, 0])
  })

  it('SC-SIL-06 una segunda ejecucion no vuelve a medir (idempotente)', async () => {
    const dir = makeDataDir({ playlist: [A], sources: { AAAAAAAAAAA: {} } })
    const first = runnerWithSilence({ AAAAAAAAAAA: 0.47 })
    await runCliSafe(['draft', '--data-dir', dir], io(), { run: first.run })
    const second = runnerWithSilence({ AAAAAAAAAAA: 9 })
    await runCliSafe(['draft', '--data-dir', dir], io(), { run: second.run })
    expect([second.detectCalls, readCatalog(dir).songs[0].startSec]).toEqual([[], 0.42])
  })

  it('SC-SIL-06 una cancion existente con startSec 0 sin marca y sin medida pasa a automatico', async () => {
    const existing = catalogOf([song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAAA', durationSec: 200 })])
    const dir = makeDataDir({ catalog: existing, playlist: [A], sources: { AAAAAAAAAAA: {} } })
    await runCliSafe(['draft', '--data-dir', dir], io(), { run: runnerWithSilence({ AAAAAAAAAAA: 0.5 }).run })
    expect(readCatalog(dir).songs[0].startSec).toBe(0.45)
  })

  it('SC-SIL-06 startSecManual y startSec fijado a mano se respetan', async () => {
    const existing = catalogOf([
      { ...song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAAA', durationSec: 200 }), startSecManual: true },
      song({ id: 'two', clipKey: '2222222222222222', youtubeId: 'BBBBBBBBBBB', durationSec: 200, startSec: 7 }),
    ])
    const dir = makeDataDir({ catalog: existing, playlist: [A, B], sources: { AAAAAAAAAAA: {}, BBBBBBBBBBB: {} } })
    await runCliSafe(['draft', '--data-dir', dir], io(), { run: runnerWithSilence({ AAAAAAAAAAA: 0.5, BBBBBBBBBBB: 0.5 }).run })
    expect(readCatalog(dir).songs.map((s: any) => [s.startSec, s.source.leadingSilenceSec])).toEqual([[0, 0.5], [7, 0.5]])
  })

  it('SC-SIL-06 si la medida falla (ffmpeg) avisa, deja startSec en 0 y no falla', async () => {
    const dir = makeDataDir({ playlist: [A], sources: { AAAAAAAAAAA: {} } })
    const out = io()
    const r = runnerWithSilence({ AAAAAAAAAAA: Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }) })
    expect(await runCliSafe(['draft', '--data-dir', dir], out, { run: r.run })).toBe(0)
    const s = readCatalog(dir).songs[0]
    expect([s.startSec, 'leadingSilenceSec' in s.source]).toEqual([0, false])
    expect(out.text()).toMatch(/silencio inicial/i)
  })

  it('SC-SIL-07 la regla de corta usa el startSec efectivo: 16,3 s con 0,5 s de silencio -> no cabe un clip de 16 s -> desactivada', async () => {
    const dir = makeDataDir({ playlist: [A], sources: { AAAAAAAAAAA: {} } })
    const r = runnerWithSilence({ AAAAAAAAAAA: 0.5 }, { AAAAAAAAAAA: 16.3 })
    await runCliSafe(['draft', '--data-dir', dir], io(), { run: r.run })
    const s = readCatalog(dir).songs[0]
    expect([s.startSec, s.enabled]).toEqual([0.45, false])
  })

  it('SC-SIL-07 el mismo audio sin silencio (16,3 s y startSec 0) sigue activo', async () => {
    const dir = makeDataDir({ playlist: [A], sources: { AAAAAAAAAAA: {} } })
    const r = runnerWithSilence({}, { AAAAAAAAAAA: 16.3 })
    await runCliSafe(['draft', '--data-dir', dir], io(), { run: r.run })
    expect(readCatalog(dir).songs[0].enabled).toBe(true)
  })
})

describe('build: silencio inicial (DEC-47)', () => {
  const L = song({ id: 'larga', clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAAA', reviewed: true })

  it('SC-SIL-08 build mide las activas que no tienen la medida y recompila con el nuevo startSec', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L]), sources: { AAAAAAAAAAA: {} } })
    const first = runnerWithSilence({ AAAAAAAAAAA: 0.47 })
    expect(await runCliSafe(['build', '--data-dir', dir], io(), { run: first.run })).toBe(0)
    const s = readCatalog(dir).songs[0]
    expect([s.startSec, s.source.leadingSilenceSec]).toEqual([0.42, 0.47])
    const master = first.base.ffmpegCalls().find((c) => c.args.includes('-ss'))!
    expect(master.args[master.args.indexOf('-ss') + 1]).toBe('0.42')
  })

  it('SC-SIL-08 un segundo build no vuelve a medir ni a cortar', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L]), sources: { AAAAAAAAAAA: {} } })
    await runCliSafe(['build', '--data-dir', dir], io(), { run: runnerWithSilence({ AAAAAAAAAAA: 0.47 }).run })
    const second = runnerWithSilence({ AAAAAAAAAAA: 3 })
    await runCliSafe(['build', '--data-dir', dir], io(), { run: second.run })
    expect([second.detectCalls, second.base.ffmpegCalls().length]).toEqual([[], 0])
  })

  it('SC-SIL-08 si el startSec cambia (medida nueva) la cancion se recompila aunque el clip ya existiera', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L]), sources: { AAAAAAAAAAA: {} } })
    await runCliSafe(['build', '--data-dir', dir], io(), { run: runnerWithSilence({ AAAAAAAAAAA: 0 }).run }) // medida 0 -> startSec 0
    // se borra la medida a mano para forzar una nueva (documentado en el README del script)
    const { readFileSync, writeFileSync } = await import('node:fs')
    const file = join(dir, 'catalog.json')
    const cat = JSON.parse(readFileSync(file, 'utf8'))
    delete cat.songs[0].source.leadingSilenceSec
    writeFileSync(file, JSON.stringify(cat, null, 2))
    const second = runnerWithSilence({ AAAAAAAAAAA: 1 })
    await runCliSafe(['build', '--data-dir', dir], io(), { run: second.run })
    expect(second.base.ffmpegCalls().length).toBe(2)
    expect(readCatalog(dir).songs[0].startSec).toBe(0.95)
  })

  it('SC-SIL-08 build no mide el silencio de canciones con startSecManual ni cambia su startSec (pero si guarda la medida)', async () => {
    const manual = { ...L, startSecManual: true, startSec: 0 }
    const dir = makeDataDir({ catalog: catalogOf([manual]), sources: { AAAAAAAAAAA: {} } })
    await runCliSafe(['build', '--data-dir', dir], io(), { run: runnerWithSilence({ AAAAAAAAAAA: 2 }).run })
    const s = readCatalog(dir).songs[0]
    expect([s.startSec, s.source.leadingSilenceSec]).toEqual([0, 2])
  })

  it('SC-SIL-08 las canciones desactivadas no se miden', async () => {
    const off = song({ id: 'off', clipKey: '2222222222222222', youtubeId: 'BBBBBBBBBBB', enabled: false })
    const dir = makeDataDir({ catalog: catalogOf([L, off]), sources: { AAAAAAAAAAA: {}, BBBBBBBBBBB: {} } })
    const r = runnerWithSilence({})
    await runCliSafe(['build', '--data-dir', dir], io(), { run: r.run })
    expect(r.detectCalls).toEqual(['AAAAAAAAAAA'])
  })

  it('SC-SIL-08 un fallo de silencedetect no aborta el build: avisa y corta desde el startSec que haya', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L]), sources: { AAAAAAAAAAA: {} } })
    const out = io()
    const r = runnerWithSilence({ AAAAAAAAAAA: new Error('ffmpeg: Invalid data') })
    expect(await runCliSafe(['build', '--data-dir', dir], out, { run: r.run })).toBe(0)
    expect(out.text()).toMatch(/silencio inicial/i)
    expect(readCatalog(dir).songs[0].startSec).toBe(0)
  })

  it('SC-SIL-09 una cancion corta con el startSec actual no se mide (no se va a cortar)', async () => {
    const short = song({ id: 'corta', clipKey: '3333333333333333', youtubeId: 'CCCCCCCCCCC' })
    const dir = makeDataDir({ catalog: catalogOf([short]), sources: { CCCCCCCCCCC: {} } })
    const r = runnerWithSilence({}, { CCCCCCCCCCC: 7.4 })
    await runCliSafe(['build', '--data-dir', dir], io(), { run: r.run })
    expect([r.detectCalls, readCatalog(dir).songs[0].enabled]).toEqual([[], false])
  })
})

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// SC-SIL-10: con ffmpeg real sobre ficheros sinteticos; si no esta instalado, se omite de forma explicita.
describe.skipIf(!hasFfmpeg())('SC-SIL-10 silencio inicial con ffmpeg real', () => {
  function synthetic(name: string, silentSeconds: number): string {
    const file = join(tmp('sil-real-'), name)
    const args = ['-y', '-loglevel', 'error']
    if (silentSeconds > 0) {
      args.push('-f', 'lavfi', '-t', String(silentSeconds), '-i', 'anullsrc=r=44100:cl=stereo', '-f', 'lavfi', '-t', '4', '-i', 'sine=frequency=440:sample_rate=44100')
      args.push('-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[out]', '-map', '[out]')
    } else {
      args.push('-f', 'lavfi', '-t', '4', '-i', 'sine=frequency=440:sample_rate=44100')
    }
    execFileSync('ffmpeg', [...args, file])
    return file
  }

  it('mide ~0,5 s de silencio inicial y startSec automatico ~0,45', async () => {
    const leading = await measureLeadingSilence(synthetic('half.wav', 0.5))
    expect(Math.abs(leading - 0.5)).toBeLessThan(0.05)
    expect(Math.abs(autoStartSec(leading) - 0.45)).toBeLessThan(0.06)
  })

  it('mide ~2,4 s', async () => {
    expect(Math.abs((await measureLeadingSilence(synthetic('long.wav', 2.4))) - 2.4)).toBeLessThan(0.05)
  })

  it('un tono sin silencio inicial da 0 y startSec 0', async () => {
    const leading = await measureLeadingSilence(synthetic('tone.wav', 0))
    expect([leading, autoStartSec(leading)]).toEqual([0, 0])
  })

  it('un silencio de mas de 10 s da el tramo analizado completo', async () => {
    const file = join(tmp('sil-real-'), 'quiet.wav')
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', '12', '-i', 'anullsrc=r=44100:cl=stereo', file])
    expect(await measureLeadingSilence(file)).toBe(SILENCE_ANALYZED_SECONDS)
  })

  it('funciona con un nombre que empieza por "-" y con espacios (ruta absoluta, sin shell)', async () => {
    const dir = tmp('sil-real-')
    const file = join(dir, '-weird name; x.wav')
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', '1', '-i', 'sine=frequency=440', file])
    expect(await measureLeadingSilence(file)).toBe(0)
  })
})
