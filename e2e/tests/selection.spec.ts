import { test, expect } from '../support/test.ts'
import { INSTRUMENT_WEBAUDIO, identifyByTone } from '../support/webaudio.ts'
import { ONLY_D, ONLY_E, dailyTargetR } from '../support/oracle.ts'

const DELTA = 'Pokemon Game Delta'
const ECHO = 'Pokemon Game Echo'

test('E2E-98_should_give_the_same_daily_solution_in_two_contexts_matching_the_v2_vector', async ({ browser, baseURL }) => {
  const solutions: string[] = []
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ baseURL, timezoneId: 'Europe/Madrid', locale: 'es-ES' })
    const page = await context.newPage()
    await page.goto('/')
    const board = page.getByRole('region', { name: 'Partida diaria' })
    for (let n = 0; n < 6; n++) {
      await expect(board.getByRole('button', { name: /^Reproducir/ })).toBeEnabled()
      await board.getByRole('button', { name: /^Saltar/ }).click()
    }
    const solution = board.getByRole('region', { name: 'Resultado' }).locator('.font-display')
    await expect(solution).toBeVisible()
    solutions.push(await solution.innerText())
    await context.close()
  }
  expect(solutions[0]).toBe(solutions[1])
  expect(solutions[0], 'vector independiente "daily|v2|" con grupos equiprobables').toBe(dailyTargetR().title)
})

test('E2E-99_should_list_grouped_games_separately_and_pick_from_either', async ({ app, page }) => {
  await page.addInitScript(INSTRUMENT_WEBAUDIO)
  const u = app.unlimited
  await app.goto()
  await app.showUnlimited()
  // Delta y Echo forman un grupo de seleccion, pero son dos casillas distintas.
  await expect(u.gameCheckbox(DELTA)).toBeVisible()
  await expect(u.gameCheckbox(ECHO)).toBeVisible()
  await u.setFilter([DELTA, ECHO])
  await expect(u.gameCheckbox(DELTA)).toBeChecked()
  await expect(u.gameCheckbox(ECHO)).toBeChecked()
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/games') && r.request().method() === 'POST'), u.startButton.click()])
  await u.ready()
  const target = await identifyByTone(page, [ONLY_D, ONLY_E])
  await u.skipAll()
  await expect(u.solution).toHaveText(target.title)
  expect([ONLY_D.title, ONLY_E.title]).toContain(await u.solution.innerText())
})

test('E2E-100_should_report_a_wrong_game_for_a_song_of_the_other_game_of_the_same_group', async ({ app }) => {
  const u = app.unlimited
  await app.goto()
  await app.startUnlimited([DELTA]) // objetivo fijo: ONLY_D
  await u.guess(ONLY_E.title) // Echo comparte grupo de seleccion con Delta, pero es otro juego
  await expect(u.rows.nth(0)).toContainText('Juego incorrecto')
  await expect(u.rows.nth(0)).not.toContainText('Juego acertado')
})
