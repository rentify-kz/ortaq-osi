import { PRESIGN_TTL_S, type PresignedUpload, type StorageProvider } from './storage.provider'

/**
 * Хранилище в памяти для тестов. «Загрузку клиентом» тест делает через putAsClient —
 * ровно то, что сделал бы телефон по presigned URL. В production запрещено конфигурацией.
 */
export class MemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>()

  async presignUpload(key: string, contentType: string): Promise<PresignedUpload> {
    return { url: `memory://upload/${key}`, method: 'PUT', headers: { 'content-type': contentType }, expiresAt: new Date(Date.now() + PRESIGN_TTL_S * 1000) }
  }

  async presignDownload(key: string): Promise<string> {
    return `memory://download/${key}`
  }

  async read(key: string, maxBytes: number): Promise<Buffer | null> {
    const o = this.objects.get(key)
    return o && o.body.length <= maxBytes ? o.body : null
  }

  async write(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType })
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key)
  }

  /** Что сделал бы клиент по presigned URL */
  putAsClient(uploadUrl: string, body: Buffer, contentType = 'image/jpeg') {
    this.objects.set(uploadUrl.replace('memory://upload/', ''), { body, contentType })
  }
}
