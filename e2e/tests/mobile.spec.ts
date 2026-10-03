import { test, expect } from '../support/test.ts'
import { MULTI, dailyTargetR } from '../support/oracle.ts'

// E2E-38: iPhone 13 en WebKit (proyecto `webkit-iphone`, seleccionado por la etiqueta @mobile).
// Dos partidas por test: gana un modo y pierde el otro; el audio se reproduce con un toque (tap).
const COUNT_PLAY = () => {
  const original = HTMLMediaElement.prototype.play
  ;(window as any).__plays = 0
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    ;(window as any).__plays++
    return original.call(this)
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(COUNT_PLAY)
})

test('E2E-38_should_win_daily_and_lose_unlimited_on_iphone @mobile', async ({ app, page }) => {
  const target = dailyTargetR()
  await app.goto()
  await app.daily.ready()
  await app.daily.playButton.tap()
  await expect.poll(() => page.evaluate(() => (window as any).__plays)).toBe(1)
  await app.daily.guess(target.title)
  await expect(app.daily.resultHeading).toHaveText('¡Acertaste en el intento 1!')

  await app.startUnlimited(['Pokemon Game Charlie'])
  await app.unlimited.skipAll()
  await expect(app.unlimited.resultHeading).toHaveText('Has agotado los intentos')
  await expect(app.unlimited.solution).toHaveText(MULTI.title)
})

test('E2E-38_should_lose_daily_and_win_unlimited_on_iphone @mobile', async ({ app }) => {
  const target = dailyTargetR()
  await app.goto()
  await app.daily.skipAll()
  await expect(app.daily.resultHeading).toHaveText('Has agotado los intentos')
  await expect(app.daily.solution).toHaveText(target.title)

  await app.startUnlimited(['Pokemon Game Charlie'])
  await app.unlimited.playButton.tap()
  await app.unlimited.guess(MULTI.title)
  await expect(app.unlimited.resultHeading).toHaveText('¡Acertaste en el intento 1!')
})
