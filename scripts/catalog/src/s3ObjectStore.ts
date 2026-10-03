import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { ObjectStore } from './upload'

export interface S3Settings {
  bucket: string
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

export function readS3Settings(env: Record<string, string | undefined>): S3Settings {
  const names = [
    'STORAGE_BUCKET',
    'STORAGE_S3_ENDPOINT',
    'STORAGE_S3_REGION',
    'STORAGE_S3_ACCESS_KEY_ID',
    'STORAGE_S3_SECRET_ACCESS_KEY',
  ]
  const missing = names.filter((name) => !env[name])
  if (missing.length > 0) throw new Error(`Faltan variables de entorno: ${missing.join(', ')} (scripts/catalog/.env)`)
  return {
    bucket: env.STORAGE_BUCKET!,
    endpoint: env.STORAGE_S3_ENDPOINT!,
    region: env.STORAGE_S3_REGION!,
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!,
  }
}

export function createS3ObjectStore(settings: S3Settings): ObjectStore {
  const client = new S3Client({
    region: settings.region,
    endpoint: settings.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  })
  return {
    async list(prefix) {
      const objects = new Map<string, { md5: string }>()
      let continuationToken: string | undefined
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: settings.bucket, Prefix: prefix, ContinuationToken: continuationToken }),
        )
        for (const object of page.Contents ?? []) {
          if (object.Key) objects.set(object.Key, { md5: (object.ETag ?? '').replaceAll('"', '') })
        }
        continuationToken = page.NextContinuationToken
      } while (continuationToken)
      return objects
    },
    async put(key, body) {
      const contentType = key.endsWith('.json') ? 'application/json' : 'audio/mpeg'
      await client.send(new PutObjectCommand({ Bucket: settings.bucket, Key: key, Body: body, ContentType: contentType }))
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }))
    },
  }
}
