import { Logger } from '@nestjs/common'
import {
  CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand,
  PutBucketCorsCommand, PutObjectCommand, S3Client, type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Env } from '../../config/env'
import { PRESIGN_TTL_S, type PresignedUpload, type StorageProvider } from './storage.provider'

/**
 * S3-совместимое хранилище. Два клиента: внутренний (API ↔ хранилище) и публичный — только
 * для подписи ссылок, потому что подпись включает хост, а клиент ходит по внешнему адресу.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly log = new Logger('Storage')
  private readonly internal: S3Client
  private readonly external: S3Client
  private readonly bucket: string

  constructor(e: Env) {
    const base: S3ClientConfig = {
      region: e.S3_REGION,
      credentials: { accessKeyId: e.S3_ACCESS_KEY!, secretAccessKey: e.S3_SECRET_KEY! },
      forcePathStyle: true,
      // Дополнительные контрольные суммы SDK ломают presigned PUT из браузера и не нужны: хеш считаем сами
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }
    this.internal = new S3Client({ ...base, endpoint: e.S3_ENDPOINT })
    this.external = new S3Client({ ...base, endpoint: e.S3_PUBLIC_ENDPOINT ?? e.S3_ENDPOINT })
    this.bucket = e.S3_BUCKET
  }

  /** Только в разработке: в облаке бакет и CORS заводятся инфраструктурой, а не приложением */
  async ensureDevBucket(origins: string[]): Promise<void> {
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch {
      await this.internal.send(new CreateBucketCommand({ Bucket: this.bucket }))
      this.log.log(`Создан бакет ${this.bucket}`)
    }
    await this.internal.send(new PutBucketCorsCommand({
      Bucket: this.bucket,
      CORSConfiguration: { CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ['PUT', 'GET'], AllowedHeaders: ['*'], MaxAgeSeconds: 3600 }] },
    })).catch((e: unknown) => this.log.warn(`CORS бакета не настроен: ${e instanceof Error ? e.message : String(e)}`))
  }

  async presignUpload(key: string, contentType: string, sizeBytes: number): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.external,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
      { expiresIn: PRESIGN_TTL_S, signableHeaders: new Set(['content-type', 'content-length']) },
    )
    return { url, method: 'PUT', headers: { 'content-type': contentType }, expiresAt: new Date(Date.now() + PRESIGN_TTL_S * 1000) }
  }

  presignDownload(key: string, fileName: string): Promise<string> {
    return getSignedUrl(
      this.external,
      new GetObjectCommand({
        Bucket: this.bucket, Key: key,
        ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      }),
      { expiresIn: PRESIGN_TTL_S },
    )
  }

  async read(key: string, maxBytes: number): Promise<Buffer | null> {
    try {
      const head = await this.internal.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      if ((head.ContentLength ?? 0) > maxBytes) return null
      const obj = await this.internal.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      const bytes = await obj.Body?.transformToByteArray()
      return bytes && bytes.length <= maxBytes ? Buffer.from(bytes) : null
    } catch {
      return null
    }
  }

  async write(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.internal.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }))
  }

  async remove(key: string): Promise<void> {
    await this.internal.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => undefined)
  }
}
