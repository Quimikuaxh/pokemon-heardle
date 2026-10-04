import { describe, it, expect } from 'vitest'
import { TicketService } from '../../src/game/tickets'
import { SECRET_A } from '../helpers/secrets'
import { thrown } from '../helpers/errors'

const NONCE = '0123456789abcdef'
const KEY = 'aaaaaaaaaaaaaaaa'

function make(ttlSec = 60, startMs = 1_800_000_000_000) {
  const clock = { now: startMs }
  const svc = new TicketService({ secret: SECRET_A, ttlSec, now: () => clock.now })
  return { svc, clock }
}

describe('game/tickets', () => {
  it('BE-TKT-01 emite y canjea: devuelve clipKey, intento y nonce', () => {
    const { svc } = make()
    const t = svc.issue({ clipKey: KEY, attempt: 3, nonce: NONCE })
    expect(svc.redeem(t)).toEqual({ clipKey: KEY, attempt: 3, nonce: NONCE })
  })

  it('BE-TKT-02 un solo uso: el segundo canje -> CLIP_TICKET_USED', () => {
    const { svc } = make()
    const t = svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE })
    svc.redeem(t)
    expect(thrown(() => svc.redeem(t))?.code).toBe('CLIP_TICKET_USED')
  })

  it('BE-TKT-02 el error de ticket usado es 410', () => {
    const { svc } = make()
    const t = svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE })
    svc.redeem(t)
    expect(thrown(() => svc.redeem(t))?.status).toBe(410)
  })

  it('BE-TKT-03 caducado (now > exp) -> CLIP_TICKET_USED', () => {
    const { svc, clock } = make(60)
    const t = svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE })
    clock.now += 61_000
    expect(thrown(() => svc.redeem(t))?.code).toBe('CLIP_TICKET_USED')
  })

  it('BE-TKT-04 frontera TTL: a exp-1s valido', () => {
    const { svc, clock } = make(60)
    const t = svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE })
    clock.now += 59_000
    expect(svc.redeem(t).clipKey).toBe(KEY)
  })

  it('BE-TKT-04 frontera TTL: a exp+1s caducado', () => {
    const { svc, clock } = make(60)
    const t = svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE })
    clock.now += 61_000
    expect(thrown(() => svc.redeem(t))?.code).toBe('CLIP_TICKET_USED')
  })

  it('BE-TKT-05 el TTL configurable se respeta (5 s)', () => {
    const { svc, clock } = make(5)
    const t = svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE })
    clock.now += 6_000
    expect(thrown(() => svc.redeem(t))?.code).toBe('CLIP_TICKET_USED')
  })

  it('BE-TKT-05 con TTL 5 s sigue valido a los 4 s', () => {
    const { svc, clock } = make(5)
    const t = svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE })
    clock.now += 4_000
    expect(svc.redeem(t).attempt).toBe(0)
  })

  for (const [label, mut] of [
    ['truncado', (t: string) => t.slice(0, t.length - 8)],
    ['un byte cambiado', (t: string) => t.slice(0, 10) + (t[10] === 'A' ? 'B' : 'A') + t.slice(11)],
    ['basura', () => 'zzzz'],
    ['vacio', () => ''],
  ] as Array<[string, (t: string) => string]>) {
    it(`BE-TKT-06 ticket ${label} -> CLIP_TICKET_INVALID (404)`, () => {
      const { svc } = make()
      const t = svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE })
      const e = thrown(() => svc.redeem(mut(t)))
      expect([e?.code, e?.status]).toEqual(['CLIP_TICKET_INVALID', 404])
    })
  }

  it('BE-TKT-07 misma longitud entre clipKeys e indices 0..5', () => {
    const { svc } = make()
    const lengths = new Set<number>()
    for (const k of ['0000000000000000', 'ffffffffffffffff', KEY])
      for (let a = 0; a < 6; a++) lengths.add(svc.issue({ clipKey: k, attempt: a, nonce: NONCE }).length)
    expect(lengths.size).toBe(1)
  })

  it('BE-TKT-08 el ticket no contiene en claro el clipKey (cadena ni bytes decodificados)', () => {
    const { svc } = make()
    const k = 'c0ffee1234567890'
    const t = svc.issue({ clipKey: k, attempt: 1, nonce: NONCE })
    expect(t).not.toContain(k)
    expect(Buffer.from(t, 'base64url').toString('latin1')).not.toContain(k)
  })

  it('BE-TKT-12 el registro de usados se purga al expirar (memoria acotada)', () => {
    const { svc, clock } = make(60)
    for (let i = 0; i < 1000; i++) svc.redeem(svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE }))
    expect(svc.usedCount()).toBe(1000)
    clock.now += 61_000
    svc.redeem(svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE }))
    expect(svc.usedCount()).toBeLessThanOrEqual(1)
  })

  it('BE-TKT-13 dos canjes simultaneos del mismo ticket: exactamente uno ok', async () => {
    const { svc } = make()
    const t = svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE })
    const results = await Promise.allSettled([0, 1].map(async () => svc.redeem(t)))
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1)
  })

  it('BE-TKT-14 tras reinicio simulado (registro vacio) un ticket vivo se reutiliza una vez (documenta AR 13)', () => {
    const a = make(60)
    const t = a.svc.issue({ clipKey: KEY, attempt: 0, nonce: NONCE })
    a.svc.redeem(t)
    const restarted = new TicketService({ secret: SECRET_A, ttlSec: 60, now: () => a.clock.now })
    expect(restarted.redeem(t).clipKey).toBe(KEY)
  })
})

describe('ticket de un solo uso: forma canonica', () => {
  const NOW_MS = 1_800_000_000_000
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
