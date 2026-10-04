// Contrato: src/validate.ts exporta
//   validateOutput({ catalog, outDir, probe }): Promise<{ ok: boolean; errors: string[] }>
//     outDir contiene <clipKey>/<n>.mp3 (n=1..6) de las canciones enabled
//     probe(file): Promise<{ durationSec: number; tags: Record<string,string> }>
//   ffprobeProbe(file): Promise<{ durationSec, tags }>   (implementacion real con ffprobe)
// Falla (ok=false) con mensajes que nombran el clipKey/fichero ofensor.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename, dirname } from 'node:path'
import { validateOutput, ffprobeProbe } from '../src/validate'
import { clipArgs } from '../src/ffmpegArgs'

const SECONDS = [1, 2, 4, 7, 11, 16]
const K1 = '1111111111111111'
const K2 = '2222222222222222'

const song = (id: string, clipKey: string, enabled = true): any => ({
  id,
  title: id,
  games: ['g'],
  clipKey,
  startSec: 0,
  enabled,
  reviewed: true,
  source: { youtubeId: 'vid00000001', videoTitle: 'x' },
})
const catalog = (songs: any[]): any => ({ version: 1, generatedAt: 'x', games: [{ id: 'g', name: 'G' }], songs })

function writeClips(dir: string, clipKey: string, opts: { skipN?: number; extraBytes?: Record<number, number> } = {}) {
  mkdirSync(join(dir, clipKey), { recursive: true })
  for (let n = 1; n <= 6; n++) {
    if (n === opts.skipN) continue
    writeFileSync(join(dir, clipKey, `${n}.mp3`), Buffer.alloc(SECONDS[n - 1] * 16000 + (opts.extraBytes?.[n] ?? 0), 1))
  }
}

/** probe simulado: duracion = la esperada por el numero de fichero (+ desviacion), sin etiquetas. */
const probeOk = (deviationSec = 0, tags: Record<string, string> = {}) => async (file: string) => ({
  durationSec: SECONDS[Number(basename(file).replace('.mp3', '')) - 1] + deviationSec,
  tags,
})

const dirWith = (keys: string[]) => {
  const d = mkdtempSync(join(tmpdir(), 'val-'))
  keys.forEach((k) => writeClips(d, k))
  return d
}

describe('validateOutput', () => {
  it('SC-VA-03 pasa con clips completos, tamanos identicos entre canciones y probe correcto', async () => {
    const d = dirWith([K1, K2])
    const r = await validateOutput({ catalog: catalog([song('a', K1), song('b', K2)]), outDir: d, probe: probeOk() })
    expect(r).toEqual({ ok: true, errors: [] })
  })

  it('SC-VA-01 falla si falta un clip (5 de 6) y nombra la cancion', async () => {
    const d = mkdtempSync(join(tmpdir(), 'val-'))
    writeClips(d, K1, { skipN: 6 })
    const r = await validateOutput({ catalog: catalog([song('a', K1)]), outDir: d, probe: probeOk() })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toContain(K1)
  })

  it('SC-VA-01 falla si faltan todos los clips de una cancion activa', async () => {
    const r = await validateOutput({ catalog: catalog([song('a', K1)]), outDir: mkdtempSync(join(tmpdir(), 'val-')), probe: probeOk() })
    expect(r.ok).toBe(false)
  })

  it('SC-VA-01 falla con catalogo invalido (ids duplicados)', async () => {
    const d = dirWith([K1, K2])
    const r = await validateOutput({ catalog: catalog([song('a', K1), song('a', K2)]), outDir: d, probe: probeOk() })
    expect(r.ok).toBe(false)
  })

  it('SC-VA-01 las canciones enabled:false no necesitan clips', async () => {
    const d = dirWith([K1])
    const r = await validateOutput({ catalog: catalog([song('a', K1), song('b', K2, false)]), outDir: d, probe: probeOk() })
    expect(r.ok).toBe(true)
  })

  it('SC-VA-02 tamanos distintos entre canciones para el mismo intento -> falla', async () => {
    const d = dirWith([K1])
    writeClips(d, K2, { extraBytes: { 3: 1000 } })
    const r = await validateOutput({ catalog: catalog([song('a', K1), song('b', K2)]), outDir: d, probe: probeOk() })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/tama|size|bytes/i)
  })

  it('SC-VA-02 una diferencia de 1 byte ya es huella y falla', async () => {
    const d = dirWith([K1])
    writeClips(d, K2, { extraBytes: { 1: 1 } })
    const r = await validateOutput({ catalog: catalog([song('a', K1), song('b', K2)]), outDir: d, probe: probeOk() })
    expect(r.ok).toBe(false)
  })

  it('SC-VA-04 duracion 29 ms por encima pasa', async () => {
    const d = dirWith([K1])
    expect((await validateOutput({ catalog: catalog([song('a', K1)]), outDir: d, probe: probeOk(0.029) })).ok).toBe(true)
  })

  it('SC-VA-04 duracion 29 ms por debajo pasa', async () => {
    const d = dirWith([K1])
    expect((await validateOutput({ catalog: catalog([song('a', K1)]), outDir: d, probe: probeOk(-0.029) })).ok).toBe(true)
  })

  // Sin cabecera Xing el encoder anade retardo/relleno: se tolera hasta +60 ms (ver README de scripts)
  it('SC-VA-04 duracion 59 ms por encima pasa', async () => {
    const d = dirWith([K1])
    expect((await validateOutput({ catalog: catalog([song('a', K1)]), outDir: d, probe: probeOk(0.059) })).ok).toBe(true)
  })

  it('SC-VA-04 duracion 61 ms por encima falla', async () => {
    const d = dirWith([K1])
    expect((await validateOutput({ catalog: catalog([song('a', K1)]), outDir: d, probe: probeOk(0.061) })).ok).toBe(false)
  })

  it('SC-VA-04 duracion 31 ms por debajo falla', async () => {
    const d = dirWith([K1])
    expect((await validateOutput({ catalog: catalog([song('a', K1)]), outDir: d, probe: probeOk(-0.031) })).ok).toBe(false)
  })

  it('SC-VA-04 un clip de 16 s que dura 11 s falla (intento equivocado)', async () => {
    const d = dirWith([K1])
    const probe = async (f: string) => ({ durationSec: basename(f) === '6.mp3' ? 11 : SECONDS[Number(basename(f)[0]) - 1], tags: {} })
    expect((await validateOutput({ catalog: catalog([song('a', K1)]), outDir: d, probe })).ok).toBe(false)
  })

  for (const tags of [{ title: 'Littleroot Town' }, { artist: 'Junichi Masuda' }, { album: 'Pokemon' }, { TITLE: 'x' }]) {
    it(`SC-VA-05 etiquetas de metadatos (${Object.keys(tags)[0]}) -> falla`, async () => {
      const d = dirWith([K1])
      const r = await validateOutput({ catalog: catalog([song('a', K1)]), outDir: d, probe: probeOk(0, tags) })
      expect(r.ok).toBe(false)
    })
  }

  it('SC-VA-05 sin etiquetas pasa', async () => {
    const d = dirWith([K1])
    expect((await validateOutput({ catalog: catalog([song('a', K1)]), outDir: d, probe: probeOk(0, {}) })).ok).toBe(true)
  })
})

describe('validateOutput: cancion corta (DEC-40) y games vacio', () => {
  const withDuration = (id: string, key: string, durationSec: number | undefined, enabled = true): any => {
    const base = song(id, key, enabled)
    if (durationSec !== undefined) base.source.durationSec = durationSec
    return base
  }

  it('SC-VA-01 falla si una cancion enabled tiene games: [] (DEC-26)', async () => {
    const d = dirWith([K1])
    const bad = song('a', K1)
    bad.games = []
    const r = await validateOutput({ catalog: catalog([bad]), outDir: d, probe: probeOk() })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toContain('a')
  })

  it('SC-VA-07 falla si una cancion enabled es corta y el mensaje nombra la cancion y su duracion', async () => {
    const d = dirWith([K1])
    const r = await validateOutput({ catalog: catalog([withDuration('tema-corto', K1, 7.4)]), outDir: d, probe: probeOk() })
    expect(r.ok).toBe(false)
    const text = r.errors.join('\n')
    expect(text).toContain('tema-corto')
    expect(text).toMatch(/7[.,]4/)
  })

  it('SC-VA-07 en el limite exacto (16,1 s) no falla; 16,0999 s si', async () => {
    const d = dirWith([K1, K2])
    const okCase = await validateOutput({ catalog: catalog([withDuration('a', K1, 16 + 0.1)]), outDir: d, probe: probeOk() })
    const badCase = await validateOutput({ catalog: catalog([withDuration('b', K2, 16 + 0.1 - 0.0001)]), outDir: d, probe: probeOk() })
    expect([okCase.ok, badCase.ok]).toEqual([true, false])
  })

  it('SC-VA-08 pasa si la cancion corta esta desactivada y no exige sus clips', async () => {
    const d = dirWith([K1])
    const r = await validateOutput({ catalog: catalog([withDuration('a', K1, 200), withDuration('corta', K2, 7.4, false)]), outDir: d, probe: probeOk() })
    expect(r).toEqual({ ok: true, errors: [] })
  })

  it('SC-VA-09 cancion activa sin durationSec: no se considera corta', async () => {
    const d = dirWith([K1])
    const r = await validateOutput({ catalog: catalog([withDuration('a', K1, undefined)]), outDir: d, probe: probeOk() })
    expect(r.ok).toBe(true)
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
describe.skipIf(!hasFfmpeg())('SC-VA-06 validateOutput real con ffmpeg/ffprobe', () => {
  it('genera 6 clips de tono con clipArgs y pasan la validacion real', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'val-real-'))
    const master = join(dir, 'master.wav')
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=16', '-ar', '44100', '-ac', '2', master], { stdio: 'ignore' })
    for (const key of [K1, K2]) {
      mkdirSync(join(dir, key), { recursive: true })
      for (let n = 1; n <= 6; n++) {
        const out = join(dir, key, `${n}.mp3`)
        execFileSync('ffmpeg', ['-y', ...clipArgs({ input: master, seconds: SECONDS[n - 1], output: out })], { stdio: 'ignore' })
      }
    }
    const r = await validateOutput({ catalog: catalog([song('a', K1), song('b', K2)]), outDir: dir, probe: ffprobeProbe })
    expect(r).toEqual({ ok: true, errors: [] })
    expect(dirname(master)).toBe(dir)
  })
})
