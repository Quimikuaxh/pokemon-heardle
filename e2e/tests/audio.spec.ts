import { test, expect } from '../support/test.ts'
import { INSTRUMENT_WEBAUDIO } from '../support/webaudio.ts'
import type { WebAudioLog } from '../support/webaudio.ts'
import { dailyTargetR } from '../support/oracle.ts'
import { CLIP_BYTE_OFFSETS, CLIP_FRAME_COUNTS } from '../../shared/rules.ts'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(INSTRUMENT_WEBAUDIO)
})

test('E2E-03_should_lengthen_the_decoded_clip_with_each_skip', async ({ app, page }) => {
  const d = app.daily
  await app.goto()
  for (let i = 0; i < 5; i++) {
    await d.ready()
    await d.skip()
  }
  await d.ready()
  // Duracion del AudioBuffer decodificado: frames(N) * 1152 / 44100 (sin recorte de retardo del codificador).
  const durations = await page.evaluate(() => ((window as any).__wa as WebAudioLog).buffers.map((b) => b.duration))
  const expected = CLIP_FRAME_COUNTS.map((frames) => (frames * 1152) / 44100)
  expect(durations).toHaveLength(6)
  durations.forEach((duration, i) => {
    expect(Math.abs(duration - expected[i]), `intento ${i + 1}: ${duration} s`).toBeLessThanOrEqual(0.005)
    expect(duration, `intento ${i + 1}`).toBeGreaterThanOrEqual([1, 2, 4, 7, 11, 16][i])
    expect(duration, `intento ${i + 1}`).toBeLessThanOrEqual([1, 2, 4, 7, 11, 16][i] + 0.05)
  })
})

test('E2E-30_should_download_one_prefix_per_attempt_each_a_prefix_of_the_next', async ({ app, net }) => {
  const d = app.daily
  await app.goto()
  for (let i = 0; i < 6; i++) {
    await d.ready()
    await net.settle()
    expect(net.clips(), `peticiones de clip tras el intento ${i + 1}`).toHaveLength(i + 1)
    expect(net.clips()[i].body!.length, `bytes del intento ${i + 1}`).toBe(CLIP_BYTE_OFFSETS[i])
    if (i < 5) await d.skip()
  }
  const bodies = net.clips().map((c) => c.body!)
  for (let i = 0; i < 5; i++) {
    expect(bodies[i + 1].subarray(0, bodies[i].length).equals(bodies[i]), `el intento ${i + 1} es prefijo del ${i + 2}`).toBe(true)
  }
})

test('E2E-27_should_serve_the_clip_from_an_opaque_url_without_id3', async ({ app, net }) => {
  const target = dailyTargetR()
  await app.goto()
  await app.daily.ready()
  await net.settle()
  const [clip] = net.clips()
  const ticket = clip.path.replace('/api/clips/', '')
  expect(ticket).toMatch(/^[A-Za-z0-9_-]{20,}$/)
  expect(clip.url).not.toMatch(/\.\w{2,4}$/)
  for (const secret of [target.id, target.clipKey, 'mp3']) expect(clip.url).not.toContain(secret)
  expect(clip.body!.length).toBeGreaterThan(1000)
  expect(clip.body!.subarray(0, 3).toString('latin1')).not.toBe('ID3')
  expect(clip.headers['content-type']).toBe('audio/mpeg')
})

test('E2E-28_should_reject_a_reused_clip_url_with_410', async ({ app, page, net }) => {
  await app.goto()
  await app.daily.ready()
  await net.settle()
  const res = await page.request.get(net.clips()[0].url)
  expect(res.status()).toBe(410)
  expect((await res.json()).error.code).toBe('CLIP_TICKET_USED')
})

test('E2E-29_should_not_expose_fixtures_or_raw_clips', async ({ page, baseURL }) => {
  const backend = `http://localhost:${new URL(baseURL!).port.replace(/^51/, '31')}`
  for (const url of [
    `${backend}/clips/1111111111111111.mp3`,
    `${backend}/clips/1111111111111111/1.mp3`,
    `${backend}/api/clips/1111111111111111.mp3`,
    `${backend}/fixtures/R/clips/1111111111111111/1.mp3`,
    `${backend}/api/clips/1111111111111111/1.mp3`,
    `${backend}/api/fixtures/R/catalog/catalog.json`,
  ]) {
    const res = await page.request.get(url)
    expect(res.status(), url).toBe(404)
  }
  const ticket = await page.request.get(`${backend}/api/clips/1111111111111111`)
  expect(ticket.status()).toBe(404)
  // El servidor de desarrollo del frontend tampoco debe servir los fixtures como audio.
  for (const path of ['/fixtures/R/clips/1111111111111111.mp3', '/clips/1111111111111111.mp3', '/clips/1111111111111111/1.mp3', '/e2e/fixtures/R/catalog/catalog.json']) {
    const res = await page.request.get(`${baseURL}${path}`)
    expect(res.headers()['content-type'] ?? '', path).not.toContain('audio')
    expect((await res.body()).subarray(0, 2).toString('hex'), path).not.toBe('fffb')
    expect(await res.text(), path).not.toContain('Zephyr Harbor')
  }
})
