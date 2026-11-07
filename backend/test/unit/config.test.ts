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

  it('BE-CFG-03 STORAGE_DRIVER=s3 ya no existe (Render retirado, DEC-57) -> lanza', () => {
    expect(() => loadConfig(ok({ STORAGE_DRIVER: 's3' }))).toThrow(/STORAGE_DRIVER/)
  })

  it('BE-CFG-03 la configuracion de supabase incompleta no imprime la clave', () => {
    const e = thrown(() => loadConfig(ok({ STORAGE_DRIVER: 'supabase', SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'SUPER-SECRET-VALUE-123' })))
    expect(String(e?.message)).toContain('STORAGE_BUCKET')
    expect(String(e?.message)).not.toContain('SUPER-SECRET-VALUE-123')
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

  it('BE-CFG-09 STORAGE_DRIVER=supabase exige SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y STORAGE_BUCKET (DEC-57)', () => {
    const supa = { STORAGE_DRIVER: 'supabase', SUPABASE_URL: 'https://ref.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', STORAGE_BUCKET: 'heardle-audio' }
    expect(loadConfig(ok(supa)).storageDriver).toBe('supabase')
    for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STORAGE_BUCKET']) {
      expect(thrown(() => loadConfig(ok({ ...supa, [name]: undefined }))).message).toContain(name)
    }
  })

  it('BE-CFG-09 RATE_LIMIT_STORE: memory por defecto; postgres exige las credenciales de Supabase; otro valor lanza', () => {
    expect(loadConfig(ok()).rateLimitStore).toBe('memory')
    expect(() => loadConfig(ok({ RATE_LIMIT_STORE: 'postgres' }))).toThrow(/SUPABASE_URL/)
    expect(() => loadConfig(ok({ RATE_LIMIT_STORE: 'redis' }))).toThrow(/RATE_LIMIT_STORE/)
  })

  it('BE-CFG-09 CATALOG_WAIT_MS: 0 por defecto', () => {
    expect(loadConfig(ok()).catalogWaitMs).toBe(0)
    expect(loadConfig(ok({ CATALOG_WAIT_MS: '8000' })).catalogWaitMs).toBe(8000)
  })
})
