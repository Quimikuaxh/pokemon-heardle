// `build` ejecutado por runCli con --data-dir temporal; ffprobe y ffmpeg simulados (deps.run).
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { catalogOf, fakeRunner, io, makeDataDir, readCatalog, song, runCliSafe } from './helpers/data'

const L1 = song({ id: 'long-one', clipKey: '1111111111111111', youtubeId: 'LLLLLLLLLL1', reviewed: true, title: 'Larga Uno' })
const L2 = song({ id: 'long-two', clipKey: '2222222222222222', youtubeId: 'LLLLLLLLLL2', reviewed: false, games: ['rse', 'dp'] })
const SH = song({ id: 'short-one', clipKey: '3333333333333333', youtubeId: 'SSSSSSSSSS1', reviewed: true })
const OFF = song({ id: 'off-one', clipKey: '4444444444444444', youtubeId: 'OOOOOOOOOO1', enabled: false, durationSec: 7.4 })

const sources = { LLLLLLLLLL1: {}, LLLLLLLLLL2: {}, SSSSSSSSSS1: {}, OOOOOOOOOO1: {} }
const build = (dir: string, runner = fakeRunner({}, 100), out = io()) => runCliSafe(['build', '--data-dir', dir], out, { run: runner.run })
const clipsOf = (dir: string, key: string) => {
  const d = join(dir, 'out', 'clips', key)
  return existsSync(d) ? readdirSync(d).sort() : []
}
const SIX = ['1.mp3', '2.mp3', '3.mp3', '4.mp3', '5.mp3', '6.mp3']

describe('build: canciones cortas (DEC-40)', () => {
  it('SC-BU-04 una corta activa y otras largas: genera las largas, desactiva la corta, avisa y sale con 0', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1, L2, SH]), sources })
    const out = io()
    const code = await build(dir, fakeRunner({ SSSSSSSSSS1: 7.4 }, 120), out)
    expect(code).toBe(0)
    expect([clipsOf(dir, L1.clipKey), clipsOf(dir, L2.clipKey), clipsOf(dir, SH.clipKey)]).toEqual([SIX, SIX, []])
    const short = readCatalog(dir).songs.find((s: any) => s.id === 'short-one')
    expect([short.enabled, short.source.durationSec]).toEqual([false, 7.4])
    expect(out.text()).toMatch(/cort/i)
  })

  it('SC-BU-04 ffmpeg solo se invoca para las canciones largas', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1, SH]), sources })
    const runner = fakeRunner({ SSSSSSSSSS1: 7.4 }, 120)
    await build(dir, runner)
    const calls = runner.ffmpegCalls()
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.some((c) => c.args.some((a) => a.includes('SSSSSSSSSS1')))).toBe(false)
    expect(calls.some((c) => c.args.some((a) => a.includes('LLLLLLLLLL1')))).toBe(true)
  })

  it('SC-BU-03 mide SIEMPRE la fuente antes de cortar: durationSec desfasada (500) y medida real 9 -> desactivada y medida guardada', async () => {
    const stale = song({ id: 'stale', clipKey: '5555555555555555', youtubeId: 'LLLLLLLLLL1', durationSec: 500 })
    const dir = makeDataDir({ catalog: catalogOf([stale]), sources })
    await build(dir, fakeRunner({ LLLLLLLLLL1: 9 }))
    const s = readCatalog(dir).songs[0]
    expect([s.enabled, s.source.durationSec, clipsOf(dir, stale.clipKey)]).toEqual([false, 9, []])
  })

  it('SC-BU-03 se mide en cada build aunque no haya nada que cortar (manifest al dia)', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1]), sources })
    await build(dir, fakeRunner({}, 120))
    const second = fakeRunner({}, 120)
    await build(dir, second)
    expect(second.probed()).toEqual(['LLLLLLLLLL1'])
  })

  it('SC-BU-03 la medida real actualiza durationSec cuando la cancion sigue siendo larga', async () => {
    const dir = makeDataDir({ catalog: catalogOf([song({ id: 'l', clipKey: '6666666666666666', youtubeId: 'LLLLLLLLLL1', durationSec: 50 })]), sources })
    await build(dir, fakeRunner({ LLLLLLLLLL1: 61.5 }))
    const s = readCatalog(dir).songs[0]
    expect([s.enabled, s.source.durationSec]).toEqual([true, 61.5])
  })

  it('SC-BU-02 build ignora enabled:false: no las mide ni genera sus clips', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1, OFF]), sources })
    const runner = fakeRunner({}, 120)
    await build(dir, runner)
    expect(runner.probed()).toEqual(['LLLLLLLLLL1'])
    expect(clipsOf(dir, OFF.clipKey)).toEqual([])
  })

  it('SC-BU-05 no modifica otros campos de la corta ni de otras entradas; no activa nada', async () => {
    const original = catalogOf([L1, L2, SH, OFF])
    const dir = makeDataDir({ catalog: original, sources })
    await build(dir, fakeRunner({ SSSSSSSSSS1: 7.4, LLLLLLLLLL1: 120, LLLLLLLLLL2: 130 }, 120))
    const after = readCatalog(dir)
    const expected = structuredClone(original.songs)
    expected[2].enabled = false
    expected[2].source.durationSec = 7.4
    expected[0].source.durationSec = 120
    expected[1].source.durationSec = 130
    expect(after.songs).toEqual(expected)
    expect(after.games).toEqual(original.games)
  })

  it('SC-BU-05 una cancion desactivada a mano nunca se reactiva', async () => {
    const off = song({ id: 'manual-off', clipKey: '7777777777777777', youtubeId: 'LLLLLLLLLL2', enabled: false })
    const dir = makeDataDir({ catalog: catalogOf([off, L1]), sources })
    await build(dir, fakeRunner({}, 500))
    expect(readCatalog(dir).songs[0].enabled).toBe(false)
  })

  it('SC-DUR-05 ffprobe no instalado en build: error claro y codigo != 0, sin modificar el catalogo', async () => {
    const original = catalogOf([L1])
    const dir = makeDataDir({ catalog: original, sources })
    const missing = Object.assign(new Error('spawn ffprobe ENOENT'), { code: 'ENOENT' })
    const out = io()
    const code = await build(dir, fakeRunner({ LLLLLLLLLL1: missing }), out)
    expect(code).not.toBe(0)
    expect(out.text()).toMatch(/ffprobe/i)
    expect(readCatalog(dir)).toEqual(original)
  })

  it('SC-DUR-03 en build tambien se usan rutas absolutas para ffprobe con youtubeId que empieza por "-"', async () => {
    const dash = song({ id: 'dash', clipKey: '8888888888888888', youtubeId: '-BRQ_XVwg-M' })
    const dir = makeDataDir({ catalog: catalogOf([dash]), sources: { '-BRQ_XVwg-M': {} } })
    const runner = fakeRunner({}, 120)
    await build(dir, runner)
    const file = runner.calls.find((c) => c.command === 'ffprobe')!.args.at(-1)!
    expect([file.startsWith('/'), file.startsWith('-')]).toEqual([true, false])
  })
})
