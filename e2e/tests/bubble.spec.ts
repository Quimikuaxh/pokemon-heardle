import { test, expect } from '../support/test.ts'
import { ENABLED_R, byId, dailyTargetR, nonTargets } from '../support/oracle.ts'

const BRAVO = 'Pokemon Game Bravo'
const ALPHA = 'Pokemon Game Alpha'
const BRAVO_SONGS = ['Obsidian Lantern', 'Velvet Cascade', 'Pokémon Café Medley']

test.describe('Buscador con burbuja de juego (DEC-49)', () => {
  test('E2E-85_should_filter_songs_with_a_game_bubble_and_remove_it', async ({ app }) => {
    const d = app.daily
    await app.goto()
    await d.ready()

    await d.type('bravo')
    await expect(d.gameOptions).toHaveCount(1)
    await expect(d.songOptions, 'las canciones de Bravo coinciden por el nombre del juego').toHaveCount(3)
    // Orden de los grupos: Juegos antes que Canciones.
    const groups = await d.root.getByRole('listbox').locator('[role="presentation"]').allInnerTexts()
    expect(groups.map((text) => text.trim().toLowerCase())).toEqual(['juegos', 'canciones'])

    await d.gameOption(BRAVO).click()
    await expect(d.bubbleRemove).toHaveAccessibleName(`Quitar filtro de juego: ${BRAVO}`)
    await expect(d.search, 'elegir el juego vacia el texto').toHaveValue('')
    await expect(d.search, 'y deja el foco en el input').toBeFocused()
    await expect(d.gameOptions).toHaveCount(0)
    await expect(d.songOptions, 'sin texto se listan todas las del juego').toHaveCount(3)
    for (const title of BRAVO_SONGS) await expect(d.option(title)).toBeVisible()

    // El texto filtra dentro de la burbuja.
    await d.type('cascade')
    await expect(d.songOptions).toHaveCount(1)
    await expect(d.option('Velvet Cascade')).toBeVisible()
    await d.type('zephyr') // cancion de Alpha: fuera de la burbuja
    await expect(d.songOptions).toHaveCount(0)
    await d.type('')

    // La × la quita y el foco vuelve al input.
    await d.bubbleRemove.click()
    await expect(d.bubbleRemove).toHaveCount(0)
    await expect(d.search).toBeFocused()

    // Backspace con el input vacio la quita; otro juego la sustituye.
    await d.type('bravo')
    await d.gameOption(BRAVO).click()
    await d.search.press('Backspace')
    await expect(d.bubbleRemove).toHaveCount(0)
    await d.type('bravo')
    await d.gameOption(BRAVO).click()
    await d.type('alpha')
    await d.gameOption(ALPHA).click()
    await expect(d.bubbleRemove).toHaveCount(1)
    await expect(d.bubbleRemove).toHaveAccessibleName(`Quitar filtro de juego: ${ALPHA}`)
    await expect(d.songOptions).toHaveCount(2)
  })

  test('E2E-86_should_be_operable_with_the_keyboard_only', async ({ app, net }) => {
    const target = dailyTargetR()
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.search.focus()
    await d.search.pressSequentially('bravo')
    await expect(d.search).toHaveAttribute('aria-expanded', 'true')

    // Flechas recorren ambos grupos como una sola lista: primero el juego.
    await d.search.press('ArrowDown')
    const active = await d.search.getAttribute('aria-activedescendant')
    expect(active).toBeTruthy()
    await expect(d.gameOption(BRAVO)).toHaveAttribute('aria-selected', 'true')
    await d.search.press('ArrowDown')
    await expect(d.songOptions.first()).toHaveAttribute('aria-selected', 'true')
    await d.search.press('ArrowUp')
    await expect(d.gameOption(BRAVO)).toHaveAttribute('aria-selected', 'true')
    await d.search.press('ArrowUp') // vuelta: la ultima cancion
    await expect(d.songOptions.last()).toHaveAttribute('aria-selected', 'true')
    await d.search.press('ArrowDown') // y vuelta al primero
    await expect(d.gameOption(BRAVO)).toHaveAttribute('aria-selected', 'true')

    // Enter sobre el juego pone la burbuja; el foco sigue en el input; la region aria-live lo anuncia.
    await d.search.press('Enter')
    await expect(d.bubbleRemove).toBeVisible()
    await expect(d.search).toBeFocused()
    await expect(d.root.getByRole('status').filter({ hasText: `Filtro de juego: ${BRAVO}` })).toHaveCount(1)
    await expect(d.search).toHaveAttribute('aria-describedby', /.+/)

    // Escape cierra la lista y, si ya esta cerrada, vacia el texto; nunca quita la burbuja.
    await d.search.press('ArrowDown')
    await expect(d.search).toHaveAttribute('aria-expanded', 'true')
    await d.search.press('Escape')
    await expect(d.search).toHaveAttribute('aria-expanded', 'false')
    await d.search.pressSequentially('zz')
    await d.search.press('Escape')
    await d.search.press('Escape')
    await expect(d.search).toHaveValue('')
    await expect(d.bubbleRemove).toBeVisible()

    // Enter sobre una cancion envia el intento.
    net.clear()
    await d.search.press('ArrowDown')
    const [res] = await Promise.all([
      app.page.waitForResponse((r) => r.url().endsWith('/api/games/guess')),
      d.search.press('Enter'),
    ])
    expect(res.status()).toBe(200)
    expect(JSON.parse(res.request().postData()!).songId).toMatch(/^b-/)
    expect(target).toBeTruthy()

    // Backspace con el input vacio quita la burbuja.
    await d.search.press('Backspace')
    await expect(d.bubbleRemove).toHaveCount(0)
    await expect(d.root.getByRole('status').filter({ hasText: 'Filtro de juego quitado' })).toHaveCount(1)
  })

  test('E2E-87_should_not_persist_the_bubble_nor_touch_the_unlimited_filter', async ({ app, page }) => {
    const u = app.unlimited
    await app.goto()
    await app.startUnlimited([ALPHA])
    const filterBefore = (await app.localStorageDump())['heardle:filter']
    expect(JSON.parse(filterBefore)).toEqual(['game-alpha'])

    await u.type('bravo') // Bravo esta fuera del pool del filtro libre
    await u.gameOption(BRAVO).click()
    await expect(u.songOptions).toHaveCount(3)
    const dump = await app.localStorageDump()
    expect(dump['heardle:filter'], 'el filtro libre no cambia').toBe(filterBefore)
    expect(Object.keys(dump).filter((key) => /bubble|burbuja|game-filter/i.test(key)), 'sin clave de la burbuja').toEqual([])

    await page.reload()
    await app.showUnlimited()
    await expect(u.bubbleRemove, 'recargar no restaura la burbuja').toHaveCount(0)

    // Una burbuja nueva desaparece al empezar otra partida.
    await u.type('bravo')
    await u.gameOption(BRAVO).click()
    await expect(u.bubbleRemove).toHaveCount(1)
    await u.skipAll()
    await expect(u.resultHeading).toBeVisible()
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/games') && r.request().method() === 'POST'), u.startButton.click()])
    await u.ready()
    await expect(u.bubbleRemove).toHaveCount(0)
    expect(JSON.parse((await app.localStorageDump())['heardle:filter'])).toEqual(['game-alpha'])
  })

  test('E2E-88_should_keep_attempted_songs_visible_and_disabled_under_a_bubble', async ({ app, net }) => {
    const target = dailyTargetR()
    const attempted = nonTargets(target).find((song) => BRAVO_SONGS.includes(song.title))!
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.type('bravo')
    await d.gameOption(BRAVO).click()
    // Con la burbuja puesta y el texto vacio se listan las canciones del juego: se elige una directamente.
    const [res] = await Promise.all([
      app.page.waitForResponse((r) => r.url().endsWith('/api/games/guess')),
      d.option(attempted.title).click(),
    ])
    expect(res.status()).toBe(200)
    await d.ready()
    await expect(d.bubbleRemove, 'la burbuja sigue tras enviar el intento').toBeVisible()

    await expect(d.songOptions).toHaveCount(3)
    const intentada = d.option(attempted.title)
    await expect(intentada).toHaveAttribute('aria-disabled', 'true')
    await expect(intentada).toContainText('ya intentada')
    const before = net.count('POST', '/api/games/guess')
    await intentada.click({ force: true })
    await app.page.waitForTimeout(300)
    expect(net.count('POST', '/api/games/guess')).toBe(before)
    const free = ENABLED_R.filter((song) => BRAVO_SONGS.includes(song.title) && song.id !== attempted.id && song.id !== target.id)[0]
    if (free) await expect(d.option(free.title)).toHaveAttribute('aria-disabled', 'false')
    expect(byId(attempted.id).games[0]).toBe('game-bravo')
  })
})
