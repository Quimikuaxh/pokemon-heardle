import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { errors } from '../http/errors'
import type { ClipStore } from './ClipStore'
import { isValidClipLocation } from './clipLocation'

export class FsClipStore implements ClipStore {
  constructor(private readonly rootDir: string) {}

  async getCatalog(): Promise<unknown> {
    try {
      return JSON.parse(await readFile(join(this.rootDir, 'catalog', 'catalog.json'), 'utf8'))
    } catch {
      throw errors.storage()
    }
  }

  async getClip(clipKey: string): Promise<Buffer> {
    if (!isValidClipLocation(clipKey)) throw errors.storage()
    try {
      return await readFile(join(this.rootDir, 'clips', `${clipKey}.mp3`))
    } catch {
      throw errors.storage()
    }
  }
}
