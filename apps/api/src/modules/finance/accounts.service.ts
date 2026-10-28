import { Injectable } from '@nestjs/common'
import type { FinanceAccount } from '@prisma/client'
import { createAccountBody, ErrorCode, updateAccountBody, type AccountView, type CreateAccountBody, type UpdateAccountBody } from '@ortaq/shared'
import { ctx } from '../../common/context'
import { conflict, notFound } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { dateStr, dec, num, toDate } from './finance.util'

/** Полный IBAN не храним: строкам 1–2 отчёта и жильцам хватает банка и последних цифр */
const mask = (n: string | null | undefined) => (n ? `•••• ${n.slice(-4)}` : null)

/**
 * Счета дома (docs/10 §2): текущий и сберегательный, по одному. Остаток не хранится,
 * а считается из проведённых операций — разойтись с журналом ему не с чем.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<AccountView[]> {
    return this.db.run(async (tx) => {
      const accounts = await tx.financeAccount.findMany({ orderBy: { type: 'asc' } })
      return Promise.all(accounts.map((a) => this.view(tx, a)))
    })
  }

  async create(input: CreateAccountBody): Promise<AccountView> {
    const b = createAccountBody.parse(input)
    return this.db.run(async (tx) => {
      if (await tx.financeAccount.findFirst({ where: { type: b.type } })) throw conflict(ErrorCode.ACCOUNT_EXISTS, b.type === 'CURRENT' ? 'Текущий счёт уже добавлен' : 'Сберегательный счёт уже добавлен')
      const a = await tx.financeAccount.create({
        data: { houseId: ctx().houseId ?? '', type: b.type, bankName: b.bank_name, accountNumberMasked: mask(b.account_number), openingBalance: dec(b.opening_balance), openedOn: toDate(b.opened_on) },
      })
      await this.audit.append(tx, { action: 'finance.account_create', entityType: 'FinanceAccount', entityId: a.id, after: { type: a.type, bank: a.bankName, opening_balance: b.opening_balance, opened_on: b.opened_on } })
      return this.view(tx, a)
    })
  }

  async update(id: string, input: UpdateAccountBody): Promise<AccountView> {
    const b = updateAccountBody.parse(input)
    return this.db.run(async (tx) => {
      // Та же блокировка, что при проведении: остаток не меняется одновременно с первой операцией
      await tx.$queryRaw`SELECT id FROM finance_accounts WHERE id = ${id}::uuid FOR UPDATE`
      const a = await tx.financeAccount.findFirst({ where: { id } })
      if (!a) throw notFound('Счёт')
      // Начальный остаток — основа всех остатков после него: после первой проведённой операции он заморожен
      if (b.opening_balance !== undefined || b.opened_on !== undefined) {
        const posted = await tx.transaction.count({ where: { accountId: id, status: { not: 'DRAFT' } } })
        if (posted > 0) throw conflict(ErrorCode.TRANSACTION_STATE, 'По счёту уже есть проведённые операции: начальный остаток не меняется')
      }
      const updated = await tx.financeAccount.update({
        where: { id },
        data: {
          bankName: b.bank_name,
          ...(b.account_number !== undefined && { accountNumberMasked: mask(b.account_number) }),
          ...(b.opening_balance !== undefined && { openingBalance: dec(b.opening_balance) }),
          ...(b.opened_on !== undefined && { openedOn: toDate(b.opened_on) }),
        },
      })
      await this.audit.append(tx, {
        action: 'finance.account_update', entityType: 'FinanceAccount', entityId: id,
        before: { bank: a.bankName, opening_balance: num(a.openingBalance), opened_on: dateStr(a.openedOn) },
        after: { ...b, account_number: b.account_number === undefined ? undefined : mask(b.account_number) },
      })
      return this.view(tx, updated)
    })
  }

  /** Остаток = начальный + поступления − расходы, только по проведённым операциям */
  async balance(tx: Tx, accountId: string): Promise<{ in: number; out: number }> {
    const sums = await tx.transaction.groupBy({ by: ['direction'], where: { accountId, status: 'CONFIRMED' }, _sum: { amount: true } })
    const of = (d: 'IN' | 'OUT') => num(sums.find((s) => s.direction === d)?._sum.amount)
    return { in: of('IN'), out: of('OUT') }
  }

  private async view(tx: Tx, a: FinanceAccount): Promise<AccountView> {
    const [moves, drafts] = await Promise.all([this.balance(tx, a.id), tx.transaction.count({ where: { accountId: a.id, status: 'DRAFT' } })])
    return {
      id: a.id, type: a.type, bank_name: a.bankName, account_number_masked: a.accountNumberMasked,
      opening_balance: num(a.openingBalance), opened_on: dateStr(a.openedOn),
      balance: Math.round((num(a.openingBalance) + moves.in - moves.out) * 100) / 100,
      pending_drafts: drafts,
    }
  }
}
