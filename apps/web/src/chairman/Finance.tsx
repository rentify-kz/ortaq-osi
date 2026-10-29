import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Plus, ReceiptText } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import type { AccountView, BudgetCategoryView, TransactionView } from '@ortaq/shared'
import { api } from '../shared/api/client'
import { useMe } from '../shared/hooks'
import { Btn, Card, CardHead, Empty, ErrorNote, PageHead, Select, Skeleton } from '../shared/ui/kit'
import { AccountsSetup } from './finance/AccountsSetup'
import { EntryForm } from './finance/EntryForm'
import { TxRow } from './finance/TxRow'
import { ACCOUNT_TYPE, money, monthLabel, recentMonths } from './labels'
import { FinanceTabs } from './finance/FinanceTabs'

/**
 * Финансы председателя и бухгалтера (docs/06 §6.3, docs/10). Каждая операция — строка
 * официальной формы; итоги месяца здесь те же, что увидят жильцы и что попадут в отчёт.
 */
export function Finance() {
  const { houseId = '' } = useParams()
  const me = useMe()
  const role = me.data?.memberships.find((m) => m.house_id === houseId)?.role === 'CHAIRMAN' ? 'CHAIRMAN' : 'ACCOUNTANT'
  const [period, setPeriod] = useState(() => recentMonths()[0]!)
  const [adding, setAdding] = useState(false)

  const accounts = useQuery({ queryKey: ['house', houseId, 'accounts'], queryFn: () => api<AccountView[]>(`/houses/${houseId}/accounts`) })
  const categories = useQuery({ queryKey: ['budget-categories'], queryFn: () => api<BudgetCategoryView[]>('/budget-categories'), staleTime: Infinity })
  const journal = useQuery({ queryKey: ['house', houseId, 'transactions', period], queryFn: () => api<TransactionView[]>(`/houses/${houseId}/transactions?period=${period}`) })
  const drafts = useQuery({ queryKey: ['house', houseId, 'transactions', 'drafts'], queryFn: () => api<TransactionView[]>(`/houses/${houseId}/transactions?status=DRAFT`) })

  const posted = (journal.data ?? []).filter((t) => t.status === 'CONFIRMED')
  const income = posted.filter((t) => t.direction === 'IN').reduce((s, t) => s + t.amount, 0)
  const expense = posted.filter((t) => t.direction === 'OUT').reduce((s, t) => s + t.amount, 0)
  const incomplete = posted.filter((t) => t.missing_documents.length > 0).length
  const list = (journal.data ?? []).filter((t) => t.status !== 'DRAFT')
  const hasAccounts = (accounts.data?.length ?? 0) > 0

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Финансы" sub="Журнал операций по строкам официальной формы отчёта"
        actions={hasAccounts && categories.data && !adding ? <Btn icon={Plus} onClick={() => setAdding(true)}>Внести операцию</Btn> : undefined} />
      <FinanceTabs />

      {accounts.isPending ? <Skeleton rows={2} /> : role === 'CHAIRMAN' ? <AccountsSetup houseId={houseId} existing={accounts.data ?? []} /> : null}
      {!accounts.isPending && !hasAccounts && role === 'ACCOUNTANT' && (
        <Empty icon={ReceiptText} title="Счета ещё не заведены" text="Председатель добавляет текущий и сберегательный счёт с остатками на дату начала учёта." />
      )}

      {hasAccounts && (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.data!.map((a) => (
            <Card key={a.id} className="flex flex-col gap-1">
              <span className="text-[13.5px] text-ink-2">{ACCOUNT_TYPE[a.type]} · {a.bank_name}{a.account_number_masked ? ` ${a.account_number_masked}` : ''}</span>
              <span className="font-display text-[28px] font-extrabold tabular-nums tracking-[-0.02em] text-ink">{money(a.balance)}</span>
              <span className="text-[12.5px] text-ink-3">начальный остаток {money(a.opening_balance)} на {a.opened_on.split('-').reverse().join('.')}</span>
            </Card>
          ))}
        </div>
      )}

      <AnimatePresence>
        {adding && accounts.data && categories.data && (
          <EntryForm houseId={houseId} chairman={role === 'CHAIRMAN'} accounts={accounts.data} categories={categories.data} onClose={() => setAdding(false)} />
        )}
      </AnimatePresence>

      {(drafts.data?.length ?? 0) > 0 && (
        <Card>
          <CardHead title="Ждут проведения" sub={role === 'CHAIRMAN' ? 'Внесены бухгалтером. Проверьте сумму и строку и проведите' : 'Председатель проведёт их после проверки'} />
          <ul className="flex flex-col gap-2">{drafts.data!.map((t) => <TxRow key={t.id} houseId={houseId} tx={t} role={role} userId={me.data?.id ?? ''} />)}</ul>
        </Card>
      )}

      {hasAccounts && (
        <Card>
          <CardHead title="Журнал" sub={`Проведено ${posted.length}: поступления ${money(income)}, расходы ${money(expense)}${incomplete ? ` · без документов ${incomplete}` : ''}`}
            aside={<span className="w-48"><Select value={period} onChange={setPeriod} options={recentMonths().map((p) => ({ v: p, label: monthLabel(p) }))} /></span>} />
          <ErrorNote>{journal.error?.message}</ErrorNote>
          {journal.isPending ? <Skeleton rows={4} /> : list.length === 0 ? (
            <Empty icon={ReceiptText} title="Операций за месяц нет" text="Внесите поступления и расходы — каждая сразу ляжет в свою строку отчёта." />
          ) : (
            <ul className="flex flex-col gap-2">{list.map((t) => <TxRow key={t.id} houseId={houseId} tx={t} role={role} userId={me.data?.id ?? ''} />)}</ul>
          )}
        </Card>
      )}
    </div>
  )
}
