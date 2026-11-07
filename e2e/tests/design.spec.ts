import type { Page } from '@playwright/test'
import { test, expect } from '../support/test.ts'
import { INSTRUMENT_WEBAUDIO } from '../support/webaudio.ts'
import type { WebAudioLog } from '../support/webaudio.ts'

const MIN_BAR_HEIGHT = '12%'
const BARS_PER_SECOND = 3 // 48 barras sobre la escala fija de 16 s

test.describe('Forma de onda y reproductor (DEC-46)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INSTRUMENT_WEBAUDIO)
  })

  test('E2E-80_should_draw_the_wave_only_for_the_unlocked_audio_at_every_attempt', async ({ app }) => {
    const d = app.daily
    await app.goto()
    for (const [i, seconds] of [1, 2, 4, 7, 11, 16].entries()) {
      await d.ready()
      await expect(d.root.locator('[data-waveform="real"]'), 'onda real (Web Audio)').toBeVisible()
      const heights = await d.root.locator('[data-waveform] [data-bar]').evaluateAll((bars) => bars.map((bar) => (bar as HTMLElement).style.height))
      expect(heights, 'barras de la onda').toHaveLength(48)
      const unlockedBars = seconds * BARS_PER_SECOND
      heights.forEach((height, bar) => {
        if (bar < unlockedBars) expect(height, `intento ${i + 1}: barra ${bar} desbloqueada con audio real`).not.toBe(MIN_BAR_HEIGHT)
        else expect(height, `intento ${i + 1}: barra ${bar} bloqueada y plana`).toBe(MIN_BAR_HEIGHT)
      })
      if (i < 5) await d.skip()
    }
  })

  test('E2E-80_should_keep_locked_bars_flat_while_the_next_clip_is_not_unlocked', async ({ app, net }) => {
    // Hasta pulsar saltar no se pide el clip siguiente: la zona bloqueada sigue plana y sin datos nuevos.
    const d = app.daily
    await app.goto()
    await d.ready()
    const before = await d.root.locator('[data-waveform] [data-bar]').evaluateAll((bars) => bars.map((bar) => (bar as HTMLElement).style.height))
    await app.page.waitForTimeout(800)
    await net.settle()
    expect(net.clips(), 'un solo clip pedido sin saltar').toHaveLength(1)
    const after = await d.root.locator('[data-waveform] [data-bar]').evaluateAll((bars) => bars.map((bar) => (bar as HTMLElement).style.height))
    expect(after).toEqual(before)
    expect(before.slice(BARS_PER_SECOND).every((height) => height === MIN_BAR_HEIGHT)).toBe(true)
  })

  test('E2E-81_should_pause_and_resume_from_the_paused_position', async ({ app, page }) => {
    const d = app.daily
    await app.goto()
    for (let i = 0; i < 5; i++) {
      await d.ready()
      await d.skip()
    }
    await d.ready() // intento 6: 16 s, da margen para pausar
    const wa = () => page.evaluate(() => { const l = (window as any).__wa as WebAudioLog; return { starts: l.starts, stops: l.stops } })
    const position = async () => Number(await d.progressbar.getAttribute('aria-valuenow'))

    await d.playIdle.click()
    const pause = d.root.getByRole('button', { name: 'Pausar' })
    await expect(pause).toBeVisible()
    await expect(d.progressbar).toHaveAttribute('data-playing', 'true')
    await expect.poll(position).toBeGreaterThan(0.5)
    expect((await wa()).starts).toHaveLength(1)

    // Pausar no reinicia: la posicion se queda donde estaba.
    await pause.click()
    await expect(d.progressbar).toHaveAttribute('data-playing', 'false')
    await expect(d.root.getByRole('button', { name: 'Reanudar' }), 'en pausa con posicion > 0 el boton dice Reanudar').toBeVisible()
    const paused = await position()
    expect(paused, 'posicion al pausar').toBeGreaterThan(0.5)
    await page.waitForTimeout(400)
    expect(await position(), 'la posicion se mantiene en pausa').toBeCloseTo(paused, 1)

    // Reanudar continua desde el offset pausado (start(t0, offset)), no desde 0.
    await d.root.getByRole('button', { name: 'Reanudar' }).click()
    await expect(d.progressbar).toHaveAttribute('data-playing', 'true')
    const { starts } = await wa()
    expect(starts).toHaveLength(2)
    expect(starts[0].offset, 'la primera reproduccion empieza en 0').toBe(0)
    expect(Math.abs(starts[1].offset - paused), `offset de la reanudacion ${starts[1].offset} vs pausa ${paused}`).toBeLessThanOrEqual(0.15)
    await expect.poll(position).toBeGreaterThanOrEqual(paused - 0.05)
    expect(await position(), 'continua desde la pausa, no desde 0').toBeGreaterThan(0.3)
  })

  test('E2E-81_should_restart_from_zero_after_the_fragment_ends_and_reset_on_attempt_change', async ({ app, page }) => {
    const d = app.daily
    await app.goto()
    await d.ready() // intento 1: 1 s
    const position = async () => Number(await d.progressbar.getAttribute('aria-valuenow'))
    await d.playIdle.click()
    await expect(d.progressbar).toHaveAttribute('data-playing', 'true')
    await expect(d.progressbar).toHaveAttribute('data-playing', 'false', { timeout: 5_000 })
    // Al acabar el fragmento la barra queda al final, pero el punto de reanudacion vuelve a 0.
    expect(await position(), 'la barra queda al final del fragmento').toBeCloseTo(1, 1)
    await d.playIdle.click()
    await expect(d.progressbar).toHaveAttribute('data-playing', 'true')
    const starts = await page.evaluate(() => ((window as any).__wa as WebAudioLog).starts.map((s) => s.offset))
    expect(starts, 'offsets de las reproducciones (la segunda empieza en 0)').toEqual([0, 0])
    await expect(d.progressbar).toHaveAttribute('data-playing', 'false', { timeout: 5_000 })

    // Pausar a medias y cambiar de intento: la posicion vuelve a 0.
    await d.skip()
    await d.ready()
    await d.skip()
    await d.ready() // intento 3: 4 s
    await d.playIdle.click()
    await expect.poll(position).toBeGreaterThan(0.3)
    await d.root.getByRole('button', { name: 'Pausar' }).click()
    expect(await position()).toBeGreaterThan(0.3)
    await d.skip()
    await d.ready()
    expect(await position(), 'cambiar de intento reinicia la posicion').toBe(0)
    await expect(d.playFromStart, 'tras cambiar de intento vuelve a "Reproducir N s"').toBeVisible()
  })

  test('E2E-84_should_not_request_any_google_fonts_host', async ({ app, page }) => {
    const hosts: string[] = []
    page.on('request', (request) => hosts.push(new URL(request.url()).hostname))
    await app.goto()
    await app.daily.ready()
    await app.showUnlimited()
    await app.showDaily()
    expect(hosts.filter((host) => /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(host)), 'peticiones a Google Fonts').toEqual([])
    await expect(page.locator('link[href*="fonts.googleapis.com"]')).toHaveCount(0)
  })
})

const luminance = (rgb: string) => {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => {
    const c = Number(v) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('E2E-82_should_look_the_same_in_light_and_dark_mode_with_readable_contrast', async ({ app, page }) => {
  // DEC-58: la Pokedex no cambia con prefers-color-scheme; el contraste debe ser legible igualmente.
  const d = app.daily
  await page.emulateMedia({ colorScheme: 'light' })
  await app.goto()
  await d.ready()
  const read = () =>
    page.evaluate(() => {
      const css = (el: Element) => getComputedStyle(el)
      const paintedBackground = (el: Element): string => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          const bg = css(node).backgroundColor
          if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg
        }
        return css(document.body).backgroundColor
      }
      const body = css(document.body)
      const skip = Array.from(document.querySelectorAll('button')).find((b) => /^Saltar/.test(b.textContent ?? ''))!
      const play = document.querySelector('section[aria-label="Reproductor"] button[aria-label^="Reproducir"], section[aria-label="Reproductor"] button[aria-label^="Cargando"]')!
      const search = document.querySelector('input[role="combobox"]') as HTMLInputElement
      return {
        body: { bg: body.backgroundColor, fg: body.color },
        skip: { bg: css(skip).backgroundColor, fg: css(skip).color },
        play: { bg: css(play).backgroundColor, fg: css(play).color },
        // Fondo que se ve detras del texto: el primer ancestro con fondo pintado (DEC-59: la caja va dentro de la pantalla LCD).
        field: { bg: paintedBackground(search), fg: css(search).color },
      }
    })
  const light = await read()
  await page.emulateMedia({ colorScheme: 'dark' })
  const dark = await read()

  expect(dark, 'mismo aspecto en claro y oscuro').toEqual(light)
  expect(light.body.bg, 'fondo negro detras de la Pokedex (DEC-59)').toBe('rgb(0, 0, 0)')
  expect(contrast(light.body.bg, light.body.fg), 'contraste del texto').toBeGreaterThanOrEqual(4.5)
  expect(contrast(light.skip.bg, light.skip.fg), 'contraste del boton Saltar').toBeGreaterThanOrEqual(4.5)
  expect(contrast(light.play.bg, light.play.fg), 'contraste del boton de reproducir').toBeGreaterThanOrEqual(4.5)
  expect(contrast(light.field.bg, light.field.fg), 'contraste del buscador').toBeGreaterThanOrEqual(4.5)
  await expect(page.getByRole('heading', { name: 'Pokémon Heardle', level: 1 })).toBeVisible()
})

for (const viewport of [
  { name: '375', width: 375, height: 667 },
  { name: '1440', width: 1440, height: 900 },
]) {
  test.describe(`Layout ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test(`E2E-83_should_lay_out_without_horizontal_scroll_and_with_touch_sized_controls_at_${viewport.name}px`, async ({ app, page }) => {
      const d = app.daily
      await app.goto()
      await d.ready()
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(await overflow(), 'scroll horizontal (px)').toBeLessThanOrEqual(0)
      const heights = async (controls: Record<string, ReturnType<Page['locator']>>) => {
        for (const [name, locator] of Object.entries(controls)) {
          const box = (await locator.boundingBox())!
          expect(box, name).not.toBeNull()
          expect(box.height, `alto de ${name}`).toBeGreaterThanOrEqual(44)
          expect(box.x, `${name} dentro del viewport`).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width, `${name} dentro del viewport`).toBeLessThanOrEqual(viewport.width)
        }
      }
      await heights({
        'conmutador Diario': page.getByRole('button', { name: 'Diario', exact: true }),
        'conmutador Libre': page.getByRole('button', { name: 'Partida libre', exact: true }),
        play: d.playIdle,
        saltar: d.skipButton,
        buscador: d.search,
      })

      const legend = page.getByRole('complementary', { name: 'Leyenda' })
      const player = (await page.getByRole('region', { name: 'Reproductor' }).boundingBox())!
      const history = (await d.root.getByRole('list', { name: 'Intentos' }).boundingBox())!
      if (viewport.width >= 1024) {
        await expect(legend, 'leyenda visible en escritorio').toBeVisible()
        expect(history.x, 'historial a la derecha del reproductor').toBeGreaterThanOrEqual(player.x + player.width)
      } else {
        await expect(legend, 'leyenda oculta en movil').toBeHidden()
        expect(history.y, 'historial debajo del reproductor').toBeGreaterThanOrEqual(player.y + player.height - 1)
      }

      await d.type('Pokemon')
      await expect(d.options.first()).toBeVisible()
      expect(await overflow(), 'scroll horizontal con el desplegable abierto').toBeLessThanOrEqual(0)
      await d.type('')

      await app.showUnlimited()
      await heights({
        Todos: app.unlimited.root.getByRole('button', { name: 'Todos' }),
        Ninguno: app.unlimited.root.getByRole('button', { name: 'Ninguno' }),
        'Empezar partida': app.unlimited.root.getByRole('button', { name: 'Empezar partida' }),
        'fila de juego': app.unlimited.root.locator('label').first(),
      })
      expect(await overflow(), 'scroll horizontal en modo libre').toBeLessThanOrEqual(0)
    })
  })
}
