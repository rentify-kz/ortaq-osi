import { useState } from 'react'
import { Inbox, TriangleAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import type { PaymentView } from '@ortaq/shared'
import { api } from '../../shared/api/client'
import { openFile } from '../../shared/api/upload'
import { useMe } from '../../shared/hooks'
import { formatDateTime } from '../../shared/lib/cn'
import { Btn, Card, CardHead, Empty, ErrorNote, Input, PageHead, Segmented, Skeleton, Tag } from '../../shared/ui/kit'
import { money, monthLabel, PAYMENT_METHOD, PAYMENT_STATUS } from '../labels'
import { FinanceTabs } from './FinanceTabs'

/** Одна оплата на проверке: чек, распознанное, замечания и решение председателя */
function PaymentCard({ houseId, p, chairman }: { houseId: string; p: PaymentView; chairman: boolean }) {
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const base = `/houses/${houseId}/payments/${p.id}`
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) => api<PaymentView>(`${base}/${path}`, { method: 'POST', body }),
    onSuccess: () => Promise.all(['payments', 'finance-overview', 'transactions', 'accounts', 'charges'].map((k) => qc.invalidateQueries({ queryKey: ['house', houseId, k] }))),
  })
  const view = useMutation({ mutationFn: (fileId: string) => openFile(houseId, fileId) })
  const open = p.status === 'PENDING_REVIEW' || p.status === 'FLAGGED'
  const left = p.charge.amount - p.charge.paid_amount
  return (
    <li className="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-semibold text-ink">№{p.unit.number} · {p.paid_by?.name}</p>
          <p className="mt-0.5 text-[13px] text-ink-2">{p.charge.title} · к оплате {money(left)} из {money(p.charge.amount)}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {PAYMENT_METHOD[p.method]}{p.external_ref ? ` · операция ${p.external_ref}` : ''}{p.paid_at ? ` · оплачено ${formatDateTime(p.paid_at)}` : ''} · подано {formatDateTime(p.created_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-bold tabular-nums text-ink">{money(p.confirmed_amount ?? p.amount)}</p>
          <Tag tone={p.status === 'CONFIRMED' ? 'brand' : p.status === 'REJECTED' ? 'mute' : p.status === 'FLAGGED' ? 'warn' : 'mute'}>{PAYMENT_STATUS[p.status]}</Tag>
        </div>
      </div>
      {p.receipt && (
        <div className="flex flex-wrap items-center gap-3 rounded-[15px] bg-surface px-4 py-3 text-[13.5px]">
          <button type="button" onClick={() => view.mutate(p.receipt!.file_id)} className="font-semibold text-brand-700 hover:underline">Открыть чек</button>
          <span className="text-ink-2">
            {p.receipt.recognized
              ? `Распознано: ${p.receipt.recognized.amount !== null ? money(p.receipt.recognized.amount) : 'сумма —'}${p.receipt.recognized.ref ? ` · №${p.receipt.recognized.ref}` : ''}${p.receipt.recognized.recipient ? ` · ${p.receipt.recognized.recipient}` : ''}`
              : 'Чек не распознан: сумму и номер ввёл плательщик'}
          </span>
        </div>
      )}
      {p.flags.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-[15px] bg-warning-soft px-4 py-3 text-[13.5px] text-warning">
          {p.flags.map((f) => <li key={f.code} className="flex items-start gap-2"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{f.message}</li>)}
        </ul>
      )}
      {p.rejection_reason && <p className="text-[13.5px] text-ink-2">Причина отказа: {p.rejection_reason}</p>}
      {open && (rejecting ? (
        <div className="flex flex-col gap-2">
          <Input value={reason} onChange={setReason} placeholder="Причина — её увидит плательщик" autoFocus />
          <div className="flex gap-2">
            <Btn variant="soft" loading={act.isPending} disabled={reason.trim().length < 5} onClick={() => act.mutate({ path: 'reject', body: { reason } })}>Отклонить</Btn>
            <Btn variant="ghost" onClick={() => setRejecting(false)}>Отмена</Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {chairman && p.flags.length > 0 && (
            <label className="flex min-h-11 items-center gap-2 text-[13.5px] text-ink">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="size-5 accent-[var(--color-brand-600)]" />
              Замечания проверил
            </label>
          )}
          {chairman && (
            <Btn loading={act.isPending && act.variables?.path === 'confirm'} disabled={p.flags.length > 0 && !acknowledged}
              onClick={() => act.mutate({ path: 'confirm', body: { acknowledge_flags: acknowledged } })}>Зачесть {money(Math.min(p.amount, left))}</Btn>
          )}
          <Btn variant="soft" onClick={() => { setRejecting(true); setReason('') }}>Отклонить</Btn>
          {!chairman && <span className="text-[13px] text-ink-2">Зачитывает председатель</span>}
        </div>
      ))}
      <ErrorNote>{(act.error ?? view.error)?.message}</ErrorNote>
    </li>
  )
}

/** Оплаты жильцов на проверке (docs/10 §5): чек, распознанное, замечания — и решение за человеком */
export function PaymentsPage() {
  const { houseId = '' } = useParams()
  const me = useMe()
  const chairman = me.data?.memberships.find((m) => m.house_id === houseId)?.role === 'CHAIRMAN'
  const [status, setStatus] = useState<'review' | 'all'>('review')
  const q = useQuery({ queryKey: ['house', houseId, 'payments', status], queryFn: () => api<PaymentView[]>(`/houses/${houseId}/payments?status=${status}`) })
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Финансы" sub="Оплаты жильцов: чек, сверка и зачёт в начисление" />
      <FinanceTabs />
      <Card>
        <CardHead icon={Inbox} title={status === 'review' ? 'Ждут проверки' : 'Все оплаты'}
          sub="Замечания не отклоняют оплату сами: у повтора бывает объяснение, решает председатель"
          aside={<Segmented id="pay-status" label="Показать" value={status} onChange={setStatus} options={[{ v: 'review', label: 'На проверке' }, { v: 'all', label: 'Все' }]} />} />
        <ErrorNote>{q.error?.message}</ErrorNote>
        {q.isPending ? <Skeleton rows={3} /> : (q.data?.length ?? 0) === 0 ? (
          <Empty icon={Inbox} title={status === 'review' ? 'Проверять нечего' : 'Оплат пока нет'} text="Когда жилец загрузит чек, оплата появится здесь и придёт уведомлением." />
        ) : (
          <ul className="flex flex-col gap-3">{q.data!.map((p) => <PaymentCard key={p.id} houseId={houseId} p={p} chairman={chairman} />)}</ul>
        )}
        {q.data && status === 'all' && <p className="mt-3 text-[12.5px] text-ink-3">Показаны последние 500 · месяцы: {[...new Set(q.data.map((p) => monthLabel(p.charge.period)))].join(', ')}</p>}
      </Card>
    </div>
  )
}
