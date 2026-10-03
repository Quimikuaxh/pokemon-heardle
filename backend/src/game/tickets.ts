import { errors } from '../http/errors'
import { open, seal } from './sealedBox'

const TICKET_PADDED_BYTES = 128
const HEX16 = /^[0-9a-f]{16}$/

export interface TicketContent {
  clipKey: string
  attempt: number
  nonce: string
}

interface TicketPayload {
  k: string
  a: number
  n: string
  exp: number
}

function isValidShape(value: any): value is TicketPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.k === 'string' &&
    HEX16.test(value.k) &&
    Number.isInteger(value.a) &&
    value.a >= 0 &&
    typeof value.n === 'string' &&
    Number.isFinite(value.exp)
  )
}

// El IV (12 B aleatorios) identifica el ticket; `open` ya garantiza que el texto es canonico.
const ticketIdentity = (ticket: string): string => Buffer.from(ticket, 'base64url').subarray(0, 12).toString('hex')

export class TicketService {
  private readonly secret: string
  private readonly ttlMs: number
  private readonly now: () => number
  // Insertion order == expiry order (TTL constante), asi la purga es O(1) amortizado.
  private readonly used = new Map<string, number>()

  constructor(options: { secret: string; ttlSec: number; now: () => number }) {
    this.secret = options.secret
    this.ttlMs = options.ttlSec * 1000
    this.now = options.now
  }

  issue(content: TicketContent): string {
    const payload: TicketPayload = {
      k: content.clipKey,
      a: content.attempt,
      n: content.nonce,
      exp: this.now() + this.ttlMs,
    }
    return seal(payload, this.secret, 'ticket', TICKET_PADDED_BYTES)
  }

  /** Canje de un solo uso. Sincrono: la comprobacion y la marca no se pueden intercalar. */
  redeem(ticket: string): TicketContent {
    const payload = open(ticket, this.secret, 'ticket', TICKET_PADDED_BYTES)
    if (!isValidShape(payload)) throw errors.clipTicketInvalid()
    const now = this.now()
    this.purgeExpired(now)
    const identity = ticketIdentity(ticket)
    if (now > payload.exp || this.used.has(identity)) throw errors.clipTicketUsed()
    this.used.set(identity, payload.exp)
    return { clipKey: payload.k, attempt: payload.a, nonce: payload.n }
  }

  /** Devuelve un ticket canjeado al estado "sin usar" (el almacen fallo y el cliente puede reintentar). */
  release(ticket: string): void {
    this.used.delete(ticketIdentity(ticket))
  }

  usedCount(): number {
    return this.used.size
  }

  private purgeExpired(now: number): void {
    for (const [ticket, exp] of this.used) {
      if (exp >= now) break
      this.used.delete(ticket)
    }
  }
}
