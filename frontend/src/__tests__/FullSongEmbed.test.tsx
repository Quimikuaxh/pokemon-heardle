// DEC-41: FullSongEmbed({ youtubeId, onOpen? }) dentro de ResultPanel({ view, onOpenFullSong? }); solo si status !== 'playing' y hay solution.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ResultPanel } from '../components/ResultPanel'
import { FullSongEmbed } from '../components/FullSongEmbed'
import { mkFinished, mkView, SOLUTION, TODAY, YOUTUBE_ID } from './helpers'

afterEach(() => vi.restoreAllMocks())

const BUTTON = /escuchar la canci[oó]n completa/i
const PREFIX = 'https://www.youtube-nocookie.com/embed/'
const iframes = (root: ParentNode = document) => root.querySelectorAll('iframe')

describe('ResultPanel + FullSongEmbed', () => {
  it('FE-EMB-01 partida en curso (ResultPanel con status playing): ni boton ni iframe', () => {
    render(<ResultPanel view={mkView({ solution: undefined })} />)
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull()
    expect(iframes().length).toBe(0)
  })

  it('FE-EMB-02 defensa: aunque llegue solution con status playing (estado inconsistente) no se renderiza FullSongEmbed', () => {
    render(<ResultPanel view={mkView({ status: 'playing', solution: SOLUTION })} />)
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull()
    expect(iframes().length).toBe(0)
  })

  for (const [label, view] of [
    ['ganada', mkFinished()],
    ['perdida', mkFinished({ status: 'lost', attempt: 6, results: ['miss', 'miss', 'miss', 'miss', 'miss', 'skip'] })],
  ] as Array<[string, any]>) {
    it(`FE-EMB-03 partida ${label}: aparece el boton "Escuchar la cancion completa" y NO hay iframe`, () => {
      render(<ResultPanel view={view} />)
      expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy()
      expect(iframes().length).toBe(0)
    })
  }

  it('FE-EMB-04 antes de pulsar: ningun iframe ni peticion a youtube / youtube-nocookie (fetch, createElement, Image)', () => {
    const fetchSpy = vi.fn(async () => new Response('x'))
    vi.stubGlobal('fetch', fetchSpy)
    const createSpy = vi.spyOn(document, 'createElement')
    const imageSpy = vi.fn()
    vi.stubGlobal('Image', imageSpy)
    render(<ResultPanel view={mkFinished()} />)
    expect(iframes().length).toBe(0)
    expect(fetchSpy.mock.calls.filter((c) => /youtube/i.test(String((c as any[])[0])))).toEqual([])
    expect(createSpy.mock.calls.filter((c) => c[0] === 'iframe')).toEqual([])
    expect(imageSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('FE-EMB-05 tras pulsar: iframe con src exactamente https://www.youtube-nocookie.com/embed/<youtubeId>', () => {
    render(<ResultPanel view={mkFinished()} />)
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    expect(iframes().length).toBe(1)
    expect(iframes()[0].getAttribute('src')).toBe(PREFIX + YOUTUBE_ID)
  })

  it('FE-EMB-06 atributos del iframe: referrerpolicy, allow, title en espanol y allowfullscreen', () => {
    render(<ResultPanel view={mkFinished()} />)
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    const frame = iframes()[0]
    expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin')
    expect(frame.getAttribute('allow')).toBe('encrypted-media; picture-in-picture; fullscreen')
    expect((frame.getAttribute('title') ?? '').length).toBeGreaterThan(0)
    expect(frame.hasAttribute('allowfullscreen')).toBe(true)
  })

  for (const id of ['-BRQ_XVwg-M', 'a_b-c_d-e_f', '___________']) {
    it(`FE-EMB-07 youtubeId ${id} (con - o _) se usa tal cual`, () => {
      render(<ResultPanel view={mkFinished({ solution: { ...SOLUTION, youtubeId: id } })} />)
      fireEvent.click(screen.getByRole('button', { name: BUTTON }))
      expect(iframes()[0].getAttribute('src')).toBe(PREFIX + id)
    })
  }

  for (const hostile of ['"><script>alert(1)</script>', 'abc/../../x', 'abcde fghij', 'abcdefghijkl', 'javascript:alert(1)', "a'onload='x", '//evil.com/x', '']) {
    it(`FE-EMB-07 youtubeId hostil ${JSON.stringify(hostile)}: sin iframe a otro dominio ni HTML inyectado`, () => {
      const { container } = render(<ResultPanel view={mkFinished({ solution: { ...SOLUTION, youtubeId: hostile } })} />)
      const button = screen.queryByRole('button', { name: BUTTON })
      if (button) fireEvent.click(button)
      for (const frame of iframes(container)) {
        const src = frame.getAttribute('src') ?? ''
        expect(src.startsWith(PREFIX)).toBe(true)
        expect(new URL(src).hostname).toBe('www.youtube-nocookie.com')
        expect(frame.getAttributeNames().filter((a) => a.startsWith('on'))).toEqual([])
      }
      expect(container.querySelector('script')).toBeNull()
      expect(container.innerHTML).not.toContain('<script')
    })
  }

  it('FE-EMB-08 al pulsar el boton se avisa para detener el clip (onOpenFullSong una vez)', () => {
    const onOpen = vi.fn()
    render(<ResultPanel view={mkFinished()} {...({ onOpenFullSong: onOpen } as any)} />)
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('FE-EMB-08 FullSongEmbed llama a onOpen al abrir', () => {
    const onOpen = vi.fn()
    render(<FullSongEmbed youtubeId={YOUTUBE_ID} onOpen={onOpen} />)
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('FE-EMB-09 pulsar el boton dos veces no crea dos iframes', () => {
    render(<ResultPanel view={mkFinished()} />)
    const button = screen.getByRole('button', { name: BUTTON })
    fireEvent.click(button)
    fireEvent.click(screen.queryByRole('button', { name: BUTTON }) ?? button)
    expect(iframes().length).toBe(1)
  })

  it('FE-EMB-11 DailyRecord.view antiguo sin solution.youtubeId: se muestra la solucion y NO el boton, sin excepcion', () => {
    const { youtubeId: _drop, ...legacy } = SOLUTION
    expect(() => render(<ResultPanel view={mkFinished({ solution: legacy })} />)).not.toThrow()
    expect(screen.getByText('Littleroot Town')).toBeTruthy()
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull()
    expect(iframes().length).toBe(0)
  })

  it('FE-EMB-12 al cambiar a otra vista (nueva partida en curso) el iframe se desmonta', () => {
    const { rerender } = render(<ResultPanel view={mkFinished()} />)
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    expect(iframes().length).toBe(1)
    rerender(<ResultPanel view={mkView()} />)
    expect(iframes().length).toBe(0)
  })

  it('FE-EMB-12 al desmontar el panel no queda ningun iframe en el documento', () => {
    render(<ResultPanel view={mkFinished()} />)
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    cleanup()
    expect(iframes().length).toBe(0)
  })

  it('FE-EMB-13 la solucion (titulo y juegos) sigue visible con el iframe abierto', () => {
    render(<ResultPanel view={mkFinished()} />)
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    expect(screen.getByText('Littleroot Town')).toBeTruthy()
    expect(document.body.textContent).toContain('Pokémon Ruby / Sapphire / Emerald')
  })

  it('FE-EMB-13 la solucion se muestra tambien antes de pulsar y el diario conserva su mensaje', () => {
    render(<ResultPanel view={mkFinished({ mode: 'daily', date: TODAY })} />)
    expect(screen.getByText('Littleroot Town')).toBeTruthy()
    expect(document.body.textContent).toMatch(/vuelve ma[ñn]ana/i)
  })
})

describe('FullSongEmbed: foco', () => {
  it('FE-EMB-14 al pulsar el boton el foco pasa al contenedor del iframe', () => {
    const { container } = render(<FullSongEmbed youtubeId="dQw4w9WgXcQ" />)
    fireEvent.click(screen.getByRole('button', { name: /escuchar la canci[oó]n completa/i }))
    const box = container.querySelector('iframe')!.parentElement!
    expect(box.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(box)
  })
})
