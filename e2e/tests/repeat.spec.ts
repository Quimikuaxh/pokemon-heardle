import { test, expect } from '../support/test.ts'
import { LABEL, dailyTargetR, madridToday, nonTargets, outcomeOf } from '../support/oracle.ts'

test('E2E-46_should_show_notice_without_consuming_attempt_when_server_returns_ALREADY_GUESSED', async ({ app, page, net }) => {
  const target = dailyTargetR()
  const [x, y] = nonTargets(target)
  const d = app.daily
  await app.goto()
  await d.ready()
  await d.guess(x.title)
  await d.ready()
  await net.settle()
  const first = net.posts('/api/games/guess')[0]
  const firstBody = JSON.parse(first.body!)
  expect(firstBody.songId).toBe(x.id)

  // 1) Reenvio directo con el mismo songId y el token previo: el servidor rechaza con 409.
  const direct = await page.request.post('/api/games/guess', { data: { token: firstBody.token, songId: x.id } })
  expect(direct.status()).toBe(200) // token previo (antes de X): X aun no estaba en `q`; es el limite aceptado AR 8
  // Con el token POSTERIOR (el que guarda la UI) la repeticion si es ALREADY_GUESSED.
  const stored = JSON.parse((await app.localStorageDump())[`heardle:daily:${madridToday()}`])
  const repeated = await page.request.post('/api/games/guess', { data: { token: stored.token, songId: x.id } })
  expect(repeated.status()).toBe(409)
  expect((await repeated.json()).error.code).toBe('ALREADY_GUESSED')

  // 2) Desde la UI: se intercepta el siguiente guess (de Y) y se sustituye por X.
  await page.route('**/api/games/guess', async (route) => {
    const body = JSON.parse(route.request().postData()!)
    await route.continue({ postData: JSON.stringify({ ...body, songId: x.id }) })
  })
  const tokenBefore = (await app.localStorageDump())[`heardle:daily:${madridToday()}`]
  const res = await d.guess(y.title)
  expect(res.status()).toBe(409)
  await expect(d.notice.filter({ hasText: 'Ya has intentado esa canción' })).toBeVisible()
  await expect(d.rows.nth(1), 'no se consume intento').toContainText('Escuchando')
  expect((await app.localStorageDump())[`heardle:daily:${madridToday()}`], 'token guardado intacto').toBe(tokenBefore)
  await expect(d.search).toBeEnabled()
})

test('E2E-47_should_keep_attempted_songs_marked_after_reload', async ({ app, page }) => {
  const target = dailyTargetR()
  const [x] = nonTargets(target)
  const d = app.daily
  await app.goto()
  await d.ready()
  await d.guess(x.title)
  await d.ready()
  await page.reload()
  await expect(d.rows.nth(0)).toContainText(LABEL[outcomeOf(target, x)])
  await d.ready()
  await d.type(x.title)
  await expect(d.option(x.title)).toHaveAttribute('aria-disabled', 'true')
  await expect(d.option(x.title)).toContainText('ya intentada')
})
