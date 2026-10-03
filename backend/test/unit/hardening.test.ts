import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { encryptToken, decryptToken } from '../../src/game/token'
import { TicketService } from '../../src/game/tickets'
import { loadConfig } from '../../src/config'
import { SECRET_A } from '../helpers/secrets'
import { thrown } from '../helpers/errors'

const NOW_S = 1_800_000_000
const NOW_MS = NOW_S * 1000
const payload = (over: Record<string, unknown> = {}): any => ({
  v: 1, n: '0123456789abcdef', m: 'u', k: 'aaaaaaaaaaaaaaaa', r: [], q: [], iat: NOW_S, exp: NOW_S + 3600, ...over,
})

describe('ticket de un solo uso: forma canonica', () => {
  for (const suffix of ['A', '_', '-', 'AA']) {
    it(`un ticket con sufijo ${JSON.stringify(suffix)} no descifra ni burla el un-solo-uso`, () => {
      const svc = new TicketService({ secret: SECRET_A, ttlSec: 60, now: () => NOW_MS })
      const ticket = svc.issue({ clipKey: 'aaaaaaaaaaaaaaaa', attempt: 0, nonce: '0123456789abcdef' })
      svc.redeem(ticket)
      expect(thrown(() => svc.redeem(ticket + suffix))?.code).toBe('CLIP_TICKET_INVALID')
      expect(thrown(() => svc.redeem(ticket))?.code).toBe('CLIP_TICKET_USED')
    })
  }

  it('cambiar solo los bits sobrantes del ultimo caracter tampoco da un ticket distinto', () => {
    const svc = new TicketService({ secret: SECRET_A, ttlSec: 60, now: () => NOW_MS })
    const ticket = svc.issue({ clipKey: 'aaaaaaaaaaaaaaaa', attempt: 0, nonce: '0123456789abcdef' })
    svc.redeem(ticket)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    for (const ch of alphabet) {
      const variant = ticket.slice(0, -1) + ch
      if (variant === ticket) continue
      expect(['CLIP_TICKET_INVALID', 'CLIP_TICKET_USED']).toContain(thrown(() => svc.redeem(variant))?.code)
    }
  })
})

describe('token: forma canonica y q <= r (DEC-21)', () => {
  it('un token con sufijo base64url no descifra', () => {
    const t = encryptToken(payload(), SECRET_A)
    for (const s of ['A', '_', '-']) expect(thrown(() => decryptToken(t + s, SECRET_A, NOW_MS))?.code).toBe('TOKEN_INVALID')
  })

  it('q con mas elementos que r -> TOKEN_INVALID', () => {
    const t = encryptToken(payload({ r: ['M'], q: ['1111111111111111', '2222222222222222'] }), SECRET_A)
    expect(thrown(() => decryptToken(t, SECRET_A, NOW_MS))?.code).toBe('TOKEN_INVALID')
  })

  it('q con tantos elementos como r es valido', () => {
    const p = payload({ r: ['M', 'S'], q: ['1111111111111111', '2222222222222222'] })
    expect(decryptToken(encryptToken(p, SECRET_A), SECRET_A, NOW_MS)).toEqual(p)
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
