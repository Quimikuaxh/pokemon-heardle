import { test, expect } from '../support/test.ts'
import { SOLO_C, dailyTargetR } from '../support/oracle.ts'
import { INSTRUMENT_WEBAUDIO } from '../support/webaudio.ts'
import type { WebAudioLog } from '../support/webaudio.ts'

// E2E-38: iPhone 13 en WebKit (proyecto `webkit-iphone`, seleccionado por la etiqueta @mobile).
// Dos partidas por test: gana un modo y pierde el otro; el audio se reproduce con un toque (tap).
const states = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ((window as any).__wa as WebAudioLog).contexts.map((c) => c.state))
const starts = (page: import('@playwright/test').Page) => page.evaluate(() => ((window as any).__wa as WebAudioLog).starts.length)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(INSTRUMENT_WEBAUDIO)
})

test('E2E-38_should_win_daily_and_lose_unlimited_on_iphone @mobile', async ({ app, page }) => {
  const target = dailyTargetR()
  await app.goto()
  await app.daily.ready()
  // Playwright desactiva la politica de autoplay (el contexto nace "running"): solo se verifica que no suena antes del toque.
  expect(await starts(page)).toBe(0)
  await app.daily.playButton.tap()
  await expect.poll(() => states(page), 'contexto tras el primer toque').toEqual(['running'])
  await expect.poll(() => starts(page), 'suena en ese mismo gesto').toBe(1)
  await app.daily.guess(target.title)
  await expect(app.daily.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 1!')

  await app.startUnlimited(['Pokemon Game Charlie'])
  await app.unlimited.skipAll()
  await expect(app.unlimited.resultHeading).toHaveText('¡LA CANCIÓN SE ESCAPÓ!')
  await expect(app.unlimited.solution).toHaveText(SOLO_C.title)
})

test('E2E-38_should_lose_daily_and_win_unlimited_on_iphone @mobile', async ({ app, page }) => {
  const target = dailyTargetR()
  await app.goto()
  await app.daily.skipAll()
  await expect(app.daily.resultHeading).toHaveText('¡LA CANCIÓN SE ESCAPÓ!')
  await expect(app.daily.solution).toHaveText(target.title)

  await app.startUnlimited(['Pokemon Game Charlie'])
  await app.unlimited.playButton.tap()
  await app.unlimited.guess(SOLO_C.title)
  await expect(app.unlimited.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 1!')
})
