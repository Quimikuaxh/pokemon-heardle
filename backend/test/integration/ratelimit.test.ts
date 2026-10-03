import { describe, it, expect, afterEach } from 'vitest'
import { startTestApp, closeAllTestApps, codeOf } from '../helpers/app'

afterEach(closeAllTestApps)

const A1 = 'a-one-song-01'
const xff = (n: number) => ({ 'X-Forwarded-For': `203.0.113.${n}` })

describe('Rate-limit', () => {
  it('BE-RL-01 POST /games: las 20 primeras pasan y la 21.a -> 429 RATE_LIMITED con Retry-After', async () => {
    const app = await startTestApp({ env: { RATE_LIMIT_CREATE_GAME: '20' } })
    for (let i = 0; i < 20; i++) expect((await app.createDaily()).status, `peticion ${i + 1}`).toBe(200)
    const r = await app.createDaily()
    expect([r.status, codeOf(r), Number(r.headers.get('retry-after')) > 0]).toEqual([429, 'RATE_LIMITED', true])
  })

  it('BE-RL-02 guess+skip: 40 por IP pasan y la 41.a -> 429', async () => {
    const app = await startTestApp({ randomInt: () => 0, env: { RATE_LIMIT_ACTION: '40' } })
    const token = (await app.createUnlimited(['C'])).json.token
    for (let i = 0; i < 20; i++) expect((await app.skip(token)).status).toBe(200)
    for (let i = 0; i < 20; i++) expect((await app.guess(token, A1)).status).toBe(200)
    expect((await app.skip(token)).status).toBe(429)
  })

  it('BE-RL-03 /clips: 30 por IP pasan y la 31.a -> 429', async () => {
    const app = await startTestApp({ randomInt: () => 0, env: { RATE_LIMIT_CLIPS: '30' } })
    const token = (await app.createUnlimited(['C'])).json.token
    const statuses: number[] = []
    for (let i = 0; i < 31; i++) {
      const url = (await app.state(token)).json.clipUrl
      statuses.push((await app.clip(url)).status)
    }
    expect([statuses.slice(0, 30).every((s) => s === 200), statuses[30]]).toEqual([true, 429])
  })

  it('BE-RL-04 global /api: 120 por IP pasan y la 121.a -> 429', async () => {
    const app = await startTestApp({ env: { RATE_LIMIT_GLOBAL: '120' } })
    let last = 0
    for (let i = 0; i < 120; i++) last = (await app.get('/api/health')).status
    expect([last, (await app.get('/api/health')).status]).toEqual([200, 429])
  })

  it('BE-RL-05 por partida (nonce): la 13.a accion en 1 min desde IPs distintas -> 429', async () => {
    const app = await startTestApp({ randomInt: () => 0, env: { RATE_LIMIT_PER_GAME: '12' } })
    const token = (await app.createUnlimited(['C'], xff(1))).json.token
    for (let i = 0; i < 12; i++) expect((await app.state(token, xff(10 + i))).status, `accion ${i + 1}`).toBe(200)
    const r = await app.state(token, xff(99))
    expect([r.status, codeOf(r)]).toEqual([429, 'RATE_LIMITED'])
  })

  it('BE-RL-06 el limite de una partida no bloquea otra partida de la misma IP', async () => {
    const app = await startTestApp({ randomInt: () => 0, env: { RATE_LIMIT_PER_GAME: '3' } })
    const t1 = (await app.createUnlimited(['C'])).json.token
    for (let i = 0; i < 4; i++) await app.state(t1)
    const t2 = (await app.createUnlimited(['D'])).json.token
    expect([(await app.state(t1)).status, (await app.state(t2)).status]).toEqual([429, 200])
  })

  it('BE-RL-07 se recupera tras la ventana (reloj +61 s)', async () => {
    const app = await startTestApp({ env: { RATE_LIMIT_CREATE_GAME: '2' } })
    await app.createDaily()
    await app.createDaily()
    expect((await app.createDaily()).status).toBe(429)
    app.clock.now += 61_000
    expect((await app.createDaily()).status).toBe(200)
  })

  it('BE-RL-07 Retry-After no supera la ventana de 60 s', async () => {
    const app = await startTestApp({ env: { RATE_LIMIT_CREATE_GAME: '1' } })
    await app.createDaily()
    const r = await app.createDaily()
    expect(Number(r.headers.get('retry-after'))).toBeLessThanOrEqual(60)
  })

  it('BE-RL-08 TRUST_PROXY=1: IPs distintas en X-Forwarded-For no comparten limite', async () => {
    const app = await startTestApp({ env: { TRUST_PROXY: '1', RATE_LIMIT_CREATE_GAME: '3' } })
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await app.createDaily(xff(i + 1))).status)
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200])
  })

  it('BE-RL-08 TRUST_PROXY=1: la misma IP reenviada si comparte limite', async () => {
    const app = await startTestApp({ env: { TRUST_PROXY: '1', RATE_LIMIT_CREATE_GAME: '3' } })
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await app.createDaily(xff(7))).status)
    expect(statuses).toEqual([200, 200, 200, 429])
  })

  it('BE-RL-08 TRUST_PROXY=0: X-Forwarded-For se ignora (no se evita el limite cambiando la cabecera)', async () => {
    const app = await startTestApp({ env: { TRUST_PROXY: '0', RATE_LIMIT_CREATE_GAME: '3' } })
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await app.createDaily(xff(i + 1))).status)
    expect(statuses).toEqual([200, 200, 200, 429])
  })

  it('BE-RL-10 flujo normal completo (6 intentos, recarga y ALREADY_GUESSED) no dispara el limite con los valores por defecto', async () => {
    const app = await startTestApp({
      randomInt: () => 0,
      env: { RATE_LIMIT_GLOBAL: '120', RATE_LIMIT_CREATE_GAME: '20', RATE_LIMIT_ACTION: '40', RATE_LIMIT_CLIPS: '30', RATE_LIMIT_PER_GAME: '12' },
    })
    const all: number[] = []
    const g = await app.createUnlimited(['C'])
    let view = g.json
    all.push(g.status, (await app.clip(view.clipUrl)).status)
    const songs = [A1, 'a-two-song-02', 'b-one-song-03', 'b-two-song-04', 'ab-multi-game-song-017']
    for (let i = 0; i < songs.length; i++) {
      const r = await app.guess(view.token, songs[i])
      all.push(r.status)
      view = r.json
      all.push((await app.clip(view.clipUrl)).status)
      if (i === 1) all.push((await app.state(view.token)).status) // recarga
      if (i === 2) all.push((await app.guess(view.token, songs[i])).status === 429 ? 429 : 0) // duplicado (409 esperado -> 0)
    }
    all.push((await app.guess(view.token, 'c-only-song-05')).status)
    expect(all).not.toContain(429)
  })

  it('BE-RL-11 los rechazos ALREADY_GUESSED cuentan para el limite por partida', async () => {
    const app = await startTestApp({ randomInt: () => 0, env: { RATE_LIMIT_PER_GAME: '12' } })
    const g = await app.createUnlimited(['C'])
    const first = await app.guess(g.json.token, A1)
    const statuses: number[] = []
    for (let i = 0; i < 15; i++) statuses.push((await app.guess(first.json.token, A1)).status)
    expect(statuses.slice(0, 5)).toEqual([409, 409, 409, 409, 409])
    expect(statuses).toContain(429)
  })

  it('BE-RL-11 los rechazos ALREADY_GUESSED cuentan para el limite por IP', async () => {
    const app = await startTestApp({ randomInt: () => 0, env: { RATE_LIMIT_ACTION: '5' } })
    const g = await app.createUnlimited(['C'])
    const first = await app.guess(g.json.token, A1)
    const statuses: number[] = []
    for (let i = 0; i < 8; i++) statuses.push((await app.guess(first.json.token, A1)).status)
    expect(statuses).toContain(429)
  })
})
