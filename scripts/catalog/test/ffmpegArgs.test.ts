// Contrato: src/ffmpegArgs.ts exporta (todo devuelve string[] para execFile, sin shell)
//   masterArgs({ input, startSec, output }): string[]
//   clipArgs({ input, output }): string[]            UN clip de 16 s por cancion (DEC-44); ya no recibe `seconds`
//   clipOutputPath(outDir, clipKey): string          <outDir>/<clipKey>.mp3
// SC-FF-02 y SC-FF-06 (un clip por intento y su fundido) estan RETIRADOS: sustituidos por SC-CLP-01..03 y FE-WA-05.
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { masterArgs, clipArgs, clipOutputPath } from '../src/ffmpegArgs'

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

describe('clipArgs (clip unico de 16 s)', () => {
  const args = clipArgs({ input: '/tmp/master.wav', output: '/o/aaaaaaaaaaaaaaaa.mp3' })

  it('SC-CLP-01 un clip de 16 s: -t 16, MP3 CBR 128k, estereo, 44100 Hz, libmp3lame', () => {
    expect([hasPair(args, '-t', '16'), hasPair(args, '-b:a', '128k'), hasPair(args, '-ac', '2'), hasPair(args, '-ar', '44100'), hasPair(args, '-c:a', 'libmp3lame')]).toEqual([true, true, true, true, true])
  })

  it('SC-CLP-01 -reservoir 0 (sin bit reservoir: cada trama es autocontenida)', () => {
    expect(hasPair(args, '-reservoir', '0')).toBe(true)
  })

  it('SC-CLP-01 entrada tras -i y salida <clipKey>.mp3 como ultimo argumento', () => {
    expect([after(args, '-i'), args.at(-1)]).toEqual(['/tmp/master.wav', '/o/aaaaaaaaaaaaaaaa.mp3'])
  })

  it('SC-CLP-01 nada por intento: ningun -t distinto de 16 ni duraciones de 1/2/4/7/11 s', () => {
    expect(args.filter((a, i) => args[i - 1] === '-t')).toEqual(['16'])
    expect(args.join(' ')).not.toMatch(/\b(1|2|4|7|11)\.mp3|\/[1-6]\.mp3/)
  })

  it('SC-CLP-01 no acepta ni usa un numero de segundos por intento (la firma ya no tiene `seconds`)', () => {
    expect(hasPair(clipArgs({ input: 'a', output: 'b', seconds: 4 } as any), '-t', '16')).toBe(true)
  })

  it('SC-CLP-02 el unico fundido del fichero es el de 50 ms al final de los 16 s (afade=t=out:st=15.95:d=0.05)', () => {
    const fades = args.filter((a) => a.includes('afade'))
    expect(fades.length).toBe(1)
    expect(fades[0]).toContain('afade=t=out:st=15.95:d=0.05')
    expect(args.filter((a) => /afade/.test(a)).length).toBe(1)
  })

  it('SC-FF-03 sin metadatos, sin Xing y sin reservoir', () => {
    expect([
      hasPair(args, '-map_metadata', '-1'),
      hasPair(args, '-id3v2_version', '0'),
      hasPair(args, '-write_xing', '0'),
      hasPair(args, '-fflags', '+bitexact'),
      hasPair(args, '-reservoir', '0'),
    ]).toEqual([true, true, true, true, true])
  })

  it('SC-CLP-03 rutas con espacios, comillas y ; viajan intactas como un unico argumento (sin shell)', () => {
    const evil = `/tmp/it's a "weird"; rm -rf ~ $(whoami).wav`
    const out = `/tmp/o ut; touch x/0123456789abcdef.mp3`
    const a = clipArgs({ input: evil, output: out })
    expect([a.filter((x) => x === evil).length, a.at(-1)]).toEqual([1, out])
    expect(masterArgs({ input: evil, startSec: 1, output: out }).includes(evil)).toBe(true)
  })

  it('SC-CLP-03 ningun argumento (salvo opciones) empieza por "-" si es una ruta: entrada y salida absolutas', () => {
    const a = clipArgs({ input: '/tmp/-master.wav', output: '/o/-ab.mp3' })
    expect([a[a.indexOf('-i') + 1].startsWith('/'), a.at(-1)!.startsWith('/')]).toEqual([true, true])
  })
})

describe('clipOutputPath', () => {
  it('SC-FF-04 data/out/clips/<clipKey>.mp3 (sin subdirectorio ni numero)', () => {
    expect(clipOutputPath('/d/out/clips', 'abcdef0123456789')).toBe(join('/d/out/clips', 'abcdef0123456789.mp3'))
  })

  it('SC-FF-04 la ruta solo contiene el clipKey (nada de ids ni titulos ni numero de intento)', () => {
    expect(clipOutputPath('/d/out/clips', 'abcdef0123456789').replace('/d/out/clips', '')).toBe('/abcdef0123456789.mp3')
  })

  it('SC-FF-04 el segundo argumento numerico antiguo no cambia la ruta (no hay <clipKey>/<n>.mp3)', () => {
    expect((clipOutputPath as any)('/d', 'abcdef0123456789', 3)).toBe(join('/d', 'abcdef0123456789.mp3'))
  })
})
