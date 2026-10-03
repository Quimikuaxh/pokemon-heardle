import { describe, it, expect, afterEach } from 'vitest'
import { startTestApp, closeAllTestApps, codeOf } from '../helpers/app'

afterEach(closeAllTestApps)

async function gameC(opts: Parameters<typeof startTestApp>[0] = {}) {
  const app = await startTestApp({ randomInt: () => 0, ...opts })
  return { app, g: await app.createUnlimited(['C']) }
}

describe('/clips', () => {
  it('un sufijo en la URL del ticket no permite descargar el clip dos veces', async () => {
    const { app, g } = await gameC()
    expect((await app.clip(g.json.clipUrl)).status).toBe(200)
    for (const s of ['A', '_', '-']) expect((await app.clip(g.json.clipUrl + s)).status).toBe(404)
    expect((await app.clip(g.json.clipUrl)).status).toBe(410)
  })

  it('HEAD responde 405 y no consume el ticket', async () => {
    const { app, g } = await gameC()
    const head = await app.call('HEAD', g.json.clipUrl)
    expect(head.status).toBe(405)
    expect((await app.clip(g.json.clipUrl)).status).toBe(200)
  })
})

describe('errores de cuerpo', () => {
  it('charset no soportado -> 4xx VALIDATION_ERROR, no 500', async () => {
    const { app } = await gameC()
    const r = await app.call('POST', '/api/games', '{"mode":"daily"}', { 'content-type': 'application/json; charset=utf-16' })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(r.status).toBeLessThan(500)
    expect(codeOf(r)).toBe('VALIDATION_ERROR')
  })
})

describe('CORS', () => {
  it('el 429 expone Retry-After al origen permitido; las respuestas normales no exponen nada', async () => {
    const { app } = await gameC({ env: { RATE_LIMIT_CREATE_GAME: '1' } })
    const origin = { Origin: 'http://localhost:5173' }
    const ok = await app.get('/api/health', origin)
    expect(ok.headers.get('access-control-expose-headers')).toBeNull()
    await app.createDaily(origin)
    const limited = await app.createDaily(origin)
    expect([limited.status, limited.headers.get('access-control-expose-headers')]).toEqual([429, 'Retry-After'])
  })

  it('ALLOWED_ORIGIN con barra final sigue funcionando', async () => {
    const { app } = await gameC({ env: { ALLOWED_ORIGIN: 'http://localhost:5173/' } })
    const r = await app.get('/api/health', { Origin: 'http://localhost:5173' })
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })
})
