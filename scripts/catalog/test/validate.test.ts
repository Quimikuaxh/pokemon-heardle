// Contrato: src/validate.ts exporta
//   validateOutput({ catalog, outDir, probe }): Promise<{ ok: boolean; errors: string[] }>
//     outDir contiene <clipKey>.mp3 (UN fichero de 16 s por cancion enabled, DEC-44)
//     probe(file): Promise<{ durationSec: number; tags: Record<string,string> }>   (se llama sobre el fichero entero)
//   ffprobeProbe(file): implementacion real con ffprobe
// Falla (ok=false) con mensajes que nombran la cancion / el offset / la trama ofensora.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateOutput, ffprobeProbe } from '../src/validate'
import { clipArgs } from '../src/ffmpegArgs'
import { walkFrames } from '../../../shared/test/helpers/mp3'
import { OFFSETS, TOTAL_BYTES, writeClip, writeOldLayout } from './helpers/clips'
import { tmp } from './helpers/data'

const K1 = '1111111111111111'
const K2 = '2222222222222222'

const song = (id: string, clipKey: string, enabled = true, durationSec?: number): any => ({
  id,
  title: id,
  games: ['g'],
  clipKey,
  startSec: 0,
  enabled,
  reviewed: true,
  source: { youtubeId: 'vid00000001', videoTitle: 'x', ...(durationSec === undefined ? {} : { durationSec }) },
})
const catalog = (songs: any[]): any => ({ version: 1, generatedAt: 'x', games: [{ id: 'g', name: 'G' }], songs })

/** probe simulado sobre el fichero entero: 16 s + desviacion, sin etiquetas. */
const probeOk = (deviationSec = 0, tags: Record<string, string> = {}) => async (_file: string) => ({ durationSec: 16 + deviationSec, tags })

const dirWith = (keys: string[]) => {
  const d = tmp('val-')
  keys.forEach((k) => writeClip(d, k))
  return d
}

const run = (songs: any[], outDir: string, probe = probeOk()) => validateOutput({ catalog: catalog(songs), outDir, probe })

describe('validateOutput: clip unico (DEC-44)', () => {
  it('SC-VA-03 pasa con ficheros de exactamente CLIP_TOTAL_BYTES, 614 tramas validas y patron 417/418', async () => {
    const d = dirWith([K1, K2])
    expect(await run([song('a', K1), song('b', K2)], d)).toEqual({ ok: true, errors: [] })
  })

  it('SC-VA-03 el fichero sintetico del test es de verdad valido (sanidad: 256.626 B, 614 tramas)', () => {
    const d = dirWith([K1])
    const buf = readFileSync(join(d, `${K1}.mp3`))
    expect([buf.length, walkFrames(buf).starts.length, walkFrames(buf).errors]).toEqual([TOTAL_BYTES, 614, []])
  })

  it('SC-VA-01 falla si falta <clipKey>.mp3 de una cancion activa y nombra la cancion', async () => {
    const d = dirWith([K1])
    const r = await run([song('a', K1), song('sin-clip', K2)], d)
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toContain('sin-clip')
  })

  it('SC-VA-01 falla si faltan todos los ficheros', async () => {
    expect((await run([song('a', K1)], tmp('val-'))).ok).toBe(false)
  })

  it('SC-VA-01 falla con catalogo invalido (ids duplicados)', async () => {
    const d = dirWith([K1, K2])
    expect((await run([song('a', K1), song('a', K2)], d)).ok).toBe(false)
  })

  it('SC-VA-01 falla si una cancion enabled tiene games: [] (DEC-26) y nombra la cancion', async () => {
    const d = dirWith([K1])
    const bad = song('a', K1)
    bad.games = []
    const r = await run([bad], d)
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toContain('a')
  })

  it('SC-VA-01 / SC-CLP-10 con el layout antiguo y sin fichero nuevo tambien falla y pide ejecutar build', async () => {
    const d = tmp('val-')
    writeOldLayout(d, K1)
    const r = await run([song('a', K1)], d)
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/build/i)
  })

  it('SC-CLP-10 con el layout antiguo y el nuevo a la vez, valida el nuevo y no se queja del directorio antiguo', async () => {
    const d = dirWith([K1])
    writeOldLayout(d, K1)
    expect((await run([song('a', K1)], d)).ok).toBe(true)
  })

  it('las canciones enabled:false no necesitan clips', async () => {
    const d = dirWith([K1])
    expect((await run([song('a', K1), song('b', K2, false)], d)).ok).toBe(true)
  })

  for (const [label, delta] of [['1 byte mas corto', -1], ['1 byte mas largo', 1], ['mitad', -128313], ['el doble', 256626]] as Array<[string, number]>) {
    it(`SC-VA-02 tamano distinto de CLIP_TOTAL_BYTES (${label}) -> falla y nombra cancion y bytes`, async () => {
      const d = dirWith([K1])
      const file = join(d, `${K1}.mp3`)
      const original = readFileSync(file)
      writeFileSync(file, delta < 0 ? original.subarray(0, original.length + delta) : Buffer.concat([original, Buffer.alloc(delta)]))
      const r = await run([song('cancion-rara', K1)], d)
      expect(r.ok).toBe(false)
      const text = r.errors.join('\n')
      expect(text).toContain('cancion-rara')
      expect(text).toContain(String(TOTAL_BYTES + delta))
    })
  }

  it('SC-VA-02 fichero de 0 bytes -> falla', async () => {
    const d = dirWith([K1])
    writeFileSync(join(d, `${K1}.mp3`), Buffer.alloc(0))
    const r = await run([song('vacia', K1)], d)
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toContain('vacia')
  })

  for (const [label, dev, ok] of [
    ['-29 ms pasa', -0.029, true],
    ['+59 ms pasa', 0.059, true],
    ['-31 ms falla', -0.031, false],
    ['+61 ms falla', 0.061, false],
  ] as Array<[string, number, boolean]>) {
    it(`SC-VA-04 tolerancia -30/+60 ms respecto a 16 s sobre el fichero entero: ${label}`, async () => {
      const d = dirWith([K1])
      expect((await run([song('a', K1)], d, probeOk(dev))).ok).toBe(ok)
    })
  }

  it('SC-VA-04 las duraciones reales medidas sin Xing (16,039 s) se aceptan', async () => {
    const d = dirWith([K1])
    expect((await run([song('a', K1)], d, probeOk(0.039))).ok).toBe(true)
  })

  it('SC-VA-04 ffprobe se invoca una sola vez por cancion (sobre el fichero entero, no por intento)', async () => {
    const d = dirWith([K1, K2])
    const seen: string[] = []
    await run([song('a', K1), song('b', K2)], d, async (file: string) => (seen.push(file), { durationSec: 16, tags: {} }))
    expect(seen.sort()).toEqual([join(d, `${K1}.mp3`), join(d, `${K2}.mp3`)].sort())
  })

  for (const tags of [{ title: 'Littleroot Town' }, { artist: 'Junichi Masuda' }, { album: 'Pokemon' }, { TITLE: 'x' }]) {
    it(`SC-VA-05 etiquetas de metadatos (${Object.keys(tags)[0]}) -> falla`, async () => {
      const d = dirWith([K1])
      expect((await run([song('a', K1)], d, probeOk(0, tags))).ok).toBe(false)
    })
  }

  it('SC-VA-05 sin etiquetas pasa', async () => {
    const d = dirWith([K1])
    expect((await run([song('a', K1)], d, probeOk(0, {}))).ok).toBe(true)
  })
})

describe('validateOutput: formato de trama (SC-CLP-06..09)', () => {
  const check = async (options: Parameters<typeof writeClip>[2]) => {
    const d = tmp('val-')
    writeClip(d, K1, options)
    return run([song('cancion-x', K1)], d)
  }

  it('SC-CLP-06 614 tramas MPEG-1 Layer III 128 kbps 44,1 kHz estereo -> pasa', async () => {
    expect((await check({})).ok).toBe(true)
  })

  for (const [label, options] of [
    ['MPEG-2', { version: 'mpeg2' as const }],
    ['otro bitrate (112 kbps)', { bitrateIndex: 8 }],
    ['otro bitrate (192 kbps)', { bitrateIndex: 11 }],
    ['mono', { channels: 'mono' as const }],
    ['48 kHz', { sampleRateIndex: 1 }],
  ] as Array<[string, Parameters<typeof writeClip>[2]]>) {
    it(`SC-CLP-06 ${label} -> falla y nombra la cancion`, async () => {
      const r = await check(options)
      expect(r.ok).toBe(false)
      expect(r.errors.join('\n')).toContain('cancion-x')
    })
  }

  it('SC-CLP-06 una cabecera de trama invalida en mitad del fichero -> falla', async () => {
    expect((await check({ breakHeaderAtFrame: 300 })).ok).toBe(false)
  })

  it('SC-CLP-07 un offset que no es limite de trama falla nombrando el offset (cabecera destruida en 32.182)', async () => {
    const r = await check({ breakHeaderAtFrame: 77 }) // la trama 77 empieza en el offset del intento 2
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toContain('32182')
  })

  for (const index of [39, 154, 268, 422]) {
    it(`SC-CLP-07 cabecera destruida en el offset ${index} tramas -> falla nombrando el offset en bytes`, async () => {
      const r = await check({ breakHeaderAtFrame: index })
      const offset = OFFSETS[[39, 77, 154, 268, 422].indexOf(index)]
      expect(r.errors.join('\n')).toContain(String(offset))
    })
  }

  it('SC-CLP-07 un patron de padding desplazado (los offsets ya no caen en limite de trama) -> falla', async () => {
    expect((await check({ patternShift: 1 })).ok).toBe(false)
  })

  it('SC-CLP-08 main_data_begin != 0 en alguna trama (bit reservoir) -> falla nombrando la trama', async () => {
    const r = await check({ mainDataBegin: { 300: 120 } })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/main_data_begin|reservoir/i)
    expect(r.errors.join('\n')).toMatch(/\b30[01]\b/)
  })

  it('SC-CLP-08 main_data_begin != 0 ya en la primera trama tambien falla', async () => {
    expect((await check({ mainDataBegin: { 0: 1 } })).ok).toBe(false)
  })

  for (const kind of ['Xing', 'Info'] as const) {
    it(`SC-CLP-09 primera trama ${kind} -> falla`, async () => {
      const r = await check({ xing: kind })
      expect(r.ok).toBe(false)
      expect(r.errors.join('\n')).toMatch(/xing|info/i)
    })
  }

  it('SC-CLP-09 ID3 al inicio -> falla', async () => {
    const r = await check({ id3: true })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/ID3/)
  })
})

describe('validateOutput: cancion corta (DEC-40) y games vacio', () => {
  const withDuration = (id: string, key: string, durationSec: number | undefined, enabled = true): any => song(id, key, enabled, durationSec)

  it('SC-VA-07 falla si una cancion enabled es corta y el mensaje nombra la cancion y su duracion', async () => {
    const d = dirWith([K1])
    const r = await run([withDuration('tema-corto', K1, 7.4)], d)
    expect(r.ok).toBe(false)
    const text = r.errors.join('\n')
    expect(text).toContain('tema-corto')
    expect(text).toMatch(/7[.,]4/)
  })

  it('SC-VA-07 en el limite exacto (16,1 s) no falla; 16,0999 s si', async () => {
    const d = dirWith([K1, K2])
    const okCase = await run([withDuration('a', K1, 16 + 0.1)], d)
    const badCase = await run([withDuration('b', K2, 16 + 0.1 - 0.0001)], d)
    expect([okCase.ok, badCase.ok]).toEqual([true, false])
  })

  it('SC-VA-08 pasa si la cancion corta esta desactivada y no exige sus clips', async () => {
    const d = dirWith([K1])
    expect(await run([withDuration('a', K1, 200), withDuration('corta', K2, 7.4, false)], d)).toEqual({ ok: true, errors: [] })
  })

  it('SC-VA-09 cancion activa sin durationSec: no se considera corta', async () => {
    const d = dirWith([K1])
    expect((await run([withDuration('a', K1, undefined)], d)).ok).toBe(true)
  })

  it('SC-VA-07 el comando validate (runCli, --data-dir temporal) sale con codigo != 0 con una corta activa', async () => {
    const { makeDataDir, catalogOf, song: mk, io, runCliSafe } = await import('./helpers/data')
    const dir = makeDataDir({ catalog: catalogOf([mk({ id: 'tema-corto', clipKey: K1, youtubeId: 'vid00000001', durationSec: 7.4 })]) })
    const out = io()
    expect(await runCliSafe(['validate', '--data-dir', dir], out)).not.toBe(0)
    expect(out.text()).toContain('tema-corto')
  })
})

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// SC-VA-06: solo con ffmpeg instalado; si no, se omite de forma explicita (visible como "skipped").
describe.skipIf(!hasFfmpeg())('SC-VA-06 validateOutput real con ffmpeg/ffprobe (clip unico)', () => {
  it('un clip generado con clipArgs (-reservoir 0, 128k, 44,1 kHz estereo, -write_xing 0) pasa la validacion real', async () => {
    const dir = tmp('val-real-')
    const master = join(dir, 'master.wav')
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=16', '-ar', '44100', '-ac', '2', master], { stdio: 'ignore' })
    mkdirSync(join(dir, 'clips'), { recursive: true })
    const out = join(dir, 'clips', `${K1}.mp3`)
    execFileSync('ffmpeg', clipArgs({ input: master, output: out }), { stdio: 'ignore' })
    const buf = readFileSync(out)
    const walk = walkFrames(buf)
    expect([buf.length, walk.starts.length, walk.errors]).toEqual([TOTAL_BYTES, 614, []])
    for (const offset of OFFSETS) expect(new Set([...walk.starts, buf.length]).has(offset)).toBe(true)
    const r = await validateOutput({ catalog: catalog([song('a', K1)]), outDir: join(dir, 'clips'), probe: ffprobeProbe })
    expect(r).toEqual({ ok: true, errors: [] })
  })
})
