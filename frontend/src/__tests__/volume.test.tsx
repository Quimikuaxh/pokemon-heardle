// DEC-55: volumen comun del clip (ClipPlayer.setVolume) y del video de YouTube (postMessage), guardado en heardle:volume.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createStore } from '../storage/store'
import { createClipPlayer } from '../audio/clipPlayer'
import { FullSongEmbed } from '../components/FullSongEmbed'
import { Player } from '../components/Player'
import type { AudioStatus } from '../components/Player'
import { FakeAudio, FakeContext, blob, fakeFrames } from './webAudioFakes'
import { YOUTUBE_ID } from './helpers'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  FakeContext.instances = []
  localStorage.clear()
})

const BUTTON = /escuchar la canci[oó]n completa/i
const ORIGIN = 'https://www.youtube-nocookie.com'

function setupPlayer(over: Record<string, unknown> = {}) {
  const ctx = new FakeContext()
  const audio = new FakeAudio() as FakeAudio & { volume?: number }
  const frames = fakeFrames()
  const player = createClipPlayer({
    fetchClip: vi.fn(async () => blob()),
    refreshClipUrl: vi.fn(async () => '/api/clips/nuevo'),
    createObjectURL: vi.fn(() => 'blob:1'),
    revokeObjectURL: vi.fn(),
    createAudio: () => audio as unknown as HTMLAudioElement,
    createAudioContext: () => ctx as any,
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    ...over,
  } as any)
  return { player, ctx, audio }
}

describe('store: heardle:volume', () => {
  it('FE-VOL-01 sin valor guardado el volumen es 1; se guarda y se restaura', () => {
    expect(createStore(localStorage).getVolume()).toBe(1)
    createStore(localStorage).setVolume(0.35)
    expect(JSON.parse(localStorage.getItem('heardle:volume')!)).toBe(0.35)
    expect(createStore(localStorage).getVolume()).toBe(0.35)
  })

  it('FE-VOL-02 valores fuera de rango se acotan a [0, 1]; basura guardada vale 1', () => {
    const store = createStore(localStorage)
    store.setVolume(4)
    expect(store.getVolume()).toBe(1)
    store.setVolume(-1)
    expect(store.getVolume()).toBe(0)
    localStorage.setItem('heardle:volume', '"alto"')
    expect(createStore(localStorage).getVolume()).toBe(1)
  })

  it('FE-VOL-03 sin localStorage escribible el volumen sigue funcionando en memoria', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('cuota')
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage
    const store = createStore(broken)
    store.setVolume(0.2)
    expect(store.getVolume()).toBe(0.2)
    expect(store.writeFailed).toBe(true)
  })
})

describe('ClipPlayer.setVolume', () => {
  it('FE-VOL-04 el clip arranca al volumen fijado y el fundido final baja desde el', async () => {
    const { player, ctx } = setupPlayer()
    player.setVolume(0.4)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    const gain = ctx.gains[0].gain
    expect(gain.setValueAtTime.mock.calls.map((call) => call[0])).toEqual([0.4, 0.4])
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number))
  })

  it('FE-VOL-05 cambiar el volumen mientras suena reprograma la ganancia desde ese instante', async () => {
    const { player, ctx } = setupPlayer()
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    ctx.currentTime = 2
    player.setVolume(0.5)
    const gain = ctx.gains[0].gain
    expect(gain.cancelScheduledValues).toHaveBeenCalledWith(2)
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.5, 2)
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, ctx.buffers[0].duration)
  })

  it('FE-VOL-06 la pausa funde desde el volumen actual, no desde 1', async () => {
    const { player, ctx } = setupPlayer()
    player.setVolume(0.3)
    await player.prepare('/api/clips/a', 'k0')
    player.play()
    ctx.currentTime = 1
    player.pause()
    expect(ctx.gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0.3, 1)
  })

  it('FE-VOL-07 ruta <audio>: aplica audio.volume; valores fuera de rango se acotan', () => {
    const { player, audio } = setupPlayer({ createAudioContext: () => null })
    player.setVolume(0.25)
    expect(audio.volume).toBe(0.25)
    player.setVolume(7)
    expect(audio.volume).toBe(1)
  })
})

describe('Deslizador de volumen', () => {
  const base: Parameters<typeof Player>[0] = {
    attempt: 0,
    maxAttempts: 6,
    clipSeconds: [1, 2, 4, 7, 11, 16],
    unlockedSec: 1,
    nextSeconds: 2,
    positionSec: 0,
    playing: false,
    audioStatus: 'ready' as AudioStatus,
    peaks: null,
    skipDisabled: false,
    onTogglePlay: vi.fn(),
    onSkip: vi.fn(),
    onRetryAudio: vi.fn(),
  }

  it('FE-VOL-08 el reproductor muestra un deslizador "Volumen" con el valor actual y avisa de 0 a 1', () => {
    const onVolumeChange = vi.fn()
    render(<Player {...base} volume={0.6} onVolumeChange={onVolumeChange} />)
    const slider = screen.getByRole('slider', { name: 'Volumen' }) as HTMLInputElement
    expect(slider.value).toBe('60')
    fireEvent.change(slider, { target: { value: '25' } })
    expect(onVolumeChange).toHaveBeenCalledWith(0.25)
  })

  it('FE-VOL-09 sin onVolumeChange el reproductor no pinta el deslizador', () => {
    render(<Player {...base} />)
    expect(screen.queryByRole('slider')).toBeNull()
  })
})

describe('FullSongEmbed con volumen', () => {
  function openEmbed(volume: number, onVolumeChange = vi.fn()) {
    const view = render(<FullSongEmbed youtubeId={YOUTUBE_ID} volume={volume} onVolumeChange={onVolumeChange} />)
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    const frame = document.querySelector('iframe')!
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    return { view, frame, post, onVolumeChange }
  }
  const volumeCalls = (post: { mock: { calls: unknown[][] } }) =>
    post.mock.calls.map(([data]) => JSON.parse(data as string) as { func?: string; args?: number[] }).filter((message) => message.func === 'setVolume')

  it('FE-VOL-10 con volumen el iframe lleva enablejsapi=1 y sigue en youtube-nocookie', () => {
    const { frame } = openEmbed(0.5)
    expect(frame.getAttribute('src')).toBe(`${ORIGIN}/embed/${YOUTUBE_ID}?enablejsapi=1`)
  })

  it('FE-VOL-11 al cargar el iframe se suscribe y fija el volumen (0..100) solo hacia el origen de YouTube', () => {
    const { frame, post } = openEmbed(0.42)
    fireEvent.load(frame)
    expect(post).toHaveBeenCalledWith(JSON.stringify({ event: 'listening' }), ORIGIN)
    expect(volumeCalls(post).at(-1)).toEqual({ event: 'command', func: 'setVolume', args: [42] })
    expect(post.mock.calls.every(([, target]) => (target as unknown) === ORIGIN)).toBe(true)
  })

  it('FE-VOL-12 cambiar el volumen manda la orden nueva al video', () => {
    const { view, post, onVolumeChange } = openEmbed(0.5)
    view.rerender(<FullSongEmbed youtubeId={YOUTUBE_ID} volume={0.1} onVolumeChange={onVolumeChange} />)
    expect(volumeCalls(post).at(-1)?.args).toEqual([10])
  })

  it('FE-VOL-13 repite el volumen con los mensajes del reproductor hasta onReady; ignora otros origenes', () => {
    const { frame, post } = openEmbed(0.7)
    const before = volumeCalls(post).length
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', source: frame.contentWindow, data: '{}' }))
    expect(volumeCalls(post).length).toBe(before)
    window.dispatchEvent(new MessageEvent('message', { origin: ORIGIN, source: frame.contentWindow, data: '{"event":"onReady"}' }))
    expect(volumeCalls(post).length).toBe(before + 1)
    window.dispatchEvent(new MessageEvent('message', { origin: ORIGIN, source: frame.contentWindow, data: '{"event":"infoDelivery"}' }))
    expect(volumeCalls(post).length).toBe(before + 1)
  })

  it('FE-VOL-14 bajo el video hay un deslizador "Volumen" con el mismo valor', () => {
    const { onVolumeChange } = openEmbed(0.3)
    const slider = screen.getByRole('slider', { name: 'Volumen' }) as HTMLInputElement
    expect(slider.value).toBe('30')
    fireEvent.change(slider, { target: { value: '80' } })
    expect(onVolumeChange).toHaveBeenCalledWith(0.8)
  })
})
