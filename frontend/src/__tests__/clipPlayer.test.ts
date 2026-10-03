import { describe, it, expect, vi } from 'vitest'
import { createClipPlayer } from '../audio/clipPlayer'
import { ApiError } from '../api/client'

function setup(over: Record<string, unknown> = {}) {
  const audio: any = { src: '', currentTime: 0, play: vi.fn(() => Promise.resolve()), pause: vi.fn(), load: vi.fn() }
  let n = 0
  const deps = {
    fetchClip: vi.fn(async (_u: string) => new Blob([new Uint8Array(4)])),
    refreshClipUrl: vi.fn(async () => '/api/clips/nuevo'),
    createObjectURL: vi.fn(() => `blob:${++n}`),
    revokeObjectURL: vi.fn(),
    createAudio: vi.fn(() => audio),
    ...over,
  }
  return { player: createClipPlayer(deps as any), deps, audio }
}

describe('audio/clipPlayer', () => {
  it('FE-AUD-01 descarga el clip a Blob, crea un objectURL y lo asigna al audio', async () => {
    const { player, deps, audio } = setup()
    await player.prepare('/api/clips/a', 'k0')
    expect([deps.fetchClip.mock.calls, audio.src]).toEqual([[['/api/clips/a']], 'blob:1'])
  })

  it('FE-AUD-01 un solo fetch por intento aunque se repita prepare y play', async () => {
    const { player, deps } = setup()
    await player.prepare('/api/clips/a', 'k0')
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    player.play()
    expect(deps.fetchClip).toHaveBeenCalledTimes(1)
  })

  it('FE-AUD-01 un intento nuevo (otra clave) descarga otro clip', async () => {
    const { player, deps } = setup()
    await player.prepare('/api/clips/a', 'k0')
    await player.prepare('/api/clips/b', 'k1')
    expect(deps.fetchClip).toHaveBeenCalledTimes(2)
  })

  it('FE-AUD-02 play() llama a audio.play() de forma sincrona (misma pila del gesto)', async () => {
    const { player, audio } = setup()
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('FE-AUD-02 repetir el clip reinicia currentTime a 0', async () => {
    const { player, audio } = setup()
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    audio.currentTime = 0.9
    player.play()
    expect([audio.currentTime, audio.play.mock.calls.length]).toEqual([0, 2])
  })

  it('FE-AUD-02 no se reproduce nada hasta que se llama a play (sin autoplay)', async () => {
    const { player, audio } = setup()
    await player.prepare('/api/clips/a', 'k0')
    expect(audio.play).not.toHaveBeenCalled()
  })

  for (const status of [410, 404]) {
    it(`FE-AUD-03 clip ${status}: pide URL nueva y reintenta una vez`, async () => {
      const fetchClip = vi.fn().mockRejectedValueOnce(new ApiError('X', status)).mockResolvedValue(new Blob([new Uint8Array(2)]))
      const { player, deps, audio } = setup({ fetchClip })
      await player.prepare('/api/clips/viejo', 'k0')
      expect([deps.refreshClipUrl.mock.calls.length, fetchClip.mock.calls[1][0], audio.src]).toEqual([1, '/api/clips/nuevo', 'blob:1'])
    })
  }

  it('FE-AUD-03 si el reintento tambien falla, rechaza (maximo 2 fetch, sin bucle)', async () => {
    const fetchClip = vi.fn().mockRejectedValue(new ApiError('CLIP_TICKET_USED', 410))
    const { player } = setup({ fetchClip })
    await expect(player.prepare('/api/clips/viejo', 'k0')).rejects.toBeDefined()
    expect(fetchClip).toHaveBeenCalledTimes(2)
  })

  it('FE-AUD-03 un error que no es de ticket (502) no pide URL nueva', async () => {
    const fetchClip = vi.fn().mockRejectedValue(new ApiError('STORAGE_ERROR', 502))
    const { player, deps } = setup({ fetchClip })
    await expect(player.prepare('/api/clips/a', 'k0')).rejects.toBeDefined()
    expect(deps.refreshClipUrl).not.toHaveBeenCalled()
  })

  it('FE-AUD-04 al cambiar de intento revoca el objectURL anterior', async () => {
    const { player, deps } = setup()
    await player.prepare('/api/clips/a', 'k0')
    await player.prepare('/api/clips/b', 'k1')
    expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:1')
  })

  it('FE-AUD-04 dispose revoca el objectURL actual y pausa', async () => {
    const { player, deps, audio } = setup()
    await player.prepare('/api/clips/a', 'k0')
    player.dispose()
    expect([deps.revokeObjectURL.mock.calls, audio.pause.mock.calls.length > 0]).toEqual([[['blob:1']], true])
  })
})
