import { test, expect } from '../support/test.ts'

test('E2E-13_should_disable_start_with_empty_filter_and_send_no_request', async ({ app, net }) => {
  const u = app.unlimited
  await app.goto()
  await app.daily.ready()
  await app.showUnlimited()
  await u.root.getByRole('button', { name: 'Todos' }).click()
  await u.root.getByRole('button', { name: 'Ninguno' }).click()

  await expect(u.startButton).toBeDisabled()
  await expect(u.root.getByRole('alert')).toContainText('Elige al menos un juego')
  // Un clic forzado sobre el boton deshabilitado no puede disparar nada.
  await u.startButton.click({ force: true })
  await net.settle()
  expect(net.posts('/api/games', (b) => b?.mode === 'unlimited'), 'POST /api/games ilimitado').toHaveLength(0)
  expect(net.count('POST', '/api/games/state')).toBe(0)
})
