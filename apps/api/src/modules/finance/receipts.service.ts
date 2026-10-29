import { Inject, Injectable } from '@nestjs/common'
import type { File as FileRow, Receipt, ReceiptPurpose } from '@prisma/client'
import { ErrorCode, MAX_UPLOAD_BYTES, scanReceiptBody, type PaymentFlag, type ReceiptFields, type ReceiptScanView, type ScanReceiptBody } from '@ortaq/shared'
import { asSystem, ctx } from '../../common/context'
import { notFound, unprocessable } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { OCR_PROVIDER, type OcrProvider } from '../../integrations/ocr/ocr.provider'
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider'
import { AuditService } from '../audit/audit.service'
import { dHash, hamming } from '../files/images'
import { parseReceipt } from './receipt-parser'

/** До скольких различающихся бит из 64 изображения считаются одним и тем же чеком */
const SIMILAR_BITS = 6
/** Ниже этой доли найденных полей распознавание считается неудачным */
const MIN_CONFIDENCE = 0.5

export type Flag = { code: PaymentFlag; message: string }
export type Inspection = { file: FileRow; phash: Buffer | null; text: string | null; fields: ReceiptFields | null; confidence: number }

/**
 * Чеки (docs/10 §5). Три рубежа против повторной подачи: тот же файл (SHA-256), тот же чек
 * другим файлом (dHash) и тот же номер операции (в payments). Ни один не отклоняет сам —
 * только помечает: у повтора бывает законное объяснение, решает человек.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(OCR_PROVIDER) private readonly ocr: OcrProvider,
  ) {}

  /** Файл, распознавание и отпечаток — до транзакции: чтение хранилища и модель не держат блокировки */
  async inspect(fileId: string, purpose: 'PAYMENT_RECEIPT' | 'FINANCE_DOCUMENT'): Promise<Inspection> {
    const userId = ctx().userId ?? ''
    const file = await this.db.run((tx) => tx.file.findFirst({ where: { id: fileId, uploadedBy: userId, status: 'READY', purpose } }))
    if (!file || !file.contentHash) throw unprocessable(ErrorCode.VALIDATION, 'Чек не загружен до конца', { fields: [{ path: 'file_id', message: 'Загрузите чек заново' }] })
    const body = await this.storage.read(file.storageKey, MAX_UPLOAD_BYTES)
    if (!body) throw unprocessable(ErrorCode.FILE_NOT_UPLOADED, 'Файл чека не найден в хранилище')
    const phash = file.mimeType.startsWith('image/') ? await dHash(body).catch(() => null) : null
    const ocr = await this.ocr.read(body, file.mimeType).catch(() => null)
    const parsed = ocr ? parseReceipt(ocr.text) : null
    return { file, phash, text: ocr?.text ?? null, fields: parsed?.fields ?? null, confidence: parsed?.confidence ?? 0 }
  }

  /** Повторы файла и изображения. Чужие дома проверяются только на точный файл и без подробностей */
  async duplicates(tx: Tx, i: Inspection, exceptReceiptId?: string): Promise<Flag[]> {
    const flags: Flag[] = []
    const hash = Buffer.from(i.file.contentHash!)
    const here = await tx.receipt.findFirst({ where: { contentHash: hash, ...(exceptReceiptId && { id: { not: exceptReceiptId } }) }, select: { createdAt: true } })
    const houseId = ctx().houseId ?? ''
    const elsewhere = here ? 0 : await asSystem(() => this.db.run((sys) => sys.receipt.count({ where: { contentHash: hash, houseId: { not: houseId } } })))
    if (here) flags.push({ code: 'DUPLICATE_FILE', message: `Этот же файл уже загружали ${here.createdAt.toLocaleDateString('ru-RU', { timeZone: 'Asia/Almaty' })}` })
    else if (elsewhere) flags.push({ code: 'DUPLICATE_FILE', message: 'Этот же файл уже загружали как чек в другом доме' })

    if (i.phash && !here) {
      const recent = await tx.receipt.findMany({ where: { perceptualHash: { not: null }, ...(exceptReceiptId && { id: { not: exceptReceiptId } }) }, select: { perceptualHash: true }, orderBy: { createdAt: 'desc' }, take: 5000 })
      if (recent.some((r) => hamming(r.perceptualHash!, i.phash!) <= SIMILAR_BITS)) {
        flags.push({ code: 'SIMILAR_IMAGE', message: 'Очень похож на чек, который уже загружали: возможно, тот же, пересохранённый или переснятый' })
      }
    }
    if (!i.fields || i.confidence < MIN_CONFIDENCE) flags.push({ code: 'NOT_RECOGNIZED', message: 'Чек не распознан: сумму и номер операции ввёл плательщик' })
    return flags
  }

  async store(tx: Tx, i: Inspection, purpose: ReceiptPurpose): Promise<Receipt> {
    return tx.receipt.create({
      data: {
        houseId: ctx().houseId ?? '', fileId: i.file.id, uploadedBy: ctx().userId ?? '', purpose,
        ocrStatus: i.fields ? 'DONE' : i.text === null ? 'MANUAL' : 'FAILED', ocrText: i.text, ocrParsed: i.fields ?? undefined,
        ocrConfidence: i.fields ? i.confidence : null, contentHash: Buffer.from(i.file.contentHash!), perceptualHash: i.phash ? new Uint8Array(i.phash) : null,
      },
    })
  }

  /**
   * Чек расхода: распознанные поля для предзаполнения формы и предупреждение о повторе.
   * Файл остаётся свободным — его прикладывают к операции как обычный документ
   */
  async scan(input: ScanReceiptBody): Promise<ReceiptScanView> {
    const b = scanReceiptBody.parse(input)
    const existing = await this.db.run((tx) => tx.receipt.findFirst({ where: { fileId: b.file_id } }))
    const i = await this.inspect(b.file_id, 'FINANCE_DOCUMENT')
    return this.db.run(async (tx) => {
      const flags = await this.duplicates(tx, i, existing?.id)
      const receipt = existing ?? (await this.store(tx, i, 'EXPENSE'))
      await this.audit.append(tx, { action: 'finance.receipt_scan', entityType: 'Receipt', entityId: receipt.id, after: { recognized: !!i.fields, flags: flags.map((f) => f.code) } })
      return { receipt_id: receipt.id, recognized: i.fields, duplicate: flags.some((f) => f.code === 'DUPLICATE_FILE' || f.code === 'SIMILAR_IMAGE') }
    })
  }

  async get(tx: Tx, id: string): Promise<Receipt> {
    const r = await tx.receipt.findFirst({ where: { id } })
    if (!r) throw notFound('Чек')
    return r
  }
}
