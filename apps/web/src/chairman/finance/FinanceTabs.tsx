import { NavLink, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { FinanceOverview } from '@ortaq/shared'
import { api } from '../../shared/api/client'
import { cn } from '../../shared/lib/cn'

/** Разделы финансов: журнал, начисления, оплаты, должники, отчёты. Счётчики — то, что ждёт решения */
export function FinanceTabs() {
  const { houseId = '' } = useParams()
  const overview = useQuery({ queryKey: ['house', houseId, 'finance-overview'], queryFn: () => api<FinanceOverview>(`/houses/${houseId}/finance/overview`), staleTime: 30_000 })
  const base = `/h/${houseId}/finance`
  const tabs = [
    { to: base, label: 'Журнал', end: true, n: overview.data?.board?.drafts },
    { to: `${base}/charges`, label: 'Начисления' },
    { to: `${base}/payments`, label: 'Оплаты', n: overview.data?.board?.payments_to_review },
    { to: `${base}/debtors`, label: 'Должники' },
    { to: `${base}/reports`, label: 'Отчёты' },
  ]
  return (
    <nav aria-label="Разделы финансов" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => cn('inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors',
            isActive ? 'bg-ink text-white' : 'bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink')}>
          {t.label}
          {!!t.n && <span className="grid min-w-5 place-items-center rounded-full bg-warning px-1.5 text-[11.5px] font-bold leading-5 text-white">{t.n}</span>}
        </NavLink>
      ))}
    </nav>
  )
}
