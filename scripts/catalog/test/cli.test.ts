// Contrato: src/cli.ts exporta
//   runCli(argv: string[], io?: { log(msg: string): void; error(msg: string): void }): Promise<number>
//   (codigo de salida; subcomandos: fetch <playlistUrl> | draft | build | validate | upload [--prune])
import { describe, it, expect, vi } from 'vitest'
import { runCli } from '../src/cli'

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
