import { describe, it, expect } from 'vitest'
import { encryptToken, decryptToken } from '../../src/game/token'
import { SECRET_A, SECRET_B } from '../helpers/secrets'
import { thrown } from '../helpers/errors'

const NOW_S = 1_800_000_000
const NOW_MS = NOW_S * 1000

function payload(over: Record<string, unknown> = {}): any {
  return {
    v: 1,
    n: '0123456789abcdef',
    m: 'u',
    k: 'aaaaaaaaaaaaaaaa',
    r: [],
    q: [],
    iat: NOW_S,
    exp: NOW_S + 3600,
    ...over,
  }
}

const b64uDecode = (s: string) => Buffer.from(s, 'base64url')
const b64uEncode = (b: Buffer) => b.toString('base64url')
const codeOf = (fn: () => unknown) => thrown(fn)?.code

describe('game/token', () => {
  it('BE-TOK-01 ida y vuelta de un payload ilimitado (sin d)', () => {
    const p = payload()
    expect(decryptToken(encryptToken(p, SECRET_A), SECRET_A, NOW_MS)).toEqual(p)
  })

  it('BE-TOK-01 ida y vuelta de un payload diario (con d)', () => {
    const p = payload({ m: 'd', d: '2026-10-03', r: ['M', 'S', 'G'], q: ['1111111111111111', '2222222222222222'] })
    expect(decryptToken(encryptToken(p, SECRET_A), SECRET_A, NOW_MS)).toEqual(p)
  })

  it('BE-TOK-02 formato de red: base64url sin + / =', () => {
    expect(encryptToken(payload(), SECRET_A)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('BE-TOK-02 decodifica a iv(12) + ciphertext(384 con padding) + tag(16)', () => {
    expect(b64uDecode(encryptToken(payload(), SECRET_A)).length).toBe(12 + 384 + 16)
  })

  for (const [name, offset] of [
    ['iv', (len: number) => 0],
    ['ciphertext', (len: number) => 12 + 10],
    ['tag', (len: number) => len - 1],
  ] as Array<[string, (len: number) => number]>) {
    it(`BE-TOK-03 alterar un byte del ${name} -> TOKEN_INVALID`, () => {
      const buf = b64uDecode(encryptToken(payload(), SECRET_A))
      buf[offset(buf.length)] ^= 0x01
      expect(codeOf(() => decryptToken(b64uEncode(buf), SECRET_A, NOW_MS))).toBe('TOKEN_INVALID')
    })
  }

  for (const [label, t] of [
    ['vacio', ''],
    ['no base64', '!!!***???'],
    ['demasiado corto', 'abcd'],
    ['basura larga', 'A'.repeat(700)],
    ['espacios', ' '],
  ] as Array<[string, string]>) {
    it(`BE-TOK-04 token ${label} -> TOKEN_INVALID sin excepcion no controlada`, () => {
      expect(codeOf(() => decryptToken(t, SECRET_A, NOW_MS))).toBe('TOKEN_INVALID')
    })
  }

  it('BE-TOK-04 token truncado -> TOKEN_INVALID', () => {
    const t = encryptToken(payload(), SECRET_A)
    expect(codeOf(() => decryptToken(t.slice(0, t.length - 10), SECRET_A, NOW_MS))).toBe('TOKEN_INVALID')
  })

  it('BE-TOK-04 token con caracteres extra -> TOKEN_INVALID', () => {
    const t = encryptToken(payload(), SECRET_A)
    expect(codeOf(() => decryptToken(t + 'AAAA', SECRET_A, NOW_MS))).toBe('TOKEN_INVALID')
  })

  it('BE-TOK-05 token caducado -> TOKEN_INVALID', () => {
    const t = encryptToken(payload({ exp: NOW_S - 1 }), SECRET_A)
    expect(codeOf(() => decryptToken(t, SECRET_A, NOW_MS))).toBe('TOKEN_INVALID')
  })

  it('BE-TOK-06 un segundo antes de exp es valido', () => {
    const t = encryptToken(payload({ exp: NOW_S }), SECRET_A)
    expect(decryptToken(t, SECRET_A, (NOW_S - 1) * 1000).exp).toBe(NOW_S)
  })

  it('BE-TOK-06 un segundo despues de exp es invalido (la frontera exacta no se fija)', () => {
    const t = encryptToken(payload({ exp: NOW_S }), SECRET_A)
    expect(codeOf(() => decryptToken(t, SECRET_A, (NOW_S + 1) * 1000))).toBe('TOKEN_INVALID')
  })

  it('BE-TOK-07 version distinta de 1 -> TOKEN_INVALID', () => {
    const t = encryptToken(payload({ v: 2 }), SECRET_A)
    expect(codeOf(() => decryptToken(t, SECRET_A, NOW_MS))).toBe('TOKEN_INVALID')
  })

  it('BE-TOK-08 misma longitud con ids de cancion de 13 y 22 caracteres (clipKey distintos)', () => {
    // el token solo lleva clipKey (16 hex); este test fija que nada dependiente del id altera la longitud
    const a = encryptToken(payload({ k: '1111111111111111' }), SECRET_A)
    const b = encryptToken(payload({ k: 'ffffffffffffffff' }), SECRET_A)
    expect(a.length).toBe(b.length)
  })

  it('BE-TOK-09 misma longitud para 0..6 resultados, 0..6 q y modos d/u', () => {
    const keys = ['1', '2', '3', '4', '5', '6'].map((c) => c.repeat(16))
    const lengths = new Set<number>()
    for (const m of ['u', 'd']) {
      for (let n = 0; n <= 6; n++) {
        const p = payload({
          m,
          ...(m === 'd' ? { d: '2026-10-03' } : {}),
          r: ['M', 'G', 'S', 'M', 'M', 'M'].slice(0, n),
          q: keys.slice(0, n),
        })
        lengths.add(encryptToken(p, SECRET_A).length)
      }
    }
    expect(lengths.size).toBe(1)
  })

  it('BE-TOK-10 peor caso (diario, r y q con 6, valores maximos) cabe en 384 bytes', () => {
    const p = payload({
      m: 'd',
      d: '2026-12-31',
      r: ['M', 'M', 'M', 'M', 'M', 'G'],
      q: ['f'.repeat(16), 'e'.repeat(16), 'd'.repeat(16), 'c'.repeat(16), 'b'.repeat(16), 'a'.repeat(16)],
      n: 'f'.repeat(16),
      k: 'f'.repeat(16),
      iat: 9_999_999_999,
      exp: 9_999_999_999 + 99_999,
    })
    expect(decryptToken(encryptToken(p, SECRET_A), SECRET_A, 9_999_999_999 * 1000)).toEqual(p)
  })

  it('BE-TOK-10 un payload que no cabe lanza al emitir (nunca token de otra longitud)', () => {
    const p = payload({ extra: 'x'.repeat(1000) })
    expect(() => encryptToken(p, SECRET_A)).toThrow(/^(?!not implemented)/)
  })

  it('BE-TOK-11 el token no contiene en claro ni en base64 decodificado el clipKey', () => {
    const k = 'c0ffee1234567890'
    const t = encryptToken(payload({ k }), SECRET_A)
    expect(t).not.toContain(k)
    expect(b64uDecode(t).toString('latin1')).not.toContain(k)
    expect(b64uDecode(t).toString('hex')).not.toContain(Buffer.from(k).toString('hex'))
  })

  it('BE-TOK-12 mismo payload dos veces da tokens distintos (iv aleatorio)', () => {
    const p = payload()
    expect(encryptToken(p, SECRET_A)).not.toBe(encryptToken(p, SECRET_A))
  })

  it('BE-TOK-13 un token no vale como ticket: HKDF con etiquetas distintas', async () => {
    const { TicketService } = await import('../../src/game/tickets')
    const svc = new TicketService({ secret: SECRET_A, ttlSec: 60, now: () => NOW_MS })
    const t = encryptToken(payload(), SECRET_A)
    expect(thrown(() => svc.redeem(t))?.code).toBe('CLIP_TICKET_INVALID')
  })

  it('BE-TOK-13 un ticket no vale como token', async () => {
    const { TicketService } = await import('../../src/game/tickets')
    const svc = new TicketService({ secret: SECRET_A, ttlSec: 60, now: () => NOW_MS })
    const ticket = svc.issue({ clipKey: 'aaaaaaaaaaaaaaaa', attempt: 0, nonce: '0123456789abcdef' })
    expect(codeOf(() => decryptToken(ticket, SECRET_A, NOW_MS))).toBe('TOKEN_INVALID')
  })

  it('BE-TOK-14 token cifrado con otro GAME_TOKEN_SECRET -> TOKEN_INVALID', () => {
    const t = encryptToken(payload(), SECRET_B)
    expect(codeOf(() => decryptToken(t, SECRET_A, NOW_MS))).toBe('TOKEN_INVALID')
  })

  it('BE-TOK-16 el payload ilimitado no tiene campo f y dos filtros dan las mismas claves', async () => {
    const { createPayload } = await import('../../src/game/engine')
    const { catalogR } = await import('../helpers/fixtures')
    const target = catalogR().songs[0] as any
    const p1: any = createPayload({ mode: 'unlimited', target, nowMs: NOW_MS })
    const p2: any = createPayload({ mode: 'unlimited', target, nowMs: NOW_MS })
    const dec1 = decryptToken(encryptToken(p1, SECRET_A), SECRET_A, NOW_MS) as any
    expect('f' in dec1).toBe(false)
    expect(Object.keys(p1).sort()).toEqual(Object.keys(p2).sort())
  })

  it('BE-TOK-17 q admite 0, 1 y 6 elementos con longitud fija y descifrado identico', () => {
    const six = ['1', '2', '3', '4', '5', '6'].map((c) => c.repeat(16))
    const lengths = new Set<number>()
    for (const n of [0, 1, 6]) {
      // DEC-21: q.length <= r.length
      const p = payload({ r: Array(n).fill('M'), q: six.slice(0, n) })
      const t = encryptToken(p, SECRET_A)
      lengths.add(t.length)
      expect(decryptToken(t, SECRET_A, NOW_MS).q).toEqual(six.slice(0, n))
    }
    expect(lengths.size).toBe(1)
  })

  for (const [label, q] of [
    ['no array', 'aaaaaaaaaaaaaaaa'],
    ['elemento no hex', ['zzzzzzzzzzzzzzzz']],
    ['elemento de 15 hex', ['aaaaaaaaaaaaaaa']],
    ['elemento no string', [1234567890123456]],
    ['duplicados', ['aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa']],
    ['mas de 6 elementos', ['1', '2', '3', '4', '5', '6', '7'].map((c) => c.repeat(16))],
  ] as Array<[string, unknown]>) {
    it(`BE-TOK-18 q mal formado (${label}) -> TOKEN_INVALID`, () => {
      const t = encryptToken(payload({ q }), SECRET_A)
      expect(codeOf(() => decryptToken(t, SECRET_A, NOW_MS))).toBe('TOKEN_INVALID')
    })
  }

  it('BE-TOK-18 r con simbolo desconocido -> TOKEN_INVALID', () => {
    const t = encryptToken(payload({ r: ['X'] }), SECRET_A)
    expect(codeOf(() => decryptToken(t, SECRET_A, NOW_MS))).toBe('TOKEN_INVALID')
  })
})
