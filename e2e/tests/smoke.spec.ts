import { test, expect } from '../support/test.ts'

test.describe('Diario - catalogo M', () => {
  test.use({ variant: 'M' })

  test('E2E-01_should_win_daily_on_first_attempt_and_lock_the_game', async ({ app }) => {
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess('Lonely Obelisk')

    await expect(d.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 1!')
    await expect(d.solution).toHaveText('Lonely Obelisk')
    await expect(d.resultPanel).toContainText('Pokemon Game Alpha')
    await expect(d.rows.nth(0)).toContainText('Acertada')
    await expect(d.search, 'buscador bloqueado').toHaveCount(0)
    await expect(d.skipButton, 'skip bloqueado').toHaveCount(0)
    await expect(d.playButton).toHaveCount(0)
    await expect(d.root.getByText(/Compartir|Copiar|Racha|Estadísticas|Distribución/i), 'sin compartir ni estadísticas').toHaveCount(0)
  })
})
