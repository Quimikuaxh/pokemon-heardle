import { describe, it, expect, afterEach } from 'vitest'
import { startTestApp, closeAllTestApps, codeOf } from '../helpers/app'

afterEach(closeAllTestApps)

async function setup() {
  const app = await startTestApp({ randomInt: () => 0 })
  const g = await app.createUnlimited(['C'])
  return { app, token: g.json.token as string }
}

describe('POST /api/games validacion (BE-VAL-01, BE-VAL-02)', () => {
  for (const [label, body] of [
    ['cuerpo vacio {}', {}],
    ['mode desconocido', { mode: 'otro' }],
    ['mode numerico', { mode: 5 }],
    ['mode null', { mode: null }],
    ['mode array', { mode: ['daily'] }],
    ['daily con games [A]', { mode: 'daily', games: ['A'] }],
    ['daily con games []', { mode: 'daily', games: [] }],
    ['daily con games string', { mode: 'daily', games: 'A' }],
    ['unlimited sin games', { mode: 'unlimited' }],
    ['unlimited con games string', { mode: 'unlimited', games: 'A' }],
    ['unlimited con games objeto', { mode: 'unlimited', games: { 0: 'A' } }],
    ['unlimited games con numeros', { mode: 'unlimited', games: [1, 2] }],
    ['unlimited games con null', { mode: 'unlimited', games: [null] }],
    ['unlimited games con objetos', { mode: 'unlimited', games: [{}] }],
    ['unlimited games con string enorme', { mode: 'unlimited', games: ['x'.repeat(1000)] }],
    ['unlimited demasiados elementos', { mode: 'unlimited', games: Array.from({ length: 500 }, () => 'A') }],
    ['array en vez de objeto', [1, 2, 3]],
  ] as Array<[string, unknown]>) {
    it(`BE-VAL-01/02 ${label} -> 400 VALIDATION_ERROR`, async () => {
      const { app } = await setup()
      const r = await app.post('/api/games', body)
      expect([r.status, codeOf(r)]).toEqual([400, 'VALIDATION_ERROR'])
    })
  }

  it('BE-VAL-01 unlimited con games:[] es EMPTY_FILTER (no VALIDATION_ERROR)', async () => {
    const { app } = await setup()
    expect(codeOf(await app.post('/api/games', { mode: 'unlimited', games: [] }))).toBe('EMPTY_FILTER')
  })
})

describe('POST /api/games/{state,guess,skip} validacion (BE-VAL-03, BE-VAL-04)', () => {
  const endpoints: Array<[string, (t: unknown) => unknown]> = [
    ['/api/games/state', (t) => ({ token: t })],
    ['/api/games/guess', (t) => ({ token: t, songId: 'a-one-song-01' })],
    ['/api/games/skip', (t) => ({ token: t })],
  ]
  for (const [path, build] of endpoints) {
    for (const [label, token] of [
      ['ausente', undefined],
      ['numero', 5],
      ['vacio', ''],
      ['null', null],
      ['objeto', {}],
      ['array', ['x']],
    ] as Array<[string, unknown]>) {
      it(`BE-VAL-03 ${path} con token ${label} -> 400 VALIDATION_ERROR`, async () => {
        const { app } = await setup()
        const r = await app.post(path, build(token))
        expect([r.status, codeOf(r)]).toEqual([400, 'VALIDATION_ERROR'])
      })
    }
  }

  for (const [label, songId] of [
    ['ausente', undefined],
    ['numero', 5],
    ['objeto', {}],
    ['array', ['a-one-song-01']],
    ['null', null],
    ['__proto__', '__proto__'],
    ['constructor', 'constructor'],
    ['toString', 'toString'],
    ['vacio', ''],
  ] as Array<[string, unknown]>) {
    it(`BE-VAL-04 songId ${label} -> 400 VALIDATION_ERROR o UNKNOWN_SONG, nunca excepcion`, async () => {
      const { app, token } = await setup()
      const r = await app.post('/api/games/guess', { token, songId })
      expect(r.status).toBe(400)
      expect(['VALIDATION_ERROR', 'UNKNOWN_SONG']).toContain(codeOf(r))
    })
  }

  it('BE-VAL-05 cuerpo no JSON con Content-Type JSON -> 400 con { error: { code, message } }', async () => {
    const { app } = await setup()
    const r = await app.post('/api/games', '{no es json')
    expect([r.status, typeof r.json?.error?.code, typeof r.json?.error?.message]).toEqual([400, 'string', 'string'])
  })

  it('BE-VAL-05 el mensaje de error es texto no vacio', async () => {
    const { app } = await setup()
    const r = await app.post('/api/games', { mode: 'otro' })
    expect(r.json.error.message.length).toBeGreaterThan(0)
  })

  it('BE-VAL-05 Content-Type incorrecto (text/plain) con JSON valido -> 400', async () => {
    const { app, token } = await setup()
    const r = await app.call('POST', '/api/games/state', JSON.stringify({ token }), { 'content-type': 'text/plain' })
    expect(r.status).toBe(400)
  })

  it('BE-VAL-06 token en query string no se acepta', async () => {
    const { app, token } = await setup()
    const r = await app.call('POST', `/api/games/state?token=${token}`, {})
    expect([r.status, codeOf(r)]).toEqual([400, 'VALIDATION_ERROR'])
  })

  it('BE-VAL-07 guess con campos extra (gameId, filter) no cambia la evaluacion', async () => {
    const { app, token } = await setup()
    const r = await app.post('/api/games/guess', { token, songId: 'a-one-song-01', gameId: 'C', filter: ['C'] })
    if (r.status === 400) expect(codeOf(r)).toBe('VALIDATION_ERROR')
    else expect(r.json.results).toEqual(['miss'])
  })
})

describe('errores de cuerpo', () => {
  it('charset no soportado -> 4xx VALIDATION_ERROR, no 500', async () => {
    const { app } = await setup()
    const r = await app.call('POST', '/api/games', '{"mode":"daily"}', { 'content-type': 'application/json; charset=utf-16' })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(r.status).toBeLessThan(500)
    expect(codeOf(r)).toBe('VALIDATION_ERROR')
  })
})
