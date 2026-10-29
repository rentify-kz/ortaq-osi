import { Inject, Injectable } from '@nestjs/common'
import type { Report } from '@prisma/client'
import {
  ErrorCode, generateReportBody, type GenerateReportBody, type ReportIssue, type ReportListItem, type ReportRow, type ReportView, type SigningStartView,
} from '@ortaq/shared'
import { createHash } from 'node:crypto'
import { asSystem, ctx } from '../../common/context'
import { AppError, conflict, forbidden, notFound, unprocessable } from '../../common/errors'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { SIGNATURE_PROVIDER, type SignatureProvider } from '../../integrations/signature/signature.provider'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from '../notifications/notifications.service'
import { isBoardRole } from '../requests/visibility'
import { titleCaseName } from '../verification/names'
import { CategoriesService } from './categories.service'
import { dueDateOf, monthName } from './charges.service'
import { almatyToday, dateStr, periodOf } from './finance.util'
import { buildReport, type BuiltReport, type TemplateSchema } from './report-builder'
export { assertPeriodOpen, isPeriodClosed } from './period-lock'

type SignRole = 'CHAIRMAN' | 'ACCOUNTANT'
type Pending = Partial<Record<SignRole, { external_id: string; user_id: string }>>

const state = (message: string) => conflict(ErrorCode.REPORT_STATE, message)

/** Срок сдачи — 20 число следующего месяца (docs/10 §7) */
export function reportDueDate(p: string): Date {
  const [y, m] = p.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 20))
}

/** Канонический вид: ключи по алфавиту — одинаковые данные дают одинаковый хеш на любой машине */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v)
}

/**
 * Отчётность (docs/10 §7). Черновик собирается 15 числа или вручную и пересобирается, пока его
 * никто не подписал. ЭЦП подписывает хеш содержимого; первая подпись закрывает месяц для правок.
 * Подписи председателя и бухгалтера (если бухгалтер есть) → SIGNED → публикация всем жильцам.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly categories: CategoriesService,
    private readonly notifications: NotificationsService,
    @Inject(SIGNATURE_PROVIDER) private readonly signer: SignatureProvider,
  ) {}

  async generate(input: GenerateReportBody): Promise<ReportView> {
    const { period } = generateReportBody.parse(input)
    if (period > periodOf(almatyToday())) throw unprocessable(ErrorCode.VALIDATION, 'Отчёт за месяц, который ещё не наступил, не формируется', { fields: [{ path: 'period', message: 'Не позже текущего месяца' }] })
    const id = await this.run(period, ctx().userId ?? null)
    return this.detail(id)
  }

  /** Сборка за месяц; вызывают правление и планировщик в контексте дома */
  async run(period: string, actorId: string | null): Promise<string> {
    const houseId = ctx().houseId ?? ''
    const categories = await this.categories.all()
    return this.db.run(async (tx) => {
      // Блокировка строки отчёта: пересборка и подписание одной и той же версии идут по очереди
      await tx.$queryRaw`SELECT id FROM reports WHERE type = 'MONTHLY' AND period = ${period} FOR UPDATE`
      const existing = await tx.report.findFirst({ where: { type: 'MONTHLY', period } })
      if (existing && (existing.status !== 'DRAFT' || existing.chairmanSignatureId || existing.accountantSignatureId)) {
        throw state('Отчёт уже подписан: пересобрать его нельзя')
      }
      const { template, built, dataHash } = await this.compose(tx, houseId, period, categories)
      const fields = {
        templateId: template.id, data: built.data, issues: built.issues, workSummary: built.work, dataHash,
        generatedAt: new Date(), generatedBy: actorId, pendingSigning: {}, dueDate: reportDueDate(period),
      }
      const report = existing
        ? await tx.report.update({ where: { id: existing.id }, data: fields })
        : await tx.report.create({ data: { houseId, type: 'MONTHLY', period, ...fields } })
      await this.audit.append(tx, {
        action: existing ? 'finance.report_regenerate' : 'finance.report_generate', entityType: 'Report', entityId: report.id,
        after: { period, issues: built.issues.length, by: actorId ? 'user' : 'schedule' },
      })
      return report.id
    })
  }

  /** Форма, заполненная из журнала, и хеш содержимого — включая фотоотчёт: подпись покрывает всё, что видит жилец */
  private async compose(tx: Tx, houseId: string, period: string, categories: Awaited<ReturnType<CategoriesService['all']>>) {
    const template = await tx.reportTemplate.findFirst({
      where: { formCode: 'MONTHLY_CONDOMINIUM', effectiveFrom: { lte: dueDateOf(period) }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: dueDateOf(period) } }] },
      orderBy: { effectiveFrom: 'desc' },
    })
    if (!template) throw state('Нет действующей формы отчёта для этого месяца')
    const built = await buildReport(tx, houseId, period, template.schema as TemplateSchema, categories)
    const dataHash = createHash('sha256').update(canonical({ house: houseId, period, form: template.version, ...built.data, work: built.work })).digest()
    return { template, built, dataHash }
  }

  async list(): Promise<ReportListItem[]> {
    const rows = await this.db.run((tx) => tx.report.findMany({
      where: isBoardRole(ctx().role) ? {} : { status: 'PUBLISHED' }, orderBy: { period: 'desc' }, take: 60,
    }))
    return rows.map((r) => ({
      id: r.id, period: r.period, status: r.status, due_date: dateStr(r.dueDate), generated_at: r.generatedAt.toISOString(),
      published_at: r.publishedAt?.toISOString() ?? null, issues: (r.issues as ReportIssue[]).length,
    }))
  }

  async detail(id: string): Promise<ReportView> {
    const r = await this.db.run((tx) => tx.report.findFirst({ where: { id }, include: { template: { select: { legalSource: true } } } }))
    // Жильцам отчёт существует только опубликованным
    if (!r || (r.status !== 'PUBLISHED' && !isBoardRole(ctx().role))) throw notFound('Отчёт')
    const sigIds = [r.chairmanSignatureId, r.accountantSignatureId].filter((x): x is string => !!x)
    const sigs = sigIds.length ? await asSystem(() => this.db.run((tx) => tx.signature.findMany({ where: { id: { in: sigIds } }, select: { id: true, signerFullName: true, createdAt: true } }))) : []
    const sig = (sid: string | null) => {
      const s = sigs.find((x) => x.id === sid)
      return s ? { name: titleCaseName(s.signerFullName), signed_at: s.createdAt.toISOString() } : null
    }
    const data = r.data as BuiltReport['data']
    return {
      id: r.id, period: r.period, status: r.status, due_date: dateStr(r.dueDate), generated_at: r.generatedAt.toISOString(),
      published_at: r.publishedAt?.toISOString() ?? null, legal_source: r.template.legalSource,
      header: data.header, rows: data.rows as ReportRow[],
      // Недочёты — рабочая кухня правления; в опубликованном отчёте жильцу не нужны
      issues: isBoardRole(ctx().role) ? (r.issues as ReportIssue[]) : [],
      work: r.workSummary as ReportView['work'],
      signatures: { chairman: sig(r.chairmanSignatureId), accountant: sig(r.accountantSignatureId), accountant_required: await this.accountantRequired() },
    }
  }

  /** Начать подписание своей ролью: в eGov уходит хеш содержимого, а не сам отчёт */
  async startSigning(id: string): Promise<SigningStartView> {
    const role = this.signRole()
    const userId = ctx().userId ?? ''
    let r = await this.db.run((tx) => tx.report.findFirst({ where: { id } }))
    if (!r) throw notFound('Отчёт')
    if (r.status !== 'DRAFT') throw state('Отчёт уже подписан')
    // Подписывается актуальное: если журнал изменился после 15-го, неподписанный черновик пересобирается
    if (!r.chairmanSignatureId && !r.accountantSignatureId) {
      const categories = await this.categories.all()
      const fresh = await this.db.run((tx) => this.compose(tx, r!.houseId, r!.period, categories))
      if (!Buffer.from(fresh.dataHash).equals(Buffer.from(r.dataHash))) {
        await this.run(r.period, userId)
        r = await this.db.run((tx) => tx.report.findFirstOrThrow({ where: { id } }))
      }
    }
    if (this.signatureOf(r, role)) throw state(role === 'CHAIRMAN' ? 'Председатель уже подписал отчёт' : 'Бухгалтер уже подписал отчёт')
    const user = await this.db.run((tx) => tx.user.findUniqueOrThrow({ where: { id: userId }, select: { iinHash: true } }))
    if (!user.iinHash) throw new AppError(422, ErrorCode.IDENTITY_REQUIRED, 'Сначала подтвердите личность через eGov mobile: отчёт подписывается вашей ЭЦП')

    const started = await this.signer.start({ documentHash: new Uint8Array(r.dataHash), description: `Ежемесячный отчёт по управлению объектом кондоминиума за ${monthName(r.period)}` })
    await this.db.run(async (tx) => {
      const pending: Pending = { ...(r.pendingSigning as Pending), [role]: { external_id: started.externalId, user_id: userId } }
      await tx.report.update({ where: { id }, data: { pendingSigning: pending } })
      await this.audit.append(tx, { action: 'finance.report_sign_start', entityType: 'Report', entityId: id, after: { role } })
    })
    return { external_id: started.externalId, qr_url: started.qrUrl, deeplink: started.deeplink, expires_at: started.expiresAt.toISOString() }
  }

  /** «Я подписал»: сервер сам забирает подпись, проверяет её и сверяет ИИН подписанта с пользователем */
  async completeSigning(id: string): Promise<ReportView | { status: 'PENDING' }> {
    const role = this.signRole()
    const userId = ctx().userId ?? ''
    const r = await this.db.run((tx) => tx.report.findFirst({ where: { id } }))
    if (!r) throw notFound('Отчёт')
    const pending = (r.pendingSigning as Pending)[role]
    if (!pending || pending.user_id !== userId) throw state('Подписание не начато или отчёт пересобран — начните заново')
    const fetched = await this.signer.fetch(pending.external_id)
    if (fetched.status === 'PENDING') return { status: 'PENDING' }
    if (fetched.status === 'EXPIRED') {
      await this.clearPending(id, role)
      throw state('Время на подписание истекло. Начните заново')
    }
    const checked = await this.signer.verify(fetched.signature, new Uint8Array(r.dataHash))
    if (!checked.valid) throw new AppError(422, ErrorCode.VERIFICATION_FAILED, `Подпись не прошла проверку: ${checked.reason}`)
    const iinHash = this.crypto.hashIin(checked.signer.iin)
    const user = await this.db.run((tx) => tx.user.findUniqueOrThrow({ where: { id: userId }, select: { iinHash: true } }))
    if (!user.iinHash || !this.crypto.equal(user.iinHash, iinHash)) throw new AppError(422, ErrorCode.VERIFICATION_FAILED, 'Отчёт подписан ЭЦП другого человека')

    const now = new Date()
    const sig = await asSystem(() => this.db.run((tx) => tx.signature.create({
      data: {
        userId, provider: this.signer.name, externalId: pending.external_id, purpose: 'REPORT', documentHash: r.dataHash, signatureData: Buffer.from(fetched.signature),
        signerIinHash: iinHash, signerFullName: checked.signer.fullName, certSerial: checked.cert.serial, certValidFrom: checked.cert.validFrom,
        certValidTo: checked.cert.validTo, verifiedAt: now, verificationResult: { valid: true, issuer: checked.cert.issuer, signed_at: checked.signedAt.toISOString() },
      },
    })))
    const needsAccountant = await this.accountantRequired()
    await this.db.run(async (tx) => {
      // Хеш сверяется ещё раз под блокировкой: отчёт могли пересобрать, пока шло подписание
      await tx.$queryRaw`SELECT id FROM reports WHERE id = ${id}::uuid FOR UPDATE`
      const fresh = await tx.report.findFirstOrThrow({ where: { id } })
      if (!Buffer.from(fresh.dataHash).equals(Buffer.from(r.dataHash))) throw state('Отчёт пересобран во время подписания — подпишите новую версию')
      if (fresh.status !== 'DRAFT' || this.signatureOf(fresh, role)) throw state('Отчёт уже подписан этой ролью')
      // Журнал мог измениться, пока шло подписание: подпись должна покрывать то, что в нём есть сейчас
      const current = await this.compose(tx, fresh.houseId, fresh.period, await this.categories.all())
      if (!Buffer.from(current.dataHash).equals(Buffer.from(r.dataHash))) throw state('Данные месяца изменились во время подписания. Начните подписание заново')
      const next = { ...fresh, [role === 'CHAIRMAN' ? 'chairmanSignatureId' : 'accountantSignatureId']: sig.id }
      const complete = !!next.chairmanSignatureId && (!!next.accountantSignatureId || !needsAccountant)
      const rest: Pending = { ...(fresh.pendingSigning as Pending) }
      delete rest[role]
      await tx.report.update({
        where: { id },
        data: {
          ...(role === 'CHAIRMAN' ? { chairmanSignatureId: sig.id } : { accountantSignatureId: sig.id }),
          pendingSigning: rest, ...(complete && { status: 'SIGNED', signedAt: now }),
        },
      })
      await this.audit.append(tx, { action: 'finance.report_sign', entityType: 'Report', entityId: id, after: { role, signature: sig.id, complete } })
    })
    return this.detail(id)
  }

  /** Публикация: закон требует представить отчёт собственникам — здесь это лента и уведомление каждому */
  async publish(id: string): Promise<ReportView> {
    const houseId = ctx().houseId ?? ''
    const r = await this.db.run(async (tx) => {
      const r = await tx.report.findFirst({ where: { id } })
      if (!r) throw notFound('Отчёт')
      if (r.status !== 'SIGNED') throw state(r.status === 'PUBLISHED' ? 'Отчёт уже опубликован' : 'Опубликовать можно только подписанный отчёт')
      await tx.report.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: ctx().userId } })
      await this.audit.append(tx, { action: 'finance.report_publish', entityType: 'Report', entityId: id, after: { period: r.period } })
      return r
    })
    const members = await this.db.run((tx) => tx.houseMembership.findMany({ where: { status: 'ACTIVE' }, select: { userId: true } }))
    await this.notifications.notify({
      userIds: members.map((m) => m.userId), houseId, category: 'REPORTS', priority: 'NORMAL',
      title: `Отчёт за ${monthName(r.period)}`, body: 'Подписан председателем и опубликован: поступления, расходы и выполненные работы', payload: { type: 'report', id },
    })
    return this.detail(id)
  }

  /** Подпись бухгалтера нужна, если бухгалтер в доме есть; без него форму подписывает председатель */
  private async accountantRequired(): Promise<boolean> {
    return (await this.db.run((tx) => tx.houseMembership.count({ where: { role: 'ACCOUNTANT', status: 'ACTIVE' } }))) > 0
  }

  private signRole(): SignRole {
    const role = ctx().role
    if (role !== 'CHAIRMAN' && role !== 'ACCOUNTANT') throw forbidden('Отчёт подписывают председатель и бухгалтер')
    return role
  }

  private signatureOf(r: Report, role: SignRole) {
    return role === 'CHAIRMAN' ? r.chairmanSignatureId : r.accountantSignatureId
  }

  private async clearPending(id: string, role: SignRole) {
    await this.db.run(async (tx) => {
      const r = await tx.report.findFirstOrThrow({ where: { id } })
      const rest: Pending = { ...(r.pendingSigning as Pending) }
      delete rest[role]
      await tx.report.update({ where: { id }, data: { pendingSigning: rest } })
    })
  }
}

