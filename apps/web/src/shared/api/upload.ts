import { MAX_UPLOAD_BYTES, type FilePurpose, type FileView, type UploadUrlResponse } from '@ortaq/shared'
import { api, ApiError } from './client'

const ACCEPTED: Record<string, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'application/pdf': 'PDF' }
export const ACCEPT_ATTR = Object.keys(ACCEPTED).join(',')

/**
 * Загрузка в три шага (docs/03 §14): ссылка с зашитыми типом и размером → файл прямо
 * в хранилище, минуя API → finalize, где сервер проверяет содержимое. Возвращает id файла.
 */
export async function uploadFile(houseId: string, file: File, purpose: FilePurpose): Promise<FileView> {
  if (!ACCEPTED[file.type]) throw new ApiError(400, 'VALIDATION_FAILED', 'Поддерживаются фото (JPEG, PNG, WebP) и PDF')
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(400, 'VALIDATION_FAILED', 'Файл больше 15 МБ')
  const ticket = await api<UploadUrlResponse>(`/houses/${houseId}/files/upload-url`, {
    method: 'POST',
    body: { purpose, mime_type: file.type, size_bytes: file.size, name: file.name },
  })
  let put: Response
  try {
    put = await fetch(ticket.upload_url, { method: ticket.method, headers: ticket.headers, body: file })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Файл не загрузился: нет связи с хранилищем')
  }
  if (!put.ok) throw new ApiError(put.status, 'UPLOAD_FAILED', 'Хранилище не приняло файл. Попробуйте ещё раз')
  return api<FileView>(`/houses/${houseId}/files/${ticket.file_id}/finalize`, { method: 'POST' })
}

/** Открыть файл: ссылка живёт 5 минут, поэтому берётся в момент нажатия */
export async function openFile(houseId: string, fileId: string): Promise<void> {
  const { url } = await api<{ url: string }>(`/houses/${houseId}/files/${fileId}/download-url`)
  window.open(url, '_blank', 'noopener')
}
