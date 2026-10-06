// `draft` ejecutado por runCli con --data-dir temporal y ffprobe simulado (deps.run). Ver helpers/data.ts.
import { describe, it, expect } from 'vitest'
import { validateCatalog } from '../../../shared/catalog'
import { catalogOf, fakeRunner, io, makeDataDir, readCatalog, song, runCliSafe } from './helpers/data'
import { join } from 'node:path'
import { createCatalogStore } from '../src/catalogStore'
import type { FakeRunner } from './helpers/data'

const A = { youtubeId: 'AAAAAAAAAAA', title: 'Pokemon Ruby/Sapphire/Emerald - Littleroot Town' }
const B = { youtubeId: 'BBBBBBBBBBB', title: 'Pokemon Ruby/Sapphire/Emerald - Obtained a Badge' }
const C = { youtubeId: 'CCCCCCCCCCC', title: 'Sin formato alguno' }

const draft = (dir: string, runner = fakeRunner({}), out = io()) => runCliSafe(['draft', '--data-dir', dir], out, { run: runner.run })

describe('draft: duracion de las fuentes (DEC-40)', () => {
  it('SC-DR-01 entradas nuevas: startSec 0, reviewed false, clipKey valido y unico, youtubeId y durationSec medida', async () => {
    const dir = makeDataDir({ playlist: [A, B], sources: { AAAAAAAAAAA: {}, BBBBBBBBBBB: {} } })
    const runner = fakeRunner({ AAAAAAAAAAA: 183.42, BBBBBBBBBBB: 40 })
    expect(await draft(dir, runner)).toBe(0)
    const cat = readCatalog(dir)
    expect(cat.songs.length).toBe(2)
    const a = cat.songs.find((s: any) => s.source.youtubeId === 'AAAAAAAAAAA')
    expect([a.startSec, a.reviewed, a.source.durationSec]).toEqual([0, false, 183.42])
    expect(cat.songs.every((s: any) => /^[0-9a-f]{16}$/.test(s.clipKey))).toBe(true)
    expect(new Set(cat.songs.map((s: any) => s.clipKey)).size).toBe(2)
  })

  it('SC-DR-01 si el titulo no permite deducir el juego: games [] y el catalogo no valida (DEC-26)', async () => {
    const dir = makeDataDir({ playlist: [C], sources: { CCCCCCCCCCC: {} } })
    expect(await draft(dir, fakeRunner({ CCCCCCCCCCC: 60 }))).toBe(0)
    const cat = readCatalog(dir)
    expect(cat.songs[0].games).toEqual([])
    expect(validateCatalog(cat).ok).toBe(false)
  })

  it('SC-DR-07 draft mide solo las fuentes sin durationSec (segunda ejecucion: 0 llamadas a ffprobe)', async () => {
    const dir = makeDataDir({ playlist: [A, B], sources: { AAAAAAAAAAA: {}, BBBBBBBBBBB: {} } })
    const first = fakeRunner({}, 60)
    await draft(dir, first)
    expect(first.probed().sort()).toEqual(['AAAAAAAAAAA', 'BBBBBBBBBBB'])
    const second = fakeRunner({}, 60)
    await draft(dir, second)
    expect(second.probed()).toEqual([])
  })

  it('SC-DR-07 una fuente nueva se mide y las ya medidas no', async () => {
    const dir = makeDataDir({ playlist: [A], sources: { AAAAAAAAAAA: {}, BBBBBBBBBBB: {} } })
    await draft(dir, fakeRunner({}, 60))
    const dir2 = dir
    const { writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    writeFileSync(join(dir2, 'work', 'playlist.json'), JSON.stringify([A, B]))
    const runner = fakeRunner({}, 60)
    await draft(dir2, runner)
    expect(runner.probed()).toEqual(['BBBBBBBBBBB'])
  })

  it('SC-DR-08 fuente corta (7,4 s): enabled false, durationSec guardada, aviso en consola y codigo de salida 0', async () => {
    const dir = makeDataDir({ playlist: [A, B], sources: { AAAAAAAAAAA: {}, BBBBBBBBBBB: {} } })
    const out = io()
    const code = await draft(dir, fakeRunner({ AAAAAAAAAAA: 40, BBBBBBBBBBB: 7.4 }), out)
    const cat = readCatalog(dir)
    const short = cat.songs.find((s: any) => s.source.youtubeId === 'BBBBBBBBBBB')
    const long = cat.songs.find((s: any) => s.source.youtubeId === 'AAAAAAAAAAA')
    expect([code, short.enabled, short.source.durationSec, long.enabled]).toEqual([0, false, 7.4, true])
    expect(out.text()).toMatch(/cort/i)
  })

  it('SC-DR-08 el limite exacto: 16,1 s no es corta; 16,0999 s si', async () => {
    const dir = makeDataDir({ playlist: [A, B], sources: { AAAAAAAAAAA: {}, BBBBBBBBBBB: {} } })
    await draft(dir, fakeRunner({ AAAAAAAAAAA: 16 + 0.1, BBBBBBBBBBB: 16 + 0.1 - 0.0001 }))
    const cat = readCatalog(dir)
    const by = (id: string) => cat.songs.find((s: any) => s.source.youtubeId === id)
    expect([by('AAAAAAAAAAA').enabled, by('BBBBBBBBBBB').enabled]).toEqual([true, false])
  })

  it('SC-DR-08 draft nunca activa nada: una cancion desactivada a mano sigue desactivada aunque su fuente sea larga', async () => {
    const existing = catalogOf([song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAAA', enabled: false })])
    const dir = makeDataDir({ catalog: existing, playlist: [A], sources: { AAAAAAAAAAA: {} } })
    await draft(dir, fakeRunner({ AAAAAAAAAAA: 300 }))
    const s = readCatalog(dir).songs[0]
    expect([s.enabled, s.source.durationSec]).toEqual([false, 300])
  })

  it('SC-DR-09 fuente no medible (ffprobe falla): durationSec ausente, aviso, enabled sin tocar y codigo 0', async () => {
    const dir = makeDataDir({ playlist: [A, B], sources: { AAAAAAAAAAA: {}, BBBBBBBBBBB: {} } })
    const out = io()
    const code = await draft(dir, fakeRunner({ AAAAAAAAAAA: new Error('ffprobe: Invalid data'), BBBBBBBBBBB: 50 }), out)
    const a = readCatalog(dir).songs.find((s: any) => s.source.youtubeId === 'AAAAAAAAAAA')
    expect([code, a.enabled, 'durationSec' in a.source]).toEqual([0, true, false])
    expect(out.text()).toMatch(/ffprobe|medir|no se pudo/i)
  })

  it('SC-DR-09 ffprobe no instalado: draft sigue, no desactiva ni falla', async () => {
    const dir = makeDataDir({ playlist: [A], sources: { AAAAAAAAAAA: {} } })
    const missing = Object.assign(new Error('spawn ffprobe ENOENT'), { code: 'ENOENT' })
    expect(await draft(dir, fakeRunner({ AAAAAAAAAAA: missing }))).toBe(0)
    expect(readCatalog(dir).songs[0].enabled).toBe(true)
  })

  it('SC-DR-09 un video sin fuente descargada no se mide y se anade igualmente', async () => {
    const dir = makeDataDir({ playlist: [A], sources: {} })
    const runner = fakeRunner({})
    expect(await draft(dir, runner)).toBe(0)
    expect([runner.probed(), readCatalog(dir).songs.length]).toEqual([[], 1])
  })

  it('SC-DUR-03 el youtubeId con "-" inicial se mide con ruta absoluta', async () => {
    const dir = makeDataDir({ playlist: [{ youtubeId: '-BRQ_XVwg-M', title: 'Pokemon X/Y - Lumiose City' }], sources: { '-BRQ_XVwg-M': {} } })
    const runner = fakeRunner({}, 60)
    await draft(dir, runner)
    const file = runner.calls.find((c) => c.command === 'ffprobe')!.args.at(-1)!
    expect([file.startsWith('/'), file.startsWith('-')]).toEqual([true, false])
  })

  it('SC-DR-03 entrada existente editada y revisada: solo se completa durationSec y, si es corta, enabled=false', async () => {
    const existing = catalogOf([
      { ...song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAAA', title: 'Titulo Editado', reviewed: true, startSec: 3 }) },
    ])
    const dir = makeDataDir({ catalog: existing, playlist: [A], sources: { AAAAAAAAAAA: {} } })
    await draft(dir, fakeRunner({ AAAAAAAAAAA: 12.5 }))
    const s = readCatalog(dir).songs[0]
    const expected = structuredClone(existing.songs[0])
    expected.enabled = false
    expected.source.durationSec = 12.5
    expected.source.leadingSilenceSec = 0 // [MOD] DEC-47: draft tambien mide el silencio inicial (startSec 3 = manual, no cambia)
    expect(s).toEqual(expected)
  })

  it('SC-DR-03 entrada existente larga: solo anade durationSec (enabled intacto)', async () => {
    const existing = catalogOf([song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAAA', reviewed: true })])
    const dir = makeDataDir({ catalog: existing, playlist: [A], sources: { AAAAAAAAAAA: {} } })
    await draft(dir, fakeRunner({ AAAAAAAAAAA: 200 }))
    const expected = structuredClone(existing.songs[0])
    expected.source.durationSec = 200
    expected.source.leadingSilenceSec = 0 // [MOD] DEC-47
    expect(readCatalog(dir).songs[0]).toEqual(expected)
  })

  it('SC-DR-03 con durationSec ya guardada no se vuelve a medir ni se toca la entrada', async () => {
    const existing = catalogOf([song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAAA', durationSec: 99.9, enabled: false })])
    const dir = makeDataDir({ catalog: existing, playlist: [A], sources: { AAAAAAAAAAA: {} } })
    const runner = fakeRunner({ AAAAAAAAAAA: 5 })
    await draft(dir, runner)
    const expected = structuredClone(existing.songs[0])
    expected.source.leadingSilenceSec = 0 // [MOD] DEC-47: solo se completa el silencio inicial que faltaba
    expect([runner.probed(), readCatalog(dir).songs[0]]).toEqual([[], expected])
  })

  it('SC-DR-02 idempotente: segunda ejecucion sin cambios en el catalogo', async () => {
    const dir = makeDataDir({ playlist: [A, B], sources: { AAAAAAAAAAA: {}, BBBBBBBBBBB: {} } })
    await draft(dir, fakeRunner({}, 60))
    const first = readCatalog(dir)
    await draft(dir, fakeRunner({}, 60))
    expect(readCatalog(dir).songs).toEqual(first.songs)
  })

  it('draft sin playlist descargada: error claro y codigo != 0', async () => {
    const dir = makeDataDir({})
    const out = io()
    expect(await draft(dir, fakeRunner({}), out)).not.toBe(0)
    expect(out.text()).toMatch(/fetch|playlist/i)
  })
})

describe('draft: una edicion concurrente del admin no se pierde', () => {
  it('SC-DR-10 ediciones hechas mientras ffprobe mide siguen en catalog.json', async () => {
    const existing = catalogOf([song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAAA', title: 'Original' })])
    const dir = makeDataDir({ catalog: existing, playlist: [{ youtubeId: 'AAAAAAAAAAA', title: 'Pokemon Ruby/Sapphire/Emerald - Littleroot Town' }], sources: { AAAAAAAAAAA: {} } })
    let release!: () => void
    let probing!: () => void
    const probeStarted = new Promise<void>((resolve) => (probing = resolve))
    const gate = new Promise<void>((resolve) => (release = resolve))
    const base: FakeRunner = fakeRunner({}, 120)
    const slow = async (command: string, args: string[]) => {
      if (command === 'ffprobe') {
        probing()
        await gate
      }
      return base.run(command, args)
    }
    const draft = runCliSafe(['draft', '--data-dir', dir], io(), { run: slow })
    await probeStarted
    // Mientras ffprobe tarda, el admin edita (misma ruta que PATCH /api/songs/:id).
    await createCatalogStore({ file: join(dir, 'catalog.json') }).update((c) => {
      c.songs[0].title = 'Editado en el admin'
      c.songs[0].reviewed = true
    })
    release()
    expect(await draft).toBe(0)
    const s = readCatalog(dir).songs[0]
    expect([s.title, s.reviewed, s.source.durationSec]).toEqual(['Editado en el admin', true, 120])
  })
})
