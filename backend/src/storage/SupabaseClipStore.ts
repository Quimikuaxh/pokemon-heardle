import { errors } from '../http/errors'
import type { ClipStore } from './ClipStore'
import { isValidClipLocation } from './clipLocation'

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

const READ_TIMEOUT_MS = 15_000

/**
 * Lee del bucket privado con la API REST de Storage y la clave service_role (Edge Function, DEC-57).
 * Mismas claves que sube el script de catalogo: catalog/catalog.json y clips/<clipKey>.mp3.
 */
export class SupabaseClipStore implements ClipStore {
  private readonly baseUrl: string
  private readonly fetchFn: FetchFn

  constructor(
    private readonly options: { url: string; serviceRoleKey: string; bucket: string; fetchFn?: FetchFn },
  ) {
    this.baseUrl = `${options.url.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(options.bucket)}`
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
  }

  async getCatalog(): Promise<unknown> {
    try {
      return JSON.parse((await this.readObject('catalog/catalog.json')).toString('utf8'))
    } catch {
      throw errors.storage()
    }
  }

  async getClip(clipKey: string): Promise<Buffer> {
    if (!isValidClipLocation(clipKey)) throw errors.storage()
    try {
      return await this.readObject(`clips/${clipKey}.mp3`)
    } catch {
      throw errors.storage()
    }
  }

  private async readObject(key: string): Promise<Buffer> {
    const response = await this.fetchFn(`${this.baseUrl}/${key}`, {
      headers: { Authorization: `Bearer ${this.options.serviceRoleKey}`, apikey: this.options.serviceRoleKey },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`Storage respondio ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }
}
