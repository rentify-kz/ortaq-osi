/**
 * Объектное хранилище за интерфейсом (docs/01 §7): Yandex Object Storage в production,
 * SeaweedFS в разработке, память в тестах. Публичных URL нет: только presigned на 5 минут.
 */
export const STORAGE_PROVIDER = Symbol('StorageProvider')

export const PRESIGN_TTL_S = 300

export type PresignedUpload = { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: Date }

export interface StorageProvider {
  /** Ссылка для прямой загрузки клиентом: тип и размер зашиты в подпись, подменить их нельзя */
  presignUpload(key: string, contentType: string, sizeBytes: number): Promise<PresignedUpload>
  presignDownload(key: string, fileName: string): Promise<string>
  /** null — объекта нет или он больше лимита: читать гигабайт в память ради проверки не будем */
  read(key: string, maxBytes: number): Promise<Buffer | null>
  write(key: string, body: Buffer, contentType: string): Promise<void>
  remove(key: string): Promise<void>
}
