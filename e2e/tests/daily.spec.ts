import { test, expect } from '../support/test.ts'
import { LABEL, dailyTargetR, madridToday, nonTargets, outcomeOf, tamper, gamesText } from '../support/oracle.ts'

test.describe('Diario - catalogo R', () => {
  test('E2E-02_should_lose_daily_after_six_attempts_mixing_skips_and_misses', async ({ app }) => {
    const target = dailyTargetR()
    const [m1, m2, m3] = nonTargets(target)
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.skip()
    await d.ready()
    await d.guess(m1.title)
    await d.ready()
    await d.skip()
    await d.ready()
    await d.guess(m2.title)
    await d.ready()
    await d.skip()
    await d.ready()
    await d.guess(m3.title)

    await expect(d.resultHeading).toHaveText('¡LA CANCIÓN SE ESCAPÓ!')
    await expect(d.solution).toHaveText(target.title)
    await expect(d.resultPanel).toContainText(gamesText(target))
    await expect(d.search).toHaveCount(0)
    await expect(d.skipButton).toHaveCount(0)
    await expect(d.playButton).toHaveCount(0)
    await expect(d.rows).toHaveCount(6)
  })

  test('E2E-04_should_list_attempts_in_order_when_winning_after_failures', async ({ app }) => {
    const target = dailyTargetR()
    const [g1, g2] = nonTargets(target)
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess(g1.title)
    await d.ready()
    await d.guess(g2.title)
    await d.ready()
    await d.skip()
    await d.ready()
    await d.guess(target.title)

    await expect(d.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 4!')
    const labels = [outcomeOf(target, g1), outcomeOf(target, g2), 'skip', 'hit'] as const
    for (const [i, key] of labels.entries()) await expect(d.rows.nth(i)).toContainText(LABEL[key])
    await expect(d.rows, 'al terminar solo quedan los intentos usados').toHaveCount(4)
  })

  test('E2E-06_should_give_same_daily_solution_in_two_independent_contexts', async ({ browser, baseURL }) => {
    const solutions: string[] = []
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ baseURL, timezoneId: 'Europe/Madrid', locale: 'es-ES' })
      const page = await context.newPage()
      await page.goto('/')
      const board = page.getByRole('region', { name: 'Partida diaria' })
      for (let n = 0; n < 6; n++) {
        await expect(board.getByRole('button', { name: /Reproducir/ })).toBeEnabled()
        await board.getByRole('button', { name: /^Saltar/ }).click()
      }
      await expect(board.getByRole('region', { name: 'Resultado' }).locator('.font-display')).toBeVisible()
      solutions.push(await board.getByRole('region', { name: 'Resultado' }).locator('.font-display').innerText())
      await context.close()
    }
    expect(solutions[0]).toBe(solutions[1])
    expect(solutions[0]).toBe(dailyTargetR().title)
  })

  test('E2E-07_should_show_no_filter_in_daily_and_keep_daily_intact_when_changing_unlimited_filter', async ({ app, page }) => {
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.skip()
    await d.ready()
    await expect(d.root.getByRole('checkbox')).toHaveCount(0)
    await expect(d.root.getByText('Empezar partida')).toHaveCount(0)
    const before = (await app.localStorageDump())[`heardle:daily:${madridToday()}`]

    await app.showUnlimited()
    await app.unlimited.setFilter(['Pokemon Game Delta'])
    await app.showDaily()

    await expect(d.rows.nth(0)).toContainText(LABEL.skip)
    await expect(d.rows.nth(1)).toContainText('Escuchando')
    expect((await app.localStorageDump())[`heardle:daily:${madridToday()}`], 'registro del diario intacto').toBe(before)
    await page.reload()
    await expect(d.rows.nth(0)).toContainText(LABEL.skip)
  })

  test('E2E-08_should_recover_daily_midgame_by_token_after_reload', async ({ app, page, net }) => {
    const target = dailyTargetR()
    const [g1] = nonTargets(target)
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.skip()
    await d.ready()
    await d.guess(g1.title)
    await d.ready()

    net.clear()
    await page.reload()
    await expect(d.rows.nth(2)).toContainText('Escuchando')
    await expect(d.rows.nth(0)).toContainText(LABEL.skip)
    await expect(d.rows.nth(1)).toContainText(LABEL[outcomeOf(target, g1)])
    await d.ready()
    await net.settle()
    expect(net.count('POST', '/api/games/state'), 'POST /games/state').toBe(1)
    expect(net.count('POST', '/api/games'), 'POST /games').toBe(0)
  })

  test('E2E-48_should_open_daily_with_one_create_then_use_state_on_reopen', async ({ app, page, net }) => {
    await app.goto()
    await app.daily.ready()
    await net.settle()
    const creates = net.posts('/api/games')
    expect(creates).toHaveLength(1)
    expect(creates[0].body).toBe('{"mode":"daily"}')
    expect(net.count('POST', '/api/games/state')).toBe(0)

    net.clear()
    await page.reload()
    await app.daily.ready()
    await net.settle()
    expect(net.count('POST', '/api/games'), 'segunda apertura: POST /games').toBe(0)
    expect(net.count('POST', '/api/games/state'), 'segunda apertura: POST /games/state').toBe(1)
  })

  test('E2E-12_should_discard_tampered_tokens_and_offer_a_new_game', async ({ app, page }) => {
    const u = app.unlimited
    await app.goto()
    await app.daily.ready()
    await app.startUnlimited(['Pokemon Game Charlie'])
    await u.skip()
    await u.ready()
    // Diario y ilimitado: se altera un byte del token guardado.
    await page.evaluate((fn) => {
      const alter = new Function('t', `return (${fn})(t)`) as (t: string) => string
      for (const key of Object.keys(localStorage)) {
        if (key === 'heardle:unlimited' || key.startsWith('heardle:daily:')) {
          const record = JSON.parse(localStorage.getItem(key)!)
          record.token = alter(record.token)
          localStorage.setItem(key, JSON.stringify(record))
        }
      }
    }, tamper.toString())
    await page.reload()

    // Ilimitado: aviso de caducada y se puede empezar otra.
    await app.showUnlimited()
    await expect(u.notice.filter({ hasText: 'La partida había caducado' })).toBeVisible()
    await expect(u.startButton).toBeEnabled()
    // Diario: se crea una partida nueva sin crash.
    await app.showDaily()
    await expect(app.daily.rows.nth(0)).toContainText('Escuchando')
    await app.daily.ready()
    await app.showUnlimited()
    await u.startButton.click()
    await u.ready()
    await expect(u.rows.nth(0)).toContainText('Escuchando')
  })
})

test.describe('Diario - catalogo M', () => {
  test.use({ variant: 'M' })

  test('E2E-05_should_show_finished_daily_after_reload_without_game_requests', async ({ app, page, net }) => {
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess('Lonely Obelisk')
    await expect(d.resultHeading).toBeVisible()

    net.clear()
    await page.reload()
    await expect(d.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 1!')
    await expect(d.solution).toHaveText('Lonely Obelisk')
    await expect(d.playButton).toHaveCount(0)
    await expect(d.search).toHaveCount(0)
    await net.settle()
    const gameCalls = net.requests.filter((r) => r.path.startsWith('/api/games') || r.path.startsWith('/api/clips'))
    expect(gameCalls, 'peticiones a /games* y /clips tras recargar un diario terminado').toEqual([])
  })

  test('E2E-49_should_prefer_server_date_when_browser_clock_is_a_day_ahead', async ({ app, page, context }) => {
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess('Lonely Obelisk')
    await expect(d.resultHeading).toBeVisible()
    const today = madridToday()

    // Segunda pagina del mismo contexto (mismo localStorage) con el reloj del navegador un dia adelantado.
    const skewed = await context.newPage()
    await skewed.clock.install({ time: Date.now() + 24 * 3600 * 1000 })
    await skewed.goto('/')
    const board = skewed.getByRole('region', { name: 'Partida diaria' })
    await expect(board.getByRole('region', { name: 'Resultado' }).locator('.font-display')).toHaveText('Lonely Obelisk')
    await expect(board.getByRole('button', { name: /Reproducir/ })).toHaveCount(0)
    const keys = await skewed.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('heardle:daily:')))
    expect(keys, 'sin registro duplicado para la fecha del reloj desviado').toEqual([`heardle:daily:${today}`])
  })
})
