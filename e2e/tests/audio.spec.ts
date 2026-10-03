import { test, expect } from '../support/test.ts'
import { dailyTargetR } from '../support/oracle.ts'

const CLIP_SECONDS = [1, 2, 4, 7, 11, 16]
const BYTES_PER_SEC = 16000 // MP3 CBR 128 kbps

test('E2E-03_should_lengthen_the_clip_with_each_skip_1_2_4_7_11_16', async ({ app, page, net }) => {
  const d = app.daily
  await app.goto()
  for (let i = 0; i < 5; i++) {
    await d.ready()
    await d.skip()
  }
  await d.ready()
  await net.settle()
  const clips = net.clips()
  expect(clips).toHaveLength(6)
  const durations: number[] = []
  for (const clip of clips) {
    const base64 = clip.body!.toString('base64')
    durations.push(
      await page.evaluate(
        (b64) =>
          new Promise<number>((resolve, reject) => {
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
            const audio = new Audio()
            audio.onloadedmetadata = () => resolve(audio.duration)
            audio.onerror = () => reject(new Error('el navegador no decodifica el clip'))
            audio.src = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
          }),
        base64,
      ),
    )
  }
  durations.forEach((duration, i) => expect(duration, `duracion del intento ${i + 1}`).toBeCloseTo(CLIP_SECONDS[i], 0))
  durations.forEach((duration, i) => expect(Math.abs(duration - CLIP_SECONDS[i]), `intento ${i + 1}`).toBeLessThanOrEqual(0.1))
})

test('E2E-30_should_download_one_clip_per_attempt_with_the_size_of_that_attempt_only', async ({ app, net }) => {
  const d = app.daily
  await app.goto()
  for (let i = 0; i < 6; i++) {
    await d.ready()
    await net.settle()
    expect(net.clips(), `peticiones de clip tras el intento ${i + 1}`).toHaveLength(i + 1)
    const size = net.clips()[i].body!.length
    const expected = CLIP_SECONDS[i] * BYTES_PER_SEC
    expect(size, `bytes del intento ${i + 1}`).toBeGreaterThanOrEqual(expected)
    expect(size, `bytes del intento ${i + 1}`).toBeLessThanOrEqual(expected + 1500)
    if (i < 5) await d.skip()
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
    `${backend}/clips/1111111111111111/1.mp3`,
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
  for (const path of ['/fixtures/R/clips/1111111111111111/1.mp3', '/clips/1111111111111111/1.mp3', '/e2e/fixtures/R/catalog/catalog.json']) {
    const res = await page.request.get(`${baseURL}${path}`)
    expect(res.headers()['content-type'] ?? '', path).not.toContain('audio')
    expect((await res.body()).subarray(0, 2).toString('hex'), path).not.toBe('fffb')
    expect(await res.text(), path).not.toContain('Zephyr Harbor')
  }
})
