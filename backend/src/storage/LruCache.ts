export class LruCache {
  private readonly entries = new Map<string, Buffer>()
  private totalBytes = 0

  constructor(private readonly maxBytes: number) {}

  get bytes(): number {
    return this.totalBytes
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  get(key: string): Buffer | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: Buffer): void {
    this.remove(key)
    if (value.length > this.maxBytes) return
    while (this.totalBytes + value.length > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value as string
      this.remove(oldestKey)
    }
    this.entries.set(key, value)
    this.totalBytes += value.length
  }

  private remove(key: string): void {
    const existing = this.entries.get(key)
    if (existing === undefined) return
    this.entries.delete(key)
    this.totalBytes -= existing.length
  }
}
