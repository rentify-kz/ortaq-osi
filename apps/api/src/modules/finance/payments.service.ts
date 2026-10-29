import { Injectable } from '@nestjs/common'
import { Prisma, type Charge, type Payment } from '@prisma/client'
import {
  CHARGE_CATEGORY, confirmPaymentBody, ErrorCode, manualPaymentBody, paymentListQuery, paymentSettingsBody, rejectPaymentBody, submitPaymentBody,
  type ConfirmPaymentBody, type ManualPaymentBody, type PaymentLinkView, type PaymentListQuery, type PaymentSettingsBody, type PaymentView,
  type ReceiptFields, type RejectPaymentBody, type SubmitPaymentBody,
} from '@ortaq/shared'
import { createHash } from 'node:crypto'
import { asSystem, ctx } from '../../common/context'
import { conflict, notFound, unprocessable } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { FilesService } from '../files/files.service'
import { NotificationsService } from '../notifications/notifications.service'
import { isBoardRole } from '../requests/visibility'
import { almatyToday, dateStr, dec, num, periodOf, toDate } from './finance.util'
import { isPeriodClosed } from './period-lock'
import { sameRecipient } from './receipt-parser'
import { ReceiptsService, type Flag } from './receipts.service'

const include = {
  charge: { select: { id: true, title: true, period: true, amount: true, paidAmount: true } },
  receipt: { select: { fileId: true, ocrParsed: true } },
} satisfies Prisma.PaymentInclude
type Row = Prisma.PaymentGetPayload<{ include: typeof include }>
type KaspiConfig = { pay_url: string; recipient_name: string }

const OPEN = ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] as const
const state = (message: string) => conflict(ErrorCode.PAYMENT_STATE, message)
const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

/**
 * Оплаты жильцов (docs/10 §5). Режим MVP: ссылка Kaspi → чек → проверка правлением.
 * Подтверждение — единственное место, где оплата становится деньгами: начисление закрывается,
 * а в журнал ложится поступление по строке формы. Всё в одной транзакции и со step-up.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly receipts: ReceiptsService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ───────── реквизиты ───────── */

  async settings(): Promise<KaspiConfig | null> {
    const h = await this.db.run((tx) => tx.house.findFirst({ where: { id: ctx().houseId }, select: { kaspiConfig: true } }))
    return (h?.kaspiConfig as KaspiConfig | null) ?? null
  }

  async updateSettings(input: PaymentSettingsBody): Promise<KaspiConfig> {
    const b = paymentSettingsBody.parse(input)
    const houseId = ctx().houseId ?? ''
    await this.db.run(async (tx) => {
      const before = await tx.house.findFirst({ where: { id: houseId }, select: { kaspiConfig: true } })
      await tx.house.update({ where: { id: houseId }, data: { kaspiConfig: b } })
      // Подмена реквизитов — классическая схема увода денег: изменение всегда в аудите
      await this.audit.append(tx, { action: 'finance.payment_settings', entityType: 'House', entityId: houseId, before: before?.kaspiConfig ?? undefined, after: b })
    })
    return b
  }

  /* ───────── жилец ───────── */

  async link(chargeId: string): Promise<PaymentLinkView> {
    return this.db.run(async (tx) => {
      const charge = await this.ownCharge(tx, chargeId)
      const house = await tx.house.findFirst({ where: { id: ctx().houseId }, select: { kaspiConfig: true, paymentMode: true } })
      const cfg = house?.kaspiConfig as KaspiConfig | null
      if (!cfg) throw conflict(ErrorCode.PAYMENT_SETTINGS_MISSING, 'Председатель ещё не указал реквизиты Kaspi. Оплатите по реквизитам ОСИ и загрузите чек')
      await this.audit.append(tx, { action: 'finance.payment_link', entityType: 'Charge', entityId: charge.id })
      return { mode: house!.paymentMode, pay_url: cfg.pay_url, recipient_name: cfg.recipient_name, amount: num(charge.amount) - num(charge.paidAmount), purpose: charge.title }
    })
  }

  /** Чек от жильца. Сначала распознаём, потом проверяем; сомнения не блокируют, а помечают */
  async submit(chargeId: string, input: SubmitPaymentBody): Promise<PaymentView> {
    const b = submitPaymentBody.parse(input)
    const i = await this.receipts.inspect(b.file_id, 'PAYMENT_RECEIPT')
    const amount = b.amount ?? i.fields?.amount ?? null
    if (amount === null) {
      throw unprocessable(ErrorCode.VALIDATION, 'Не удалось прочитать сумму в чеке. Введите её вручную', { fields: [{ path: 'amount', message: 'Сумма из чека' }], recognized: i.fields })
    }
    const ref = b.external_ref ?? i.fields?.ref ?? null
    const userId = ctx().userId ?? ''
    const id = await this.db.run(async (tx) => {
      const charge = await this.ownCharge(tx, chargeId)
      if (!(OPEN as readonly string[]).includes(charge.status)) throw state('Начисление уже оплачено или отменено')
      const flags = await this.receipts.duplicates(tx, i)
      flags.push(...(await this.checks(tx, charge, amount, ref, i.fields, b.amount)))
      const receipt = await this.receipts.store(tx, i, 'RESIDENT_PAYMENT')
      await this.files.attach(tx, [i.file.id], 'RECEIPT', receipt.id, userId, 'PAYMENT_RECEIPT')
      const p = await tx.payment.create({
        data: {
          houseId: charge.houseId, chargeId: charge.id, unitId: charge.unitId, paidBy: userId, amount: dec(amount),
          paidAt: b.paid_at ? new Date(b.paid_at) : i.fields?.date ? new Date(i.fields.date) : null,
          method: 'RECEIPT_UPLOAD', receiptId: receipt.id, externalRef: ref, status: flags.length ? 'FLAGGED' : 'PENDING_REVIEW', flags,
        },
      })
      await this.audit.append(tx, { action: 'finance.payment_submit', entityType: 'Payment', entityId: p.id, after: { charge: charge.id, amount, ref, flags: flags.map((f) => f.code) } })
      return p.id
    })
    const view = await this.detail(id)
    await this.tellBoard(`Оплата на проверку: №${view.unit.number}`, `${fmt.format(view.amount)} ₸ · ${view.charge.title}${view.flags.length ? ' · есть замечания' : ''}`, id)
    return view
  }

  async mine(): Promise<PaymentView[]> {
    const rows = await this.db.run((tx) => tx.payment.findMany({ where: { paidBy: ctx().userId }, include, orderBy: { createdAt: 'desc' }, take: 100 }))
    return this.views(rows)
  }

  /* ───────── правление ───────── */

  async list(input: PaymentListQuery): Promise<PaymentView[]> {
    const q = paymentListQuery.parse(input)
    const rows = await this.db.run((tx) => tx.payment.findMany({
      where: q.status === 'all' ? {} : q.status === 'review' ? { status: { in: ['PENDING_REVIEW', 'FLAGGED'] } } : { status: q.status },
      include, orderBy: { createdAt: q.status === 'review' ? 'asc' : 'desc' }, take: 500,
    }))
    return this.views(rows)
  }

  async detail(id: string): Promise<PaymentView> {
    const row = await this.db.run((tx) => tx.payment.findFirst({ where: { id }, include }))
    if (!row || (!isBoardRole(ctx().role) && row.paidBy !== ctx().userId)) throw notFound('Оплата')
    return (await this.views([row]))[0]!
  }

  async confirm(id: string, input: ConfirmPaymentBody): Promise<PaymentView> {
    const b = confirmPaymentBody.parse(input)
    const paidBy = await this.db.run(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`
      const p = await tx.payment.findFirst({ where: { id } })
      if (!p) throw notFound('Оплата')
      if (p.status !== 'PENDING_REVIEW' && p.status !== 'FLAGGED') throw state('Оплата уже рассмотрена')
      if (p.status === 'FLAGGED' && !b.acknowledge_flags) throw conflict(ErrorCode.FLAGS_NOT_ACKNOWLEDGED, 'У оплаты есть замечания: просмотрите их и подтвердите явно')
      await this.post(tx, p, b.amount)
      return p.paidBy
    })
    const view = await this.detail(id)
    await this.notifications.notify({
      userIds: [paidBy], houseId: ctx().houseId ?? '', category: 'PAYMENTS', priority: 'NORMAL',
      title: 'Оплата подтверждена', body: `${fmt.format(view.confirmed_amount ?? view.amount)} ₸ · ${view.charge.title}`, payload: { type: 'payment', id },
    })
    return view
  }

  async reject(id: string, input: RejectPaymentBody): Promise<PaymentView> {
    const b = rejectPaymentBody.parse(input)
    const paidBy = await this.db.run(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`
      const p = await tx.payment.findFirst({ where: { id } })
      if (!p) throw notFound('Оплата')
      if (p.status !== 'PENDING_REVIEW' && p.status !== 'FLAGGED') throw state('Оплата уже рассмотрена')
      await tx.payment.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: b.reason, confirmedBy: ctx().userId, confirmedAt: new Date() } })
      await this.audit.append(tx, { action: 'finance.payment_reject', entityType: 'Payment', entityId: id, after: { reason: b.reason } })
      return p.paidBy
    })
    await this.notifications.notify({
      userIds: [paidBy], houseId: ctx().houseId ?? '', category: 'PAYMENTS', priority: 'HIGH',
      title: 'Оплата не подтверждена', body: b.reason, payload: { type: 'payment', id },
    })
    return this.detail(id)
  }

  /** Наличные или перевод по банковской выписке: вносит правление, и это сразу подтверждение */
  async manual(input: ManualPaymentBody): Promise<PaymentView> {
    const b = manualPaymentBody.parse(input)
    const id = await this.db.run(async (tx) => {
      const charge = await tx.charge.findFirst({ where: { id: b.charge_id } })
      if (!charge) throw notFound('Начисление')
      if (!(OPEN as readonly string[]).includes(charge.status)) throw state('Начисление уже оплачено или отменено')
      const p = await tx.payment.create({
        data: {
          houseId: charge.houseId, chargeId: charge.id, unitId: charge.unitId, paidBy: ctx().userId ?? '', amount: dec(b.amount),
          paidAt: toDate(b.paid_on), method: b.method, externalRef: b.external_ref ?? null, status: 'PENDING_REVIEW',
        },
      })
      await this.post(tx, p, b.amount)
      return p.id
    })
    return this.detail(id)
  }

  /* ───────── внутреннее ───────── */

  /** Зачёт: начисление, поступление в журнале и статус оплаты — атомарно */
  private async post(tx: Tx, p: Payment, requested?: number) {
    await tx.$queryRaw`SELECT id FROM charges WHERE id = ${p.chargeId}::uuid FOR UPDATE`
    const charge = await tx.charge.findFirst({ where: { id: p.chargeId }, include: { unit: { select: { type: true } } } })
    if (!charge) throw notFound('Начисление')
    const remaining = charge.amount.sub(charge.paidAmount)
    if (charge.status === 'CANCELLED' || remaining.lte(0)) throw state('Начисление уже закрыто: зачесть оплату некуда')
    const credit = Prisma.Decimal.min(requested !== undefined ? dec(requested) : p.amount, remaining)

    const accountType = charge.type === 'CAPITAL_REPAIR' ? 'SAVINGS' : 'CURRENT'
    const account = await tx.financeAccount.findFirst({ where: { type: accountType } })
    if (!account) throw conflict(ErrorCode.ACCOUNT_MISSING, accountType === 'SAVINGS' ? 'Добавьте сберегательный счёт: на него поступают взносы на капремонт' : 'Добавьте текущий счёт дома')
    // Целевой взнос за парковку и кладовку — отдельная строка формы (6.6)
    const code = charge.type === 'TARGETED' && (charge.unit.type === 'PARKING' || charge.unit.type === 'STORAGE') ? '6.6' : CHARGE_CATEGORY[charge.type]
    const paidDay = p.paidAt ? dateStr(new Date(p.paidAt.getTime() + 5 * 3600_000)) : almatyToday()
    let occurred = paidDay < dateStr(account.openedOn) || paidDay > almatyToday() ? almatyToday() : paidDay
    // Месяц уже подписан — деньги ложатся в текущий: подписанный отчёт не меняется задним числом
    if (await isPeriodClosed(tx, periodOf(occurred))) occurred = almatyToday()

    const seq = await tx.$queryRaw<{ transaction_seq: number }[]>`
      UPDATE houses SET transaction_seq = transaction_seq + 1 WHERE id = ${charge.houseId}::uuid RETURNING transaction_seq`
    const now = new Date()
    const t = await tx.transaction.create({
      data: {
        houseId: charge.houseId, number: seq[0]?.transaction_seq ?? 0, accountId: account.id, categoryCode: code, direction: 'IN', amount: credit,
        occurredOn: toDate(occurred), period: periodOf(occurred),
        // Без номера помещения и имени: журнал открыт всему дому, а кто платил — не его дело (docs/14 §4)
        description: `Оплата начисления: ${charge.title}`,
        status: 'CONFIRMED', confirmedBy: ctx().userId, confirmedAt: now, createdBy: ctx().userId ?? '',
        idempotencyKey: `payment-${p.id}`, requestHash: createHash('sha256').update(p.id).digest(),
      },
    })
    const paid = charge.paidAmount.add(credit)
    await tx.charge.update({
      where: { id: charge.id },
      data: { paidAmount: paid, status: paid.gte(charge.amount) ? 'PAID' : charge.status === 'OVERDUE' ? 'OVERDUE' : 'PARTIALLY_PAID' },
    })
    try {
      await tx.payment.update({ where: { id: p.id }, data: { status: 'CONFIRMED', confirmedBy: ctx().userId, confirmedAt: now, confirmedAmount: credit, transactionId: t.id } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw state('Оплата с этим номером операции уже подтверждена')
      throw e
    }
    await this.audit.append(tx, {
      action: 'finance.payment_confirm', entityType: 'Payment', entityId: p.id,
      after: { charge: charge.id, credited: num(credit), transaction: t.id, number: t.number, category: code, method: p.method },
    })
  }

  /** Номер операции, сумма и получатель — сверка с начислением и с уже принятыми оплатами */
  private async checks(tx: Tx, charge: Charge, amount: number, ref: string | null, fields: ReceiptFields | null, typed?: number): Promise<Flag[]> {
    const flags: Flag[] = []
    if (ref) {
      const here = await tx.payment.count({ where: { externalRef: ref, status: { not: 'REJECTED' } } })
      const anywhere = here ? 0 : await asSystem(() => this.db.run((sys) => sys.payment.count({ where: { externalRef: ref, status: { not: 'REJECTED' } } })))
      if (here || anywhere) flags.push({ code: 'DUPLICATE_REF', message: `Номер операции ${ref} уже указан в другой оплате` })
    }
    const remaining = num(charge.amount) - num(charge.paidAmount)
    if (Math.abs(amount - remaining) > 0.005) flags.push({ code: 'AMOUNT_MISMATCH', message: `Оплачено ${fmt.format(amount)} ₸, к оплате ${fmt.format(remaining)} ₸` })
    if (typed !== undefined && fields?.amount && Math.abs(fields.amount - typed) > 0.005) {
      flags.push({ code: 'AMOUNT_MISMATCH', message: `В чеке ${fmt.format(fields.amount)} ₸, а указано ${fmt.format(typed)} ₸` })
    }
    const cfg = (await tx.house.findFirst({ where: { id: charge.houseId }, select: { kaspiConfig: true } }))?.kaspiConfig as KaspiConfig | null
    if (fields?.recipient && cfg && !sameRecipient(fields.recipient, cfg.recipient_name)) {
      flags.push({ code: 'RECIPIENT_MISMATCH', message: `Получатель в чеке «${fields.recipient}», а у ОСИ — «${cfg.recipient_name}»` })
    }
    return flags
  }

  /** Начисление по своему помещению: собственность подтверждена. Иначе — «не найдено», а не «чужое» */
  private async ownCharge(tx: Tx, chargeId: string): Promise<Charge> {
    const charge = await tx.charge.findFirst({ where: { id: chargeId } })
    const mine = charge && (await tx.unitOwnership.count({ where: { unitId: charge.unitId, userId: ctx().userId, verificationStatus: 'VERIFIED' } }))
    if (!charge || !mine) throw notFound('Начисление')
    return charge
  }

  private async tellBoard(title: string, body: string, paymentId: string) {
    const houseId = ctx().houseId ?? ''
    const board = await this.db.run((tx) => tx.houseMembership.findMany({ where: { role: { in: ['CHAIRMAN', 'ACCOUNTANT'] }, status: 'ACTIVE' }, select: { userId: true } }))
    await this.notifications.notify({ userIds: board.map((m) => m.userId), houseId, category: 'PAYMENTS', priority: 'NORMAL', title, body, payload: { type: 'payment', id: paymentId } })
  }

  private async views(rows: Row[]): Promise<PaymentView[]> {
    const board = isBoardRole(ctx().role)
    const [units, users] = await this.db.run((tx) => Promise.all([
      tx.unit.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.unitId))] } }, select: { id: true, number: true } }),
      board ? tx.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.paidBy))] } }, select: { id: true, fullName: true } }) : [],
    ]))
    const unit = new Map(units.map((u) => [u.id, u]))
    const name = new Map(users.map((u) => [u.id, u.fullName]))
    return rows.map((r) => ({
      id: r.id, status: r.status, method: r.method, amount: num(r.amount), confirmed_amount: r.confirmedAmount ? num(r.confirmedAmount) : null,
      paid_at: r.paidAt?.toISOString() ?? null, external_ref: r.externalRef, created_at: r.createdAt.toISOString(),
      confirmed_at: r.confirmedAt?.toISOString() ?? null, rejection_reason: r.rejectionReason,
      flags: (r.flags as Flag[]) ?? [],
      charge: { id: r.charge.id, title: r.charge.title, period: r.charge.period, amount: num(r.charge.amount), paid_amount: num(r.charge.paidAmount) },
      unit: unit.get(r.unitId) ?? { id: r.unitId, number: '' },
      receipt: r.receipt ? { file_id: r.receipt.fileId, recognized: (r.receipt.ocrParsed as ReceiptFields | null) ?? null } : null,
      ...(board && { paid_by: { id: r.paidBy, name: name.get(r.paidBy) ?? '' } }),
    }))
  }
}
