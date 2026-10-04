// Genera e2e/fixtures/<R|M|X>/{catalog/catalog.json,clips/<clipKey>.mp3} sin ffmpeg (encoder JS lamejs).
// Un clip de 16 s por cancion (DEC-44): MP3 CBR 128 kbps, estereo, 44,1 kHz, sin ID3 ni Xing, CLIP_TOTAL_BYTES
// bytes, con cabecera de trama en cada CLIP_BYTE_OFFSETS. Tono escalonado: frecuencia = base + STEP_HZ * segundo.
// X = copia de M con un offset intermedio corrupto (E2E-78).
// Determinista: dos ejecuciones dan los mismos bytes. Uso: npm --prefix e2e run fixtures
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADMIN_CATALOG, ADMIN_SOURCES, STEP_HZ, STORES } from '../fixtures/catalogs.ts'
import { CLIP_BYTE_OFFSETS, CLIP_SECONDS, CLIP_TOTAL_BYTES } from '../../shared/rules.ts'

const CLIP_LENGTH_SECONDS = CLIP_SECONDS[CLIP_SECONDS.length - 1]
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

function encode(seconds: number, frequencyAt: (second: number) => number): Buffer {
  const total = Math.round(seconds * SAMPLE_RATE)
  const samples = new Int16Array(total)
  let phase = 0
  for (let i = 0; i < total; i++) {
    phase += (2 * Math.PI * frequencyAt(Math.floor(i / SAMPLE_RATE))) / SAMPLE_RATE
    samples[i] = Math.round(8000 * Math.sin(phase))
  }
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

const encodeTone = (seconds: number, hz: number) => encode(seconds, () => hz)

/** Clip de una cancion: 16 s, tono base + STEP_HZ por segundo, validado contra el formato de DEC-44. */
function encodeClip(baseHz: number): Buffer {
  const mp3 = encode(CLIP_LENGTH_SECONDS, (second) => baseHz + STEP_HZ * second)
  if (mp3.length !== CLIP_TOTAL_BYTES) throw new Error(`el clip mide ${mp3.length} B, se esperaban ${CLIP_TOTAL_BYTES}`)
  for (const offset of CLIP_BYTE_OFFSETS.slice(0, -1)) {
    if (mp3[offset] !== 0xff || (mp3[offset + 1] & 0xe0) !== 0xe0) throw new Error(`sin cabecera de trama en el offset ${offset}`)
  }
  return mp3
}

for (const [name, store] of Object.entries(STORES)) {
  const dir = join(root, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'catalog'), { recursive: true })
  writeFileSync(join(dir, 'catalog', 'catalog.json'), JSON.stringify(store.catalog, null, 2) + '\n')
  mkdirSync(join(dir, 'clips'), { recursive: true })
  for (const song of store.songs) {
    if (!song.enabled) continue // la deshabilitada no se sirve nunca: sin clip
    writeFileSync(join(dir, 'clips', `${song.clipKey}.mp3`), encodeClip(song.toneHz))
  }
  console.log(`fixtures ${name}: ${store.songs.length} canciones`)
}

// Store X (E2E-78): copia de M con la cabecera de trama del offset del intento 2 destruida.
{
  const dir = join(root, 'X')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'catalog'), { recursive: true })
  mkdirSync(join(dir, 'clips'), { recursive: true })
  writeFileSync(join(dir, 'catalog', 'catalog.json'), JSON.stringify(STORES.M.catalog, null, 2) + '\n')
  const clip = encodeClip(STORES.M.songs[0].toneHz)
  clip.fill(0, CLIP_BYTE_OFFSETS[1], CLIP_BYTE_OFFSETS[1] + 4)
  writeFileSync(join(dir, 'clips', `${STORES.M.songs[0].clipKey}.mp3`), clip)
  console.log('fixtures X: clip corrupto')
}

// Admin: catalog.json + work/<youtubeId>.mp3 (fuentes completas de tono, sin clips por intento).
const adminDir = join(root, 'admin')
rmSync(adminDir, { recursive: true, force: true })
mkdirSync(join(adminDir, 'work'), { recursive: true })
writeFileSync(join(adminDir, 'catalog.json'), JSON.stringify(ADMIN_CATALOG, null, 2) + '\n')
for (const [youtubeId, { seconds, toneHz }] of Object.entries(ADMIN_SOURCES)) {
  writeFileSync(join(adminDir, 'work', `${youtubeId}.mp3`), encodeTone(seconds, toneHz))
}
console.log('fixtures admin: 8 canciones, 2 fuentes')
