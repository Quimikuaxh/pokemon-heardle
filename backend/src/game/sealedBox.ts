import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

export type KeyLabel = 'token' | 'ticket'

const keyCache = new Map<string, Buffer>()

// Claves distintas por etiqueta: un token no descifra como ticket ni al reves.
function deriveKey(secretBase64: string, label: KeyLabel): Buffer {
  const cacheKey = `${label}:${secretBase64}`
  let key = keyCache.get(cacheKey)
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', Buffer.from(secretBase64, 'base64'), Buffer.alloc(0), label, KEY_BYTES))
    keyCache.set(cacheKey, key)
  }
  return key
}

/**
 * AES-256-GCM con el JSON relleno con espacios a `paddedBytes`: toda salida mide lo mismo
 * y no delata el contenido (ARQUITECTURA DEC-03). Lanza si no cabe.
 */
export function seal(value: unknown, secretBase64: string, label: KeyLabel, paddedBytes: number): string {
  const json = Buffer.from(JSON.stringify(value), 'utf8')
  if (json.length > paddedBytes) {
    throw new Error(`El contenido (${json.length} B) no cabe en ${paddedBytes} B`)
  }
  const plain = Buffer.alloc(paddedBytes, 0x20)
  json.copy(plain)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secretBase64, label), iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')
}

/** Devuelve el valor descifrado o `undefined` si el texto no es un sello valido. */
export function open(text: string, secretBase64: string, label: KeyLabel, paddedBytes: number): unknown {
  if (typeof text !== 'string' || !BASE64URL_PATTERN.test(text)) return undefined
  const raw = Buffer.from(text, 'base64url')
  // base64url ignora los bits sobrantes del ultimo caracter: sin esto, un sufijo o un ultimo caracter
  // distinto descifra igual y daria identidades distintas a un mismo ticket.
  if (raw.toString('base64url') !== text) return undefined
  if (raw.length !== IV_BYTES + paddedBytes + TAG_BYTES) return undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secretBase64, label), raw.subarray(0, IV_BYTES))
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES))
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()])
    return JSON.parse(plain.toString('utf8'))
  } catch {
    return undefined
  }
}
