import 'dotenv/config'
import { S3Client } from '@aws-sdk/client-s3'
import { createApp } from './app'
import { loadConfig } from './config'
import type { ClipStore } from './storage/ClipStore'
import { CachedClipStore } from './storage/CachedClipStore'
import { FsClipStore } from './storage/FsClipStore'
import { LruCache } from './storage/LruCache'
import { S3ClipStore } from './storage/S3ClipStore'

const config = loadConfig(process.env)

const driverStore: ClipStore =
  config.storageDriver === 's3'
    ? new S3ClipStore({
        bucket: config.storageBucket!,
        client: new S3Client({
          region: config.storageS3Region,
          endpoint: config.storageS3Endpoint,
          forcePathStyle: true,
          requestHandler: { requestTimeout: 15_000, connectionTimeout: 5_000 },
          credentials: {
            accessKeyId: config.storageS3AccessKeyId!,
            secretAccessKey: config.storageS3SecretAccessKey!,
          },
        }),
      })
    : new FsClipStore(config.storageDir)

const store = new CachedClipStore(driverStore, new LruCache(config.clipCacheMb * 1024 * 1024))

createApp({ config, store }).listen(config.port, () => {
  console.log(`pokemon-heardle backend escuchando en el puerto ${config.port}`)
})
