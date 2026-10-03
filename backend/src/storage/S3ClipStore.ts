import { GetObjectCommand } from '@aws-sdk/client-s3'
import { errors } from '../http/errors'
import type { ClipStore } from './ClipStore'
import { isValidClipLocation } from './clipLocation'

interface S3Like {
  send(command: any): Promise<any>
}

export class S3ClipStore implements ClipStore {
  private readonly client: S3Like
  private readonly bucket: string

  constructor(options: { client: S3Like; bucket: string }) {
    this.client = options.client
    this.bucket = options.bucket
  }

  async getCatalog(): Promise<unknown> {
    try {
      const bytes = await this.readObject('catalog/catalog.json')
      return JSON.parse(bytes.toString('utf8'))
    } catch {
      throw errors.storage()
    }
  }

  async getClip(clipKey: string, clipNumber: number): Promise<Buffer> {
    if (!isValidClipLocation(clipKey, clipNumber)) throw errors.storage()
    try {
      return await this.readObject(`clips/${clipKey}/${clipNumber}.mp3`)
    } catch {
      throw errors.storage()
    }
  }

  private async readObject(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    return Buffer.from(await response.Body.transformToByteArray())
  }
}
