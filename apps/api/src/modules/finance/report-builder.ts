import type { BudgetCategory, ChargeType } from '@prisma/client'
import type { ReportIssue, ReportRow, ReportView } from '@ortaq/shared'
import type { Tx } from '../../infra/prisma.service'
import { dueDateOf } from './charges.service'
import { dateStr, num, toDate } from './finance.util'
import { missing } from './transactions.service'

type Source =
  | { kind: 'balance'; account: 'CURRENT' | 'SAVINGS' }
  | { kind: 'debt'; charge_types: ChargeType[] }
  | { kind: 'codes'; prefix: string; detail?: 'payees' }
  | { kind: 'sum'; of: string[] }
export type TemplateSchema = { title: string; rows: { code: string; source: Source }[] }

export type BuiltReport = {
  data: { header: ReportView['header']; rows: ReportRow[] }
  issues: ReportIssue[]
  work: ReportView['work']
}

const MANAGEMENT: Record<string, string> = { OSI: 'Объединение собственников имущества', PT: 'Простое товарищество' }
const round = (n: number) => Math.round(n * 100) / 100
const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

/**
 * Заполнение формы за месяц (docs/10 §7). Источник каждой строки — в шаблоне: остаток счёта на
 * конец месяца, долг по видам начислений, сумма проведённых операций по кодам строки или сумма
 * других строк. Поэтому смена формы — данные, а цифры совпадают с дашбордом по построению.
 */
export async function buildReport(tx: Tx, houseId: string, period: string, schema: TemplateSchema, categories: Map<string, BudgetCategory>): Promise<BuiltReport> {
  const end = dueDateOf(period)
  const house = await tx.house.findFirstOrThrow({ where: { id: houseId }, include: { organization: true } })
  const accounts = await tx.financeAccount.findMany()
  const moves = await tx.transaction.groupBy({ by: ['accountId', 'direction'], where: { status: 'CONFIRMED', occurredOn: { lte: end } }, _sum: { amount: true } })
  const byCode = await tx.transaction.groupBy({ by: ['categoryCode'], where: { status: 'CONFIRMED', period }, _sum: { amount: true } })
  const debts = await tx.charge.findMany({ where: { period: { lte: period }, status: { not: 'CANCELLED' } }, select: { type: true, amount: true, paidAmount: true } })

  const values = new Map<string, number>()
  const lines = new Map<string, ReportRow['lines']>()
  const sourceOf = new Map(schema.rows.map((r) => [r.code, r.source]))
  const value = async (code: string): Promise<number> => {
    if (values.has(code)) return values.get(code)!
    const src = sourceOf.get(code)
    let v = 0
    if (src?.kind === 'balance') {
      const a = accounts.find((x) => x.type === src.account)
      if (a && a.openedOn <= end) {
        const of = (d: 'IN' | 'OUT') => num(moves.find((m) => m.accountId === a.id && m.direction === d)?._sum.amount)
        v = num(a.openingBalance) + of('IN') - of('OUT')
      }
    } else if (src?.kind === 'debt') {
      v = debts.filter((c) => src.charge_types.includes(c.type)).reduce((s, c) => s + num(c.amount) - num(c.paidAmount), 0)
    } else if (src?.kind === 'codes') {
      v = byCode.filter((r) => r.categoryCode === src.prefix || r.categoryCode.startsWith(`${src.prefix}.`)).reduce((s, r) => s + num(r._sum.amount), 0)
      if (src.detail === 'payees') lines.set(code, await payees(tx, period, src.prefix, categories))
    } else if (src?.kind === 'sum') {
      for (const c of src.of) v += await value(c)
    }
    values.set(code, round(v))
    return round(v)
  }
  const rows: ReportRow[] = []
  for (const r of schema.rows) {
    const amount = await value(r.code)
    rows.push({
      code: r.code, label: categories.get(r.code)?.nameRu ?? r.code, level: r.code.split('.').length - 1, amount,
      ...(lines.has(r.code) && { lines: lines.get(r.code) }),
    })
  }

  const bank = (t: 'CURRENT' | 'SAVINGS') => accounts.find((a) => a.type === t)?.bankName ?? null
  return {
    data: {
      header: {
        address: house.address, management_form: MANAGEMENT[house.organization.managementForm] ?? house.organization.managementForm,
        organization: house.organization.name, bin: house.organization.bin, legal_address: house.organization.legalAddress,
        period_from: `${period}-01`, period_to: dateStr(end), banks: { CURRENT: bank('CURRENT'), SAVINGS: bank('SAVINGS') },
      },
      rows,
    },
    issues: await completeness(tx, period),
    work: await work(tx, period, end),
  }
}

/** 7.2.1: форма печатает исполнителя и вид услуги по каждой паре */
async function payees(tx: Tx, period: string, prefix: string, categories: Map<string, BudgetCategory>): Promise<NonNullable<ReportRow['lines']>> {
  const items = await tx.transaction.findMany({
    where: { status: 'CONFIRMED', period, categoryCode: { startsWith: `${prefix}.` } },
    select: { categoryCode: true, amount: true, counterparty: true, contractor: { select: { name: true } } },
  })
  const grouped = new Map<string, { payee: string; service: string; amount: number }>()
  for (const t of items) {
    const payee = t.contractor?.name ?? t.counterparty ?? 'Не указан'
    const key = `${payee}|${t.categoryCode}`
    const g = grouped.get(key) ?? { payee, service: categories.get(t.categoryCode)?.nameRu ?? t.categoryCode, amount: 0 }
    g.amount = round(g.amount + num(t.amount))
    grouped.set(key, g)
  }
  return [...grouped.values()].sort((a, b) => b.amount - a.amount)
}

/** Проверка полноты: что исправить за пять дней до срока, пока ещё можно запросить документ */
async function completeness(tx: Tx, period: string): Promise<ReportIssue[]> {
  const issues: ReportIssue[] = []
  const expenses = await tx.transaction.findMany({
    where: { period, status: 'CONFIRMED', direction: 'OUT' },
    select: { id: true, number: true, amount: true, category: { select: { shortName: true, requiredDocuments: true } }, documents: { where: { removedAt: null }, select: { kind: true } } },
    orderBy: { number: 'asc' },
  })
  for (const e of expenses) {
    const gaps = missing(e.category.requiredDocuments, e.documents.map((d) => d.kind))
    if (gaps.length) {
      issues.push({
        kind: 'MISSING_DOCUMENTS', message: `${e.category.shortName} ${fmt.format(num(e.amount))} ₸ — не хватает документов`,
        transaction: { id: e.id, number: e.number, amount: num(e.amount), category: e.category.shortName, missing: gaps },
      })
    }
  }
  const drafts = await tx.transaction.count({ where: { period, status: 'DRAFT' } })
  if (drafts) issues.push({ kind: 'UNPOSTED_DRAFTS', message: `Не проведено черновиков за месяц: ${drafts}` })
  const review = await tx.payment.count({ where: { status: { in: ['PENDING_REVIEW', 'FLAGGED'] } } })
  if (review) issues.push({ kind: 'PAYMENTS_TO_REVIEW', message: `Оплаты жильцов ждут проверки: ${review}` })
  const noArea = await tx.unit.count({ where: { area: null, type: { in: ['APARTMENT', 'COMMERCIAL'] } } })
  if (noArea) issues.push({ kind: 'UNITS_WITHOUT_AREA', message: `Помещений без площади: ${noArea} — им не начислены взносы` })
  return issues
}

/** Фотоотчёт: подтверждённые председателем работы месяца, отмеченные для отчёта */
async function work(tx: Tx, period: string, end: Date): Promise<ReportView['work']> {
  const done = await tx.taskCompletion.findMany({
    where: { includeInReport: true, approvedAt: { gte: toDate(`${period}-01`), lt: new Date(end.getTime() + 86_400_000) } },
    select: { taskId: true, approvedAt: true, photoFileIds: true, task: { select: { title: true } } },
    orderBy: { approvedAt: 'asc' },
  })
  return done.map((d) => ({ task_id: d.taskId, title: d.task.title, completed_at: d.approvedAt!.toISOString(), photo_file_ids: d.photoFileIds }))
}
