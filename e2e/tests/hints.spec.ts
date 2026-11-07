import { test, expect } from '../support/test.ts'
import { INSTRUMENT_WEBAUDIO, identifyByTone } from '../support/webaudio.ts'
import { ENABLED_R, ONLY_F, ONLY_G, ONLY_Z, SOLO_C, byId, dailyTargetR, expectedHint, madridToday, nonTargets } from '../support/oracle.ts'


const consoleLabel = (hint: { console: { label: string; match: boolean } }) => `Consola: ${hint.console.label}, ${hint.console.match ? 'coincide' : 'no coincide'}`
const arrowLabel = (order: 'earlier' | 'later') => `La canción buscada es de un juego ${order === 'earlier' ? 'anterior' : 'posterior'}`

const GAME = { alpha: 'Pokemon Game Alpha', charlie: 'Pokemon Game Charlie', delta: 'Pokemon Game Delta', foxtrot: 'Pokemon Game Foxtrot', golf: 'Pokemon Game Golf', zeta: 'Pokemon Legends Zeta: the remastered ultimate collector edition' }

test.describe('Pistas de consola y de fecha (DEC-50, DEC-52)', () => {
  test('E2E-89_should_show_console_hints_only_when_enabled_in_settings_and_keep_the_setting', async ({ app, page, net }) => {
    const target = dailyTargetR()
    const [g1, g2, g3] = nonTargets(target)
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess(g1.title)
    await d.ready()
    await d.guess(g2.title)
    await d.ready()
    // Por defecto no hay pistas.
    await expect(d.consoleHints).toHaveCount(0)
    await expect(d.dateHints).toHaveCount(0)

    // Activar "Pista de consola" las muestra en los fallos anteriores, sin peticiones.
    await net.settle()
    const apiRequests = () => net.requests.filter((r) => r.path.startsWith('/api')).length
    const requestsBefore = apiRequests()
    await app.setHints({ console: true })
    await expect(d.consoleHints).toHaveCount(2)
    await expect(d.dateHints, 'la pista de fecha sigue apagada').toHaveCount(0)
    await expect(d.rows.nth(0).getByLabel(consoleLabel(expectedHint(target, g1)))).toBeVisible()
    await expect(d.rows.nth(1).getByLabel(consoleLabel(expectedHint(target, g2)))).toBeVisible()
    await net.settle()
    expect(apiRequests(), 'cambiar un ajuste no hace peticiones a la API').toBe(requestsBefore)

    // ... y en los siguientes.
    await d.guess(g3.title)
    await expect(d.consoleHints).toHaveCount(3)
    await expect(d.rows.nth(2).getByLabel(consoleLabel(expectedHint(target, g3)))).toBeVisible()

    // Recargar conserva el ajuste.
    await page.reload()
    await expect(d.consoleHints).toHaveCount(3)
    expect(JSON.parse((await app.localStorageDump())['heardle:settings'])).toMatchObject({ consoleHint: true, dateHint: false })

    // Desactivar las oculta.
    await app.setHints({ console: false })
    await expect(d.consoleHints).toHaveCount(0)
  })

  test('E2E-90_should_point_to_earlier_and_later_games_and_say_nothing_for_skips_or_the_same_game', async ({ app, page }) => {
    await page.addInitScript(INSTRUMENT_WEBAUDIO)
    const u = app.unlimited
    await app.goto()
    await app.setHints({ date: true })
    // DEC-60: los juegos de los fallos tienen que estar en la partida; se repite hasta que el objetivo sea Charlie.
    const pool = ENABLED_R.filter((song) => ['game-alpha', 'game-charlie', 'game-foxtrot'].includes(song.games[0]))
    await app.startUnlimitedFor([GAME.alpha, GAME.charlie, GAME.foxtrot], pool, SOLO_C.id)
    const earlierGame = byId('a-one-song-01') // Alpha sale antes que Charlie: la buscada es posterior
    const laterGame = ONLY_F // Foxtrot sale despues: la buscada es anterior
    await u.guess(earlierGame.title)
    await u.ready()
    await u.skip()
    await u.ready()
    await u.guess(laterGame.title)
    await expect(u.dateHints).toHaveCount(2)
    await expect(u.rows.nth(0).getByLabel(arrowLabel('later'))).toBeVisible()
    await expect(u.rows.nth(1), 'un skip no lleva pista').toContainText('Saltado')
    await expect(u.rows.nth(2).getByLabel(arrowLabel('earlier'))).toBeVisible()
    await expect(u.consoleHints, 'la pista de consola sigue apagada').toHaveCount(0)
  })

  test('E2E-90_should_not_draw_an_arrow_for_a_failure_of_the_same_game', async ({ app, page }) => {
    await page.addInitScript(INSTRUMENT_WEBAUDIO)
    const u = app.unlimited
    await app.goto()
    await app.setHints({ console: true, date: true })
    await app.startUnlimited([GAME.alpha])
    const alpha = ENABLED_R.filter((song) => song.games[0] === 'game-alpha')
    const target = await identifyByTone(page, alpha)
    const other = alpha.find((song) => song.id !== target.id)!
    await u.guess(other.title)
    await expect(u.rows.nth(0)).toContainText('Juego acertado')
    await expect(u.dateHints, 'mismo juego: sin flecha (ya existe el resultado "juego acertado")').toHaveCount(0)
    await expect(u.consoleHints).toHaveCount(1)
    await expect(u.consoleHints.first()).toHaveAttribute('aria-label', 'Consola: GB, coincide')
  })

  test.describe('Reglas de Legends: Z-A (consolas Switch y Switch 2)', () => {
    // DEC-60: el filtro incluye los juegos de los fallos y se repite la partida hasta que sale el objetivo.
    const cases: Array<{ name: string; filter: string[]; target: typeof ONLY_F; guesses: Array<{ title: string; label: string }> }> = [
      { name: 'a_elegida_Z-A_buscada_Switch_es_Switch_verde', filter: [GAME.foxtrot, GAME.zeta], target: ONLY_F, guesses: [{ title: ONLY_Z.title, label: 'Consola: Switch, coincide' }] },
      { name: 'b_elegida_Z-A_buscada_Switch_2_es_Switch_2_verde', filter: [GAME.golf, GAME.zeta], target: ONLY_G, guesses: [{ title: ONLY_Z.title, label: 'Consola: Switch 2, coincide' }] },
      { name: 'c_elegida_Z-A_buscada_de_otra_consola_es_Switch_roja', filter: [GAME.charlie, GAME.zeta], target: SOLO_C, guesses: [{ title: ONLY_Z.title, label: 'Consola: Switch, no coincide' }] },
      {
        name: 'd_buscada_Z-A_elegida_Switch_o_Switch_2_es_esa_consola_verde',
        filter: [GAME.zeta, GAME.foxtrot, GAME.golf],
        target: ONLY_Z,
        guesses: [
          { title: ONLY_F.title, label: 'Consola: Switch, coincide' },
          { title: ONLY_G.title, label: 'Consola: Switch 2, coincide' },
        ],
      },
    ]
    for (const c of cases) {
      test(`E2E-91_should_apply_rule_${c.name}`, async ({ app, page }) => {
        await page.addInitScript(INSTRUMENT_WEBAUDIO)
        const u = app.unlimited
        await app.goto()
        await app.setHints({ console: true })
        const candidates = [ONLY_F, ONLY_G, ONLY_Z, SOLO_C]
        await app.startUnlimitedFor(c.filter, candidates, c.target.id)
        for (const [i, guess] of c.guesses.entries()) {
          await u.guess(guess.title)
          await u.ready()
          await expect(u.rows.nth(i).getByLabel(guess.label)).toBeVisible()
        }
        // El color no es la unica pista: cada burbuja lleva un icono (svg) ademas del texto.
        await expect(u.consoleHints.first().locator('svg')).toHaveCount(1)
      })
    }
  })

  test('E2E-93_should_show_the_hints_of_a_finished_daily_after_reload_without_requests', async ({ app, page, net }) => {
    const target = dailyTargetR()
    const [wrong] = nonTargets(target)
    const d = app.daily
    await app.goto()
    await app.setHints({ console: true, date: true })
    await d.ready()
    await d.guess(wrong.title)
    await d.ready()
    await d.guess(target.title)
    await expect(d.resultHeading).toBeVisible()

    net.clear()
    await page.reload()
    await expect(d.resultHeading).toBeVisible()
    const hint = expectedHint(target, wrong)
    await expect(d.rows.nth(0).getByLabel(consoleLabel(hint))).toBeVisible()
    if (hint.order) await expect(d.rows.nth(0).getByLabel(arrowLabel(hint.order))).toBeVisible()
    await expect(d.rows.nth(1), 'el acierto no lleva pista').not.toContainText('Consola')
    await net.settle()
    expect(net.requests.filter((r) => r.path.startsWith('/api/games') || r.path.startsWith('/api/clips'))).toEqual([])
    expect(Object.keys(await app.localStorageDump()).sort()).toEqual([`heardle:daily:${madridToday()}`, 'heardle:settings'])
  })
})

