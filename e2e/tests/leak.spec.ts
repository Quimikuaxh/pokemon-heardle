import { test, expect } from '../support/test.ts'
import { RECORD_AUDIO_SRC, expectNoLeak } from '../support/leak.ts'
import { MULTI, dailyTargetR, gamesText, nonTargets } from '../support/oracle.ts'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(RECORD_AUDIO_SRC)
})

test('E2E-26_should_not_leak_the_daily_solution_before_the_game_ends', async ({ app, page, net }) => {
  const target = dailyTargetR()
  const [wrong] = nonTargets(target)
  const d = app.daily
  await app.goto()
  await d.ready()
  await d.skip()
  await d.ready()
  await d.guess(wrong.title)
  await d.ready()
  await d.skip()
  await d.ready()
  await expectNoLeak(page, net, target, [wrong])
})

test('E2E-26_should_not_leak_the_unlimited_solution_before_the_game_ends', async ({ app, page, net }) => {
  const [wrong] = nonTargets(MULTI)
  await app.goto()
  await app.startUnlimited(['Pokemon Game Charlie'])
  const u = app.unlimited
  await u.guess(wrong.title)
  await u.ready()
  await u.skip()
  await u.ready()
  await expectNoLeak(page, net, MULTI, [wrong])
})

test('E2E-31_should_reveal_title_and_games_when_the_game_ends', async ({ app }) => {
  const target = dailyTargetR()
  const d = app.daily
  await app.goto()
  await d.skipAll()
  await expect(d.resultHeading).toHaveText('Has agotado los intentos')
  await expect(d.solution).toHaveText(target.title)
  await expect(d.resultPanel).toContainText(gamesText(target))
  await expect(d.root.getByRole('button', { name: 'Escuchar la canción completa' })).toBeVisible()
  expect(app.page.frames(), 'sin iframe hasta pulsar el boton').toHaveLength(1)
})

test('E2E-32_should_show_the_solution_only_after_the_game_ends', async ({ app, page }) => {
  const u = app.unlimited
  await app.goto()
  await app.startUnlimited(['Pokemon Game Charlie'])
  const snapshot = async () => ({
    dom: await page.evaluate(() => document.body.innerText + document.documentElement.outerHTML),
    storage: JSON.stringify(await app.localStorageDump()),
  })
  const before = await snapshot()
  expect(before.dom).not.toContain(MULTI.title)
  expect(before.storage).not.toContain(MULTI.title)
  await u.guess(MULTI.title)
  await expect(u.solution).toHaveText(MULTI.title)
  const after = await snapshot()
  expect(after.dom).toContain(MULTI.title)
})
