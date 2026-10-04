// Contrato: src/cli.ts exporta
//   runCli(argv: string[], io?: { log(msg: string): void; error(msg: string): void }): Promise<number>
//   (codigo de salida; subcomandos: fetch <playlistUrl> | draft | build | validate | upload [--prune])
import { describe, it, expect, vi } from 'vitest'
import { runCli } from '../src/cli'
import { catalogOf, fakeRunner, io as textIo, makeDataDir, runCliSafe, song } from './helpers/data'

const io = () => ({ log: vi.fn(), error: vi.fn() })

describe('runCli', () => {
  it('SC-CLI-01 subcomando desconocido -> codigo != 0 y muestra el uso', async () => {
    const o = io()
    expect(await runCli(['frobnicate'], o)).not.toBe(0)
    expect([...o.error.mock.calls, ...o.log.mock.calls].flat().join('\n')).toMatch(/uso|usage/i)
  })

  it('SC-CLI-01 sin argumentos -> codigo != 0 y muestra el uso', async () => {
    const o = io()
    expect(await runCli([], o)).not.toBe(0)
    expect([...o.error.mock.calls, ...o.log.mock.calls].flat().join('\n')).toMatch(/uso|usage/i)
  })

  it('SC-CLI-01 fetch sin URL -> codigo != 0 sin tocar la red', async () => {
    const o = io()
    expect(await runCli(['fetch'], o)).not.toBe(0)
  })

  it('SC-CLI-01 el mensaje de uso lista los subcomandos', async () => {
    const o = io()
    await runCli(['frobnicate'], o)
    const text = [...o.error.mock.calls, ...o.log.mock.calls].flat().join('\n')
    for (const c of ['fetch', 'draft', 'build', 'validate', 'upload']) expect(text).toContain(c)
  })
})

describe('cli: flags desconocidos', () => {
  it('SC-CLI-02 --xxx no reconocido -> error claro y codigo != 0 sin ejecutar nada', async () => {
    const dir = makeDataDir({ catalog: catalogOf([song({ id: 'one', clipKey: '1111111111111111', youtubeId: 'AAAAAAAAAAA' })]) })
    const out = textIo()
    const runner = fakeRunner({}, 100)
    expect(await runCliSafe(['build', '--bogus', '--data-dir', dir], out, { run: runner.run })).not.toBe(0)
    expect(out.text()).toContain('--bogus')
    expect(runner.calls).toEqual([])
  })

  it('SC-CLI-02 un typo como --prunee tampoco se acepta', async () => {
    const out = textIo()
    expect(await runCliSafe(['upload', '--prunee', '--data-dir', makeDataDir({})], out)).not.toBe(0)
  })
})
