import { test, expect } from '../support/test.ts'
import { ENABLED_R, byId } from '../support/oracle.ts'

test('E2E-20_should_search_by_title_and_by_game_name_and_select', async ({ app }) => {
  const d = app.daily
  await app.goto()
  await d.ready()

  await d.type('cascade')
  await expect(d.songOptions).toHaveCount(1)
  await expect(d.gameOptions, 'el grupo vacio no se pinta').toHaveCount(0)
  await expect(d.root.getByRole('group', { name: 'Juegos' })).toHaveCount(0)
  await expect(d.option('Velvet Cascade')).toContainText('Game Bravo')

  await d.type('Bravo')
  await expect(d.gameOptions).toHaveCount(1)
  await expect(d.songOptions).toHaveCount(3)
  for (const id of ['b-one-song-03', 'b-two-song-04', 'b-accent-song-08']) await expect(d.option(byId(id).title)).toBeVisible()

  const res = await d.guess('Obsidian Lantern')
  expect(res.status()).toBe(200)
})

test('E2E-21_should_list_only_the_games_of_the_free_game_and_the_whole_series_in_the_daily', async ({ app }) => {
  // DEC-60: el libre solo ofrece los juegos con los que empezo la partida; el diario, toda su serie.
  await app.goto()
  await app.startUnlimited(['Pokemon Game Charlie'])
  const u = app.unlimited
  await u.type('Bravo')
  await expect(u.options, 'ni canciones ni juegos fuera de la partida').toHaveCount(0)
  await u.type('Charlie')
  await expect(u.gameOption('Game Charlie')).toBeVisible()
  await expect(u.songOptions).toHaveCount(1)

  await app.showDaily()
  await app.daily.ready()
  await app.daily.type('Pokemon')
  await expect(app.daily.songOptions).toHaveCount(ENABLED_R.length)
  await expect(app.daily.gameOptions).toHaveCount(8)
  await app.daily.type('Phantom')
  await expect(app.daily.options, 'la deshabilitada no aparece').toHaveCount(0)
})

test('E2E-22_should_search_ignoring_accents_and_case', async ({ app }) => {
  const d = app.daily
  await app.goto()
  await d.ready()
  await d.type('pokemon cafe')
  await expect(d.option('Pokémon Café Medley')).toBeVisible()
  await d.type('POKÉMON CAFÉ')
  await expect(d.option('Pokémon Café Medley')).toBeVisible()
})
