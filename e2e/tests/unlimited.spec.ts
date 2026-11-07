import { test, expect } from '../support/test.ts'
import { ENABLED_R, LABEL, SOLO_C, ONLY_D, byId } from '../support/oracle.ts'
import { INSTRUMENT_WEBAUDIO, identifyByTone } from '../support/webaudio.ts'

const ALPHA = 'Pokemon Game Alpha'
const CHARLIE = 'Pokemon Game Charlie'
const DELTA = 'Pokemon Game Delta'

test.describe('Ilimitado, filtro y feedback de juego', () => {
  test('E2E-10_should_play_full_unlimited_game_and_start_a_new_one', async ({ app }) => {
    const u = app.unlimited
    await app.goto()
    await app.startUnlimited([CHARLIE])
    await u.guess(SOLO_C.title)
    await expect(u.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 1!')
    await expect(u.solution).toHaveText(SOLO_C.title)
    await expect(u.search).toHaveCount(0)

    await expect(u.root.getByText('Nueva partida', { exact: true })).toBeVisible()
    await expect(u.startButton).toBeEnabled() // el filtro sigue guardado
    const [res] = await Promise.all([
      app.page.waitForResponse((r) => r.url().endsWith('/api/games') && r.request().method() === 'POST'),
      u.startButton.click(),
    ])
    expect(res.status()).toBe(200)
    await u.ready()
    await expect(u.rows.nth(0)).toContainText('Escuchando')
    await expect(u.resultPanel).toHaveCount(0)
  })

  test('E2E-11_should_recover_unlimited_midgame_after_reload', async ({ app, page }) => {
    const u = app.unlimited
    await app.goto()
    await app.startUnlimited([CHARLIE])
    await u.skip()
    await u.ready()
    await page.reload()
    await app.showUnlimited()
    await expect(u.rows.nth(0)).toContainText(LABEL.skip)
    await expect(u.rows.nth(1)).toContainText('Escuchando')
    await u.ready()
    await u.guess(SOLO_C.title)
    await expect(u.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 2!')
  })

  test('E2E-14_should_play_and_win_with_a_single_song_pool', async ({ app }) => {
    const u = app.unlimited
    await app.goto()
    await app.startUnlimited([DELTA])
    await u.guess(ONLY_D.title)
    await expect(u.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 1!')
    await expect(u.solution).toHaveText(ONLY_D.title)
  })

  test('E2E-15_should_persist_filter_after_reload_and_keep_daily_playable_with_empty_filter', async ({ app, page }) => {
    const u = app.unlimited
    await app.goto()
    await app.showUnlimited()
    await u.setFilter(['Pokemon Game Bravo', DELTA])
    await page.reload()
    await app.showUnlimited()
    await expect(u.gameCheckbox('Pokemon Game Bravo')).toBeChecked()
    await expect(u.gameCheckbox(DELTA)).toBeChecked()
    await expect(u.gameCheckbox('Pokemon Game Alpha')).not.toBeChecked()
    await expect(u.gameCheckbox(CHARLIE)).not.toBeChecked()

    await u.root.getByRole('button', { name: 'Ninguno' }).click()
    await page.reload()
    await app.showUnlimited()
    await expect(u.startButton).toBeDisabled()
    await app.showDaily()
    await app.daily.ready()
    await expect(app.daily.search).toBeVisible()
  })

  test('E2E-16_should_apply_filter_change_only_to_the_next_unlimited_game', async ({ app }) => {
    const u = app.unlimited
    await app.goto()
    await app.startUnlimited([CHARLIE])
    // Cambio de filtro a mitad de partida.
    await u.root.getByText('Filtro para la próxima partida').click()
    await u.setFilter([DELTA])
    await u.skipAll()
    await expect(u.resultHeading).toHaveText('¡LA CANCIÓN SE ESCAPÓ!')
    await expect(u.solution, 'la partida en curso conserva su pool original').toHaveText(SOLO_C.title)

    const [res] = await Promise.all([
      app.page.waitForResponse((r) => r.url().endsWith('/api/games') && r.request().method() === 'POST'),
      u.startButton.click(),
    ])
    expect(res.status()).toBe(200)
    await u.ready()
    await u.guess(ONLY_D.title)
    await expect(u.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 1!')
    await expect(u.solution, 'la siguiente usa el nuevo filtro').toHaveText(ONLY_D.title)
  })

  test('E2E-17_should_report_game_correct_when_failed_song_is_of_the_same_game', async ({ app, page }) => {
    const u = app.unlimited
    await page.addInitScript(INSTRUMENT_WEBAUDIO)
    await app.goto()
    await app.startUnlimited([ALPHA]) // dos canciones de Alpha: el objetivo se identifica por el tono del clip
    const alpha = ENABLED_R.filter((song) => song.games[0] === 'game-alpha')
    const target = await identifyByTone(page, alpha)
    const other = alpha.find((song) => song.id !== target.id)!
    await u.guess(other.title)
    await expect(u.rows.nth(0)).toContainText(LABEL.game)
    await expect(u.rows.nth(0)).toContainText(other.title)
    await expect(u.rows.nth(1)).toContainText('Escuchando')
    await u.skipAll(5)
    await expect(u.solution).toHaveText(target.title)
  })

  test('E2E-18_should_report_wrong_game_when_failed_song_shares_none', async ({ app, page }) => {
    // DEC-60: el juego del fallo tiene que estar en la partida: Charlie y Delta, objetivo identificado por el tono.
    await page.addInitScript(INSTRUMENT_WEBAUDIO)
    const u = app.unlimited
    await app.goto()
    const target = await app.startUnlimitedFor([CHARLIE, DELTA], [SOLO_C, ONLY_D])
    const other = target.id === SOLO_C.id ? ONLY_D : SOLO_C
    await u.guess(other.title)
    await expect(u.rows.nth(0)).toContainText(LABEL.miss)
  })
})
