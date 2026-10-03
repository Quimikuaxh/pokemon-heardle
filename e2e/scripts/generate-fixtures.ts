// Genera e2e/fixtures/<R|M>/{catalog/catalog.json,clips/<clipKey>/<n>.mp3} sin ffmpeg (encoder JS lamejs).
// Clips: tono senoidal, MP3 CBR 128 kbps, estereo, 44,1 kHz, sin ID3 ni Xing, N s = CLIP_SECONDS[n-1].
// Determinista: dos ejecuciones dan los mismos bytes. Uso: npm --prefix e2e run fixtures
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STORES } from '../fixtures/catalogs.ts'

const CLIP_SECONDS = [1, 2, 4, 7, 11, 16]
const SAMPLE_RATE = 44100
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

// lamejs 1.2.1 no se puede importar como modulo (MPEGMode global): se evalua el bundle y se toma el global.
const require = createRequire(import.meta.url)
const lameSource = readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8')
const lamejs = new Function(`${lameSource}\n;return lamejs`)() as {
  Mp3Encoder: new (channels: number, rate: number, kbps: number) => {
    encodeBuffer(l: Int16Array, r: Int16Array): Int8Array
    flush(): Int8Array
  }
}

function encodeTone(seconds: number, hz: number): Buffer {
  const total = Math.round(seconds * SAMPLE_RATE)
  const samples = new Int16Array(total)
  for (let i = 0; i < total; i++) samples[i] = Math.round(8000 * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE))
  const encoder = new lamejs.Mp3Encoder(2, SAMPLE_RATE, 128)
  const chunks: Buffer[] = []
  for (let i = 0; i < total; i += 1152) {
    const block = samples.subarray(i, i + 1152)
    const out = encoder.encodeBuffer(block, block)
    if (out.length) chunks.push(Buffer.from(out))
  }
  const tail = encoder.flush()
  if (tail.length) chunks.push(Buffer.from(tail))
  const mp3 = Buffer.concat(chunks)
  if (mp3.subarray(0, 3).toString('latin1') === 'ID3') throw new Error('el clip empieza por ID3')
  if (mp3.includes(Buffer.from('Xing')) || mp3.includes(Buffer.from('Info'))) throw new Error('el clip lleva cabecera Xing/Info')
  return mp3
}

for (const [name, store] of Object.entries(STORES)) {
  const dir = join(root, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'catalog'), { recursive: true })
  writeFileSync(join(dir, 'catalog', 'catalog.json'), JSON.stringify(store.catalog, null, 2) + '\n')
  for (const song of store.songs) {
    if (!song.enabled) continue // la deshabilitada no se sirve nunca: sin clips
    mkdirSync(join(dir, 'clips', song.clipKey), { recursive: true })
    CLIP_SECONDS.forEach((seconds, index) => {
      writeFileSync(join(dir, 'clips', song.clipKey, `${index + 1}.mp3`), encodeTone(seconds, song.toneHz))
    })
  }
  console.log(`fixtures ${name}: ${store.songs.length} canciones`)
}
