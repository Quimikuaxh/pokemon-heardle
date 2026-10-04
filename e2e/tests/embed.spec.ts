import { test, expect } from '../support/test.ts'
import { stubYoutube } from '../support/youtube.ts'
import { INSTRUMENT_WEBAUDIO } from '../support/webaudio.ts'
import type { WebAudioLog } from '../support/webaudio.ts'
import { RECORD_AUDIO_SRC, expectNoLeak } from '../support/leak.ts'
import { MULTI, ONLY_D, dailyTargetR, madridToday, nonTargets } from '../support/oracle.ts'
import { M_SONGS } from '../fixtures/catalogs.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { E2E_DIR } from '../support/env.ts'

const BUTTON = 'Escuchar la canción completa'
const M_SONG = M_SONGS[0]

test.describe('Cancion completa - catalogo M', () => {
  test.use({ variant: 'M' })

  test('E2E-54_should_offer_the_full_song_button_without_any_youtube_request_when_winning', async ({ app, page }) => {
    const hits = await stubYoutube(page)
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess(M_SONG.title)
    await expect(d.resultHeading).toBeVisible()
    await expect(d.root.getByRole('button', { name: BUTTON })).toBeVisible()
    await page.waitForTimeout(500)
    expect(page.frames(), 'frames (solo el principal)').toHaveLength(1)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(hits, 'peticiones a YouTube antes de pulsar').toEqual([])
  })

  test('E2E-57_should_reopen_a_finished_daily_with_button_but_no_iframe_nor_api_calls', async ({ app, page, net }) => {
    const hits = await stubYoutube(page)
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess(M_SONG.title)
    await expect(d.resultHeading).toBeVisible()

    net.clear()
    await page.reload()
    await expect(d.root.getByRole('button', { name: BUTTON })).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(0)
    await page.waitForTimeout(500)
    expect(hits).toEqual([])
    await net.settle()
    expect(net.requests.filter((r) => r.path.startsWith('/api/games') || r.path.startsWith('/api/clips'))).toEqual([])

    await d.root.getByRole('button', { name: BUTTON }).click()
    await expect(page.locator('iframe')).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${M_SONG.source.youtubeId}`)
  })

  test('E2E-58_should_keep_the_solution_visible_when_the_video_is_unavailable', async ({ app, page }) => {
    const hits = await stubYoutube(page, { status: 404, body: '<!doctype html><h1>Video no disponible</h1>' })
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess(M_SONG.title)
    await d.root.getByRole('button', { name: BUTTON }).click()
    await expect(page.locator('iframe')).toBeVisible()
    await expect.poll(() => hits.length).toBe(1)
    await expect(d.solution).toHaveText(M_SONG.title)
    await expect(d.resultPanel).toContainText('Pokemon Game Alpha')
    // pageErrors (fixture) comprueba que la app no ha lanzado excepciones.
  })

  test('E2E-59_should_allow_only_the_nocookie_embed_under_the_real_vercel_csp', async ({ app, page }) => {
    const vercel = JSON.parse(readFileSync(join(E2E_DIR, '..', 'frontend', 'vercel.json'), 'utf8'))
    const csp: string = vercel.headers[0].headers.find((h: { key: string }) => h.key === 'Content-Security-Policy').value
    expect(csp).toBe('frame-src https://www.youtube-nocookie.com')
    const hits = await stubYoutube(page)
    // Cabecera real de Vercel aplicada al documento (el servidor de desarrollo no lee vercel.json).
    await page.route(
      (url) => url.pathname === '/',
      async (route) => {
        const response = await route.fetch()
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
      },
    )
    await page.addInitScript(() => {
      ;(window as any).__csp = []
      document.addEventListener('securitypolicyviolation', (e) => (window as any).__csp.push({ directive: e.violatedDirective, uri: e.blockedURI }))
    })
    const d = app.daily
    await app.goto()
    await d.ready() // audio por Blob y API funcionan bajo la CSP
    await d.guess(M_SONG.title)
    await expect(d.resultHeading).toBeVisible()

    await d.root.getByRole('button', { name: BUTTON }).click()
    await expect(page.locator('iframe')).toBeVisible()
    await expect.poll(() => hits.filter((u) => u.includes('youtube-nocookie.com')).length).toBe(1)
    expect(await page.evaluate(() => (window as any).__csp), 'el embed permitido no viola la CSP').toEqual([])

    await page.evaluate(() => {
      const frame = document.createElement('iframe')
      frame.src = 'https://www.youtube.com/embed/abcdefghijk'
      document.body.append(frame)
    })
    await expect.poll(() => page.evaluate(() => (window as any).__csp.length)).toBe(1)
    const [violation] = await page.evaluate(() => (window as any).__csp)
    expect(violation.directive).toContain('frame-src')
    expect(hits.filter((u) => new URL(u).hostname.endsWith('youtube.com') && !u.includes('nocookie')), 'youtube.com bloqueado').toEqual([])
    // Sin regresiones: la app sigue respondiendo (solucion visible, dos pestanas).
    await expect(d.solution).toHaveText(M_SONG.title)
  })

  test('E2E-73_should_have_no_share_nor_stats_after_finishing_the_daily', async ({ app, page }) => {
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.guess(M_SONG.title)
    await expect(d.resultHeading).toBeVisible()
    await expectNoShareNorStats(page)
    await expect(page.getByRole('button', { name: /compartir|copiar/i })).toHaveCount(0)
    const keys = Object.keys(await app.localStorageDump())
    expect(keys.sort()).toEqual([`heardle:daily:${madridToday()}`])
    await page.reload()
    await expect(d.resultHeading).toHaveText('¡Acertaste en el intento 1!')
    await expect(d.playButton).toHaveCount(0)
    await expectNoShareNorStats(page)
  })
})

async function expectNoShareNorStats(page: import('@playwright/test').Page) {
  const text = await page.locator('body').innerText()
  expect(text, 'texto de compartir/estadisticas').not.toMatch(/compartir|copiar|racha|estad[ií]sticas|distribuci[oó]n/i)
  const html = await page.content()
  expect(html).not.toMatch(/Estad[ií]sticas|Distribuci[oó]n de aciertos/)
}

const wa = <T>(page: import('@playwright/test').Page, pick: (log: WebAudioLog) => T): Promise<T> =>
  page.evaluate(`(${pick.toString()})(window.__wa)`) as Promise<T>

test.describe('Cancion completa - catalogo R', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INSTRUMENT_WEBAUDIO)
    await page.addInitScript(RECORD_AUDIO_SRC)
  })

  test('E2E-55_should_offer_the_full_song_button_without_any_youtube_request_when_losing', async ({ app, page }) => {
    const hits = await stubYoutube(page)
    const d = app.daily
    await app.goto()
    await d.skipAll()
    await expect(d.resultHeading).toHaveText('Has agotado los intentos')
    await expect(d.root.getByRole('button', { name: BUTTON })).toBeVisible()
    await page.waitForTimeout(500)
    expect(page.frames()).toHaveLength(1)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(hits).toEqual([])
  })

  test('E2E-56_should_open_the_nocookie_iframe_with_the_solution_id_and_stop_the_clip', async ({ app, page }) => {
    const target = dailyTargetR()
    const hits = await stubYoutube(page)
    const d = app.daily
    await app.goto()
    for (let i = 0; i < 5; i++) {
      await d.ready()
      await d.skip()
    }
    await d.ready() // intento 6: clip de 16 s
    await d.playButton.click()
    await expect.poll(() => wa(page, (log) => log.starts.length)).toBe(1)
    expect(await wa(page, (log) => log.stops), 'el clip suena: aun sin stop()').toBe(0)
    await d.guess(target.title)
    await expect(d.resultHeading).toBeVisible()

    await d.root.getByRole('button', { name: BUTTON }).click()
    const frame = page.locator('iframe')
    await expect(frame).toHaveCount(1)
    await expect(frame).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${target.source.youtubeId}`)
    await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    await expect(frame).toHaveAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen')
    await expect.poll(() => hits.length).toBe(1)
    expect(hits[0]).toContain('youtube-nocookie.com')
    await expect.poll(() => wa(page, (log) => log.stops), 'clip detenido al abrir el embed').toBeGreaterThanOrEqual(1)
  })

  test('E2E-60_should_expose_the_youtube_id_only_in_the_response_that_ends_the_game', async ({ app, page, net }) => {
    const target = dailyTargetR()
    const [wrong] = nonTargets(target)
    const id = target.source.youtubeId
    expect(id).toHaveLength(11)
    const d = app.daily
    await app.goto()
    await d.ready()
    await d.skip()
    await d.ready()
    await d.guess(wrong.title)
    await d.ready()
    await d.guess(target.title)
    await expect(d.resultHeading).toBeVisible()
    await net.settle()

    const containing = net.responses.filter((r) => r.body?.toString('latin1').includes(id))
    expect(containing.map((r) => r.path), 'respuestas con el youtubeId').toEqual(['/api/games/guess'])
    expect(JSON.parse(containing[0].body!.toString('utf8')).status).toBe('won')
    const catalog = net.responses.find((r) => r.path === '/api/catalog')!
    expect(catalog.body!.toString('utf8')).not.toContain(id)
    // Bundle JS/HTML servido
    const assets = net.responses.filter((r) => !r.path.startsWith('/api/'))
    expect(assets.length).toBeGreaterThan(0)
    for (const asset of assets) expect(asset.body?.toString('utf8') ?? '', asset.path).not.toContain(id)
    // y la primera aparicion en el almacenamiento tambien es posterior al final
    expect(JSON.stringify(await app.localStorageDump())).toContain(id)
  })

  test('E2E-61_should_remove_the_iframe_on_new_game_and_not_leak_the_new_id', async ({ app, page, net }) => {
    await stubYoutube(page)
    const u = app.unlimited
    await app.goto()
    await app.startUnlimited(['Pokemon Game Charlie']) // objetivo fijo: MULTI
    await u.guess(MULTI.title)
    await u.root.getByRole('button', { name: BUTTON }).click()
    await expect(page.locator('iframe')).toHaveCount(1)
    await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(`${MULTI.source.youtubeId}$`))

    // Nueva partida con otro filtro: el siguiente objetivo es ONLY_D.
    net.clear()
    await u.setFilter(['Pokemon Game Delta'])
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/games') && r.request().method() === 'POST'),
      u.startButton.click(),
    ])
    await u.ready()
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(page.frames()).toHaveLength(1)
    await net.settle()
    const dom = await page.content()
    expect(dom).not.toContain(MULTI.source.youtubeId)
    expect(dom).not.toContain(ONLY_D.source.youtubeId)
    for (const res of net.responses.filter((r) => r.path.startsWith('/api/games'))) {
      expect(res.body!.toString('utf8'), res.path).not.toContain(ONLY_D.source.youtubeId)
    }
  })

  test('E2E-73_should_have_no_share_nor_stats_after_losing_an_unlimited_game', async ({ app, page }) => {
    const u = app.unlimited
    await app.goto()
    await app.startUnlimited(['Pokemon Game Charlie'])
    await u.skipAll()
    await expect(u.resultHeading).toHaveText('Has agotado los intentos')
    await expectNoShareNorStats(page)
    const keys = Object.keys(await app.localStorageDump())
    expect(keys.filter((k) => k.includes('stats')), 'claves stats:*').toEqual([])
    for (const key of keys) expect(key).toMatch(new RegExp(`^heardle:(filter|daily:${madridToday()}|unlimited)$`))
    expect(keys, 'sin partida ilimitada guardada tras terminar').not.toContain('heardle:unlimited')
  })
})
