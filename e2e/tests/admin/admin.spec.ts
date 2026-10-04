import { createHash } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '../../support/admin.ts'
import type { Page } from '@playwright/test'

const row = (page: Page, id: string) => page.locator(`li[data-song-id="${id}"]`)
const count = (page: Page) => page.getByText(/^Mostrando \d+$/)
const shown = async (page: Page) => Number((await count(page).innerText()).replace('Mostrando ', ''))
const gameFilter = (page: Page) => page.getByRole('region', { name: 'Filtros' }).locator('select').first()
const titles = (page: Page) => page.locator('li[data-song-id] h3').allInnerTexts()

test.describe('Admin del catalogo', () => {
  test('E2E-62_should_list_songs_with_state_and_per_game_counters_without_touching_real_data', async ({ admin, page }) => {
    // Centinela: carpeta que hace de "data/ real". El servidor solo recibe el directorio temporal.
    const decoy = mkdtempSync(join(tmpdir(), 'heardle-decoy-data-'))
    mkdirSync(join(decoy, 'out'))
    writeFileSync(join(decoy, 'catalog.json'), '{"sentinel":true}')
    const hash = () => createHash('sha256').update(readFileSync(join(decoy, 'catalog.json'))).digest('hex')
    const before = hash()
    expect(admin.dataDir).not.toContain('scripts/catalog/data')

    await page.goto(admin.url)
    await expect(page.getByRole('heading', { name: 'Admin del catálogo' })).toBeVisible()
    await expect(page.locator('li[data-song-id]')).toHaveCount(8)
    await expect(page.getByText('8 canciones', { exact: true })).toBeVisible()
    const long = row(page, 'song-long-one')
    await expect(long).toContainText('Long Melody')
    await expect(long).toContainText('Activada · Revisada · Duración 40,0 s')
    await expect(long).toContainText('Vídeo original: Original video of Long Melody')
    await expect(long.getByRole('checkbox', { name: 'Admin Alpha' })).toBeChecked()
    await expect(long.getByRole('checkbox', { name: 'Admin Bravo' })).not.toBeChecked()
    await expect(row(page, 'song-short-one')).toContainText('Desactivada · Pendiente')
    await expect(row(page, 'song-bravo-b')).toContainText('Desactivada · Revisada')
    await expect(row(page, 'song-multi')).toContainText('Activada · Pendiente')
    // Contadores por juego
    const games = page.getByRole('region', { name: 'Juegos' })
    for (const [id, songs] of [['alpha', 3], ['bravo', 4], ['charlie', 2]] as const) {
      await expect(games.getByLabel(`Nombre del juego ${id}`).locator('xpath=ancestor::li')).toContainText(`${songs} en este juego`)
    }
    expect(hash(), 'el "data/ real" no cambia').toBe(before)
    rmSync(decoy, { recursive: true, force: true })
  })

  test('E2E-63_should_persist_a_title_edit_keeping_id_and_clipkey_and_create_a_backup', async ({ admin, page }) => {
    const before = admin.readCatalog().songs.find((s: any) => s.id === 'song-bravo-a')
    await page.goto(admin.url)
    const r = row(page, 'song-bravo-a')
    await r.getByLabel('Título de Bravo Theme').fill('Bravo Theme Remastered')
    await r.getByRole('button', { name: 'Guardar título' }).click()
    await expect(r.getByRole('heading', { level: 3 })).toHaveText('Bravo Theme Remastered')
    await page.reload()
    await expect(row(page, 'song-bravo-a').getByRole('heading', { level: 3 })).toHaveText('Bravo Theme Remastered')

    const after = admin.readCatalog().songs.find((s: any) => s.id === 'song-bravo-a')
    expect(after.title).toBe('Bravo Theme Remastered')
    expect(after.id).toBe(before.id)
    expect(after.clipKey).toBe(before.clipKey)
    expect(admin.exists('catalog.json.bak'), 'copia de seguridad').toBe(true)
  })

  test('E2E-64_should_assign_games_create_a_new_game_and_rename_it_keeping_its_id', async ({ admin, page }) => {
    await page.goto(admin.url)
    const r = row(page, 'song-charlie')
    await r.getByRole('checkbox', { name: 'Admin Bravo' }).check()
    await r.getByRole('button', { name: 'Guardar juegos' }).click()
    await expect.poll(() => admin.readCatalog().songs.find((s: any) => s.id === 'song-charlie').games).toEqual(['bravo', 'charlie'])

    await page.getByLabel('Nombre del juego nuevo').fill('Nueva Zona')
    await page.getByRole('button', { name: 'Crear juego' }).click()
    await expect.poll(() => admin.readCatalog().games.map((g: any) => g.id)).toContain('nueva-zona')
    await expect(r.getByRole('checkbox', { name: 'Nueva Zona' })).toBeVisible()
    await expect(gameFilter(page)).toContainText('Nueva Zona')

    await page.getByLabel('Nombre del juego nueva-zona').fill('Zona Renombrada')
    await page.getByRole('button', { name: 'Renombrar nueva-zona' }).click()
    await expect.poll(() => admin.readCatalog().games.find((g: any) => g.id === 'nueva-zona')?.name).toBe('Zona Renombrada')
    expect(admin.readCatalog().games.map((g: any) => g.id), 'id estable tras renombrar').toEqual(['alpha', 'bravo', 'charlie', 'nueva-zona'])
    await expect(r.getByRole('checkbox', { name: 'Zona Renombrada' })).toBeVisible()
    await r.getByRole('checkbox', { name: 'Zona Renombrada' }).check()
    await r.getByRole('button', { name: 'Guardar juegos' }).click()
    await expect.poll(() => admin.readCatalog().songs.find((s: any) => s.id === 'song-charlie').games).toEqual(['bravo', 'charlie', 'nueva-zona'])
  })

  test('E2E-65_should_toggle_enabled_and_reviewed_and_keep_filters_coherent', async ({ admin, page }) => {
    await page.goto(admin.url)
    const r = row(page, 'song-bravo-b') // desactivada y revisada
    await r.getByRole('button', { name: 'Activar' }).click()
    await expect(r).toContainText('Activada · Revisada')
    await r.getByRole('button', { name: 'Marcar pendiente' }).click()
    await expect(r).toContainText('Activada · Pendiente')
    const song = () => admin.readCatalog().songs.find((s: any) => s.id === 'song-bravo-b')
    expect([song().enabled, song().reviewed]).toEqual([true, false])

    await page.getByLabel('Estado').selectOption('disabled')
    await expect(row(page, 'song-bravo-b')).toHaveCount(0)
    await page.getByLabel('Estado').selectOption('enabled')
    await expect(row(page, 'song-bravo-b')).toHaveCount(1)
    await page.getByLabel('Revisión').selectOption('pending')
    await expect(row(page, 'song-bravo-b')).toHaveCount(1)
    await page.getByLabel('Revisión').selectOption('reviewed')
    await expect(row(page, 'song-bravo-b')).toHaveCount(0)
    await expect(row(page, 'song-long-one')).toHaveCount(1)

    await page.getByLabel('Estado').selectOption('all')
    await page.getByLabel('Revisión').selectOption('all')
    await row(page, 'song-bravo-b').getByRole('button', { name: 'Marcar revisada' }).click()
    await row(page, 'song-bravo-b').getByRole('button', { name: 'Desactivar' }).click()
    await expect.poll(() => [song().enabled, song().reviewed]).toEqual([false, true])
  })

  test('E2E-66_should_block_enabling_a_too_short_song_in_ui_and_api', async ({ admin, page }) => {
    await page.goto(admin.url)
    const r = row(page, 'song-short-one')
    await expect(r).toContainText('Demasiado corta (7,4 s)')
    await expect(r.getByRole('button', { name: 'Activar' })).toBeDisabled()

    const hash = admin.catalogHash()
    const res = await page.request.patch(`${admin.url}/api/songs/song-short-one`, {
      headers: { 'X-Admin-Token': admin.token, 'Content-Type': 'application/json' },
      data: { enabled: true },
    })
    expect(res.status()).toBe(409)
    expect((await res.json()).error.code).toBe('TOO_SHORT')
    expect(admin.catalogHash(), 'el fichero no cambia').toBe(hash)
  })

  test('E2E-67_should_combine_filters_and_search_without_accents_or_case', async ({ admin, page }) => {
    await page.goto(admin.url)
    expect(await shown(page)).toBe(8)
    await gameFilter(page).selectOption({ label: 'Admin Bravo' })
    await expect.poll(() => shown(page)).toBe(4)
    await page.getByLabel('Estado').selectOption('disabled')
    await expect.poll(() => titles(page)).toEqual(['Cañón de Bravo'])
    await page.getByLabel('Revisión').selectOption('pending')
    await expect.poll(() => shown(page)).toBe(0)
    await page.getByLabel('Estado').selectOption('enabled')
    await expect.poll(() => titles(page)).toEqual(['Multi Game Tune', 'Another Pending'])

    await gameFilter(page).selectOption('')
    await page.getByLabel('Estado').selectOption('all')
    await page.getByLabel('Revisión').selectOption('all')
    await page.getByLabel('Solo cortas').check()
    await expect.poll(() => titles(page)).toEqual(['Short Jingle'])
    await page.getByLabel('Solo con errores').check()
    await expect.poll(() => shown(page)).toBe(0)
    await page.getByLabel('Solo cortas').uncheck()
    await page.getByLabel('Solo con errores').uncheck()

    await page.getByLabel('Buscar').fill('CANON')
    await expect.poll(() => titles(page)).toEqual(['Cañón de Bravo'])
    await page.getByLabel('Buscar').fill('charlie')
    await expect.poll(() => titles(page)).toEqual(['Charlie Song', 'Unknown Length'])
    await page.getByLabel('Buscar').fill('original video of unknown')
    await expect.poll(() => titles(page)).toEqual(['Unknown Length'])
  })

  test('E2E-68_should_stream_the_full_source_with_range_requests_and_seek', async ({ admin, page }) => {
    await page.goto(admin.url)
    const ranges: Array<{ range: string | undefined; status: number }> = []
    page.on('response', (res) => {
      if (res.url().includes('/api/songs/song-long-one/audio')) ranges.push({ range: res.request().headers()['range'], status: res.status() })
    })
    const builds: string[] = []
    page.on('request', (req) => {
      if (/build/i.test(req.url())) builds.push(req.url())
    })
    const audio = row(page, 'song-long-one').locator('audio')
    await page.locator('body').click() // gesto de usuario
    await audio.evaluate((el: HTMLAudioElement) => el.play())
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0.2)
    expect(await audio.evaluate((el: HTMLAudioElement) => el.duration)).toBeCloseTo(40, 0)
    await audio.evaluate(
      (el: HTMLAudioElement) =>
        new Promise<void>((resolve) => {
          el.addEventListener('seeked', () => resolve(), { once: true })
          el.currentTime = 30
        }),
    )
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(30)
    expect(await audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeLessThan(32)
    const partial = ranges.filter((r) => r.range && r.status === 206)
    expect(partial.length, `peticiones con Range: ${JSON.stringify(ranges)}`).toBeGreaterThan(0)
    expect(builds).toEqual([])
  })

  test('E2E-69_should_refresh_on_focus_and_not_lose_an_external_edit', async ({ admin, page }) => {
    await page.goto(admin.url)
    await expect(row(page, 'song-bravo-a').getByRole('heading', { level: 3 })).toHaveText('Bravo Theme')

    // Edicion externa (draft/build o a mano) con el admin abierto.
    const external = admin.readCatalog()
    external.songs.find((s: any) => s.id === 'song-bravo-a').title = 'Edited Externally'
    admin.writeCatalog(external)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(row(page, 'song-bravo-a').getByRole('heading', { level: 3 })).toHaveText('Edited Externally')

    // Una edicion posterior desde el admin conserva el cambio externo.
    await row(page, 'song-multi').getByRole('button', { name: 'Marcar revisada' }).click()
    await expect.poll(() => admin.readCatalog().songs.find((s: any) => s.id === 'song-multi').reviewed).toBe(true)
    expect(admin.readCatalog().songs.find((s: any) => s.id === 'song-bravo-a').title).toBe('Edited Externally')

    // Segunda edicion externa SIN refrescar la pagina y edicion en el admin sobre otra cancion.
    const again = admin.readCatalog()
    again.songs.find((s: any) => s.id === 'song-charlie').title = 'Charlie Edited Outside'
    admin.writeCatalog(again)
    await row(page, 'song-nodur').getByRole('button', { name: 'Marcar revisada' }).click()
    await expect.poll(() => admin.readCatalog().songs.find((s: any) => s.id === 'song-nodur').reviewed).toBe(true)
    expect(admin.readCatalog().songs.find((s: any) => s.id === 'song-charlie').title).toBe('Charlie Edited Outside')
  })

  test('E2E-70_should_reject_foreign_hosts_and_cross_origin_requests', async ({ admin, page }) => {
    const hash = admin.catalogHash()
    // (a) Host ajeno -> 403 en todas las rutas probadas.
    for (const path of ['/', '/api/session', '/api/catalog']) {
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port: admin.port, path, headers: { Host: 'evil.com' } }, (res) => {
          res.resume()
          resolve(res.statusCode!)
        })
        req.on('error', reject)
        req.end()
      })
      expect(status, `Host evil.com en ${path}`).toBe(403)
    }

    // Segundo servidor en otro puerto: pagina de "otro origen local".
    const other = createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>otro</title>'))
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve))
    const otherPort = (other.address() as { port: number }).port
    try {
      await page.goto(`http://127.0.0.1:${otherPort}/`)
      // (b) PATCH sin token desde otro origen: bloqueada (preflight sin CORS) y sin cambios.
      const patch = await page.evaluate(async (url) => {
        try {
          const res = await fetch(`${url}/api/songs/song-bravo-a`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Hacked' }),
          })
          return { blocked: false, status: res.status }
        } catch {
          return { blocked: true }
        }
      }, admin.url)
      expect(patch.blocked, JSON.stringify(patch)).toBe(true)
      // (c) Leer /api/session desde otro origen no es posible.
      const session = await page.evaluate(async (url) => {
        try {
          const res = await fetch(`${url}/api/session`)
          return { blocked: false, body: await res.text() }
        } catch {
          return { blocked: true }
        }
      }, admin.url)
      expect(session.blocked, JSON.stringify(session)).toBe(true)
      // El envio "simple" sin preflight (text/plain) llega, pero sin token no muta.
      await page.evaluate((url) => fetch(`${url}/api/songs/song-bravo-a`, { method: 'POST', mode: 'no-cors', body: '{"title":"Hacked"}' }).catch(() => {}), admin.url)
    } finally {
      await new Promise<void>((resolve) => other.close(() => resolve()))
    }
    expect(admin.catalogHash(), 'catalog.json intacto').toBe(hash)
  })

  test('E2E-72_should_not_offer_startsec_deleting_merging_games_or_the_six_clips', async ({ admin, page }) => {
    await page.goto(admin.url)
    await expect(page.locator('li[data-song-id]')).toHaveCount(8)
    const body = page.locator('body')
    await expect(body.getByText(/startSec|inicio del fragmento|fragmento/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /borrar|eliminar|fusionar|combinar/i })).toHaveCount(0)
    await expect(page.getByRole('spinbutton')).toHaveCount(0)
    expect(await page.locator('audio').count(), 'como mucho un audio (fuente completa) por cancion con fuente').toBeLessThanOrEqual(2)
    await expect(page.locator('audio[src*="clips"]')).toHaveCount(0)
  })
})

test.describe('Admin con catalogo invalido', () => {
  test.use({
    adminOptions: {
      transform: (catalog: any) => {
        catalog.songs.find((s: any) => s.id === 'song-charlie').games = []
      },
    },
  })

  test('E2E-71_should_load_an_invalid_catalog_mark_the_error_and_allow_fixing_it', async ({ admin, page }) => {
    await page.goto(admin.url)
    await expect(page.locator('li[data-song-id]')).toHaveCount(8)
    const r = row(page, 'song-charlie')
    await expect(r).toContainText('games debe ser un array no vacio')
    await page.getByLabel('Solo con errores').check()
    await expect.poll(() => titles(page)).toEqual(['Charlie Song'])

    await r.getByRole('checkbox', { name: 'Admin Charlie' }).check()
    await r.getByRole('button', { name: 'Guardar juegos' }).click()
    await expect.poll(() => admin.readCatalog().songs.find((s: any) => s.id === 'song-charlie').games).toEqual(['charlie'])
    await expect.poll(() => shown(page)).toBe(0) // ya no hay errores
    // `validate` con ffmpeg real queda cubierto por SC-VA-06 y SC-DUR-07 (unit, scripts/catalog).
  })
})
