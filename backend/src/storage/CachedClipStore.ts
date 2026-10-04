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

  evict(clipKey: string): void {
    this.cache.delete(clipKey)
  }

  async getClip(clipKey: string): Promise<Buffer> {
    const cached = this.cache.get(clipKey)
    if (cached) return cached
    const clip = await this.inner.getClip(clipKey)
    this.cache.set(clipKey, clip)
    return clip
  }
}
