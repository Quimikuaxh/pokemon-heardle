// `build` ejecutado por runCli con --data-dir temporal; ffprobe y ffmpeg simulados (deps.run).
import { spawnSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { catalogOf, fakeRunner, io, makeDataDir, readCatalog, song, runCliSafe } from './helpers/data'

const L1 = song({ id: 'long-one', clipKey: '1111111111111111', youtubeId: 'LLLLLLLLLL1', reviewed: true, title: 'Larga Uno' })
const L2 = song({ id: 'long-two', clipKey: '2222222222222222', youtubeId: 'LLLLLLLLLL2', reviewed: false, games: ['dp'] })
const SH = song({ id: 'short-one', clipKey: '3333333333333333', youtubeId: 'SSSSSSSSSS1', reviewed: true })
const OFF = song({ id: 'off-one', clipKey: '4444444444444444', youtubeId: 'OOOOOOOOOO1', enabled: false, durationSec: 7.4 })

const sources = { LLLLLLLLLL1: {}, LLLLLLLLLL2: {}, SSSSSSSSSS1: {}, OOOOOOOOOO1: {} }
const build = (dir: string, runner = fakeRunner({}, 100), out = io()) => runCliSafe(['build', '--data-dir', dir], out, { run: runner.run })
/** Ficheros generados para una cancion en out/clips: el clip unico <clipKey>.mp3 (DEC-44) y, si lo hay, el directorio antiguo. */
const clipFile = (dir: string, key: string) => join(dir, 'out', 'clips', `${key}.mp3`)
const hasClip = (dir: string, key: string) => existsSync(clipFile(dir, key))
const oldDir = (dir: string, key: string) => join(dir, 'out', 'clips', key)
const clipsOf = (dir: string, key: string) => (hasClip(dir, key) ? ['mp3'] : [])
const ONE = ['mp3']

describe('build: canciones cortas (DEC-40)', () => {
  it('SC-BU-04 una corta activa y otras largas: genera las largas, desactiva la corta, avisa y sale con 0', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1, L2, SH]), sources })
    const out = io()
    const code = await build(dir, fakeRunner({ SSSSSSSSSS1: 7.4 }, 120), out)
    expect(code).toBe(0)
    expect([clipsOf(dir, L1.clipKey), clipsOf(dir, L2.clipKey), clipsOf(dir, SH.clipKey)]).toEqual([ONE, ONE, []])
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
    expected[0].source.leadingSilenceSec = 0 // [MOD] DEC-47: build mide el silencio inicial de las activas largas
    expected[1].source.leadingSilenceSec = 0
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

  it('SC-CLP-01 build genera UN solo fichero por cancion (out/clips/<clipKey>.mp3) y ninguna carpeta <clipKey>/', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1]), sources })
    await build(dir, fakeRunner({}, 120))
    expect([hasClip(dir, L1.clipKey), existsSync(oldDir(dir, L1.clipKey))]).toEqual([true, false])
  })

  it('SC-CLP-01 la segunda invocacion de ffmpeg (clip) usa clipArgs de 16 s y la salida <clipKey>.mp3', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1]), sources })
    const runner = fakeRunner({}, 120)
    await build(dir, runner)
    const clipCall = runner.ffmpegCalls().find((c) => c.args.at(-1)!.endsWith(`${L1.clipKey}.mp3`))!
    expect(clipCall.args).toContain('-reservoir')
    // master + un unico clip (antes eran 1 + 6); la medicion del silencio inicial (DEC-47) no cuenta
    expect(runner.ffmpegCalls().filter((c) => !c.args.includes('-hide_banner')).length).toBe(2)
  })

  it('SC-CLP-04 build borra el directorio antiguo out/clips/<clipKey>/ tras generar el nuevo (y no el de otras canciones)', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1]), sources })
    mkdirSync(oldDir(dir, L1.clipKey), { recursive: true })
    writeFileSync(join(oldDir(dir, L1.clipKey), '1.mp3'), 'antiguo')
    mkdirSync(oldDir(dir, 'ffffffffffffffff'), { recursive: true }) // de una cancion que no se reconstruye
    await build(dir, fakeRunner({}, 120))
    expect(existsSync(oldDir(dir, L1.clipKey))).toBe(false)
    expect(hasClip(dir, L1.clipKey)).toBe(true)
    expect(existsSync(oldDir(dir, 'ffffffffffffffff'))).toBe(true)
  })

  it('SC-CLP-04 una cancion desactivada conserva su carpeta antigua (no se reconstruye ni se toca)', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1, OFF]), sources })
    mkdirSync(oldDir(dir, OFF.clipKey), { recursive: true })
    writeFileSync(join(oldDir(dir, OFF.clipKey), '1.mp3'), 'antiguo')
    await build(dir, fakeRunner({}, 120))
    expect(existsSync(join(oldDir(dir, OFF.clipKey), '1.mp3'))).toBe(true)
  })

  it('SC-CLP-04 el layout antiguo sin fichero nuevo cuenta como no compilado: se regenera aunque el manifest este al dia', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1]), sources })
    const first = fakeRunner({}, 120)
    await build(dir, first) // genera y escribe el manifest
    rmSync(clipFile(dir, L1.clipKey)) // se queda "sin fichero nuevo"
    mkdirSync(oldDir(dir, L1.clipKey), { recursive: true })
    writeFileSync(join(oldDir(dir, L1.clipKey), '1.mp3'), 'antiguo')
    const second = fakeRunner({}, 120)
    await build(dir, second)
    expect([hasClip(dir, L1.clipKey), existsSync(oldDir(dir, L1.clipKey)), second.ffmpegCalls().length]).toEqual([true, false, 2])
  })

  it('SC-CLP-05 si la generacion falla, el directorio antiguo no se borra y el codigo de salida es != 0', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1]), sources })
    mkdirSync(oldDir(dir, L1.clipKey), { recursive: true })
    writeFileSync(join(oldDir(dir, L1.clipKey), '1.mp3'), 'antiguo')
    const base = fakeRunner({}, 120)
    const failing = async (command: string, args: string[], options?: any) => {
      if (command === 'ffmpeg' && args.at(-1)!.endsWith('.mp3')) throw Object.assign(new Error('ffmpeg: encoder error'), { code: 1 })
      return base.run(command, args, options)
    }
    const out = io()
    const code = await runCliSafe(['build', '--data-dir', dir], out, { run: failing })
    expect(code).not.toBe(0)
    expect(existsSync(join(oldDir(dir, L1.clipKey), '1.mp3'))).toBe(true)
    expect(hasClip(dir, L1.clipKey)).toBe(false)
  })

  it('SC-CLP-05 un clip a medias (ffmpeg fallo despues de escribir) no se deja como bueno', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1]), sources })
    const base = fakeRunner({}, 120)
    const failing = async (command: string, args: string[], options?: any) => {
      if (command === 'ffmpeg' && args.at(-1)!.endsWith('.mp3')) {
        await base.run(command, args, options) // escribe el fichero
        throw new Error('ffmpeg murio a mitad')
      }
      return base.run(command, args, options)
    }
    expect(await runCliSafe(['build', '--data-dir', dir], io(), { run: failing })).not.toBe(0)
    expect(hasClip(dir, L1.clipKey)).toBe(false)
  })

  it('SC-CLP-03 youtubeId que empieza por "-": el master y el clip usan rutas absolutas para ffmpeg', async () => {
    const dash = song({ id: 'dash', clipKey: '9999999999999999', youtubeId: '-BRQ_XVwg-M' })
    const dir = makeDataDir({ catalog: catalogOf([dash]), sources: { '-BRQ_XVwg-M': {} } })
    const runner = fakeRunner({}, 120)
    await build(dir, runner)
    for (const call of runner.ffmpegCalls()) {
      const input = call.args[call.args.indexOf('-i') + 1]
      expect([input.startsWith('/'), call.args.at(-1)!.startsWith('/')]).toEqual([true, true])
    }
  })
})

describe('build: limpieza de restos', () => {
  it('SC-CLP-05 un directorio .tmp-<pid> huerfano de un build interrumpido se borra al empezar y no toca otros ficheros', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1]), sources })
    const clips = join(dir, 'out', 'clips')
    const deadPid = spawnSync(process.execPath, ['-e', '0']).pid // proceso ya terminado
    const orphan = `.tmp-${deadPid}`
    mkdirSync(join(clips, orphan), { recursive: true })
    writeFileSync(join(clips, orphan, `${L1.clipKey}.mp3`), 'a medias')
    writeFileSync(join(clips, 'ffffffffffffffff.mp3'), 'otra cancion')
    await build(dir, fakeRunner({}, 120))
    expect(existsSync(join(clips, orphan))).toBe(false)
    expect(existsSync(join(clips, 'ffffffffffffffff.mp3'))).toBe(true)
    expect(hasClip(dir, L1.clipKey)).toBe(true)
  })

  it('SC-CLP-05 no borra el .tmp-<pid> de un proceso vivo (otro build en marcha) y si el de nombre sin pid', async () => {
    const dir = makeDataDir({ catalog: catalogOf([L1]), sources })
    const clips = join(dir, 'out', 'clips')
    mkdirSync(join(clips, `.tmp-${process.ppid}`), { recursive: true })
    mkdirSync(join(clips, '.tmp-abc'), { recursive: true })
    await build(dir, fakeRunner({}, 120))
    expect([existsSync(join(clips, `.tmp-${process.ppid}`)), existsSync(join(clips, '.tmp-abc'))]).toEqual([true, false])
  })
})
