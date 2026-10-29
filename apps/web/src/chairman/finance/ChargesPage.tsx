import { useState } from 'react'
import { CalendarPlus, Landmark, Percent, ReceiptText } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { TariffType, type ChargeRunView, type ChargeView, type PaymentSettingsBody, type TariffBody, type TariffView } from '@ortaq/shared'
import { api, ApiError } from '../../shared/api/client'
import { useMe } from '../../shared/hooks'
import { cn } from '../../shared/lib/cn'
import { Btn, Card, CardHead, Empty, ErrorNote, Field, Input, PageHead, Segmented, Select, Skeleton, Tag } from '../../shared/ui/kit'
import { CHARGE_STATUS, CHARGE_TYPE, money, monthLabel, recentMonths, UNIT_TYPE } from '../labels'
import { FinanceTabs } from './FinanceTabs'

const num = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'))

function KaspiSettings({ houseId, chairman }: { houseId: string; chairman: boolean }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['house', houseId, 'payment-settings'], queryFn: () => api<PaymentSettingsBody | null>(`/houses/${houseId}/payment-settings`) })
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const save = useMutation({
    mutationFn: () => api<PaymentSettingsBody>(`/houses/${houseId}/payment-settings`, { method: 'PUT', body: { pay_url: url.trim(), recipient_name: name.trim() } }),
    onSuccess: async () => { setEditing(false); await qc.invalidateQueries({ queryKey: ['house', houseId, 'payment-settings'] }) },
  })
  const fields = save.error instanceof ApiError ? save.error.fields : {}
  const open = editing || (q.data === null && chairman)
  return (
    <Card>
      <CardHead icon={Landmark} title="Реквизиты для оплаты"
        sub={q.data ? `Kaspi Pay · получатель в чеке «${q.data.recipient_name}»` : 'Жильцы платят по ссылке Kaspi Pay и прикладывают чек'}
        aside={chairman && q.data && !editing ? <Btn variant="soft" onClick={() => { setUrl(q.data!.pay_url); setName(q.data!.recipient_name); setEditing(true) }}>Изменить</Btn> : undefined} />
      {q.data && !editing && <p className="truncate rounded-[15px] bg-surface-2 px-4 py-3 text-[14px] text-ink-2">{q.data.pay_url}</p>}
      {open && (
        <div className="flex flex-col gap-3">
          <Field label="Ссылка Kaspi Pay" hint="Из приложения Kaspi Pay: https://pay.kaspi.kz/…" error={fields.pay_url}>{(id) => <Input id={id} value={url} onChange={setUrl} placeholder="https://pay.kaspi.kz/pay/…" />}</Field>
          <Field label="Получатель, как в чеке" hint="По нему сверяется чек жильца" error={fields.recipient_name}>{(id) => <Input id={id} value={name} onChange={setName} placeholder="ОСИ «Асыл Арман»" />}</Field>
          <ErrorNote>{save.error && !Object.keys(fields).length ? save.error.message : null}</ErrorNote>
          <div className="flex gap-2"><Btn loading={save.isPending} disabled={!url || name.trim().length < 2} onClick={() => save.mutate()}>Сохранить</Btn>
            {editing && <Btn variant="ghost" onClick={() => setEditing(false)}>Отмена</Btn>}</div>
        </div>
      )}
    </Card>
  )
}

function Tariffs({ houseId, chairman }: { houseId: string; chairman: boolean }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['house', houseId, 'tariffs'], queryFn: () => api<TariffView[]>(`/houses/${houseId}/tariffs`) })
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState<TariffType>('MAINTENANCE')
  const [basis, setBasis] = useState<'PER_SQM' | 'FIXED'>('PER_SQM')
  const [rate, setRate] = useState('')
  const [from, setFrom] = useState(() => recentMonths()[0]!)
  const [note, setNote] = useState('')
  const save = useMutation({
    mutationFn: () => api<TariffView>(`/houses/${houseId}/tariffs`, { method: 'POST', body: { type, basis, rate: num(rate), effective_from: from, decision_note: note.trim() || undefined } satisfies TariffBody }),
    onSuccess: async () => { setAdding(false); setRate(''); await qc.invalidateQueries({ queryKey: ['house', houseId, 'tariffs'] }) },
  })
  const active = (q.data ?? []).filter((t) => !t.effective_to)
  return (
    <Card>
      <CardHead icon={Percent} title="Тарифы" sub="Действуют с месяца и до следующего тарифа того же вида. Задним числом не вводятся"
        aside={chairman && !adding ? <Btn variant="soft" onClick={() => setAdding(true)}>Новый тариф</Btn> : undefined} />
      {q.isPending ? <Skeleton rows={2} /> : active.length === 0 && !adding ? (
        <Empty icon={Percent} title="Тарифов нет" text="Задайте взнос на управление и на капремонт — с них начнутся ежемесячные начисления." />
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[18px] bg-surface-2 px-5 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">{CHARGE_TYPE[t.type]}</span>
                <span className="block text-[12.5px] text-ink-2">{t.unit_types.map((u) => UNIT_TYPE[u]).join(', ')} · с {monthLabel(t.effective_from).toLowerCase()}{t.decision_note ? ` · ${t.decision_note}` : ''}</span>
              </span>
              <span className="text-[15px] font-semibold tabular-nums text-ink">{money(t.rate)}{t.basis === 'PER_SQM' ? ' за м²' : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="mt-4 flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4">
          <Segmented id="tariff-type" label="Вид" value={type} onChange={(v) => { setType(v); setBasis(v === 'PARKING' ? 'FIXED' : 'PER_SQM') }}
            options={TariffType.map((v) => ({ v, label: CHARGE_TYPE[v]! }))} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Расчёт">{(id) => <Select id={id} value={basis} onChange={(v) => setBasis(v as 'PER_SQM' | 'FIXED')} options={[{ v: 'PER_SQM', label: 'За м² площади' }, { v: 'FIXED', label: 'Фиксированно' }]} />}</Field>
            <Field label={basis === 'PER_SQM' ? 'Ставка, ₸ за м²' : 'Сумма, ₸'}>{(id) => <Input id={id} value={rate} onChange={setRate} inputMode="decimal" placeholder="120" />}</Field>
            <Field label="С месяца">{(id) => <Select id={id} value={from} onChange={setFrom} options={[...recentMonths(1), ...nextMonths(3)].map((p) => ({ v: p, label: monthLabel(p) }))} />}</Field>
          </div>
          <Field label="Основание" hint="Номер и дата протокола собрания">{(id) => <Input id={id} value={note} onChange={setNote} placeholder="Протокол №2 от 01.09.2026" />}</Field>
          <ErrorNote>{save.error?.message}</ErrorNote>
          <div className="flex gap-2"><Btn loading={save.isPending} disabled={!(num(rate) > 0)} onClick={() => save.mutate()}>Ввести тариф</Btn><Btn variant="ghost" onClick={() => setAdding(false)}>Отмена</Btn></div>
        </div>
      )}
    </Card>
  )
}

function nextMonths(n: number): string[] {
  const now = new Date(Date.now() + 5 * 3600_000)
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1 + i, 1)).toISOString().slice(0, 7))
}

/**
 * Начисления (docs/06 §6.3, docs/10 §4): тарифы, начисление месяца и его итог — сколько помещений
 * начислено, кому не смогли (нет площади) и кто сколько должен.
 */
export function ChargesPage() {
  const { houseId = '' } = useParams()
  const qc = useQueryClient()
  const me = useMe()
  const chairman = me.data?.memberships.find((m) => m.house_id === houseId)?.role === 'CHAIRMAN'
  const [period, setPeriod] = useState(() => recentMonths()[0]!)
  const [filter, setFilter] = useState<'open' | 'all'>('all')
  const summary = useQuery({ queryKey: ['house', houseId, 'charge-summary', period], queryFn: () => api<ChargeRunView>(`/houses/${houseId}/charges/summary?period=${period}`) })
  const list = useQuery({ queryKey: ['house', houseId, 'charges', period, filter], queryFn: () => api<ChargeView[]>(`/houses/${houseId}/charges?period=${period}&status=${filter}`) })
  const generate = useMutation({
    mutationFn: () => api<ChargeRunView & { created: number }>(`/houses/${houseId}/charges/generate`, { method: 'POST', body: { period } }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['house', houseId, 'charge-summary'] }), qc.invalidateQueries({ queryKey: ['house', houseId, 'charges'] })]),
  })
  const s = summary.data
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Финансы" sub="Тарифы, начисления и реквизиты для оплаты" />
      <FinanceTabs />
      <div className="grid gap-5 lg:grid-cols-2">
        <Tariffs houseId={houseId} chairman={chairman} />
        <KaspiSettings houseId={houseId} chairman={chairman} />
      </div>
      <Card>
        <CardHead icon={CalendarPlus} title="Начисления за месяц"
          sub={s?.created_at ? `Начислено ${s.units_charged} помещениям на ${money(s.total)}` : 'Начисляются 1 числа автоматически. Можно начислить и вручную — повтор добавит только недостающее'}
          aside={<span className="w-48"><Select value={period} onChange={setPeriod} options={recentMonths(6).map((p) => ({ v: p, label: monthLabel(p) }))} /></span>} />
        {(s?.skipped_units.length ?? 0) > 0 && (
          <p className="mb-4 rounded-[15px] bg-warning-soft px-4 py-3 text-[13.5px] text-warning">
            Без площади — не начислено по тарифу за м²: {s!.skipped_units.map((u) => `№${u.number}`).join(', ')}. Заполните площади в разделе «Площади»
          </p>
        )}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {chairman && recentMonths(2).includes(period) && <Btn loading={generate.isPending} onClick={() => generate.mutate()}>{s?.created_at ? 'Доначислить' : 'Начислить'}</Btn>}
          <Segmented id="charges-filter" label="Показать" value={filter} onChange={setFilter} options={[{ v: 'all', label: 'Все' }, { v: 'open', label: 'Неоплаченные' }]} />
        </div>
        {generate.data && <p className="mb-3 text-[13.5px] text-ink-2">Добавлено начислений: {generate.data.created}</p>}
        <ErrorNote>{(generate.error ?? list.error)?.message}</ErrorNote>
        {list.isPending ? <Skeleton rows={4} /> : (list.data?.length ?? 0) === 0 ? (
          <Empty icon={ReceiptText} title="Начислений нет" text="Задайте тарифы и начислите месяц." />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.data!.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[18px] bg-surface-2 px-5 py-3">
                <span className="w-14 shrink-0 text-[15px] font-semibold text-ink">№{c.unit.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] text-ink">{CHARGE_TYPE[c.type]}</span>
                  <span className="block text-[12.5px] text-ink-2">{c.basis.kind === 'PER_SQM' ? `${c.basis.area} м² × ${money(c.basis.rate)}` : 'фиксированно'}</span>
                </span>
                <Tag tone={c.status === 'PAID' ? 'brand' : c.status === 'OVERDUE' ? 'crit' : c.status === 'PARTIALLY_PAID' ? 'warn' : 'mute'}>{CHARGE_STATUS[c.status]}</Tag>
                <span className={cn('w-32 text-right text-[15px] font-semibold tabular-nums', c.status === 'CANCELLED' ? 'text-ink-3 line-through' : 'text-ink')}>
                  {c.paid_amount > 0 && c.status !== 'PAID' ? `${money(c.paid_amount)} из ` : ''}{money(c.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

