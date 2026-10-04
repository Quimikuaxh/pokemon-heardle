// BE-CLP-10: los fixtures generados con lamejs cumplen el formato de DEC-44 (614 tramas, 256.626 bytes, offsets en limite de
// trama, sin ID3/Xing). main_data_begin == 0 NO se exige: lamejs no permite desactivar el reservoir (solo lo exige `validate` del script).
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { OFFSETS, TOTAL_BYTES } from '../helpers/fixtures'
import { walkFrames } from '../../../shared/test/helpers/mp3'

const E2E = join(__dirname, '..', '..', '..', 'e2e')
const lamePath = join(E2E, 'node_modules', 'lamejs', 'lame.all.js')
const hasLame = existsSync(lamePath)

function encodeTone(seconds: number, hz: number): Buffer {
  const lameSource = readFileSync(lamePath, 'utf8')
  const lamejs = new Function(`${lameSource}\n;return lamejs`)()
  const rate = 44100
  const total = Math.round(seconds * rate)
  const samples = new Int16Array(total)
  for (let i = 0; i < total; i++) samples[i] = Math.round(8000 * Math.sin((2 * Math.PI * hz * i) / rate))
  const encoder = new lamejs.Mp3Encoder(2, rate, 128)
  const chunks: Buffer[] = []
  for (let i = 0; i < total; i += 1152) {
    const block = samples.subarray(i, i + 1152)
    const out = encoder.encodeBuffer(block, block)
    if (out.length) chunks.push(Buffer.from(out))
  }
  const tail = encoder.flush()
  if (tail.length) chunks.push(Buffer.from(tail))
  return Buffer.concat(chunks)
}

describe.skipIf(!hasLame)('BE-CLP-10 fixtures de lamejs (tono de 16 s)', () => {
  const clip = hasLame ? encodeTone(16, 440) : Buffer.alloc(0)

  it('mide exactamente 256.626 bytes', () => {
    expect(clip.length).toBe(TOTAL_BYTES)
  })

  it('tiene 614 tramas MPEG-1 L3 128 kbps 44,1 kHz estereo y el recorrido acaba exactamente en el final', () => {
    const walk = walkFrames(clip)
    expect([walk.errors, walk.starts.length]).toEqual([[], 614])
  })

  it('cada offset de los 6 intentos cae en el inicio de una trama (limite de trama)', () => {
    const starts = new Set([...walkFrames(clip).starts, clip.length])
    for (const offset of OFFSETS) expect(starts.has(offset), `offset ${offset}`).toBe(true)
  })

  it('no empieza por ID3 y no contiene Xing ni Info', () => {
    expect(clip.subarray(0, 3).toString('latin1')).not.toBe('ID3')
    expect(clip.includes(Buffer.from('Xing'))).toBe(false)
    expect(clip.includes(Buffer.from('Info'))).toBe(false)
  })

  it('otro tono produce los mismos offsets y el mismo tamano (la disposicion de tramas no depende del audio)', () => {
    const other = encodeTone(16, 880)
    expect(other.length).toBe(TOTAL_BYTES)
    expect(walkFrames(other).starts).toEqual(walkFrames(clip).starts)
  })
})

// Fixtures versionados de e2e con el layout nuevo (clips/<clipKey>.mp3): se comprueban si ya se han regenerado.
const fixtureClips: string[] = []
for (const store of ['R', 'M']) {
  const dir = join(E2E, 'fixtures', store, 'clips')
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (/^[0-9a-f]{16}\.mp3$/.test(f)) fixtureClips.push(join(dir, f))
}

describe.skipIf(fixtureClips.length === 0)('BE-CLP-10 fixtures de e2e regenerados (layout nuevo)', () => {
  for (const file of fixtureClips) {
    it(`${file.split('/').slice(-3).join('/')} cumple DEC-44`, () => {
      const buf = readFileSync(file)
      const walk = walkFrames(buf)
      expect([buf.length, walk.errors, walk.starts.length]).toEqual([TOTAL_BYTES, [], 614])
      const starts = new Set([...walk.starts, buf.length])
      for (const offset of OFFSETS) expect(starts.has(offset)).toBe(true)
    })
  }
})
