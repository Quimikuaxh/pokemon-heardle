import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect } from '../support/test.ts'
import { E2E_DIR, X_STORE_COPY } from '../support/env.ts'
import { M_SONGS, STEP_HZ } from '../fixtures/catalogs.ts'
import { dailyTargetR } from '../support/oracle.ts'
import { INSTRUMENT_WEBAUDIO, REMOVE_WEBAUDIO, dominantFrequency } from '../support/webaudio.ts'
import type { WebAudioLog } from '../support/webaudio.ts'
import { CLIP_BYTE_OFFSETS, CLIP_SECONDS, CLIP_TOTAL_BYTES } from '../../shared/rules.ts'

const wa = (page: Page) => page.evaluate(() => {
  const log = (window as any).__wa as WebAudioLog
  return { decodes: log.decodes, starts: log.starts, params: log.params, buffers: log.buffers.map((b) => b.duration), resumes: log.resumes, states: log.contexts.map((c) => c.state) }
})

test.describe('Web Audio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INSTRUMENT_WEBAUDIO)
  })

  test('E2E-74_should_schedule_a_50ms_fade_out_ramp_on_every_play', async ({ app, page }) => {
    const d = app.daily
    await app.goto()
    for (let i = 0; i < 6; i++) {
      await d.ready()
      await d.playButton.click()
      await expect.poll(async () => (await wa(page)).starts.length).toBe(i + 1)
      const log = await wa(page)
      const t0 = log.starts[i].when
      const duration = log.buffers[i]
      const ramp = log.params.slice(-3)
      expect(ramp.map((p) => p.fn), `llamadas del intento ${i + 1}`).toEqual(['setValueAtTime', 'setValueAtTime', 'linearRampToValueAtTime'])
      expect(ramp.map((p) => p.value)).toEqual([1, 1, 0])
      expect(ramp[0].time).toBeCloseTo(t0, 5)
      expect(ramp[1].time, 'inicio del fundido').toBeCloseTo(t0 + duration - 0.05, 5)
      expect(ramp[2].time, 'fin del fundido').toBeCloseTo(t0 + duration, 5)
      if (i < 5) await d.skip()
    }
    expect(log6(await wa(page)), 'una rampa por reproduccion').toBe(6)
  })

  test('E2E-77_should_fetch_and_decode_once_per_attempt_and_never_request_the_full_file_early', async ({ app, page, net }) => {
    const d = app.daily
    await app.goto()
    for (let i = 0; i < 6; i++) {
      await d.ready()
      await d.playIdle.click()
      await app.showUnlimited()
      await app.showDaily()
      await net.settle()
      expect(net.clips(), `fetch de clips en el intento ${i + 1}`).toHaveLength(i + 1)
      expect((await wa(page)).decodes, `decodificaciones en el intento ${i + 1}`).toBe(i + 1)
      for (const clip of net.clips()) expect(clip.body!.length).toBeLessThanOrEqual(CLIP_BYTE_OFFSETS[i])
      if (i < 5) {
        expect(Math.max(...net.clips().map((c) => c.body!.length)), 'fichero completo antes del intento 6').toBeLessThan(CLIP_TOTAL_BYTES)
        await d.skip()
      }
    }
  })
})

test.describe('Corte en limite de trama', () => {
  test.use({ variant: 'M' })

  test('E2E-76_should_end_each_prefix_in_the_tone_of_its_own_second', async ({ app, page }) => {
    await page.addInitScript(INSTRUMENT_WEBAUDIO)
    const base = M_SONGS[0].toneHz
    const candidates = Array.from({ length: 16 }, (_, s) => base + STEP_HZ * s)
    const d = app.daily
    await app.goto()
    for (let n = 1; n <= 5; n++) {
      await d.ready()
      const tail = await page.evaluate((index) => {
        const buffer = ((window as any).__wa as WebAudioLog).buffers[index]
        const data = buffer.getChannelData(0)
        const count = Math.round(buffer.sampleRate * 0.01)
        return { samples: Array.from(data.subarray(data.length - count)), rate: buffer.sampleRate }
      }, n - 1)
      const found = dominantFrequency(tail.samples, tail.rate, candidates)
      expect(found, `intento ${n}: ultimos 10 ms`).toBe(base + STEP_HZ * (CLIP_SECONDS[n - 1] - 1))
      await d.skip()
    }
  })
})

test('E2E-75_should_play_a_full_game_with_the_audio_element_when_web_audio_is_missing', async ({ app, page }) => {
  await page.addInitScript(REMOVE_WEBAUDIO)
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  const target = dailyTargetR()
  const d = app.daily
  await app.goto()
  expect(await page.evaluate(() => typeof AudioContext), 'sin AudioContext').toBe('undefined')
  await d.ready()
  const bar = d.root.getByRole('progressbar')
  await d.playButton.click()
  await expect(bar).toHaveAttribute('data-playing', 'true')
  const samples: number[] = []
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(300)
    samples.push(Number(await bar.getAttribute('aria-valuenow')))
  }
  expect(samples[1], `barra con audio.currentTime: ${samples}`).toBeGreaterThan(0)
  await d.skip()
  await d.ready()
  await d.skip()
  await d.ready()
  await d.guess(target.title)
  await expect(d.resultHeading).toHaveText('¡ACERTASTE EN EL INTENTO 3!')
  expect(consoleErrors, 'errores de consola').toEqual([])
})

test.describe('Clip corrupto', () => {
  test.use({ variant: 'X' })
  // Comparten el fichero corrupto y la cache del backend: en orden y en el mismo worker.
  test.describe.configure({ mode: 'serial' })

  test('E2E-78_should_answer_502_keep_the_ticket_and_let_the_user_retry', async ({ app, page, net }) => {
    const file = join(X_STORE_COPY, 'clips', `${M_SONGS[0].clipKey}.mp3`)
    const corrupt = readFileSync(file)
    const d = app.daily
    try {
      await app.goto()
      const retry = d.root.getByRole('button', { name: /No se pudo cargar el audio/ })
      await expect(retry).toBeVisible()
      await net.settle()
      expect(net.clips()[0].status).toBe(502)
      expect(JSON.parse(net.clips()[0].body!.toString()).error.code).toBe('STORAGE_ERROR')
      await expect(d.playButton).toBeDisabled()
      await expect(d.skipButton, 'la partida sigue jugable').toBeEnabled()

      // Reintento con el almacen aun roto: mismo ticket, 502 otra vez (no 410: no se consumio).
      await retry.click()
      await expect.poll(() => net.responses.filter((r) => r.path.startsWith('/api/clips/')).length).toBe(2)
      await net.settle()
      expect(net.clips().map((c) => c.status)).toEqual([502, 502])
      expect(net.clips()[1].path).toBe(net.clips()[0].path)
    } finally {
      writeFileSync(file, corrupt)
    }
  })

  // Un clip invalido no queda en cache (la ruta lo expulsa, DEC-44): reparado el fichero, el mismo ticket funciona (DEC-22).
  test('E2E-78_should_recover_with_the_same_ticket_after_the_store_is_repaired', async ({ app, net }) => {
    const file = join(X_STORE_COPY, 'clips', `${M_SONGS[0].clipKey}.mp3`)
    const good = join(E2E_DIR, 'fixtures', 'M', 'clips', `${M_SONGS[0].clipKey}.mp3`)
    const corrupt = readFileSync(file)
    try {
      await app.goto()
      const retry = app.daily.root.getByRole('button', { name: /No se pudo cargar el audio/ })
      await expect(retry).toBeVisible()
      copyFileSync(good, file)
      await retry.click()
      await expect.poll(() => net.responses.filter((r) => r.path.startsWith('/api/clips/')).length).toBe(2)
      await net.settle()
      expect(net.clips().map((c) => c.status), 'tras reparar el fichero').toEqual([502, 200])
    } finally {
      writeFileSync(file, corrupt)
    }
  })
})

function log6(log: { params: Array<{ fn: string }> }) {
  return log.params.filter((p) => p.fn === 'linearRampToValueAtTime').length
}

test.describe('Contexto interrumpido (iOS)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INSTRUMENT_WEBAUDIO)
  })

  test('E2E-79_should_rest_the_ui_when_the_context_is_interrupted_and_resume_on_next_click @mobile', async ({ app, page }) => {
    const d = app.daily
    await app.goto()
    for (let i = 0; i < 5; i++) {
      await d.ready()
      await d.skip()
    }
    await d.ready() // intento 6: 16 s, da margen para interrumpir
    const bar = d.root.getByRole('progressbar')
    await d.playButton.tap()
    await expect(bar).toHaveAttribute('data-playing', 'true')

    await page.evaluate(() => {
      const ctx = ((window as any).__wa as WebAudioLog).contexts[0]
      Object.defineProperty(ctx, 'state', { get: () => 'interrupted', configurable: true })
      ctx.dispatchEvent(new Event('statechange'))
    })
    await expect(bar).toHaveAttribute('data-playing', 'false')
    await expect(d.playButton).toBeEnabled()
    await expect(d.playButton).toHaveAccessibleName(/^(Reproducir|Reanudar)/)

    // Fin de la interrupcion: el siguiente toque reanuda la reproduccion.
    await page.evaluate(() => {
      delete (((window as any).__wa as WebAudioLog).contexts[0] as any).state
    })
    const startsBefore = (await wa(page)).starts.length
    await d.playButton.tap()
    await expect(bar).toHaveAttribute('data-playing', 'true')
    expect((await wa(page)).starts.length).toBe(startsBefore + 1)
  })
})
