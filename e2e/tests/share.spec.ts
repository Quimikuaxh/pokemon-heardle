import { test, expect } from '../support/test.ts'
import { MULTI, madridToday, byId } from '../support/oracle.ts'

const CHARLIE = 'Pokemon Game Charlie'

test.describe('Catalogo M', () => {
  test.use({ variant: 'M' })

  test('E2E-23_should_share_emoji_text_without_revealing_the_solution', async ({ app }) => {
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess('Lonely Obelisk')
    await expect(d.shareText).toHaveText(`Pokémon Heardle diario ${madridToday()}\n1/6\n🟩⬜⬜⬜⬜⬜`)
    const text = await d.shareText.innerText()
    for (const secret of ['Lonely', 'Obelisk', 'mono-song', 'Alpha', 'aaaaaaaaaaaaaaaa']) expect(text).not.toContain(secret)
    await d.shareButton.click()
    await expect(d.resultPanel).toContainText(/Copiado al portapapeles|No se pudo copiar/)
  })

  test('E2E-25_should_keep_streak_and_stats_after_reload', async ({ app, page }) => {
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess('Lonely Obelisk')
    await expect(d.resultHeading).toBeVisible()
    await page.reload()
    await expect(d.resultHeading).toBeVisible()
    expect(await d.stat('Partidas')).toBe('1')
    expect(await d.stat('Racha')).toBe('1')
    expect(await d.stat('Mejor racha')).toBe('1')
    await expect(d.root.getByRole('list', { name: 'Distribución de aciertos' }).getByRole('listitem').first()).toHaveText(/1\s*1/)
  })
})

test('E2E-24_should_format_share_text_for_loss_and_win', async ({ app }) => {
  const u = app.unlimited
  await app.goto()
  await app.startUnlimited([CHARLIE])
  // Derrota: 4 fallos de juego incorrecto y 2 skips.
  for (const id of ['b-one-song-03', 'b-two-song-04', 'b-accent-song-08', 'd-only-song-06']) {
    await u.guess(byId(id).title)
    await u.ready()
  }
  await u.skip()
  await u.ready()
  await u.skip()
  await expect(u.shareText).toHaveText('Pokémon Heardle (partida libre)\nX/6\n🟥🟥🟥🟥⬛⬛')

  // Victoria en el 3.er intento.
  const [res] = await Promise.all([
    app.page.waitForResponse((r) => r.url().endsWith('/api/games') && r.request().method() === 'POST'),
    u.startButton.click(),
  ])
  expect(res.status()).toBe(200)
  await u.ready()
  await u.skip()
  await u.ready()
  await u.guess(byId('a-one-song-01').title) // juego compartido
  await u.ready()
  await u.guess(MULTI.title)
  await expect(u.shareText).toHaveText('Pokémon Heardle (partida libre)\n3/6\n⬛🟨🟩⬜⬜⬜')
})
