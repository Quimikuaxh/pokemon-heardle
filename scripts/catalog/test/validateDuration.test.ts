// Sin cabecera Xing, ffprobe mide ~40-50 ms de mas sobre el fichero de 16 s; el criterio es -30 ms / +60 ms (SC-VA-04).
import { describe, it, expect } from 'vitest'
import { validateOutput } from '../src/validate'
import { writeClip } from './helpers/clips'
import { tmp } from './helpers/data'

const KEY = '1111111111111111'
const catalog: any = {
  version: 1, generatedAt: 'x', games: [{ id: 'g', name: 'G' }],
  songs: [{ id: 'a', title: 'a', games: ['g'], clipKey: KEY, startSec: 0, enabled: true, reviewed: true, source: { youtubeId: 'vid00000001', videoTitle: 'v' } }],
}
function dir() {
  const d = tmp('dur-')
  writeClip(d, KEY)
  return d
}
const probeWith = (durationSec: number) => async () => ({ durationSec, tags: {} })

describe('validateOutput: duracion medida por ffprobe sobre el clip unico', () => {
  it('SC-VA-04 acepta la duracion real medida del fichero de 16 s (16.039)', async () => {
    expect(await validateOutput({ catalog, outDir: dir(), probe: probeWith(16.039) })).toEqual({ ok: true, errors: [] })
  })

  it('SC-VA-04 rechaza un clip 61 ms mas largo y uno 31 ms mas corto', async () => {
    expect((await validateOutput({ catalog, outDir: dir(), probe: probeWith(16.061) })).ok).toBe(false)
    expect((await validateOutput({ catalog, outDir: dir(), probe: probeWith(15.969) })).ok).toBe(false)
  })

  it('SC-VA-04 un clip de 11 s (intento equivocado guardado como fichero entero) falla', async () => {
    expect((await validateOutput({ catalog, outDir: dir(), probe: probeWith(11.02) })).ok).toBe(false)
  })
})
