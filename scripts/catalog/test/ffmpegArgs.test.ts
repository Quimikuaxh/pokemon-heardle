// Contrato: src/ffmpegArgs.ts exporta (todo devuelve string[] para execFile, sin shell)
//   masterArgs({ input, startSec, output }): string[]
//   clipArgs({ input, seconds, output }): string[]
//   clipOutputPath(outDir, clipKey, n /*1..6*/): string
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { masterArgs, clipArgs, clipOutputPath } from '../src/ffmpegArgs'

const SECONDS = [1, 2, 4, 7, 11, 16]
const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1]
const hasPair = (args: string[], a: string, b: string) => args.some((x, i) => x === a && args[i + 1] === b)

describe('masterArgs', () => {
  const args = masterArgs({ input: '/work/vid.m4a', startSec: 12.5, output: '/tmp/master.wav' })

  it('SC-FF-01 -ss con el startSec de la cancion', () => {
    expect(after(args, '-ss')).toBe('12.5')
  })

  it('SC-FF-01 -t 16 (master de 16 s)', () => {
    expect(hasPair(args, '-t', '16')).toBe(true)
  })

  it('SC-FF-01 aplica loudnorm', () => {
    expect(args.some((a) => a.includes('loudnorm'))).toBe(true)
  })

  it('SC-FF-01 entrada tras -i y salida como ultimo argumento', () => {
    expect([after(args, '-i'), args.at(-1)]).toEqual(['/work/vid.m4a', '/tmp/master.wav'])
  })

  it('SC-FF-01 startSec 0 se pasa como "0"', () => {
    expect(after(masterArgs({ input: 'a', startSec: 0, output: 'b' }), '-ss')).toBe('0')
  })
})

describe('clipArgs', () => {
  for (const n of SECONDS) {
    const args = clipArgs({ input: '/tmp/master.wav', seconds: n, output: `/o/${n}.mp3` })

    it(`SC-FF-02 clip de ${n} s: -t ${n}`, () => {
      expect(hasPair(args, '-t', String(n))).toBe(true)
    })

    it(`SC-FF-02 clip de ${n} s: MP3 CBR 128k estereo 44100 Hz (libmp3lame)`, () => {
      expect([hasPair(args, '-b:a', '128k'), hasPair(args, '-ac', '2'), hasPair(args, '-ar', '44100'), hasPair(args, '-c:a', 'libmp3lame')]).toEqual([
        true,
        true,
        true,
        true,
      ])
    })

    it(`SC-FF-02 clip de ${n} s: fundido de salida de 50 ms que termina en ${n} s`, () => {
      const f = args.find((a) => /afade=t=out/.test(a))!
      const m = /st=([0-9.]+):d=0\.05/.exec(f)!
      expect(Number(m[1])).toBeCloseTo(n - 0.05, 5)
    })

    it(`SC-FF-06 clip de ${n} s: el inicio del fundido nunca es negativo`, () => {
      const f = args.find((a) => /afade=t=out/.test(a))!
      expect(Number(/st=(-?[0-9.]+)/.exec(f)![1])).toBeGreaterThanOrEqual(0)
    })
  }

  const a = clipArgs({ input: 'in.wav', seconds: 4, output: 'out.mp3' })

  it('SC-FF-03 sin metadatos: -map_metadata -1', () => {
    expect(hasPair(a, '-map_metadata', '-1')).toBe(true)
  })

  it('SC-FF-03 sin metadatos: -id3v2_version 0', () => {
    expect(hasPair(a, '-id3v2_version', '0')).toBe(true)
  })

  it('SC-FF-03 sin cabecera Xing: -write_xing 0', () => {
    expect(hasPair(a, '-write_xing', '0')).toBe(true)
  })

  it('SC-FF-03 -fflags +bitexact', () => {
    expect(hasPair(a, '-fflags', '+bitexact')).toBe(true)
  })

  it('SC-FF-05 rutas con espacios, comillas y ; viajan intactas como un unico argumento (sin shell)', () => {
    const evil = `/tmp/it's a "weird"; rm -rf ~ $(whoami).m4a`
    const out = `/tmp/o ut; touch x.mp3`
    const args = clipArgs({ input: evil, seconds: 2, output: out })
    expect([args.includes(evil), args.at(-1)]).toEqual([true, out])
    expect(masterArgs({ input: evil, startSec: 1, output: out }).includes(evil)).toBe(true)
  })
})

describe('clipOutputPath', () => {
  it('SC-FF-04 data/out/clips/<clipKey>/<n>.mp3 para n=1..6', () => {
    for (let n = 1; n <= 6; n++) expect(clipOutputPath('/d/out/clips', 'abcdef0123456789', n)).toBe(join('/d/out/clips', 'abcdef0123456789', `${n}.mp3`))
  })

  it('SC-FF-04 la ruta solo contiene el clipKey (nada de ids ni titulos)', () => {
    const p = clipOutputPath('/d/out/clips', 'abcdef0123456789', 2)
    expect(p.replace('/d/out/clips', '')).toBe('/abcdef0123456789/2.mp3')
  })
})
