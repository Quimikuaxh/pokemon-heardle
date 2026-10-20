// FE-WA-*, FE-AUD-01..04 y FE-PLY-* por la ruta Web Audio (DEC-45). Ruta de reserva <audio>: clipPlayer.test.ts / clipPlayerSubscribe.test.ts.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createClipPlayer } from '../audio/clipPlayer'
import { ApiError } from '../api/client'
import { FakeAudio, FakeContext, blob, fakeFrames, flush } from './webAudioFakes'

afterEach(() => {
  vi.unstubAllGlobals()
  delete (navigator as any).audioSession
  FakeContext.instances = []
})

function setup(over: Record<string, unknown> = {}) {
  const ctx = new FakeContext()
  const audio = new FakeAudio()
  const frames = fakeFrames()
  let n = 0
  const deps = {
    fetchClip: vi.fn(async (_u: string) => blob()),
    refreshClipUrl: vi.fn(async () => '/api/clips/nuevo'),
    createObjectURL: vi.fn(() => `blob:${++n}`),
    revokeObjectURL: vi.fn(),
    createAudio: vi.fn(() => audio as unknown as HTMLAudioElement),
    createAudioContext: vi.fn(() => ctx as any),
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    ...over,
  }
  const player = createClipPlayer(deps as any) as any
  return { player, ctx, audio, frames, deps }
}
const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0]

describe('ClipPlayer Web Audio: contexto y decodificacion', () => {
  it('FE-WA-01 no se crea ningun AudioContext antes del primer prepare', () => {
    const { deps, player } = setup()
    player.subscribe(vi.fn())
    expect(deps.createAudioContext).not.toHaveBeenCalled()
  })

  it('FE-WA-01 un AudioContext por ClipPlayer, creado en el primer prepare y reutilizado', async () => {
    const { deps, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    await player.prepare('/api/clips/b', 'k1')
    player.play()
    expect(deps.createAudioContext).toHaveBeenCalledTimes(1)
  })

  it('FE-WA-02 prepare decodifica el Blob (ArrayBuffer) y NO llama a resume()', async () => {
    const { ctx, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1)
    expect(ctx.decodeAudioData.mock.calls[0][0]).toBeInstanceOf(ArrayBuffer)
    expect(ctx.resume).not.toHaveBeenCalled()
  })

  it('FE-WA-02 prepare funciona con el contexto suspended (decodificar no necesita contexto activo)', async () => {
    const { ctx, player } = setup()
    expect(ctx.state).toBe('suspended')
    await expect(player.prepare('/api/clips/a', 'k0')).resolves.toBeUndefined()
  })

  it('FE-AUD-01 prepare: un solo fetch del Blob y una decodificacion aunque se repita prepare y play', async () => {
    const { ctx, deps, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    player.play()
    expect([deps.fetchClip.mock.calls.length, ctx.decodeAudioData.mock.calls.length]).toEqual([1, 1])
  })

  it('FE-AUD-01 un intento nuevo (otra clave) hace su propio fetch y decodificacion', async () => {
    const { ctx, deps, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    await player.prepare('/api/clips/b', 'k1')
    expect([deps.fetchClip.mock.calls.length, ctx.decodeAudioData.mock.calls.length]).toEqual([2, 2])
  })

  it('FE-AUD-04 en la ruta Web Audio no se crean objectURL (y por tanto no hay nada que revocar)', async () => {
    const { deps, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    await player.prepare('/api/clips/b', 'k1')
    player.dispose()
    expect([deps.createObjectURL.mock.calls.length, deps.revokeObjectURL.mock.calls.length]).toEqual([0, 0])
  })
})

describe('ClipPlayer Web Audio: reproduccion y ganancia', () => {
  it('FE-WA-03 / FE-AUD-02 play con el contexto suspended: resume() y source.start(t0) en la misma pila, antes de cualquier await', async () => {
    const { ctx, player } = setup()
    player.subscribe(vi.fn())
    await player.prepare('/api/clips/a', 'k0')
    ctx.currentTime = 3.25
    player.play()
    expect(ctx.resume).toHaveBeenCalledTimes(1)
    expect(ctx.sources.length).toBe(1)
    expect(ctx.sources[0].start).toHaveBeenCalledWith(3.25)
  })

  it('FE-WA-04 con el contexto running no se llama a resume()', async () => {
    const { ctx, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    ctx.state = 'running'
    player.play()
    expect(ctx.resume).not.toHaveBeenCalled()
    expect(ctx.sources[0].start).toHaveBeenCalledTimes(1)
  })

  it('FE-WA-03 la cadena de audio es fuente -> ganancia -> destination', async () => {
    const { ctx, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    expect(ctx.sources[0].connect).toHaveBeenCalledWith(ctx.gains[0])
    expect(ctx.gains[0].connect).toHaveBeenCalledWith(ctx.destination)
    expect(ctx.sources[0].buffer).toBe(ctx.buffers[0])
  })

  for (const d of [1.0188, 2.0114, 4.0229, 7.0008, 11.0237, 16.0392]) {
    it(`FE-WA-05 ganancia exacta con buffer de ${d} s (sin caso especial para 16 s)`, async () => {
      const { ctx, player } = setup()
      ctx.durations = [d]
      ctx.currentTime = 5.5
      await player.prepare('/api/clips/a', 'k0')
      player.play()
      const gain = ctx.gains[0].gain
      expect(gain.setValueAtTime.mock.calls.length).toBe(2)
      expect(gain.setValueAtTime.mock.calls[0]).toEqual([1, 5.5])
      expect(gain.setValueAtTime.mock.calls[1][0]).toBe(1)
      expect(gain.setValueAtTime.mock.calls[1][1]).toBeCloseTo(5.5 + d - 0.05, 9)
      expect(gain.linearRampToValueAtTime.mock.calls.length).toBe(1)
      expect(gain.linearRampToValueAtTime.mock.calls[0][0]).toBe(0)
      expect(gain.linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(5.5 + d, 9)
    })
  }

  it('FE-WA-05 un buffer de 0,03 s (d < 0,05): ningun tiempo programado es anterior a t0', async () => {
    const { ctx, player } = setup()
    ctx.durations = [0.03]
    ctx.currentTime = 2
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    const gain = ctx.gains[0].gain
    const times = [...gain.setValueAtTime.mock.calls.map((c: any[]) => c[1]), ...gain.linearRampToValueAtTime.mock.calls.map((c: any[]) => c[1])]
    for (const t of times) expect(t).toBeGreaterThanOrEqual(2)
    expect(gain.linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(2.03, 9)
  })

  it('FE-WA-06 cada play crea fuente y GainNode nuevos; la anterior se para y se desconecta', async () => {
    const { ctx, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    ctx.currentTime = 0.4
    player.play()
    expect([ctx.sources.length, ctx.gains.length]).toEqual([2, 2])
    expect(ctx.sources[0].stop).toHaveBeenCalledTimes(1)
    expect(ctx.sources[0].disconnect).toHaveBeenCalled()
    expect(ctx.sources[1].stop).not.toHaveBeenCalled()
  })

  it('FE-WA-12 / FE-AUD-04 solo se conserva el AudioBuffer del intento actual: play usa el ultimo y un prepare fallido no deja el anterior', async () => {
    const { ctx, deps, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    await player.prepare('/api/clips/b', 'k1')
    player.play()
    expect(ctx.sources[0].buffer).toBe(ctx.buffers[1])
    deps.fetchClip.mockRejectedValue(new ApiError('STORAGE_ERROR', 502))
    await expect(player.prepare('/api/clips/c', 'k2')).rejects.toBeDefined()
    const before = ctx.sources.length
    player.play()
    expect(ctx.sources.length).toBe(before) // no suena el clip del intento anterior
  })

  it('FE-AUD-03 clip 410 en prepare: pide URL nueva y reintenta una vez; solo se decodifica el reintento', async () => {
    const fetchClip = vi.fn().mockRejectedValueOnce(new ApiError('CLIP_TICKET_USED', 410)).mockResolvedValue(blob())
    const { ctx, deps, player } = setup({ fetchClip })
    await player.prepare('/api/clips/viejo', 'k0')
    expect([deps.refreshClipUrl.mock.calls.length, fetchClip.mock.calls[1][0], ctx.decodeAudioData.mock.calls.length]).toEqual([1, '/api/clips/nuevo', 1])
  })

  it('FE-AUD-03 si el reintento tambien falla, rechaza (2 fetch) y no queda ningun AudioBuffer a medias', async () => {
    const fetchClip = vi.fn().mockRejectedValue(new ApiError('CLIP_TICKET_USED', 410))
    const { ctx, player } = setup({ fetchClip })
    await expect(player.prepare('/api/clips/viejo', 'k0')).rejects.toBeDefined()
    expect([fetchClip.mock.calls.length, ctx.decodeAudioData.mock.calls.length]).toEqual([2, 0])
    player.play()
    expect(ctx.sources.length).toBe(0)
  })

  it('FE-AUD-03 un error que no es de ticket (502) no pide URL nueva', async () => {
    const fetchClip = vi.fn().mockRejectedValue(new ApiError('STORAGE_ERROR', 502))
    const { deps, player } = setup({ fetchClip })
    await expect(player.prepare('/api/clips/a', 'k0')).rejects.toBeDefined()
    expect(deps.refreshClipUrl).not.toHaveBeenCalled()
  })

  it('play antes de que acabe prepare no suena nada ni lanza', () => {
    const { ctx, player } = setup()
    expect(() => player.play()).not.toThrow()
    expect(ctx.sources.length).toBe(0)
  })
})

describe('ClipPlayer Web Audio: progreso y estados (FE-PLY)', () => {
  async function playing(durations = [4.0229]) {
    const env = setup()
    env.ctx.durations = durations
    const fn = vi.fn()
    env.player.subscribe(fn)
    await env.player.prepare('/api/clips/a', 'k0')
    env.ctx.state = 'running'
    env.ctx.currentTime = 10
    env.player.play()
    return { ...env, fn }
  }

  it('FE-PLY-01 / FE-WA-07 emite { playing:true, positionSec: ctx.currentTime - t0 } en cada frame', async () => {
    const { ctx, frames, fn } = await playing()
    ctx.currentTime = 10.5
    frames.tick()
    expect(last(fn)).toEqual({ playing: true, positionSec: 0.5 })
    ctx.currentTime = 11.25
    frames.tick()
    expect(last(fn)).toEqual({ playing: true, positionSec: 1.25 })
  })

  it('FE-WA-07 la posicion se limita a d (buffer de 4,0229 s)', async () => {
    const { ctx, frames, fn } = await playing()
    ctx.currentTime = 99
    frames.tick()
    expect(last(fn).positionSec).toBeCloseTo(4.0229, 9)
  })

  it('FE-WA-07 la posicion nunca es negativa (reloj del contexto por detras de t0)', async () => {
    const { ctx, frames, fn } = await playing()
    ctx.currentTime = 9
    frames.tick()
    expect(last(fn).positionSec).toBe(0)
  })

  it('FE-PLY-02 / FE-WA-08 onended emite { playing:false } y detiene el rAF', async () => {
    const { ctx, frames, fn } = await playing()
    ctx.currentTime = 14.1
    ctx.sources[0].onended?.()
    expect(last(fn)).toMatchObject({ playing: false })
    expect(frames.pending()).toBe(0)
  })

  it('FE-WA-08 con stop() previo, onended no emite una segunda vez', async () => {
    const { player, fn, frames } = await playing()
    player.stop()
    await flush() // la fuente parada dispara onended
    const stops = fn.mock.calls.filter((c) => c[0].playing === false).length
    expect(stops).toBe(1)
    expect(frames.pending()).toBe(0)
  })

  it('FE-PLY-10 stop() para la fuente, emite { playing:false } y NO cierra el contexto', async () => {
    const { ctx, player, fn } = await playing()
    player.stop()
    expect(ctx.sources[0].stop).toHaveBeenCalled()
    expect(last(fn)).toMatchObject({ playing: false })
    expect(ctx.close).not.toHaveBeenCalled()
  })

  it('FE-PLY-10 dispose() cierra el contexto', async () => {
    const { ctx, player } = await playing()
    player.dispose()
    expect(ctx.close).toHaveBeenCalledTimes(1)
  })

  it('FE-WA-09 contexto a interrupted mientras suena: emite playing:false, para la fuente y detiene el rAF', async () => {
    const { ctx, fn, frames } = await playing()
    ctx.setState('interrupted')
    expect(last(fn)).toMatchObject({ playing: false })
    expect(ctx.sources[0].stop).toHaveBeenCalled()
    expect(frames.pending()).toBe(0)
  })

  it('FE-WA-09 contexto a suspended mientras suena: igual', async () => {
    const { ctx, fn } = await playing()
    ctx.setState('suspended')
    expect(last(fn)).toMatchObject({ playing: false })
    expect(ctx.sources[0].stop).toHaveBeenCalled()
  })

  it('FE-WA-09 el siguiente play() vuelve a llamar a resume() dentro del gesto', async () => {
    const { ctx, player } = await playing()
    ctx.resume.mockClear()
    ctx.setState('interrupted')
    player.play()
    expect(ctx.resume).toHaveBeenCalledTimes(1)
    expect(ctx.sources.length).toBe(2)
  })

  it('FE-WA-09 un statechange a running no emite ni para nada', async () => {
    const { ctx, fn } = await playing()
    const calls = fn.mock.calls.length
    ctx.setState('running')
    expect(fn.mock.calls.length).toBe(calls)
    expect(ctx.sources[0].stop).not.toHaveBeenCalled()
  })

  it('FE-WA-10 resume() rechaza: playing:false, sin excepcion; un segundo clic reintenta', async () => {
    const { ctx, player } = setup()
    const fn = vi.fn()
    player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    ctx.resume.mockRejectedValueOnce(new Error('NotAllowedError'))
    expect(() => player.play()).not.toThrow()
    await flush()
    expect(last(fn)).toMatchObject({ playing: false })
    player.play()
    await flush()
    expect(ctx.resume).toHaveBeenCalledTimes(2)
  })

  it('FE-PLY-05 sin reproduccion no hay rAF: ni suscrito, ni preparado, ni con el contexto suspendido', async () => {
    const { player, frames } = setup()
    player.subscribe(vi.fn())
    await player.prepare('/api/clips/a', 'k0')
    expect([frames.requestFrame.mock.calls.length, frames.pending()]).toEqual([0, 0])
  })

  it('FE-PLY-05 tras onended no queda ningun rAF', async () => {
    const { ctx, frames } = await playing()
    frames.tick()
    ctx.sources[0].onended?.()
    expect(frames.pending()).toBe(0)
  })

  it('FE-PLY-06 repetir crea una fuente nueva, para la anterior y reinicia desde 0', async () => {
    const { ctx, player, frames, fn } = await playing()
    ctx.currentTime = 11
    frames.tick()
    ctx.currentTime = 12
    player.play()
    ctx.currentTime = 12.2
    frames.tick()
    expect(ctx.sources.length).toBe(2)
    expect(ctx.sources[0].stop).toHaveBeenCalled()
    expect(last(fn).positionSec).toBeCloseTo(0.2, 9)
  })

  it('FE-PLY-06 el onended tardio de la fuente anterior no corta la reproduccion nueva', async () => {
    const { ctx, player, fn } = await playing()
    player.play() // repetir
    const calls = fn.mock.calls.length
    ctx.sources[0].onended?.() // llega el ended de la fuente parada
    const extra = fn.mock.calls.slice(calls).filter((c) => c[0].playing === false)
    expect(extra.length).toBe(0)
  })

  it('FE-PLY-07 cambio de intento: { playing:false, positionSec:0 }, los listeners siguen y se suelta el buffer anterior', async () => {
    const { ctx, player, frames, fn } = await playing()
    await player.prepare('/api/clips/b', 'k1')
    expect(last(fn)).toEqual({ playing: false, positionSec: 0 })
    ctx.currentTime = 20
    player.play()
    ctx.currentTime = 20.3
    frames.tick()
    expect(last(fn)).toMatchObject({ playing: true })
    expect(ctx.sources.at(-1)!.buffer).toBe(ctx.buffers[1])
  })

  it('FE-PLY-02 un listener que lanza no rompe la emision a los demas', async () => {
    const { player, ctx, frames } = setup()
    const good = vi.fn()
    player.subscribe(() => {
      throw new Error('roto')
    })
    player.subscribe(good)
    await player.prepare('/api/clips/a', 'k0')
    ctx.state = 'running'
    expect(() => player.play()).not.toThrow()
    expect(() => frames.tick()).not.toThrow()
    expect(good).toHaveBeenCalled()
  })
})

describe('ClipPlayer Web Audio: ciclo de vida (FE-WA-11, 19)', () => {
  it('FE-WA-11 dispose() cierra el contexto una sola vez (idempotente)', async () => {
    const { ctx, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    player.dispose()
    player.dispose()
    expect(ctx.close).toHaveBeenCalledTimes(1)
  })

  it('FE-WA-11 stop() no cierra el contexto y se puede volver a reproducir', async () => {
    const { ctx, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    player.stop()
    player.play()
    expect(ctx.close).not.toHaveBeenCalled()
    expect(ctx.sources.length).toBe(2)
  })

  it('FE-WA-11 dispose sin haber preparado nunca (sin contexto) no falla', () => {
    const { player, deps } = setup()
    expect(() => player.dispose()).not.toThrow()
    expect(deps.createAudioContext).not.toHaveBeenCalled()
  })

  it('FE-WA-19 tras dispose no se emite nada: ni onended, ni statechange, ni frames', async () => {
    const { ctx, player, frames } = setup()
    const fn = vi.fn()
    player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    ctx.state = 'running'
    player.play()
    player.dispose()
    const calls = fn.mock.calls.length
    ctx.sources[0].onended?.()
    ctx.setState('interrupted')
    frames.tick()
    expect(fn.mock.calls.length).toBe(calls)
    expect(frames.pending()).toBe(0)
  })

  it('FE-WA-19 prepare en vuelo cuando se hace dispose: el resultado tardio se descarta (sin fuentes ni emisiones)', async () => {
    const { ctx, player } = setup()
    let release!: (b: any) => void
    ctx.decodeAudioData.mockImplementationOnce(() => new Promise((r) => (release = r)))
    const pending = player.prepare('/api/clips/a', 'k0')
    await flush()
    player.dispose()
    release({ duration: 4 })
    await pending.catch(() => {})
    player.play()
    expect(ctx.sources.length).toBe(0)
  })

  it('FE-WA-18 [MOD] la interfaz publica es prepare/play/pause/stop/setVolume/subscribe/dispose (pause DEC-46, setVolume DEC-55)', () => {
    const { player } = setup()
    expect(Object.keys(player).sort()).toEqual(['dispose', 'pause', 'play', 'prepare', 'setVolume', 'stop', 'subscribe'])
  })
})

describe('ClipPlayer Web Audio: reserva y variantes del navegador (FE-WA-13..17)', () => {
  it('FE-WA-13 createAudioContext -> null: se usa <audio> + objectURL, play sigue siendo sincrono y no se toca Web Audio', async () => {
    const { audio, deps, ctx, player } = setup({ createAudioContext: vi.fn(() => null) })
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    expect([deps.createObjectURL.mock.calls.length, audio.src, audio.play.mock.calls.length]).toEqual([1, 'blob:1', 1])
    expect([ctx.decodeAudioData.mock.calls.length, ctx.createBufferSource.mock.calls.length, ctx.resume.mock.calls.length]).toEqual([0, 0, 0])
  })

  it('FE-WA-13 sin AudioContext global (jsdom) y sin dependencia inyectada tambien cae a <audio>', async () => {
    const { audio, deps, player } = setup({ createAudioContext: undefined })
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    expect([deps.createObjectURL.mock.calls.length, audio.play.mock.calls.length]).toEqual([1, 1])
  })

  it('FE-WA-13 en el fallback el corte es seco: no se programa ninguna ganancia', async () => {
    const { ctx, player } = setup({ createAudioContext: vi.fn(() => null) })
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    expect(ctx.createGain).not.toHaveBeenCalled()
  })

  it('FE-WA-14 solo webkitAudioContext: se usa igual (contexto creado en prepare, play con resume y start)', async () => {
    const created: FakeContext[] = []
    class Webkit extends FakeContext {
      constructor() {
        super()
        created.push(this)
      }
    }
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', Webkit)
    const { player } = setup({ createAudioContext: undefined })
    await player.prepare('/api/clips/a', 'k0')
    expect(created.length).toBe(1)
    player.play()
    expect(created[0].resume).toHaveBeenCalledTimes(1)
    expect(created[0].sources[0].start).toHaveBeenCalled()
    expect(created[0].gains[0].gain.linearRampToValueAtTime).toHaveBeenCalled()
  })

  it('FE-WA-15 decodeAudioData rechaza una vez: ese clip va por <audio>; el siguiente vuelve a intentar Web Audio', async () => {
    const { ctx, audio, player } = setup()
    ctx.decodeAudioData.mockRejectedValueOnce(new Error('EncodingError'))
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    expect([audio.play.mock.calls.length, ctx.sources.length]).toEqual([1, 0])
    await player.prepare('/api/clips/b', 'k1')
    player.play()
    expect(ctx.sources.length).toBe(1)
    expect(audio.play.mock.calls.length).toBe(1)
  })

  it('FE-WA-15 la decision se toma en prepare, no en play (play no decodifica)', async () => {
    const { ctx, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    const decodes = ctx.decodeAudioData.mock.calls.length
    player.play()
    player.play()
    expect(ctx.decodeAudioData.mock.calls.length).toBe(decodes)
  })

  it('FE-WA-16 carrera en prepare (A y luego B con retardos invertidos): el resultado tardio de A se descarta y suena B', async () => {
    const { ctx, player } = setup()
    let releaseA!: (b: any) => void
    ctx.decodeAudioData.mockImplementationOnce(() => new Promise((r) => (releaseA = r)))
    const a = player.prepare('/api/clips/a', 'kA')
    await flush()
    const b = player.prepare('/api/clips/b', 'kB')
    await b
    const bufferB = ctx.buffers[0] // el unico decodificado hasta ahora es el de B
    releaseA({ duration: 9, numberOfChannels: 2, sampleRate: 44100 })
    await a.catch(() => {})
    player.play()
    expect(ctx.sources[0].buffer).toBe(bufferB)
  })

  it('FE-WA-17 navigator.audioSession.type pasa a "playback" cuando existe', async () => {
    ;(navigator as any).audioSession = { type: 'auto' }
    const { player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    expect((navigator as any).audioSession.type).toBe('playback')
  })

  it('FE-WA-17 sin navigator.audioSession no falla', async () => {
    delete (navigator as any).audioSession
    const { player } = setup()
    await expect(player.prepare('/api/clips/a', 'k0')).resolves.toBeUndefined()
    expect(() => player.play()).not.toThrow()
  })
})

describe('ClipPlayer Web Audio: limpieza de nodos y listeners', () => {
  it('FE-WA-06 al reproducir de nuevo se desconectan la fuente Y el GainNode anteriores', async () => {
    const { ctx, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    player.play()
    expect([ctx.sources[0].disconnect.mock.calls.length > 0, ctx.gains[0].disconnect.mock.calls.length]).toEqual([true, 1])
    expect(ctx.gains[1].disconnect).not.toHaveBeenCalled()
  })

  it('FE-PLY-10 stop() desconecta tambien el GainNode', async () => {
    const { ctx, player } = setup()
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    player.stop()
    expect(ctx.gains[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('FE-WA-11 dispose() quita el listener de statechange del contexto', async () => {
    const { ctx, player } = setup()
    const remove = vi.spyOn(ctx, 'removeEventListener')
    await player.prepare('/api/clips/a', 'k0')
    player.dispose()
    expect(remove).toHaveBeenCalledWith('statechange', expect.any(Function))
  })
})

describe('ClipPlayer Web Audio: buffer decodificado para la onda (DEC-46)', () => {
  it('FE-WF-13 onDecoded entrega el AudioBuffer del intento actual con su clave', async () => {
    const onDecoded = vi.fn()
    const { ctx, player } = setup({ onDecoded })
    await player.prepare('/api/clips/a', 'k0')
    expect(onDecoded).toHaveBeenLastCalledWith({ attemptKey: 'k0', buffer: ctx.buffers[0] })
  })

  it('FE-WF-13 al preparar otro intento se suelta primero el anterior (null) y luego llega el nuevo: nunca se reentrega el viejo', async () => {
    const onDecoded = vi.fn()
    const { ctx, player } = setup({ onDecoded })
    await player.prepare('/api/clips/a', 'k0')
    onDecoded.mockClear()
    await player.prepare('/api/clips/b', 'k1')
    expect(onDecoded.mock.calls.map((c) => [c[0].attemptKey, c[0].buffer === null])).toEqual([['k1', true], ['k1', false]])
    expect(onDecoded.mock.calls.at(-1)![0].buffer).toBe(ctx.buffers[1])
  })

  it('FE-WF-13 un prepare fallido deja la onda sin datos (null) y no el buffer del intento anterior', async () => {
    const onDecoded = vi.fn()
    const { deps, player } = setup({ onDecoded })
    await player.prepare('/api/clips/a', 'k0')
    deps.fetchClip.mockRejectedValue(new ApiError('STORAGE_ERROR', 502))
    await expect(player.prepare('/api/clips/b', 'k1')).rejects.toBeDefined()
    expect(onDecoded.mock.calls.at(-1)![0]).toEqual({ attemptKey: 'k1', buffer: null })
  })

  it('FE-WF-13 en la ruta <audio> (sin Web Audio) no hay buffer: la onda queda neutra', async () => {
    const onDecoded = vi.fn()
    const { player } = setup({ onDecoded, createAudioContext: vi.fn(() => null) })
    await player.prepare('/api/clips/a', 'k0')
    expect(onDecoded.mock.calls.every((c) => c[0].buffer === null)).toBe(true)
  })
})

describe('ClipPlayer: pausa y reanudacion (DEC-45/46)', () => {
  async function playingAt(position: number, durations = [4.0229]) {
    const env = setup()
    env.ctx.durations = durations
    const fn = vi.fn()
    env.player.subscribe(fn)
    await env.player.prepare('/api/clips/a', 'k0')
    env.ctx.state = 'running'
    env.ctx.currentTime = 10
    env.player.play()
    env.ctx.currentTime = 10 + position
    return { ...env, fn }
  }

  it('FE-PLY-11 pause() para la fuente y emite { playing:false, positionSec: posicion actual }', async () => {
    const { ctx, player, fn, frames } = await playingAt(1.5)
    player.pause()
    expect(ctx.sources[0].stop).toHaveBeenCalled()
    expect(last(fn)).toEqual({ playing: false, positionSec: 1.5 })
    expect(frames.pending()).toBe(0)
  })

  it('FE-PLY-11 el siguiente play() relanza la fuente con start(t0, offset) y sigue emitiendo desde el offset', async () => {
    const { ctx, player, fn, frames } = await playingAt(1.5)
    player.pause()
    ctx.currentTime = 20
    player.play()
    expect(ctx.sources.length).toBe(2)
    expect(ctx.sources[1].start).toHaveBeenCalledWith(20, 1.5)
    expect(last(fn)).toEqual({ playing: true, positionSec: 1.5 })
    ctx.currentTime = 20.5
    frames.tick()
    expect(last(fn)).toEqual({ playing: true, positionSec: 2 })
  })

  it('FE-PLY-11 el fundido de 50 ms se recalcula para el tramo que queda (d - offset)', async () => {
    const { ctx, player } = await playingAt(1.5)
    player.pause()
    ctx.currentTime = 20
    player.play()
    const gain = ctx.gains[1].gain
    const remaining = 4.0229 - 1.5
    expect(gain.setValueAtTime.mock.calls[0]).toEqual([1, 20])
    expect(gain.setValueAtTime.mock.calls[1][1]).toBeCloseTo(20 + remaining - 0.05, 9)
    expect(gain.linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(20 + remaining, 9)
  })

  it('FE-PLY-11 pausar dos veces seguidas no cambia la posicion ni emite de nuevo', async () => {
    const { ctx, player, fn } = await playingAt(1)
    player.pause()
    const calls = fn.mock.calls.length
    ctx.currentTime = 50
    player.pause()
    expect(fn.mock.calls.length).toBe(calls)
    player.play()
    expect(ctx.sources[1].start).toHaveBeenCalledWith(50, 1)
  })

  it('FE-PLY-11 pause() sin reproducir no hace nada', async () => {
    const { player } = setup()
    const fn = vi.fn()
    player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    player.pause()
    expect(fn).not.toHaveBeenCalled()
  })

  it('FE-PLY-12 al acabar el fragmento el siguiente play() empieza desde 0 (no desde el final)', async () => {
    const { ctx, player } = await playingAt(2)
    ctx.sources[0].onended?.()
    ctx.currentTime = 30
    player.play()
    expect(ctx.sources[1].start).toHaveBeenCalledWith(30)
  })

  it('FE-PLY-12 tras pausar y acabar no queda offset: play() desde 0', async () => {
    const { ctx, player } = await playingAt(2)
    player.pause()
    player.play()
    ctx.sources[1].onended?.()
    player.play()
    expect(ctx.sources[2].start.mock.calls[0].length).toBe(1)
  })

  it('FE-PLY-12 al cambiar de intento (prepare) se descarta la pausa: empieza desde 0', async () => {
    const { ctx, player, fn } = await playingAt(2)
    player.pause()
    await player.prepare('/api/clips/b', 'k1')
    expect(last(fn)).toEqual({ playing: false, positionSec: 0 })
    ctx.currentTime = 40
    player.play()
    expect(ctx.sources.at(-1)!.start).toHaveBeenCalledWith(40)
  })

  it('FE-PLY-13 si ya suena, play() reinicia desde 0 (no continua)', async () => {
    const { ctx, player } = await playingAt(2)
    ctx.currentTime = 12
    player.play()
    expect(ctx.sources[1].start).toHaveBeenCalledWith(12)
  })

  it('FE-PLY-13 stop() (p. ej. al abrir la cancion completa) descarta la pausa: vuelve a 0', async () => {
    const { ctx, player } = await playingAt(2)
    player.pause()
    player.stop()
    ctx.currentTime = 60
    player.play()
    expect(ctx.sources[1].start).toHaveBeenCalledWith(60)
  })

  it('FE-PLY-14 una interrupcion del sistema (statechange) cuenta como pausa: el siguiente play() continua', async () => {
    const { ctx, player, fn } = await playingAt(1.25)
    ctx.setState('interrupted')
    expect(last(fn)).toEqual({ playing: false, positionSec: 1.25 })
    ctx.currentTime = 70
    player.play()
    expect(ctx.sources[1].start).toHaveBeenCalledWith(70, 1.25)
  })

  it('FE-PLY-15 un offset casi al final (menos de 50 ms) reinicia desde 0 en vez de reanudar un resto inaudible', async () => {
    const { ctx, player } = await playingAt(4.0)
    player.pause()
    ctx.currentTime = 80
    player.play()
    expect(ctx.sources[1].start).toHaveBeenCalledWith(80)
  })
})

describe('ClipPlayer Web Audio: sin chasquido al pausar y cambio de intento sonando', () => {
  async function playingAt2(position: number) {
    const env = setup()
    env.ctx.durations = [4.0229]
    const fn = vi.fn()
    env.player.subscribe(fn)
    await env.player.prepare('/api/clips/a', 'k0')
    env.ctx.state = 'running'
    env.ctx.currentTime = 10
    env.player.play()
    env.ctx.currentTime = 10 + position
    return { ...env, fn }
  }

  it('FE-PLY-18 pause(): ganancia a 0 en 10 ms y fuente parada al final de la rampa; la posicion guardada es la de pulsar', async () => {
    const { ctx, player, fn } = await playingAt2(1.5)
    player.pause()
    const gain = ctx.gains[0].gain
    expect(gain.cancelScheduledValues).toHaveBeenCalledWith(11.5)
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 11.5 + 0.01)
    expect(ctx.sources[0].stop).toHaveBeenCalledWith(11.5 + 0.01)
    expect(last(fn)).toEqual({ playing: false, positionSec: 1.5 })
  })

  it('FE-PLY-18 la fuente que se apaga libera sus nodos al terminar y su "ended" no emite ni corta la reanudacion', async () => {
    const { ctx, player, fn } = await playingAt2(1.5)
    player.pause()
    ctx.currentTime = 20
    player.play()
    const calls = fn.mock.calls.length
    await flush() // llega el onended de la fuente parada
    expect(ctx.sources[0].disconnect).toHaveBeenCalled()
    expect(ctx.gains[0].disconnect).toHaveBeenCalled()
    expect(fn.mock.calls.slice(calls).some((c) => c[0].playing === false)).toBe(false)
    expect(ctx.sources[1].start).toHaveBeenCalledWith(20, 1.5)
  })

  it('FE-PLY-18 pausar dentro del fundido final (posicion >= d - 50 ms) corta sin rampa nueva', async () => {
    const { ctx, player } = await playingAt2(3.99)
    const before = ctx.gains[0].gain.linearRampToValueAtTime.mock.calls.length
    player.pause()
    expect(ctx.gains[0].gain.linearRampToValueAtTime.mock.calls.length).toBe(before)
    expect(ctx.sources[0].stop).toHaveBeenCalled()
  })

  it('FE-PLY-19 sonando, un prepare nuevo emite { playing:false, positionSec:0 } al empezar y cancela el rAF mientras descarga', async () => {
    const { ctx, player, fn, frames, deps } = await playingAt2(1)
    frames.tick()
    let release!: (blob: Blob) => void
    deps.fetchClip.mockImplementationOnce(() => new Promise<Blob>((resolve) => (release = resolve)))
    const pending = player.prepare('/api/clips/b', 'k1')
    expect(last(fn)).toEqual({ playing: false, positionSec: 0 })
    expect(frames.pending()).toBe(0)
    frames.tick()
    expect(fn.mock.calls.filter((c) => c[0].playing).length).toBeGreaterThan(0) // las emisiones anteriores existian
    const calls = fn.mock.calls.length
    frames.tick()
    expect(fn.mock.calls.length).toBe(calls)
    release(blob())
    await pending
    expect(ctx.sources[0].stop).toHaveBeenCalled()
  })
})
