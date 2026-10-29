import { useState } from 'react'
import { CircleCheck, FileSignature, FileText, Printer, Send, TriangleAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import type { ReportListItem, ReportView, SigningStartView } from '@ortaq/shared'
import { api } from '../../shared/api/client'
import { useMe } from '../../shared/hooks'
import { cn, formatDate, formatDateTime } from '../../shared/lib/cn'
import { Photos } from '../../shared/ui/Photos'
import { Btn, Card, CardHead, Empty, ErrorNote, PageHead, Select, Skeleton, Tag } from '../../shared/ui/kit'
import { MISSING_DOC, money, monthLabel, recentMonths, REPORT_STATUS } from '../labels'
import { FinanceTabs } from './FinanceTabs'

const tone = (s: string) => (s === 'PUBLISHED' ? 'brand' : s === 'SIGNED' ? 'solid' : 'mute') as 'brand' | 'solid' | 'mute'

/** Отчёты: черновик 15 числа, подписи до 20-го, публикация жильцам (docs/10 §7) */
export function ReportsPage() {
  const { houseId = '' } = useParams()
  const navigate = useNavigate()
  const [period, setPeriod] = useState(() => recentMonths()[1]!)
  const q = useQuery({ queryKey: ['house', houseId, 'reports'], queryFn: () => api<ReportListItem[]>(`/houses/${houseId}/reports`) })
  const generate = useMutation({
    mutationFn: () => api<ReportView>(`/houses/${houseId}/reports/generate`, { method: 'POST', body: { period } }),
    onSuccess: (r) => navigate(`/h/${houseId}/finance/reports/${r.id}`),
  })
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Финансы" sub="Ежемесячный отчёт по официальной форме" />
      <FinanceTabs />
      <Card>
        <CardHead icon={FileText} title="Отчёты" sub="Черновик за прошлый месяц собирается 15 числа сам. Срок сдачи — 20 число"
          aside={<span className="flex flex-wrap gap-2"><span className="w-44"><Select value={period} onChange={setPeriod} options={recentMonths(6).map((p) => ({ v: p, label: monthLabel(p) }))} /></span>
            <Btn loading={generate.isPending} onClick={() => generate.mutate()}>Собрать</Btn></span>} />
        <ErrorNote>{(q.error ?? generate.error)?.message}</ErrorNote>
        {q.isPending ? <Skeleton rows={3} /> : (q.data?.length ?? 0) === 0 ? (
          <Empty icon={FileText} title="Отчётов пока нет" text="Соберите черновик за месяц: строки формы заполнятся из журнала операций." />
        ) : (
          <ul className="flex flex-col gap-2">
            {q.data!.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => navigate(`/h/${houseId}/finance/reports/${r.id}`)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-[18px] bg-surface-2 px-5 py-3.5 text-left transition-colors hover:bg-surface-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-ink">{monthLabel(r.period)}</span>
                    <span className="block text-[12.5px] text-ink-2">{r.published_at ? `опубликован ${formatDate(r.published_at)}` : `срок ${formatDate(r.due_date)}`}</span>
                  </span>
                  {r.issues > 0 && r.status === 'DRAFT' && <Tag tone="warn" icon={TriangleAlert}>замечаний: {r.issues}</Tag>}
                  <Tag tone={tone(r.status)}>{REPORT_STATUS[r.status]}</Tag>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/** Подписание своей ролью: ссылка в eGov mobile, затем «Я подписал» — подпись забирает сервер */
function Signing({ houseId, report, role }: { houseId: string; report: ReportView; role: 'CHAIRMAN' | 'ACCOUNTANT' }) {
  const qc = useQueryClient()
  const [started, setStarted] = useState<SigningStartView | null>(null)
  const base = `/houses/${houseId}/reports/${report.id}`
  const start = useMutation({ mutationFn: () => api<SigningStartView>(`${base}/sign`, { method: 'POST' }), onSuccess: setStarted })
  const done = useMutation({
    mutationFn: () => api<ReportView | { status: 'PENDING' }>(`${base}/sign/complete`, { method: 'POST' }),
    onSuccess: async (r) => {
      if ('id' in r) {
        setStarted(null)
        await qc.invalidateQueries({ queryKey: ['house', houseId, 'report', report.id] })
        await qc.invalidateQueries({ queryKey: ['house', houseId, 'reports'] })
      }
    },
  })
  const mine = role === 'CHAIRMAN' ? report.signatures.chairman : report.signatures.accountant
  if (mine || report.status !== 'DRAFT') return null
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4">
      {started ? (
        <>
          <p className="text-[14px] text-ink">Откройте eGov mobile, проверьте описание документа и подпишите своей ЭЦП. Потом вернитесь сюда.</p>
          <div className="flex flex-wrap gap-2">
            <a href={started.deeplink} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-full bg-surface px-4 text-[14px] font-semibold text-brand-700 hover:bg-surface-3">Открыть eGov mobile</a>
            <Btn icon={CircleCheck} loading={done.isPending} onClick={() => done.mutate()}>Я подписал</Btn>
          </div>
          {done.data && !('id' in done.data) && <p className="text-[13px] text-ink-2">Подпись ещё не получена. Завершите подписание в eGov mobile</p>}
        </>
      ) : (
        <Btn icon={FileSignature} loading={start.isPending} onClick={() => start.mutate()}>Подписать ЭЦП {role === 'CHAIRMAN' ? 'председателя' : 'бухгалтера'}</Btn>
      )}
      <ErrorNote>{(start.error ?? done.error)?.message}</ErrorNote>
    </div>
  )
}

export function ReportDetail() {
  const { houseId = '', reportId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useMe()
  const role = me.data?.memberships.find((m) => m.house_id === houseId)?.role === 'CHAIRMAN' ? 'CHAIRMAN' : 'ACCOUNTANT'
  const q = useQuery({ queryKey: ['house', houseId, 'report', reportId], queryFn: () => api<ReportView>(`/houses/${houseId}/reports/${reportId}`) })
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['house', houseId, 'report', reportId] }), qc.invalidateQueries({ queryKey: ['house', houseId, 'reports'] })])
  const regenerate = useMutation({ mutationFn: () => api(`/houses/${houseId}/reports/generate`, { method: 'POST', body: { period: q.data!.period } }), onSuccess: refresh })
  const publish = useMutation({ mutationFn: () => api(`/houses/${houseId}/reports/${reportId}/publish`, { method: 'POST' }), onSuccess: refresh })
  if (q.isPending) return <Skeleton rows={6} />
  if (!q.data) return <ErrorNote>{q.error?.message}</ErrorNote>
  const r = q.data
  const unsigned = !r.signatures.chairman && !r.signatures.accountant
  return (
    <div className="flex flex-col gap-5">
      <PageHead title={`Отчёт за ${monthLabel(r.period).toLowerCase()}`} sub={`${REPORT_STATUS[r.status]} · срок сдачи ${formatDate(r.due_date)} · собран ${formatDateTime(r.generated_at)}`}
        back={{ label: 'Отчёты', onClick: () => navigate(`/h/${houseId}/finance/reports`) }}
        actions={<Btn variant="soft" icon={Printer} onClick={() => window.print()}>Печать</Btn>} />

      {r.issues.length > 0 && (
        <Card className="bg-warning-soft">
          <CardHead icon={TriangleAlert} title="До сдачи стоит исправить" sub="Отчёт можно подписать и так, но недостающие документы лучше запросить сейчас" />
          <ul className="flex flex-col gap-1.5 text-[14px] text-ink">
            {r.issues.map((i, n) => (
              <li key={n}>
                • {i.transaction ? `Операция №${i.transaction.number}, ${i.transaction.category} ${money(i.transaction.amount)} — нет: ${i.transaction.missing.map((k) => MISSING_DOC[k]).join(', ')}` : i.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-display text-[18px] font-bold text-ink">Ежемесячный отчёт по управлению объектом кондоминиума</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13.5px] sm:grid-cols-2">
          <div><dt className="inline text-ink-2">Период: </dt><dd className="inline text-ink">{formatDate(r.header.period_from)} — {formatDate(r.header.period_to)}</dd></div>
          <div><dt className="inline text-ink-2">Адрес: </dt><dd className="inline text-ink">{r.header.address}</dd></div>
          <div><dt className="inline text-ink-2">Форма управления: </dt><dd className="inline text-ink">{r.header.management_form}</dd></div>
          <div><dt className="inline text-ink-2">Субъект управления: </dt><dd className="inline text-ink">{r.header.organization}, БИН {r.header.bin}</dd></div>
        </dl>
        <table className="mt-5 w-full text-left text-[14px]">
          <thead><tr className="text-[13px] text-ink-2"><th className="w-20 pb-2 font-medium">№</th><th className="pb-2 font-medium">Наименование</th><th className="w-36 pb-2 text-right font-medium">Сумма, ₸</th></tr></thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.code} className="align-top [&>td]:border-t [&>td]:border-surface-3">
                <td className="py-2.5 tabular-nums text-ink-2">{row.code}</td>
                <td className="py-2.5" style={{ paddingLeft: row.level * 16 }}>
                  <span className={cn('text-ink', row.level === 0 && 'font-semibold')}>{row.code === '1' && r.header.banks.CURRENT ? `${row.label} (${r.header.banks.CURRENT})` : row.code === '2' && r.header.banks.SAVINGS ? `${row.label} (${r.header.banks.SAVINGS})` : row.label}</span>
                  {row.lines?.map((l, i) => <span key={i} className="mt-1 block text-[13px] text-ink-2">«{l.payee}» — {l.service.toLowerCase()}: {money(l.amount)}</span>)}
                </td>
                <td className={cn('py-2.5 text-right tabular-nums text-ink', row.level === 0 && 'font-semibold')}>{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-[12.5px] text-ink-3">{r.legal_source}</p>
      </Card>

      {r.work.length > 0 && (
        <Card>
          <CardHead title="Выполненные работы" sub="Подтверждённые председателем задачи с фотофиксацией" />
          <ul className="flex flex-col gap-4">
            {r.work.map((w) => (
              <li key={w.task_id} className="flex flex-col gap-2">
                <p className="text-[14.5px] text-ink">{w.title} <span className="text-ink-3">· {formatDate(w.completed_at)}</span></p>
                <Photos houseId={houseId} ids={w.photo_file_ids} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHead icon={FileSignature} title="Подписи" sub={r.signatures.accountant_required ? 'Председатель и бухгалтер подписывают ЭЦП через eGov mobile' : 'Бухгалтера в доме нет — подписывает председатель'} />
        <ul className="mb-4 flex flex-col gap-1.5 text-[14px]">
          <li>Председатель: {r.signatures.chairman ? <span className="text-brand-700">{r.signatures.chairman.name}, {formatDateTime(r.signatures.chairman.signed_at)}</span> : <span className="text-ink-3">не подписано</span>}</li>
          {r.signatures.accountant_required && <li>Бухгалтер: {r.signatures.accountant ? <span className="text-brand-700">{r.signatures.accountant.name}, {formatDateTime(r.signatures.accountant.signed_at)}</span> : <span className="text-ink-3">не подписано</span>}</li>}
        </ul>
        <div className="flex flex-col gap-3">
          <Signing houseId={houseId} report={r} role={role} />
          <div className="flex flex-wrap gap-2">
            {r.status === 'DRAFT' && unsigned && <Btn variant="soft" loading={regenerate.isPending} onClick={() => regenerate.mutate()}>Пересобрать из журнала</Btn>}
            {role === 'CHAIRMAN' && r.status === 'SIGNED' && <Btn icon={Send} loading={publish.isPending} onClick={() => publish.mutate()}>Опубликовать жильцам</Btn>}
          </div>
          {!unsigned && r.status === 'DRAFT' && <p className="text-[13px] text-ink-2">Первая подпись закрыла месяц: операции за {monthLabel(r.period).toLowerCase()} больше не меняются</p>}
          <ErrorNote>{(regenerate.error ?? publish.error)?.message}</ErrorNote>
        </div>
      </Card>
    </div>
  )
}
