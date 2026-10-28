import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { env } from '../../config/env'
import { S3StorageProvider } from './s3-storage.provider'
import { STORAGE_PROVIDER, type StorageProvider } from './storage.provider'

/** Порт веб-сборки приложения жильца (Expo) — из него загрузка идёт прямо в хранилище */
const MOBILE_WEB_DEV_ORIGIN = 'http://localhost:8081'

/**
 * В разработке создаёт бакет и CORS для прямой загрузки из браузера. В облаке бакет
 * и его политики заводит инфраструктура: приложению там такие права не нужны.
 */
@Injectable()
export class DevStorageBootstrap implements OnApplicationBootstrap {
  private readonly log = new Logger('Storage')

  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  async onApplicationBootstrap() {
    if (env().NODE_ENV !== 'development' || !(this.storage instanceof S3StorageProvider)) return
    await this.storage.ensureDevBucket([env().WEB_ORIGIN, MOBILE_WEB_DEV_ORIGIN]).catch((e: unknown) => {
      this.log.warn(`Хранилище недоступно: ${e instanceof Error ? e.message : String(e)}. Запустите docker compose up -d`)
    })
  }
}
