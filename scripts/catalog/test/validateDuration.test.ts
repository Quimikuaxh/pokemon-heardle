// Sin cabecera Xing, ffprobe mide ~40-50 ms de mas; el criterio es -30 ms / +60 ms sobre lo esperado.
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { validateOutput } from '../src/validate'

const SECONDS = [1, 2, 4, 7, 11, 16]
const KEY = '1111111111111111'
const catalog: any = {
  version: 1, generatedAt: 'x', games: [{ id: 'g', name: 'G' }],
  songs: [{ id: 'a', title: 'a', games: ['g'], clipKey: KEY, startSec: 0, enabled: true, reviewed: true, source: { youtubeId: 'vid00000001', videoTitle: 'v' } }],
}
const created: string[] = []
afterAll(() => created.forEach((d) => rmSync(d, { recursive: true, force: true })))
function dir() {
  const d = mkdtempSync(join(tmpdir(), 'dur-'))
  created.push(d)
  mkdirSync(join(d, KEY))
  for (let n = 1; n <= 6; n++) writeFileSync(join(d, KEY, `${n}.mp3`), Buffer.alloc(SECONDS[n - 1] * 16000))
  return d
}
const probeWith = (deviation: (n: number) => number) => async (file: string) => {
  const n = Number(basename(file).replace('.mp3', ''))
  return { durationSec: SECONDS[n - 1] + deviation(n), tags: {} }
}

describe('validateOutput: duraciones medidas por ffprobe sin Xing', () => {
  it('acepta las duraciones reales medidas (1.045, 2.038, 4.049, 7.027, 11.050, 16.039)', async () => {
    const real = [1.045, 2.038, 4.049, 7.027, 11.05, 16.039]
    const probe = async (f: string) => ({ durationSec: real[Number(basename(f)[0]) - 1], tags: {} })
    expect(await validateOutput({ catalog, outDir: dir(), probe })).toEqual({ ok: true, errors: [] })
  })

  it('rechaza un clip 61 ms mas largo y uno mas corto de 31 ms', async () => {
    expect((await validateOutput({ catalog, outDir: dir(), probe: probeWith(() => 0.061) })).ok).toBe(false)
    expect((await validateOutput({ catalog, outDir: dir(), probe: probeWith(() => -0.031) })).ok).toBe(false)
  })
})
