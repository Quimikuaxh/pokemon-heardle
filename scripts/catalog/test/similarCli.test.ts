// `similar` ejecutado por runCli con --data-dir temporal; la decodificacion se simula (deps.decodeAudio).
import { basename } from 'node:path'
import { describe, it, expect } from 'vitest'
import { SAMPLE_RATE } from '../src/similar'
import type { AudioDecoder } from '../src/similar'
import { melody } from './helpers/audio'
import { catalogOf, io, makeDataDir, runCliSafe, song } from './helpers/data'

const GAMES = [
  { id: 'sm', name: 'Sun/Moon' },
  { id: 'xy', name: 'X/Y' },
]
const ORIGINAL = song({ id: 'sm-route-1', title: 'Route 1', games: ['sm'], clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAA1' })
const REUPLOAD = song({ id: 'sm-route-1-otro', title: 'Route 1 (otro canal)', games: ['sm'], clipKey: '2222222222222222', youtubeId: 'AAAAAAAAAA2', startSec: 2 })
const OTHER = song({ id: 'sm-route-2', title: 'Route 2', games: ['sm'], clipKey: '3333333333333333', youtubeId: 'AAAAAAAAAA3' })
const OFF = song({ id: 'sm-route-1-off', title: 'Route 1 (noche)', games: ['sm'], clipKey: '4444444444444444', youtubeId: 'AAAAAAAAAA4', enabled: false })
const XY = song({ id: 'xy-route-1', title: 'Route 1', games: ['xy'], clipKey: '5555555555555555', youtubeId: 'AAAAAAAAAA5' })

/** Melodia por youtubeId: 1, 2, 4 y 5 son la misma pista; 3 es otra. */
const SEEDS: Record<string, number> = { AAAAAAAAAA1: 1, AAAAAAAAAA2: 1, AAAAAAAAAA3: 2, AAAAAAAAAA4: 1, AAAAAAAAAA5: 1 }

function fakeDecoder() {
  const calls: Array<{ id: string; startSec: number; seconds: number }> = []
  const decode: AudioDecoder = async (file, startSec, seconds) => {
    const id = basename(file).replace(/\.[^.]+$/, '')
    calls.push({ id, startSec, seconds })
    return melody(SEEDS[id], 40).subarray(Math.round(startSec * SAMPLE_RATE))
  }
  return { decode, calls }
}

const all = [ORIGINAL, REUPLOAD, OTHER, OFF, XY]
const sources = Object.fromEntries(all.map((s) => [s.source.youtubeId, { ext: 'm4a' }]))
const similar = (dir: string, extra: string[] = [], decoder = fakeDecoder(), out = io()) =>
  runCliSafe(['similar', ...extra, '--data-dir', dir], out, { decodeAudio: decoder.decode }).then((code) => ({ code, out, decoder }))

describe('similar', () => {
  it('SC-SIM-10 lista la pareja que suena igual dentro del juego, con puntuacion, y sale con 0', async () => {
    const dir = makeDataDir({ catalog: catalogOf(all, GAMES), sources })
    const { code, out } = await similar(dir, ['sm'])
    expect(code).toBe(0)
    expect(out.text()).toMatch(/^0\.\d\d {2}sm-route-1 "Route 1" {2}~ {2}sm-route-1-otro "Route 1 \(otro canal\)"$/m)
    expect(out.text()).not.toMatch(/sm-route-2 "/)
    expect(out.text()).toMatch(/1 parejas con similitud >= 0\.8 entre 3 canciones de sm/)
  })

  it('SC-SIM-11 solo compara canciones del juego pedido y, sin --all, solo las activas', async () => {
    const dir = makeDataDir({ catalog: catalogOf(all, GAMES), sources })
    const { decoder } = await similar(dir, ['sm'])
    expect(decoder.calls.map((c) => c.id).sort()).toEqual(['AAAAAAAAAA1', 'AAAAAAAAAA2', 'AAAAAAAAAA3'])
  })

  it('SC-SIM-12 --all incluye las desactivadas y las marca', async () => {
    const dir = makeDataDir({ catalog: catalogOf(all, GAMES), sources })
    const { out } = await similar(dir, ['sm', '--all'])
    expect(out.text()).toMatch(/sm-route-1-off "Route 1 \(noche\)" \[desactivada\]/)
    expect(out.text()).toMatch(/3 parejas .* entre 4 canciones/)
  })

  it('SC-SIM-13 decodifica desde el startSec de cada cancion, 90 s', async () => {
    const dir = makeDataDir({ catalog: catalogOf(all, GAMES), sources })
    const { decoder } = await similar(dir, ['sm'])
    expect(decoder.calls.find((c) => c.id === 'AAAAAAAAAA2')).toEqual({ id: 'AAAAAAAAAA2', startSec: 2, seconds: 90 })
  })

  it('SC-SIM-14 --threshold filtra: con 0.999 no queda ninguna pareja', async () => {
    const dir = makeDataDir({ catalog: catalogOf(all, GAMES), sources })
    const { code, out } = await similar(dir, ['sm', '--threshold', '0.999'])
    expect(code).toBe(0)
    expect(out.text()).toMatch(/^0 parejas con similitud >= 0\.999/m)
  })

  it('SC-SIM-15 avisa de las canciones sin audio descargado y compara el resto', async () => {
    const { AAAAAAAAAA3: _missing, ...partial } = sources
    const dir = makeDataDir({ catalog: catalogOf(all, GAMES), sources: partial })
    const { code, out } = await similar(dir, ['sm'])
    expect(code).toBe(0)
    expect(out.text()).toMatch(/sin audio descargado.*sm-route-2/)
    expect(out.text()).toMatch(/entre 2 canciones/)
  })

  it('SC-SIM-16 errores: juego inexistente, falta el juego, umbral no valido y catalogo ausente -> codigo != 0', async () => {
    const dir = makeDataDir({ catalog: catalogOf(all, GAMES), sources })
    const unknown = await similar(dir, ['zz'])
    expect([unknown.code, /No existe el juego "zz"/.test(unknown.out.text())]).toEqual([1, true])
    expect((await similar(dir, [])).code).toBe(1)
    for (const bad of ['1.5', 'abc', '-1']) {
      const result = await similar(dir, ['sm', '--threshold', bad])
      expect(result.code).toBe(1)
    }
    expect((await similar(makeDataDir({}), ['sm'])).code).toBe(1)
  })
})
