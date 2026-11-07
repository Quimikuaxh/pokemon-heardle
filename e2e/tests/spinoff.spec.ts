// DEC-60: diario de spin-offs, buscador por modo y filtro en dos secciones (catalogo S: un juego principal y uno
// spin-off, de una cancion cada uno).
import { test, expect } from '../support/test.ts'
import { S_SONGS } from '../fixtures/catalogs.ts'

const [MAIN_SONG, SPIN_SONG] = S_SONGS

test.use({ variant: 'S' })

test.describe('Diario de spin-offs', () => {
  test('E2E-102_should_play_main_and_spinoff_dailies_separately_with_scoped_search', async ({ app, page }) => {
    await app.goto()
    await app.daily.ready()
    await expect(app.seriesButton('Principal')).toHaveAttribute('aria-pressed', 'true')

    // Diario principal: el buscador no ofrece la cancion spin-off.
    await app.daily.type('Theme')
    await expect(app.daily.options.filter({ hasText: MAIN_SONG.title })).toHaveCount(1)
    await expect(app.daily.options.filter({ hasText: SPIN_SONG.title })).toHaveCount(0)
    await app.daily.guess(MAIN_SONG.title)
    await expect(app.daily.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 1!')

    // Diario spin-off: otro reto, su subtitulo y solo canciones spin-off.
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/games') && r.request().method() === 'POST'),
      app.seriesButton('Spin-off').click(),
    ])
    expect(JSON.parse(res.request().postData()!)).toEqual({ mode: 'daily', series: 'spinoff' })
    await app.spinoff.ready()
    await expect(app.spinoff.root.getByText(/^SPIN-OFF DEL DÍA · /)).toBeVisible()
    await app.spinoff.type('Theme')
    await expect(app.spinoff.options.filter({ hasText: SPIN_SONG.title })).toHaveCount(1)
    await expect(app.spinoff.options.filter({ hasText: MAIN_SONG.title })).toHaveCount(0)
    await app.spinoff.guess(SPIN_SONG.title)
    await expect(app.spinoff.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 1!')

    // Al recargar recuerda la serie y cada diario conserva su resultado.
    await page.reload()
    await expect(app.seriesButton('Spin-off')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.spinoff.solution).toHaveText(SPIN_SONG.title)
    await app.seriesButton('Principal').click()
    await expect(app.daily.solution).toHaveText(MAIN_SONG.title)
  })

  test('E2E-103_should_show_spinoffs_in_their_own_unchecked_filter_section_and_scope_the_free_search', async ({ app }) => {
    await app.goto()
    await app.showUnlimited()
    const u = app.unlimited
    const spinSection = u.root.getByRole('group', { name: 'Spin-offs' })
    await expect(u.root.getByRole('group', { name: 'Principales' }).getByRole('checkbox')).toHaveCount(1)
    await expect(spinSection.getByRole('checkbox')).toHaveCount(1)
    await expect(spinSection.getByRole('checkbox')).not.toBeChecked()

    await u.root.getByRole('button', { name: 'Todos los spin-offs' }).click()
    await expect(spinSection.getByRole('checkbox')).toBeChecked()
    await Promise.all([app.page.waitForResponse((r) => r.url().endsWith('/api/games') && r.request().method() === 'POST'), u.startButton.click()])
    await u.ready()
    await u.type('Theme')
    await expect(u.options.filter({ hasText: SPIN_SONG.title })).toHaveCount(1)
    await expect(u.options.filter({ hasText: MAIN_SONG.title })).toHaveCount(0)
  })
})

test.describe('Sin spin-offs', () => {
  test.use({ variant: 'R' })
  test('E2E-104_should_not_show_the_series_switch_without_spinoffs', async ({ app }) => {
    await app.goto()
    await app.daily.ready()
    await expect(app.page.getByRole('group', { name: 'Serie del diario' })).toHaveCount(0)
  })
})
