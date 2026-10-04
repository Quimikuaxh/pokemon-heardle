import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { loadConfig } from '../../src/config'
import { thrown } from '../helpers/errors'

const secret = () => randomBytes(32).toString('base64')
const ok = (over: Record<string, string | undefined> = {}) => ({
  GAME_TOKEN_SECRET: secret(),
  DAILY_SEED: 'a-long-random-daily-seed',
  STORAGE_DRIVER: 'fs',
  STORAGE_DIR: '/tmp/x',
  ALLOWED_ORIGIN: 'https://pokemon-heardle.vercel.app',
  ...over,
})

describe('config loadConfig', () => {
  it('BE-CFG-01 falta GAME_TOKEN_SECRET -> lanza', () => {
    expect(() => loadConfig(ok({ GAME_TOKEN_SECRET: undefined }))).toThrow(/^(?!not implemented)/)
  })

  it('BE-CFG-01 falta DAILY_SEED -> lanza', () => {
    expect(() => loadConfig(ok({ DAILY_SEED: undefined }))).toThrow(/^(?!not implemented)/)
  })

  it('BE-CFG-01 DAILY_SEED vacio -> lanza', () => {
    expect(() => loadConfig(ok({ DAILY_SEED: '' }))).toThrow(/^(?!not implemented)/)
  })

  it('BE-CFG-02 GAME_TOKEN_SECRET de 31 bytes -> lanza', () => {
    expect(() => loadConfig(ok({ GAME_TOKEN_SECRET: randomBytes(31).toString('base64') }))).toThrow(/^(?!not implemented)/)
  })

  it('BE-CFG-02 GAME_TOKEN_SECRET de 32 bytes -> acepta', () => {
    expect(() => loadConfig(ok({ GAME_TOKEN_SECRET: randomBytes(32).toString('base64') }))).not.toThrow(/^(?!not implemented)/)
  })

  it('BE-CFG-02 el mensaje de error no incluye el secreto', () => {
    const short = randomBytes(8).toString('base64')
    const e = thrown(() => loadConfig(ok({ GAME_TOKEN_SECRET: short })))
    expect(String(e?.message)).toMatch(/^(?!not implemented)/)
    expect(String(e?.message)).not.toContain(short)
  })

  it('BE-CFG-03 STORAGE_DRIVER=s3 sin claves/endpoint/bucket -> lanza', () => {
    expect(() => loadConfig(ok({ STORAGE_DRIVER: 's3' }))).toThrow(/^(?!not implemented)/)
  })

  it('BE-CFG-03 STORAGE_DRIVER=s3 incompleto no imprime la clave secreta', () => {
    const e = thrown(() =>
      loadConfig(ok({ STORAGE_DRIVER: 's3', STORAGE_S3_SECRET_ACCESS_KEY: 'SUPER-SECRET-VALUE-123' })),
    )
    expect(String(e?.message)).toMatch(/^(?!not implemented)/)
    expect(String(e?.message)).not.toContain('SUPER-SECRET-VALUE-123')
  })

  it('BE-CFG-03 s3 completo -> acepta', () => {
    expect(() =>
      loadConfig(
        ok({
          STORAGE_DRIVER: 's3',
          STORAGE_BUCKET: 'heardle-audio',
          STORAGE_S3_ENDPOINT: 'https://ref.supabase.co/storage/v1/s3',
          STORAGE_S3_REGION: 'eu-west-1',
          STORAGE_S3_ACCESS_KEY_ID: 'id',
          STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
        }),
      ),
    ).not.toThrow(/^(?!not implemented)/)
  })

  it('BE-CFG-03 driver desconocido -> lanza', () => {
    expect(() => loadConfig(ok({ STORAGE_DRIVER: 'gcs' }))).toThrow(/^(?!not implemented)/)
  })

  it('BE-CFG-04 defaults: TTL 60, cache 32 MB, TRUST_PROXY 1', () => {
    const c: any = loadConfig(ok())
    expect([c.clipTicketTtlSec, c.clipCacheMb, c.trustProxy]).toEqual([60, 32, 1])
  })

  it('BE-CFG-04 defaults de rate-limit: 120 global, 20 crear, 40 acciones, 30 clips, 12 por partida', () => {
    const c: any = loadConfig(ok())
    expect(c.rateLimit).toEqual({ global: 120, createGame: 20, action: 40, clips: 30, perGame: 12 })
  })

  it('BE-RL-09 RATE_LIMIT_* por env se aplican', () => {
    const c: any = loadConfig(
      ok({ RATE_LIMIT_GLOBAL: '5', RATE_LIMIT_CREATE_GAME: '2', RATE_LIMIT_ACTION: '3', RATE_LIMIT_CLIPS: '4', RATE_LIMIT_PER_GAME: '6' }),
    )
    expect(c.rateLimit).toEqual({ global: 5, createGame: 2, action: 3, clips: 4, perGame: 6 })
  })

  it('BE-CFG-04 TTL y TRUST_PROXY configurables', () => {
    const c: any = loadConfig(ok({ CLIP_TICKET_TTL_SEC: '5', TRUST_PROXY: '0', CLIP_CACHE_MB: '8' }))
    expect([c.clipTicketTtlSec, c.trustProxy, c.clipCacheMb]).toEqual([5, 0, 8])
  })

  it('BE-CFG-05 no hay variables especificas de Render (RENDER_*) en la config', () => {
    const c = loadConfig(ok({ RENDER: 'true', RENDER_EXTERNAL_URL: 'https://x.onrender.com' } as any))
    expect(JSON.stringify(c)).not.toMatch(/render/i)
  })
})

describe('config: limites >= 1', () => {
  const base = { GAME_TOKEN_SECRET: randomBytes(32).toString('base64'), DAILY_SEED: 'seed', STORAGE_DRIVER: 'fs' }
  for (const name of ['RATE_LIMIT_GLOBAL', 'RATE_LIMIT_CREATE_GAME', 'RATE_LIMIT_ACTION', 'RATE_LIMIT_CLIPS', 'RATE_LIMIT_PER_GAME']) {
    it(`${name}=0 lanza y ${name}=1 se acepta`, () => {
      expect(() => loadConfig({ ...base, [name]: '0' })).toThrow(name)
      expect(() => loadConfig({ ...base, [name]: '1' })).not.toThrow()
    })
  }
})
