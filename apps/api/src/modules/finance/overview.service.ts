import { Injectable } from '@nestjs/common'
import { overviewQuery, type CategoryTotal, type FinanceOverview, type OverviewQuery } from '@ortaq/shared'
import { ctx } from '../../common/context'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { isBoardRole } from '../requests/visibility'
import { AccountsService } from './accounts.service'
import { CategoriesService, compareCodes } from './categories.service'
import { almatyToday, num, periodOf, toDate } from './finance.util'
import { missing } from './transactions.service'

const MONTHS_BACK = 6
const round = (n: number) => Math.round(n * 100) / 100

export function periodsBack(p: string, n: number): string[] {
  const [y, m] = p.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y!, m! - 1 - (n - 1 - i), 1)).toISOString().slice(0, 7))
}

/**
 * Дашборд (docs/10 §8). Одна структура для жильца и правления — это и есть проверяемая
 * прозрачность: суммы по строкам здесь те же, что соберёт отчёт. Правлению сверху — очередь дел.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly db: PrismaService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
  ) {}

  async overview(input: OverviewQuery): Promise<FinanceOverview> {
    const q = overviewQuery.parse(input)
    const period = q.period ?? periodOf(almatyToday())
    const names = await this.categories.all()
    return this.db.run(async (tx) => {
      const accounts = await tx.financeAccount.findMany({ orderBy: { type: 'asc' } })
      const balances = await Promise.all(accounts.map(async (a) => {
        const m = await this.accounts.balance(tx, a.id)
        return { type: a.type, bank_name: a.bankName, balance: round(num(a.openingBalance) + m.in - m.out) }
      }))
      const rows = await tx.transaction.groupBy({ by: ['categoryCode', 'direction'], where: { period, status: 'CONFIRMED' }, _sum: { amount: true }, _count: true })
      const totals = (dir: 'IN' | 'OUT'): CategoryTotal[] => rows.filter((r) => r.direction === dir)
        .map((r) => ({ code: r.categoryCode, name: names.get(r.categoryCode)?.shortName ?? r.categoryCode, amount: num(r._sum.amount), transaction_count: r._count }))
        .sort((a, b) => compareCodes(a.code, b.code))
      const income = totals('IN')
      const expense = totals('OUT')

      const periods = periodsBack(period, MONTHS_BACK)
      const trend = await tx.transaction.groupBy({ by: ['period', 'direction'], where: { period: { in: periods }, status: 'CONFIRMED' }, _sum: { amount: true } })
      const sum = (p: string, d: 'IN' | 'OUT') => num(trend.find((t) => t.period === p && t.direction === d)?._sum.amount)

      const charged = await tx.charge.aggregate({ where: { period, status: { not: 'CANCELLED' } }, _sum: { amount: true, paidAmount: true } })
      const due = num(charged._sum.amount)

      return {
        period, accounts: balances,
        income_total: round(income.reduce((s, c) => s + c.amount, 0)),
        expense_total: round(expense.reduce((s, c) => s + c.amount, 0)),
        collection_rate: due > 0 ? Math.round((num(charged._sum.paidAmount) / due) * 1000) / 10 : null,
        income_by_category: income, expense_by_category: expense,
        months: periods.map((p) => ({ period: p, income: sum(p, 'IN'), expense: sum(p, 'OUT') })),
        ...(isBoardRole(ctx().role) && { board: await this.queue(tx, period) }),
      }
    })
  }

  /** Что ждёт правление: черновики, расходы без документов, оплаты на проверке, просроченный долг */
  private async queue(tx: Tx, period: string): Promise<NonNullable<FinanceOverview['board']>> {
    const [drafts, toReview, expenses, overdue] = await Promise.all([
      tx.transaction.count({ where: { status: 'DRAFT' } }),
      tx.payment.count({ where: { status: { in: ['PENDING_REVIEW', 'FLAGGED'] } } }),
      tx.transaction.findMany({
        where: { period, status: 'CONFIRMED', direction: 'OUT' },
        select: { category: { select: { requiredDocuments: true } }, documents: { where: { removedAt: null }, select: { kind: true } } },
      }),
      tx.charge.findMany({ where: { status: 'OVERDUE', dueDate: { lt: toDate(almatyToday()) } }, select: { amount: true, paidAmount: true } }),
    ])
    return {
      drafts, payments_to_review: toReview,
      missing_documents: expenses.filter((e) => missing(e.category.requiredDocuments, e.documents.map((d) => d.kind)).length > 0).length,
      debt_total: round(overdue.reduce((s, c) => s + num(c.amount) - num(c.paidAmount), 0)),
    }
  }
}
