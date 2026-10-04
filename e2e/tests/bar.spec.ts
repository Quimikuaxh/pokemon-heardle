import { test, expect } from '../support/test.ts'

const SECONDS = [1, 2, 4, 7, 11, 16]

test.describe('Barra de reproduccion (DEC-42)', () => {
  test('E2E-50_should_show_segmented_bar_with_marks_at_the_clip_durations', async ({ app }) => {
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.playButton.click()
    const bar = d.root.getByRole('progressbar')
    await expect(bar).toBeVisible()
    const marks = bar.locator('[data-mark]')
    await expect(marks).toHaveCount(6)
    const barBox = (await bar.boundingBox())!
    for (const [i, seconds] of SECONDS.entries()) {
      expect(await marks.nth(i).getAttribute('data-mark')).toBe(String(seconds))
      const box = (await marks.nth(i).boundingBox())!
      const percent = ((box.x - barBox.x) / barBox.width) * 100
      expect(Math.abs(percent - (seconds / 16) * 100), `marca de ${seconds} s en ${percent.toFixed(2)} %`).toBeLessThanOrEqual(1)
    }
  })

  test('E2E-51_should_grow_the_unlocked_zone_with_every_skip', async ({ app }) => {
    const d = app.daily
    await app.goto()
    const bar = d.root.getByRole('progressbar')
    for (const [i, seconds] of SECONDS.entries()) {
      await d.ready()
      await expect(bar).toHaveAttribute('aria-valuemax', String(seconds))
      const barBox = (await bar.boundingBox())!
      const unlocked = (await bar.locator('[data-zone="unlocked"]').boundingBox())!
      const locked = bar.locator('[data-zone="locked"]')
      const ratio = (unlocked.width / (barBox.width - 2)) * 100 // 2 px de borde
      expect(Math.abs(ratio - (seconds / 16) * 100), `ancho desbloqueado del intento ${i + 1}: ${ratio.toFixed(2)} %`).toBeLessThanOrEqual(1)
      const style = async (zone: typeof locked) => zone.evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(await style(locked), 'la parte bloqueada tiene otro estilo').not.toBe(await style(bar.locator('[data-zone="unlocked"]')))
      if (i < 5) await d.skip()
    }
  })

  test('E2E-52_should_move_the_playhead_in_real_time_within_the_unlocked_zone', async ({ app }) => {
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.skip()
    await d.ready()
    await d.skip()
    await d.ready() // intento 3: clip de 4 s
    const bar = d.root.getByRole('progressbar')
    await expect(bar).toHaveAttribute('aria-valuemax', '4')
    const position = async () => Number(await bar.getAttribute('aria-valuenow'))

    await d.playButton.click()
    await expect(bar).toHaveAttribute('data-playing', 'true')
    const samples: number[] = []
    for (let i = 0; i < 3; i++) {
      await app.page.waitForTimeout(450)
      samples.push(await position())
    }
    expect(samples[1], `muestras ${samples}`).toBeGreaterThan(samples[0])
    expect(samples[2], `muestras ${samples}`).toBeGreaterThan(samples[1])
    for (const sample of samples) expect(sample).toBeLessThanOrEqual(4)

    await expect(bar).toHaveAttribute('data-playing', 'false', { timeout: 8_000 })
    const rest = await position()
    expect(rest).toBeLessThanOrEqual(4)
    await app.page.waitForTimeout(500)
    expect(await position(), 'cabezal en reposo al terminar').toBe(rest)
  })
})

test.describe('Barra en movil oscuro', () => {
  test.use({ variant: 'M', colorScheme: 'dark' })

  test('E2E-53_should_render_the_bar_in_a_375px_dark_viewport @mobile', async ({ app, page }) => {
    await app.goto()
    await app.daily.ready()
    const bar = app.daily.root.getByRole('progressbar')
    await expect(bar).toBeVisible()
    const box = (await bar.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'scroll horizontal').toBeLessThanOrEqual(0)

    const marks = await bar.locator('[data-mark]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x))
    for (let i = 1; i < marks.length; i++) expect(marks[i] - marks[i - 1], `separacion entre marcas ${i - 1} y ${i}`).toBeGreaterThanOrEqual(8)

    const colors = await bar.evaluate((el) => {
      const get = (selector: string) => getComputedStyle(el.querySelector(selector)!).backgroundColor
      return { track: getComputedStyle(el).backgroundColor, unlocked: get('[data-zone="unlocked"]'), locked: get('[data-zone="locked"]'), page: getComputedStyle(document.body).backgroundColor }
    })
    expect(colors.page).toBe('rgb(15, 23, 42)')
    expect(colors.unlocked).not.toBe(colors.locked)
    expect(colors.unlocked).not.toBe(colors.page)
  })
})
