import { test, expect } from '../support/test.ts'
import { dailyTargetR, nonTargets } from '../support/oracle.ts'

test('E2E-45_should_mark_failed_song_as_attempted_and_not_selectable', async ({ app, net }) => {
  const target = dailyTargetR()
  const [x, y] = nonTargets(target)
  const d = app.daily
  await app.goto()
  await d.ready()
  await d.guess(x.title)
  await d.ready()
  await net.settle()
  const guessesBefore = net.count('POST', '/api/games/guess')

  // Sigue visible al buscar su titulo, marcada y no seleccionable.
  await d.type(x.title)
  const optionX = d.option(x.title)
  await expect(optionX).toBeVisible()
  await expect(optionX).toHaveAttribute('aria-disabled', 'true')
  await expect(optionX).toContainText('ya intentada')

  // Clic y teclado: ninguna peticion.
  await optionX.click({ force: true }) // aria-disabled: sin force Playwright esperaria a que se habilite
  await d.search.press('ArrowDown')
  await d.search.press('Enter')
  await net.settle()
  expect(net.count('POST', '/api/games/guess'), 'peticiones /games/guess tras pulsar la ya intentada').toBe(guessesBefore)
  await expect(d.rows.nth(1), 'no se ha consumido otro intento').toContainText('Intento 2')

  // El resto se puede elegir.
  await d.type(y.title)
  await expect(d.option(y.title)).toHaveAttribute('aria-disabled', 'false')
  const res = await d.guess(y.title)
  expect(res.status()).toBe(200)
})
