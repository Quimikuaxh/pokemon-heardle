import { test, expect } from '../support/test.ts'
import { MULTI, dailyTargetR, nonTargets } from '../support/oracle.ts'

const COUNT_PLAY = () => {
  const original = HTMLMediaElement.prototype.play
  ;(window as any).__plays = 0
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    ;(window as any).__plays++
    return original.call(this)
  }
}
const plays = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__plays as number)

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
    await page.addInitScript(COUNT_PLAY)
  })

  test('E2E-41_should_not_play_before_the_user_gesture', async ({ app, page }) => {
    await app.goto()
    await app.daily.ready()
    await page.waitForTimeout(500)
    expect(await plays(page), 'play() antes del clic').toBe(0)
    await app.daily.playButton.click()
    await expect.poll(() => plays(page)).toBe(1)
  })

  test('E2E-42_should_replay_the_current_clip_without_new_requests', async ({ app, page, net }) => {
    await app.goto()
    await app.daily.ready()
    await net.settle()
    expect(net.clips()).toHaveLength(1)
    await app.daily.playButton.click()
    await app.daily.playButton.click()
    await app.daily.playButton.click()
    await expect.poll(() => plays(page)).toBe(3)
    await net.settle()
    expect(net.clips(), 'peticiones de clip tras repetir').toHaveLength(1)
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
