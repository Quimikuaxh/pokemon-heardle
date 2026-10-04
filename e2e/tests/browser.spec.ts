import { test, expect } from '../support/test.ts'
import { dailyTargetR } from '../support/oracle.ts'
import { INSTRUMENT_WEBAUDIO } from '../support/webaudio.ts'
import type { WebAudioLog } from '../support/webaudio.ts'
import type { Page } from '@playwright/test'

test.describe('Tema', () => {
  for (const [scheme, background, color] of [
    ['dark', 'rgb(15, 23, 42)', 'rgb(241, 245, 249)'],
    ['light', 'rgb(248, 250, 252)', 'rgb(15, 23, 42)'],
  ] as const) {
    test.describe(scheme, () => {
      test.use({ colorScheme: scheme })
      test(`E2E-39_should_render_${scheme}_theme_with_readable_colors`, async ({ app, page }) => {
        await app.goto()
        await app.daily.ready()
        const style = await page.evaluate(() => {
          const s = getComputedStyle(document.body)
          return { background: s.backgroundColor, color: s.color }
        })
        expect(style).toEqual({ background, color })
      })
    })
  }
})

test.describe('Movil 375x667', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('E2E-40_should_fit_the_small_viewport_with_touch_sized_controls', async ({ app, page }) => {
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.type('Pokemon')
    await expect(d.options.first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'scroll horizontal (px)').toBeLessThanOrEqual(0)
    await d.type('')
    const controls = {
      tab_diario: page.getByRole('button', { name: 'Diario', exact: true }),
      tab_libre: page.getByRole('button', { name: 'Partida libre', exact: true }),
      play: d.playButton,
      skip: d.skipButton,
      search: d.search,
    }
    for (const [name, locator] of Object.entries(controls)) {
      const box = await locator.boundingBox()
      expect(box!.height, `alto de ${name}`).toBeGreaterThanOrEqual(44)
      expect(box!.x, `${name} dentro del viewport`).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width, `${name} dentro del viewport`).toBeLessThanOrEqual(375)
    }
    await app.showUnlimited()
    for (const name of ['Todos', 'Ninguno', 'Empezar partida']) {
      const box = await app.unlimited.root.getByRole('button', { name }).boundingBox()
      expect(box!.height, `alto de ${name}`).toBeGreaterThanOrEqual(44)
    }
    const labelBox = await app.unlimited.root.locator('label').first().boundingBox()
    expect(labelBox!.height, 'alto de la fila de juego').toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
})

test.describe('Audio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INSTRUMENT_WEBAUDIO)
  })
  const log = (page: Page) =>
    page.evaluate(() => {
      const wa = (window as any).__wa as WebAudioLog
      return { decodes: wa.decodes, starts: wa.starts.length, resumes: wa.resumes, states: wa.contexts.map((c) => c.state) }
    })

  test('E2E-41_should_not_start_audio_before_the_user_gesture', async ({ app, page }) => {
    await app.goto()
    await app.daily.ready()
    await page.waitForTimeout(500)
    const before = await log(page)
    expect(before.starts, 'source.start() antes del clic').toBe(0)
    expect(before.resumes, 'resume() antes del clic').toBe(0)
    expect(before.states.length).toBeGreaterThan(0)
    // Playwright (Chromium y WebKit) desactiva la politica de autoplay: el contexto nace "running", asi que
    // "suspended" no es verificable aqui; si lo es que nada arranca antes del gesto (0 start, 0 resume).
    await app.daily.playButton.click()
    await expect.poll(async () => (await log(page)).starts).toBe(1)
    await expect.poll(async () => (await log(page)).states).toEqual(['running'])
  })

  test('E2E-42_should_replay_the_current_clip_without_new_requests_or_decodes', async ({ app, page, net }) => {
    await app.goto()
    await app.daily.ready()
    await net.settle()
    expect(net.clips()).toHaveLength(1)
    const decodes = (await log(page)).decodes
    expect(decodes).toBe(1)
    await app.daily.playButton.click()
    await app.daily.playButton.click()
    await app.daily.playButton.click()
    await expect.poll(async () => (await log(page)).starts).toBe(3)
    await net.settle()
    expect(net.clips(), 'peticiones de clip tras repetir').toHaveLength(1)
    expect((await log(page)).decodes, 'decodificaciones tras repetir').toBe(decodes)
  })
})

test('E2E-43_should_stay_coherent_when_the_same_game_is_finished_in_another_tab', async ({ app, page, context, pageErrors }) => {
  const d = app.daily
  await app.goto()
  await d.ready()
  for (let i = 0; i < 5; i++) {
    await d.skip()
    await d.ready()
  }
  // Segunda pestana en el mismo contexto: carga la partida en el intento 6.
  const other = await context.newPage()
  other.on('pageerror', (e) => pageErrors.push(e.message))
  await other.goto('/')
  const otherBoard = other.getByRole('region', { name: 'Partida diaria' })
  await expect(otherBoard.getByRole('button', { name: /Reproducir/ })).toBeEnabled()
  // Termina en la primera.
  await d.skip()
  await expect(d.resultHeading).toHaveText('Has agotado los intentos')
  // La segunda aun tiene el token del intento 6: actua sobre una partida ya terminada.
  await otherBoard.getByRole('button', { name: /^Saltar/ }).click()
  await expect(otherBoard.locator('section[aria-live="polite"] h2')).toBeVisible()
  await expect(otherBoard.getByRole('alert')).toHaveCount(0)
  await expect(otherBoard.locator('section[aria-live="polite"] strong')).toHaveText(dailyTargetR().title)
})
