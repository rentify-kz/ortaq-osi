import { Inject, Injectable } from '@nestjs/common'
import type { File as FileRow } from '@prisma/client'
import { ErrorCode, MAX_UPLOAD_BYTES, type FileView, type UploadUrlBody, type UploadUrlResponse } from '@ortaq/shared'
import { randomUUID } from 'node:crypto'
import { ctx } from '../../common/context'
import { AppError, notFound, unprocessable } from '../../common/errors'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider'
import { AuditService } from '../audit/audit.service'
import { isBoardRole, visibleRequestsWhere } from '../requests/visibility'
import { reencodeImage, sniffImage } from './images'

export type FileParent = 'REQUEST' | 'REQUEST_EVENT' | 'TASK_COMPLETION'

const rejected = (message: string) => new AppError(422, ErrorCode.FILE_REJECTED, message)

/**
 * Файлы (docs/03 §14, docs/13 §6). Загрузка в два шага: presigned URL → прямая загрузка
 * в хранилище → finalize. На finalize сервер проверяет содержимое по сигнатуре и
 * перекодирует изображение: EXIF с координатами квартиры не доживает до хранилища.
 * Права на файл не существует отдельно — оно наследуется от заявки или отчёта о работе.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async requestUpload(body: UploadUrlBody): Promise<UploadUrlResponse> {
    const houseId = ctx().houseId ?? ''
    // Сначала во «входящие»: до проверки файл нигде не показывается и ни к чему не привязан
    const storageKey = `incoming/${houseId}/${randomUUID()}`
    const file = await this.db.run((tx) =>
      tx.file.create({
        data: {
          houseId, storageKey, originalName: safeName(body.name), mimeType: body.mime_type, sizeBytes: body.size_bytes,
          purpose: body.purpose, uploadedBy: ctx().userId ?? '',
        },
      }),
    )
    const upload = await this.storage.presignUpload(storageKey, body.mime_type, body.size_bytes)
    return { file_id: file.id, upload_url: upload.url, method: upload.method, headers: upload.headers, expires_at: upload.expiresAt.toISOString() }
  }

  async finalize(fileId: string): Promise<FileView> {
    const userId = ctx().userId ?? ''
    const file = await this.db.run((tx) => tx.file.findFirst({ where: { id: fileId, uploadedBy: userId } }))
    if (!file) throw notFound('Файл')
    if (file.status === 'READY') return view(file)
    if (file.status === 'REJECTED') throw rejected('Файл отклонён при проверке. Загрузите другой')

    const original = await this.storage.read(file.storageKey, MAX_UPLOAD_BYTES)
    if (!original) throw unprocessable(ErrorCode.FILE_NOT_UPLOADED, 'Файл не загружен или больше 15 МБ')
    if (!sniffImage(original)) return this.reject(file, 'Это не фотография: поддерживаются JPEG, PNG и WebP')

    let image: Awaited<ReturnType<typeof reencodeImage>>
    try {
      image = await reencodeImage(original)
    } catch {
      return this.reject(file, 'Не удалось прочитать изображение')
    }
    const key = `files/${file.houseId}/${file.id}.jpg`
    await this.storage.write(key, image.body, 'image/jpeg')
    await this.storage.remove(file.storageKey)

    const ready = await this.db.run(async (tx) => {
      const f = await tx.file.update({
        where: { id: file.id },
        data: {
          storageKey: key, mimeType: 'image/jpeg', sizeBytes: image.body.length, width: image.width, height: image.height,
          contentHash: this.crypto.sha256Bytes(image.body), status: 'READY', exifStripped: true,
          // Перекодированный растр не несёт исполняемой нагрузки; PDF пойдут через антивирус (фаза 3)
          scanStatus: 'CLEAN', finalizedAt: new Date(),
        },
      })
      await this.audit.append(tx, { action: 'file.upload', entityType: 'File', entityId: f.id, after: { purpose: f.purpose, size: f.sizeBytes } })
      return f
    })
    return view(ready)
  }

  /** Привязка к родителю: только свои, проверенные и ещё ни к чему не привязанные файлы */
  async attach(tx: Tx, ids: string[], parentType: FileParent, parentId: string, uploaderId: string): Promise<void> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return
    const files = await tx.file.findMany({ where: { id: { in: unique }, uploadedBy: uploaderId, status: 'READY', parentId: null }, select: { id: true } })
    if (files.length !== unique.length) throw unprocessable(ErrorCode.VALIDATION, 'Часть фото не загружена до конца или уже прикреплена')
    await tx.file.updateMany({ where: { id: { in: unique } }, data: { parentType, parentId } })
  }

  async downloadUrl(fileId: string): Promise<{ url: string; expires_at: string }> {
    const file = await this.db.run((tx) => tx.file.findFirst({ where: { id: fileId, status: 'READY' } }))
    // Нет права — то же, что нет файла: по ответу нельзя понять, что он существует
    if (!file || !(await this.db.run((tx) => this.canRead(tx, file)))) throw notFound('Файл')
    const url = await this.storage.presignDownload(file.storageKey, file.originalName)
    return { url, expires_at: new Date(Date.now() + 300_000).toISOString() }
  }

  private async canRead(tx: Tx, file: FileRow): Promise<boolean> {
    const { userId = '', role } = ctx()
    if (!file.parentId) return file.uploadedBy === userId
    const visible = (requestId: string) => tx.request.count({ where: { id: requestId, ...visibleRequestsWhere(userId, role) } }).then((n) => n > 0)

    switch (file.parentType) {
      case 'REQUEST':
        return visible(file.parentId)
      case 'REQUEST_EVENT': {
        const event = await tx.requestEvent.findFirst({ where: { id: file.parentId }, select: { requestId: true, public: true } })
        return !!event && (event.public || isBoardRole(role)) && visible(event.requestId)
      }
      case 'TASK_COMPLETION': {
        const c = await tx.taskCompletion.findFirst({ where: { id: file.parentId }, include: { task: { select: { assigneeId: true, requestId: true } } } })
        if (!c) return false
        if (isBoardRole(role) || c.task.assigneeId === userId) return true
        // Жильцам — только после подтверждения председателем (docs/07 §7.2)
        return c.visibleToResidents && !!c.task.requestId && visible(c.task.requestId)
      }
      default:
        return false
    }
  }

  private async reject(file: FileRow, reason: string): Promise<never> {
    await this.storage.remove(file.storageKey)
    await this.db.run((tx) => tx.file.update({ where: { id: file.id }, data: { status: 'REJECTED' } }))
    throw rejected(reason)
  }
}

function safeName(name: string): string {
  return name.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 200) || 'photo.jpg'
}

export function fileView(f: FileRow): FileView {
  return { id: f.id, mime_type: f.mimeType, size_bytes: f.sizeBytes, width: f.width, height: f.height }
}
const view = fileView
