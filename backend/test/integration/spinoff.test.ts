// DEC-60: diario de spin-offs por HTTP.
import { describe, it, expect, afterEach } from 'vitest'
import { startTestApp, closeAllTestApps, codeOf } from '../helpers/app'
import { catalogR } from '../helpers/fixtures'

afterEach(closeAllTestApps)

/** Catalogo R con D convertido en spin-off (una sola cancion, d-only-song-06). */
const withSpinoff = () => {
  const c: any = catalogR()
  c.games.find((g: any) => g.id === 'D').series = 'spinoff'
  return c
}

describe('POST /games diario spin-off (DEC-60)', () => {
  it('BE-SPO-01 series spinoff: partida diaria con series=spinoff, fecha y la unica cancion spin-off como objetivo', async () => {
    const app = await startTestApp({ catalog: withSpinoff() })
    const r = await app.post('/api/games', { mode: 'daily', series: 'spinoff' })
    expect([r.status, r.json.mode, r.json.series, typeof r.json.date]).toEqual([200, 'daily', 'spinoff', 'string'])
    const won = await app.guess(r.json.token, 'd-only-song-06')
    expect([won.json.status, won.json.series, won.json.solution.id]).toEqual(['won', 'spinoff', 'd-only-song-06'])
  })

  it('BE-SPO-02 el diario principal lleva series=main y nunca elige el spin-off', async () => {
    const app = await startTestApp({ catalog: withSpinoff() })
    const r = await app.createDaily()
    expect(r.json.series).toBe('main')
    const lost = await app.skip((await app.skip((await app.skip((await app.skip((await app.skip((await app.skip(r.json.token)).json.token)).json.token)).json.token)).json.token)).json.token)
    expect(lost.json.solution.games.map((g: any) => g.id)).not.toContain('D')
  })

  it('BE-SPO-03 /games/state conserva la serie del token', async () => {
    const app = await startTestApp({ catalog: withSpinoff() })
    const r = await app.post('/api/games', { mode: 'daily', series: 'spinoff' })
    expect((await app.state(r.json.token)).json.series).toBe('spinoff')
  })

  it('BE-SPO-04 serie no valida -> 400 VALIDATION_ERROR', async () => {
    const app = await startTestApp({ catalog: withSpinoff() })
    const r = await app.post('/api/games', { mode: 'daily', series: 'otra' })
    expect([r.status, codeOf(r)]).toEqual([400, 'VALIDATION_ERROR'])
  })

  it('BE-SPO-05 sin juegos spin-off -> 400 EMPTY_FILTER', async () => {
    const app = await startTestApp()
    const r = await app.post('/api/games', { mode: 'daily', series: 'spinoff' })
    expect([r.status, codeOf(r)]).toEqual([400, 'EMPTY_FILTER'])
  })

  it('BE-SPO-06 /catalog publica la serie de cada juego', async () => {
    const app = await startTestApp({ catalog: withSpinoff() })
    const games = (await app.get('/api/catalog')).json.games
    expect(games.find((g: any) => g.id === 'D').series).toBe('spinoff')
    expect(games.find((g: any) => g.id === 'A').series).toBe('main')
  })

  it('BE-SPO-07 el libre admite juegos de cualquier serie', async () => {
    const app = await startTestApp({ catalog: withSpinoff(), randomInt: () => 0 })
    const r = await app.createUnlimited(['D'])
    expect([r.status, r.json.mode, r.json.series]).toEqual([200, 'unlimited', undefined])
  })
})
