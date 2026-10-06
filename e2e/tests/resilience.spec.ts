import { test, expect } from '../support/test.ts'
import { dailyTargetR, madridToday, nonTargets } from '../support/oracle.ts'

const unavailable = { status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'CATALOG_UNAVAILABLE', message: 'No disponible' } }) }

test.describe('Arranque en frio', () => {
  test('E2E-33_should_wake_up_gracefully_and_recover_after_slow_then_503_health', async ({ app, page }) => {
    test.setTimeout(90_000)
    let calls = 0
    await page.route('**/api/health', async (route) => {
      calls++
      if (calls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 10_000))
        return route.fulfill(unavailable)
      }
      if (calls <= 4) return route.fulfill(unavailable)
      return route.continue()
    })
    await page.goto('/')
    await expect(page.getByRole('status').filter({ hasText: 'Despertando el servidor...' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Partida diaria' })).toBeVisible({ timeout: 45_000 })
    expect(calls).toBe(5)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await app.daily.ready()
    await app.daily.skip()
    await expect(app.daily.rows.nth(1)).toContainText('Escuchando')
  })

  test('E2E-34_should_show_error_with_retry_button_when_503_persists_past_the_limit', async ({ page }) => {
    test.setTimeout(60_000)
    await page.clock.install()
    await page.route('**/api/health', (route) => route.fulfill(unavailable))
    await page.goto('/')
    await expect(page.getByRole('status').filter({ hasText: 'Despertando el servidor...' })).toBeVisible()
    // El reloj simulado avanza por tramos; entre tramos se deja resolver la red real.
    for (let i = 0; i < 12; i++) {
      await page.clock.runFor(10_000)
      await page.waitForTimeout(150)
    }
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('No se pudo conectar con el servidor')
    await expect(alert.getByRole('button', { name: 'Reintentar' })).toBeVisible()

    // Reintentar con el servidor ya disponible recupera la app.
    await page.unroute('**/api/health')
    await alert.getByRole('button', { name: 'Reintentar' }).click()
    await expect(page.getByRole('region', { name: 'Partida diaria' })).toBeVisible()
  })

  test('E2E-35_should_not_ping_health_periodically_after_loading', async ({ app, page, net }) => {
    await page.clock.install()
    await app.goto()
    await app.daily.ready()
    await net.settle()
    expect(net.count('GET', '/api/health')).toBe(1)
    await page.clock.fastForward(120_000)
    await page.clock.runFor(120_000)
    await page.waitForTimeout(500)
    expect(net.count('GET', '/api/health'), 'peticiones a /health tras 4 min simulados').toBe(1)
  })
})

test.describe('Fallos de red y rate-limit', () => {
  test('E2E-36_should_keep_the_attempt_after_a_transient_guess_failure', async ({ app, page }) => {
    const target = dailyTargetR()
    const [x] = nonTargets(target)
    const d = app.daily
    await app.goto()
    await d.ready()
    const tokenBefore = (await app.localStorageDump())[`heardle:daily:${madridToday()}`]
    let aborted = false
    await page.route('**/api/games/guess', (route) => {
      if (!aborted) {
        aborted = true
        return route.abort('failed')
      }
      return route.continue()
    })
    await d.type(x.title)
    await d.option(x.title).click()
    await expect(d.notice.filter({ hasText: 'No se pudo conectar con el servidor' })).toBeVisible()
    await expect(d.rows.nth(0)).toContainText('Escuchando')
    expect((await app.localStorageDump())[`heardle:daily:${madridToday()}`], 'token sin cambios').toBe(tokenBefore)

    const res = await d.guess(x.title)
    expect(res.status()).toBe(200)
    await expect(d.rows.nth(1)).toContainText('Escuchando')
  })

  test.describe('con limite bajo', () => {
    test.use({ variant: 'RL' })

    test('E2E-37_should_show_429_message_and_recover_after_retry_after', async ({ app, page }) => {
      test.setTimeout(120_000)
      const d = app.daily
      await app.goto()
      for (let i = 0; i < 3; i++) {
        await d.ready()
        await d.skip()
      }
      await d.ready()
      const limited = await d.skip()
      expect(limited.status()).toBe(429)
      const retryAfter = Number(limited.headers()['retry-after'])
      expect(retryAfter).toBeGreaterThan(0)
      await expect(d.notice.filter({ hasText: 'Demasiadas acciones seguidas' })).toContainText(`${retryAfter}`)
      await expect(d.rows.nth(3)).toContainText('Escuchando')

      await page.waitForTimeout((retryAfter + 1) * 1000)
      const ok = await d.skip()
      expect(ok.status()).toBe(200)
      await expect(d.rows.nth(4)).toContainText('Escuchando')
    })
  })
})
