import { Injectable } from '@nestjs/common'
import { Prisma, type BudgetCategory, type DocumentKind, type Transaction } from '@prisma/client'
import { createHash } from 'node:crypto'
import {
  addDocumentBody, confirmTransactionBody, createTransactionBody, ErrorCode, PAYMENT_PROOF, removeDocumentBody, transactionListQuery, updateTransactionBody, voidTransactionBody,
  type AddDocumentBody, type ConfirmTransactionBody, type CreateTransactionBody, type RemoveDocumentBody, type TransactionListQuery, type TransactionView,
  type UpdateTransactionBody, type VoidTransactionBody,
} from '@ortaq/shared'
import { ctx } from '../../common/context'
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { FilesService } from '../files/files.service'
import { isBoardRole } from '../requests/visibility'
import { CategoriesService } from './categories.service'
import { almatyToday, dateStr, dec, num, periodOf, toDate } from './finance.util'
import { assertPeriodOpen } from './period-lock'

const include = {
  category: { select: { code: true, shortName: true, nameRu: true, section: true, requiredDocuments: true } },
  account: { select: { id: true, type: true } },
  contractor: { select: { id: true, name: true } },
  documents: { where: { removedAt: null }, orderBy: { addedAt: 'asc' } },
  corrects: { select: { id: true, number: true } },
  correctedBy: { select: { id: true, number: true, confirmedAt: true } },
} satisfies Prisma.TransactionInclude
type Row = Prisma.TransactionGetPayload<{ include: typeof include }>

type Fields = { accountId: string; categoryCode: string; occurredOn: string; period?: string; contractorId?: string | null; counterparty?: string | null }

const state = (message: string) => conflict(ErrorCode.TRANSACTION_STATE, message)

/** Отпечаток содержимого: председатель подтверждает ровно ту версию черновика, которую видел */
function revisionOf(t: Transaction): string {
  const content = [t.accountId, t.categoryCode, t.amount.toFixed(2), dateStr(t.occurredOn), t.period, t.description, t.contractorId, t.counterparty]
  return createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16)
}

/** Жильцу и работнику видны только операции, которые председатель проводил хотя бы раз */
const reviewed = { confirmedAt: { not: null } } satisfies Prisma.TransactionWhereInput

/**
 * Операции по счетам (docs/10 §3). Код строки формы обязателен — без него операция не попадёт
 * в отчёт. Проведённая операция не меняется: ошибка исправляется аннулированием с причиной
 * и новой записью. Запись бухгалтера проводит председатель — вторая пара глаз на деньгах.
 */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly files: FilesService,
    private readonly categories: CategoriesService,
  ) {}

  async list(input: TransactionListQuery): Promise<TransactionView[]> {
    const q = transactionListQuery.parse(input)
    const board = isBoardRole(ctx().role)
    // Жильцам — проведённые и аннулированные: аннулирование с причиной тоже часть прозрачности
    const statuses = board ? (q.status === 'all' ? undefined : [q.status]) : (q.status === 'all' ? ['CONFIRMED', 'VOIDED'] : q.status === 'DRAFT' ? [] : [q.status])
    const rows = await this.db.run((tx) =>
      tx.transaction.findMany({
        where: {
          ...(statuses && { status: { in: statuses as ('DRAFT' | 'CONFIRMED' | 'VOIDED')[] } }),
          ...(!board && reviewed),
          ...(q.period && { period: q.period }),
          ...(q.account_id && { accountId: q.account_id }),
          ...(q.category && { OR: [{ categoryCode: q.category }, { categoryCode: { startsWith: `${q.category}.` } }] }),
        },
        include,
        orderBy: [{ occurredOn: 'desc' }, { number: 'desc' }],
        take: 500,
      }),
    )
    return this.views(rows)
  }

  async detail(id: string): Promise<TransactionView> {
    const row = await this.db.run((tx) => tx.transaction.findFirst({ where: { id }, include }))
    // Черновик — и снятый черновик — для жильца не существует
    if (!row || (!row.confirmedAt && !isBoardRole(ctx().role))) throw notFound('Операция')
    return (await this.views([row]))[0]!
  }

  async create(input: CreateTransactionBody): Promise<TransactionView> {
    const b = createTransactionBody.parse(input)
    const { userId = '', role } = ctx()
    if (b.confirm && role !== 'CHAIRMAN') throw forbidden('Операцию проводит председатель. Сохраните её черновиком — он подтвердит')
    const { idempotency_key, ...payload } = b
    const requestHash = this.crypto.sha256Bytes(Buffer.from(JSON.stringify(payload)))

    const replay = await this.replay(idempotency_key, requestHash)
    if (replay) return replay

    try {
      const id = await this.db.run(async (tx) => {
        const v = await this.validate(tx, {
          accountId: b.account_id, categoryCode: b.category_code, occurredOn: b.occurred_on, period: b.period, contractorId: b.contractor_id, counterparty: b.counterparty,
        })
        if (b.corrects_id) {
          const target = await tx.transaction.findFirst({ where: { id: b.corrects_id }, include: { correctedBy: { select: { id: true } } } })
          if (!target) throw notFound('Исправляемая операция')
          if (target.status !== 'VOIDED' || target.correctedBy) throw state('Исправить можно только аннулированную операцию, и только один раз')
        }
        const houseId = ctx().houseId ?? ''
        const seq = await tx.$queryRaw<{ transaction_seq: number }[]>`
          UPDATE houses SET transaction_seq = transaction_seq + 1 WHERE id = ${houseId}::uuid RETURNING transaction_seq`
        const now = new Date()
        const t = await tx.transaction.create({
          data: {
            houseId, number: seq[0]?.transaction_seq ?? 0, accountId: b.account_id, categoryCode: v.category.code, direction: v.direction,
            amount: dec(b.amount), occurredOn: toDate(b.occurred_on), period: v.period, description: b.description,
            contractorId: b.contractor_id ?? null, counterparty: b.counterparty ?? null,
            idempotencyKey: idempotency_key, requestHash, createdBy: userId, correctsId: b.corrects_id ?? null,
            ...(b.confirm && { status: 'CONFIRMED', confirmedBy: userId, confirmedAt: now }),
          },
        })
        await this.attachDocuments(tx, t.id, b.documents, userId)
        await this.audit.append(tx, {
          action: b.confirm ? 'finance.transaction_post' : 'finance.transaction_draft', entityType: 'Transaction', entityId: t.id,
          after: {
            number: t.number, account: b.account_id, category: v.category.code, direction: v.direction, amount: b.amount, occurred_on: b.occurred_on, period: v.period,
            description: b.description, contractor: b.contractor_id, counterparty: b.counterparty, corrects: b.corrects_id,
          },
        })
        return t.id
      })
      return this.detail(id)
    } catch (e) {
      // Два одинаковых запроса одновременно: второй упрётся в уникальный ключ и вернёт результат первого
      // Формат meta.target у Prisma зависит от драйвера, поэтому сначала просто ищем запись по ключу
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.replay(idempotency_key, requestHash)
        if (again) return again
        if (b.corrects_id) throw state('Эту операцию уже исправляет другая запись')
      }
      throw e
    }
  }

  async update(id: string, input: UpdateTransactionBody): Promise<TransactionView> {
    const b = updateTransactionBody.parse(input)
    await this.db.run(async (tx) => {
      const t = await this.draft(tx, id)
      await assertPeriodOpen(tx, t.period)
      const v = await this.validate(tx, {
        accountId: b.account_id ?? t.accountId,
        categoryCode: b.category_code ?? t.categoryCode,
        occurredOn: b.occurred_on ?? dateStr(t.occurredOn),
        // Сменили дату, а период не трогали — период следует за датой
        period: b.period ?? (b.occurred_on ? undefined : t.period),
        contractorId: b.contractor_id === undefined ? t.contractorId : b.contractor_id,
        counterparty: b.counterparty === undefined ? t.counterparty : b.counterparty,
      })
      await tx.transaction.update({
        where: { id },
        data: {
          accountId: b.account_id, categoryCode: v.category.code, direction: v.direction, period: v.period, description: b.description,
          ...(b.amount !== undefined && { amount: dec(b.amount) }),
          ...(b.occurred_on !== undefined && { occurredOn: toDate(b.occurred_on) }),
          ...(b.contractor_id !== undefined && { contractorId: b.contractor_id }),
          ...(b.counterparty !== undefined && { counterparty: b.counterparty }),
        },
      })
      await this.audit.append(tx, {
        action: 'finance.transaction_update', entityType: 'Transaction', entityId: id,
        before: {
          account: t.accountId, category: t.categoryCode, amount: num(t.amount), occurred_on: dateStr(t.occurredOn), period: t.period, description: t.description,
          contractor: t.contractorId, counterparty: t.counterparty,
        },
        after: b,
      })
    })
    return this.detail(id)
  }

  async confirm(id: string, input: ConfirmTransactionBody): Promise<TransactionView> {
    const b = confirmTransactionBody.parse(input)
    await this.db.run(async (tx) => {
      const t = await this.draft(tx, id)
      if (revisionOf(t) !== b.revision) throw state('Черновик изменился, пока вы его смотрели. Откройте его заново и проверьте')
      // Правила проверяются на момент проведения: счёт мог измениться после записи черновика
      await this.validate(tx, { accountId: t.accountId, categoryCode: t.categoryCode, occurredOn: dateStr(t.occurredOn), period: t.period, contractorId: t.contractorId, counterparty: t.counterparty })
      await tx.transaction.update({ where: { id }, data: { status: 'CONFIRMED', confirmedBy: ctx().userId, confirmedAt: new Date() } })
      await this.audit.append(tx, { action: 'finance.transaction_confirm', entityType: 'Transaction', entityId: id, after: { number: t.number, amount: num(t.amount), category: t.categoryCode } })
    })
    return this.detail(id)
  }

  /** Аннулирование вместо удаления: запись остаётся в журнале с причиной. Бухгалтер может так снять свой черновик */
  async void(id: string, input: VoidTransactionBody): Promise<TransactionView> {
    const b = voidTransactionBody.parse(input)
    const { userId = '', role } = ctx()
    await this.db.run(async (tx) => {
      const t = await this.locked(tx, id)
      if (t.status === 'VOIDED') throw state('Операция уже аннулирована')
      await assertPeriodOpen(tx, t.period)
      if (role !== 'CHAIRMAN' && !(t.status === 'DRAFT' && t.createdBy === userId)) throw forbidden('Проведённую операцию аннулирует председатель')
      await tx.transaction.update({ where: { id }, data: { status: 'VOIDED', voidedBy: userId, voidedAt: new Date(), voidReason: b.reason } })
      await this.audit.append(tx, { action: 'finance.transaction_void', entityType: 'Transaction', entityId: id, before: { status: t.status }, after: { number: t.number, amount: num(t.amount), reason: b.reason } })
    })
    return this.detail(id)
  }

  /** Документы прикладываются и после проведения: акт часто приходит позже оплаты (docs/03 §12) */
  async addDocument(id: string, input: AddDocumentBody): Promise<TransactionView> {
    const b = addDocumentBody.parse(input)
    await this.db.run(async (tx) => {
      const t = await tx.transaction.findFirst({ where: { id } })
      if (!t) throw notFound('Операция')
      if (t.status === 'VOIDED') throw state('Операция аннулирована: документы к ней не прикладываются')
      await this.attachDocuments(tx, id, [b], ctx().userId ?? '')
    })
    return this.detail(id)
  }

  /**
   * Изъятие документа — мягкое и со step-up: файл и запись о нём остаются. У проведённой операции
   * документ уже видели жильцы и он идёт в отчёт, поэтому изымает только председатель и с причиной
   */
  async removeDocument(id: string, documentId: string, input: RemoveDocumentBody): Promise<TransactionView> {
    const b = removeDocumentBody.parse(input)
    await this.db.run(async (tx) => {
      const t = await this.locked(tx, id)
      if (t.status !== 'DRAFT') {
        if (ctx().role !== 'CHAIRMAN') throw forbidden('Документ проведённой операции изымает председатель')
        if (!b.reason) throw unprocessable(ErrorCode.VALIDATION, 'Укажите причину изъятия', { fields: [{ path: 'reason', message: 'Почему документ изымается' }] })
      }
      const doc = await tx.transactionDocument.findFirst({ where: { id: documentId, transactionId: id, removedAt: null } })
      if (!doc) throw notFound('Документ')
      await tx.transactionDocument.update({ where: { id: documentId }, data: { removedAt: new Date(), removedBy: ctx().userId } })
      await this.audit.append(tx, { action: 'finance.document_remove', entityType: 'Transaction', entityId: id, before: { document: documentId, kind: doc.kind, file: doc.fileId }, after: { reason: b.reason } })
    })
    return this.detail(id)
  }

  private async replay(key: string, hash: Uint8Array): Promise<TransactionView | null> {
    const existing = await this.db.run((tx) => tx.transaction.findFirst({ where: { idempotencyKey: key }, select: { id: true, requestHash: true } }))
    if (!existing) return null
    if (!Buffer.from(existing.requestHash).equals(Buffer.from(hash))) throw conflict(ErrorCode.IDEMPOTENCY_CONFLICT, 'Этот ключ уже использован для другой операции')
    return this.detail(existing.id)
  }

  /** Строка операции под блокировкой: правка, проведение и аннулирование одной записи идут по очереди */
  private async locked(tx: Tx, id: string): Promise<Transaction> {
    await tx.$queryRaw`SELECT id FROM transactions WHERE id = ${id}::uuid FOR UPDATE`
    const t = await tx.transaction.findFirst({ where: { id } })
    if (!t) throw notFound('Операция')
    return t
  }

  private async draft(tx: Tx, id: string) {
    const t = await this.locked(tx, id)
    if (t.status !== 'DRAFT') throw state(t.status === 'CONFIRMED' ? 'Операция проведена и не меняется. Аннулируйте её и внесите верную' : 'Операция аннулирована')
    return t
  }

  /** Правила формы и закона: конечная строка, нужный счёт, дата в пределах счёта, получатель для 7.2.1 */
  private async validate(tx: Tx, f: Fields): Promise<{ category: BudgetCategory; direction: 'IN' | 'OUT'; period: string }> {
    const category = await this.categories.get(f.categoryCode)
    if (!category || !category.isLeaf || category.section === 'BALANCE') {
      throw unprocessable(ErrorCode.CATEGORY_INVALID, 'Выберите конечную строку формы: например 7.2.1.10, а не 7.2', { fields: [{ path: 'category_code', message: 'Нужна конечная строка формы' }] })
    }
    // Блокировка счёта: проведение и смена начального остатка не проскакивают одновременно
    await tx.$queryRaw`SELECT id FROM finance_accounts WHERE id = ${f.accountId}::uuid FOR UPDATE`
    const account = await tx.financeAccount.findFirst({ where: { id: f.accountId } })
    if (!account) throw notFound('Счёт')
    if (!category.allowedAccounts.includes(account.type)) {
      throw unprocessable(ErrorCode.ACCOUNT_MISMATCH, account.type === 'SAVINGS'
        ? 'Сберегательный счёт — только для капремонта: с него тратят по решению собрания, на него поступают взносы на капремонт'
        : 'Взносы на капремонт по закону поступают на сберегательный счёт', { fields: [{ path: 'account_id', message: 'Не тот счёт для этой строки' }] })
    }
    const today = almatyToday()
    const field = (path: string, message: string) => unprocessable(ErrorCode.VALIDATION, message, { fields: [{ path, message }] })
    if (f.occurredOn > today) throw field('occurred_on', 'Дата операции ещё не наступила')
    if (f.occurredOn < dateStr(account.openedOn)) throw field('occurred_on', `Счёт ведётся с ${dateStr(account.openedOn)}: более ранние операции входят в начальный остаток`)
    const period = f.period ?? periodOf(f.occurredOn)
    if (period > periodOf(today)) throw field('period', 'Отчётный месяц ещё не наступил')
    await assertPeriodOpen(tx, period)

    if (f.contractorId) {
      const c = await tx.contractor.findFirst({ where: { id: f.contractorId }, select: { id: true } })
      if (!c) throw notFound('Подрядчик')
    }
    if (category.requiresContractor && !f.contractorId && !f.counterparty) {
      throw unprocessable(ErrorCode.CONTRACTOR_REQUIRED, 'Укажите подрядчика или исполнителя: его наименование печатается в отчёте', { fields: [{ path: 'contractor_id', message: 'Кому заплатили' }] })
    }
    return { category, direction: category.section === 'INCOME' ? 'IN' : 'OUT', period }
  }

  private async attachDocuments(tx: Tx, transactionId: string, docs: { file_id: string; kind: DocumentKind }[], userId: string) {
    if (docs.length === 0) return
    await this.files.attach(tx, docs.map((d) => d.file_id), 'TRANSACTION', transactionId, userId, 'FINANCE_DOCUMENT')
    const houseId = ctx().houseId ?? ''
    await tx.transactionDocument.createMany({ data: docs.map((d) => ({ houseId, transactionId, fileId: d.file_id, kind: d.kind, addedBy: userId })) })
    await this.audit.append(tx, { action: 'finance.document_add', entityType: 'Transaction', entityId: transactionId, after: { documents: docs } })
  }

  private async views(rows: Row[]): Promise<TransactionView[]> {
    const board = isBoardRole(ctx().role)
    const fileIds = rows.flatMap((r) => r.documents.map((d) => d.fileId))
    const userIds = board ? [...new Set(rows.map((r) => r.createdBy))] : []
    const [files, users] = await this.db.run((tx) =>
      Promise.all([
        fileIds.length ? tx.file.findMany({ where: { id: { in: fileIds } }, select: { id: true, mimeType: true } }) : [],
        userIds.length ? tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [],
      ]),
    )
    const mime = new Map(files.map((f) => [f.id, f.mimeType]))
    const names = new Map(users.map((u) => [u.id, u.fullName]))
    return rows.map((r) => ({
      id: r.id, number: r.number, status: r.status, revision: revisionOf(r),
      account: r.account, category: { code: r.category.code, short_name: r.category.shortName, name: r.category.nameRu },
      direction: r.direction, amount: num(r.amount), occurred_on: dateStr(r.occurredOn), period: r.period, description: r.description,
      contractor: r.contractor, counterparty: r.counterparty,
      documents: r.documents.map((d) => ({ id: d.id, kind: d.kind, file_id: d.fileId, mime_type: mime.get(d.fileId) ?? 'application/octet-stream', added_at: d.addedAt.toISOString() })),
      missing_documents: r.status === 'VOIDED' || r.category.section !== 'EXPENSE' ? [] : missing(r.category.requiredDocuments, r.documents.map((d) => d.kind)),
      created_at: r.createdAt.toISOString(), confirmed_at: r.confirmedAt?.toISOString() ?? null,
      voided_at: r.voidedAt?.toISOString() ?? null, void_reason: r.voidReason,
      corrects: r.corrects,
      corrected_by: r.correctedBy && (board || r.correctedBy.confirmedAt) ? { id: r.correctedBy.id, number: r.correctedBy.number } : null,
      ...(board && { created_by: { id: r.createdBy, name: names.get(r.createdBy) ?? '' } }),
    }))
  }
}

/** Расходу нужен чек или платёжка, плюс документы строки: акт работ, дефектный акт, протокол собрания */
export function missing(required: DocumentKind[], present: DocumentKind[]): DocumentKind[] {
  const have = new Set(present)
  const out: DocumentKind[] = PAYMENT_PROOF.some((k) => have.has(k)) ? [] : ['RECEIPT']
  return [...out, ...required.filter((k) => !have.has(k))]
}
