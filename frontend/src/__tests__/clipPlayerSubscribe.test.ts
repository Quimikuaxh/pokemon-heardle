// FE-PLY-*: ClipPlayer.subscribe(listener) -> unsubscribe y stop(). Contrato: createClipPlayer(deps) acepta ademas
// requestFrame(cb): number y cancelFrame(id) (por defecto requestAnimationFrame/cancelAnimationFrame);
// el audio es un EventTarget que emite 'pause' y 'ended'. Las emisiones son { playing: boolean, positionSec: number }.
import { describe, it, expect, vi } from 'vitest'
import { createClipPlayer } from '../audio/clipPlayer'

class FakeAudio extends EventTarget {
  src = ''
  currentTime = 0
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn(() => {
    this.dispatchEvent(new Event('pause'))
  })
}

function fakeFrames() {
  let next = 1
  const pending = new Map<number, (t: number) => void>()
  return {
    requestFrame: vi.fn((cb: (t: number) => void) => {
      const id = next++
      pending.set(id, cb)
      return id
    }),
    cancelFrame: vi.fn((id: number) => void pending.delete(id)),
    tick() {
      const batch = [...pending.entries()]
      pending.clear()
      batch.forEach(([, cb]) => cb(0))
    },
    pending: () => pending.size,
  }
}

function setup() {
  const audio = new FakeAudio()
  const frames = fakeFrames()
  let n = 0
  const deps = {
    fetchClip: vi.fn(async () => new Blob([new Uint8Array(4)])),
    refreshClipUrl: vi.fn(async () => '/api/clips/nuevo'),
    createObjectURL: vi.fn(() => `blob:${++n}`),
    revokeObjectURL: vi.fn(),
    createAudio: vi.fn(() => audio as unknown as HTMLAudioElement),
    createAudioContext: () => null, // ruta de reserva <audio> (DEC-45)
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
  }
  const player = createClipPlayer(deps as any) as any
  return { player, audio, frames, deps }
}

const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0]

describe('ClipPlayer.subscribe (ruta de reserva <audio>)', () => {
  it('FE-PLY-01 al reproducir, el listener recibe { playing:true, positionSec } con audio.currentTime en cada frame', async () => {
    const { player, audio, frames } = setup()
    const fn = vi.fn()
    player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    audio.currentTime = 0.5
    frames.tick()
    expect(last(fn)).toEqual({ playing: true, positionSec: 0.5 })
    audio.currentTime = 0.9
    frames.tick()
    expect(last(fn)).toEqual({ playing: true, positionSec: 0.9 })
  })

  it('FE-PLY-01 sigue emitiendo mientras suena (se reprograma un frame por tick)', async () => {
    const { player, frames } = setup()
    player.subscribe(vi.fn())
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    for (let i = 0; i < 5; i++) {
      expect(frames.pending()).toBe(1)
      frames.tick()
    }
  })

  it('FE-PLY-02 al pausar emite { playing:false, positionSec } y detiene el requestAnimationFrame', async () => {
    const { player, audio, frames } = setup()
    const fn = vi.fn()
    player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    audio.currentTime = 0.7
    audio.pause()
    expect(last(fn)).toEqual({ playing: false, positionSec: 0.7 })
    expect(frames.pending()).toBe(0)
  })

  it('FE-PLY-02 al terminar (ended) emite { playing:false } y no quedan frames pendientes', async () => {
    const { player, audio, frames } = setup()
    const fn = vi.fn()
    player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    audio.currentTime = 1
    audio.dispatchEvent(new Event('ended'))
    expect(last(fn)).toMatchObject({ playing: false })
    expect(frames.pending()).toBe(0)
  })

  it('FE-PLY-03 unsubscribe deja de emitir y cancela el frame pendiente', async () => {
    const { player, frames } = setup()
    const fn = vi.fn()
    const off = player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    off()
    const calls = fn.mock.calls.length
    frames.tick()
    expect(fn.mock.calls.length).toBe(calls)
    expect(frames.pending()).toBe(0)
  })

  it('FE-PLY-03 llamar a unsubscribe dos veces no falla', () => {
    const { player } = setup()
    const off = player.subscribe(vi.fn())
    off()
    expect(() => off()).not.toThrow()
  })

  it('FE-PLY-04 varios listeners reciben las mismas emisiones y quitar uno no afecta al otro', async () => {
    const { player, audio, frames } = setup()
    const a = vi.fn()
    const b = vi.fn()
    const offA = player.subscribe(a)
    player.subscribe(b)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    audio.currentTime = 0.3
    frames.tick()
    expect([last(a), last(b)]).toEqual([{ playing: true, positionSec: 0.3 }, { playing: true, positionSec: 0.3 }])
    offA()
    const callsA = a.mock.calls.length
    audio.currentTime = 0.6
    frames.tick()
    expect(a.mock.calls.length).toBe(callsA)
    expect(last(b)).toEqual({ playing: true, positionSec: 0.6 })
  })

  it('FE-PLY-05 sin reproduccion no hay requestAnimationFrame activo (ni al suscribirse ni al preparar)', async () => {
    const { player, frames } = setup()
    player.subscribe(vi.fn())
    await player.prepare('/api/clips/a', 'k0')
    expect([frames.requestFrame.mock.calls.length, frames.pending()]).toEqual([0, 0])
  })

  it('FE-PLY-06 repetir el clip reinicia las emisiones desde 0', async () => {
    const { player, audio, frames } = setup()
    const fn = vi.fn()
    player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    audio.currentTime = 0.9
    frames.tick()
    audio.pause()
    player.play()
    frames.tick()
    expect(last(fn)).toEqual({ playing: true, positionSec: 0 })
  })

  it('FE-PLY-06 una segunda play() mientras suena no duplica los frames', async () => {
    const { player, frames } = setup()
    player.subscribe(vi.fn())
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    player.play()
    expect(frames.pending()).toBe(1)
  })

  it('FE-PLY-07 al cargar un clip nuevo (otro intento) el listener recibe { playing:false, positionSec:0 } y sigue suscrito', async () => {
    const { player, audio, frames } = setup()
    const fn = vi.fn()
    player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    audio.currentTime = 0.8
    frames.tick()
    await player.prepare('/api/clips/b', 'k1')
    expect(last(fn)).toEqual({ playing: false, positionSec: 0 })
    player.play()
    audio.currentTime = 0.2
    frames.tick()
    expect(last(fn)).toEqual({ playing: true, positionSec: 0.2 })
  })

  it('FE-PLY-09 un listener que lanza no impide emitir a los demas ni rompe el player', async () => {
    const { player, audio, frames } = setup()
    const bad = vi.fn(() => {
      throw new Error('listener roto')
    })
    const good = vi.fn()
    player.subscribe(bad)
    player.subscribe(good)
    await player.prepare('/api/clips/a', 'k0')
    expect(() => player.play()).not.toThrow()
    audio.currentTime = 0.4
    expect(() => frames.tick()).not.toThrow()
    expect(last(good)).toEqual({ playing: true, positionSec: 0.4 })
  })

  it('FE-PLY-10 stop() detiene la reproduccion, emite { playing:false } y cancela los frames', async () => {
    const { player, audio, frames } = setup()
    const fn = vi.fn()
    player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    player.stop()
    expect(audio.pause).toHaveBeenCalled()
    expect(last(fn)).toMatchObject({ playing: false })
    expect(frames.pending()).toBe(0)
  })

  it('FE-PLY-10 stop() sin reproducir no falla', () => {
    const { player } = setup()
    expect(() => player.stop()).not.toThrow()
  })

  it('FE-AUD-02 [MOD] audio.play() sigue siendo sincrono en el clic con una suscripcion activa (la barra no lo retrasa)', async () => {
    const { player, audio } = setup()
    player.subscribe(vi.fn())
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('dispose() cancela frames pendientes y deja de emitir', async () => {
    const { player, frames } = setup()
    const fn = vi.fn()
    player.subscribe(fn)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    player.dispose()
    const calls = fn.mock.calls.length
    frames.tick()
    expect([frames.pending(), fn.mock.calls.length > calls + 1]).toEqual([0, false])
  })
})

describe('ClipPlayer: audio.play() rechazado', () => {
  it('FE-PLY-11 si el navegador rechaza play() se emite playing:false y no quedan frames', async () => {
    const audio: any = new (class extends EventTarget {
      src = ''
      currentTime = 0
      play = vi.fn(() => Promise.reject(new Error('NotAllowedError')))
      pause = vi.fn()
    })()
    const pending = new Map<number, () => void>()
    let id = 0
    const player = createClipPlayer({
      fetchClip: async () => new Blob([new Uint8Array(2)]),
      refreshClipUrl: async () => '/x',
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
      createAudio: () => audio,
      requestFrame: (cb) => (pending.set(++id, () => cb(0)), id),
      cancelFrame: (n) => void pending.delete(n),
    })
    const listener = vi.fn()
    player.subscribe(listener)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    await new Promise((r) => setTimeout(r, 0))
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({ playing: false })
    expect(pending.size).toBe(0)
  })
})
