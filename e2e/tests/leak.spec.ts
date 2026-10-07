import { test, expect } from '../support/test.ts'
import { RECORD_AUDIO_SRC, expectNoLeak } from '../support/leak.ts'
import { GAME_NAME, SOLO_C, dailyTargetR, gamesText, nonTargets } from '../support/oracle.ts'
import type { FixtureSong } from '../fixtures/catalogs.ts'

const gameNeedles = (song: FixtureSong) => [song.games[0], GAME_NAME[song.games[0]]]

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
  await expectNoLeak(page, net, target, [wrong], gameNeedles(target))
})

test('E2E-26_should_not_leak_the_unlimited_solution_before_the_game_ends', async ({ app, page, net }) => {
  const [wrong] = nonTargets(SOLO_C)
  await app.goto()
  await app.startUnlimited(['Pokemon Game Charlie'])
  const u = app.unlimited
  await u.guess(wrong.title)
  await u.ready()
  await u.skip()
  await u.ready()
  await expectNoLeak(page, net, SOLO_C, [wrong], gameNeedles(SOLO_C))
})

test('E2E-31_should_reveal_title_and_games_when_the_game_ends', async ({ app }) => {
  const target = dailyTargetR()
  const d = app.daily
  await app.goto()
  await d.skipAll()
  await expect(d.resultHeading).toHaveText('¡LA CANCIÓN SE ESCAPÓ!')
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
  expect(before.dom).not.toContain(SOLO_C.title)
  expect(before.storage).not.toContain(SOLO_C.title)
  await u.guess(SOLO_C.title)
  await expect(u.solution).toHaveText(SOLO_C.title)
  const after = await snapshot()
  expect(after.dom).toContain(SOLO_C.title)
})

test('E2E-26_should_not_leak_with_the_hints_enabled', async ({ app, page, net }) => {
  const target = dailyTargetR()
  const [wrong] = nonTargets(target)
  const d = app.daily
  await app.goto()
  await app.setHints({ console: true, date: true })
  await d.ready()
  await d.guess(wrong.title)
  await d.ready()
  await d.skip()
  await d.ready()
  await expectNoLeak(page, net, target, [wrong], gameNeedles(target))
})

test('E2E-92_should_send_the_hints_with_exact_keys_and_never_reveal_the_target_game', async ({ app, page, net }) => {
  const target = dailyTargetR()
  const [w1, w2] = nonTargets(target)
  const d = app.daily
  await app.goto()
  await d.ready()
  await d.guess(w1.title) // con las pistas desactivadas en el cliente...
  await d.ready()
  await app.setHints({ console: true, date: true }) // ... y activadas: la red es la misma
  await d.guess(w2.title)
  await d.ready()
  await net.settle()

  const views = net.responses.filter((r) => r.path.startsWith('/api/games') && r.status === 200).map((r) => JSON.parse(r.body!.toString('utf8')))
  expect(views.length).toBeGreaterThanOrEqual(3)
  for (const view of views) {
    expect(Object.keys(view).sort(), 'claves de GameView').toEqual(['attempt', 'clipSeconds', 'clipUrl', 'date', 'guesses', 'hints', 'maxAttempts', 'mode', 'results', 'status', 'token'].sort())
    expect(view.hints, 'hints alineado con results').toHaveLength(view.results.length)
    for (const hint of view.hints) {
      if (hint === null) continue
      expect(Object.keys(hint).sort()).toEqual(['console', 'order'])
      expect(Object.keys(hint.console ?? { label: 1, match: 1 }).sort()).toEqual(['label', 'match'])
    }
  }
  const last = views[views.length - 1]
  expect(last.hints[0], 'pista del primer fallo').not.toBeNull()
  expect(last.hints[1], 'pista del segundo fallo').not.toBeNull()
  await expectNoLeak(page, net, target, [w1, w2], gameNeedles(target))
})
