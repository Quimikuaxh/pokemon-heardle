import type { ClipStore } from './ClipStore'
import type { LruCache } from './LruCache'

export class CachedClipStore implements ClipStore {
  constructor(
    private readonly inner: ClipStore,
    private readonly cache: LruCache,
  ) {}

  getCatalog(): Promise<unknown> {
    return this.inner.getCatalog()
  }

  async getClip(clipKey: string, clipNumber: number): Promise<Buffer> {
    const cacheKey = `${clipKey}/${clipNumber}`
    const cached = this.cache.get(cacheKey)
    if (cached) return cached
    const clip = await this.inner.getClip(clipKey, clipNumber)
    this.cache.set(cacheKey, clip)
    return clip
  }
}
