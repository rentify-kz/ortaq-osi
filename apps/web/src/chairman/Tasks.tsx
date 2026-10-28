import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarClock, ListTodo, Plus, Repeat, TriangleAlert } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import type { RecurringTemplateBody } from '@ortaq/shared'
import { api } from '../shared/api/client'
import { cn, ease, formatDate, formatDateTime } from '../shared/lib/cn'
import { Btn, Card, CardHead, Empty, ErrorNote, Field, Input, PageHead, Segmented, Select, Skeleton, Tag } from '../shared/ui/kit'
import { PRIORITY_LABELS, PRIORITY_TONE, TASK_STATUS_LABELS } from './labels'

type Task = {
  id: string; title: string; status: string; priority: string; due_at: string | null; recurring: boolean
  assignee: { name: string } | null; contractor: { name: string } | null; request: { id: string; number: number } | null
}
type Template = {
  id: string; title: string; rrule: string; lead_time_hours: number; requires_photo: boolean; is_active: boolean
  default_assignee: { id: string; name: string | null } | null; next: string[]; missed_in_row: number
}
type Assignees = { workers: { id: string; name: string; active_tasks: number }[] }

/* Конструктор расписания: председатель выбирает по-человечески, на сервер уходит RRULE */
const DAYS = [['MO', 'пн'], ['TU', 'вт'], ['WE', 'ср'], ['TH', 'чт'], ['FR', 'пт'], ['SA', 'сб'], ['SU', 'вс']] as const
type Kind = 'weekdays' | 'daily' | 'weekly' | 'monthly'

function buildRule(kind: Kind, days: string[], hour: number): string {
  const at = `;BYHOUR=${hour};BYMINUTE=0`
  if (kind === 'daily') return `FREQ=DAILY${at}`
  if (kind === 'weekdays') return `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR${at}`
  if (kind === 'monthly') return `FREQ=MONTHLY;BYDAY=1${days[0] ?? 'MO'}${at}`
  return `FREQ=WEEKLY;BYDAY=${(days.length ? days : ['MO']).join(',')}${at}`
}

function describeRule(rule: string): string {
  const day = (code: string) => DAYS.find(([c]) => c === code)?.[1] ?? code
  const hour = rule.match(/BYHOUR=(\d+)/)?.[1] ?? '9'
  const by = rule.match(/BYDAY=([^;]+)/)?.[1]
  if (rule.includes('FREQ=DAILY')) return `ежедневно в ${hour}:00`
  if (by === 'MO,TU,WE,TH,FR') return `по будням в ${hour}:00`
  if (rule.includes('FREQ=MONTHLY') && by) return `первый ${day(by.replace(/^\d/, ''))} месяца в ${hour}:00`
  return `${by?.split(',').map(day).join(', ') ?? 'еженедельно'} в ${hour}:00`
}

function TemplateForm({ houseId, onClose }: { houseId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<Kind>('weekdays')
  const [days, setDays] = useState<string[]>(['FR'])
  const [hour, setHour] = useState('9')
  const [who, setWho] = useState('')
  const [photo, setPhoto] = useState(false)
  const rule = buildRule(kind, days, Number(hour))
  const assignees = useQuery({ queryKey: ['house', houseId, 'assignees'], queryFn: () => api<Assignees>(`/houses/${houseId}/tasks/assignees`) })
  const preview = useQuery({ queryKey: ['rrule-preview', houseId, rule], queryFn: () => api<{ next: string[] }>(`/houses/${houseId}/recurring/preview`, { method: 'POST', body: { rrule: rule } }) })
  const create = useMutation({
    mutationFn: (body: RecurringTemplateBody) => api(`/houses/${houseId}/recurring`, { method: 'POST', body }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['house', houseId, 'recurring'] }); onClose() },
  })
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
      <div className="mb-5 flex flex-col gap-4 rounded-[20px] bg-surface-2 p-4">
        <Field label="Что делать">{(id) => <Input id={id} value={title} onChange={setTitle} placeholder="Уборка двора" autoFocus />}</Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13.5px] font-semibold text-ink">Как часто</span>
          <Segmented id="rr-kind" label="Как часто" value={kind} onChange={setKind} options={[
            { v: 'weekdays', label: 'По будням' }, { v: 'daily', label: 'Каждый день' }, { v: 'weekly', label: 'По дням недели' }, { v: 'monthly', label: 'Раз в месяц' },
          ]} />
          {(kind === 'weekly' || kind === 'monthly') && (
            <div role="group" aria-label="Дни недели" className="flex flex-wrap gap-1.5">
              {DAYS.map(([code, label]) => {
                const on = days.includes(code)
                return (
                  <button key={code} type="button" aria-pressed={on} onClick={() => setDays((d) => (kind === 'monthly' ? [code] : on ? d.filter((x) => x !== code) : [...d, code]))}
                    className={cn('h-11 min-w-11 rounded-full px-3 text-[14px] font-semibold transition-colors', on ? 'bg-brand-600 text-white' : 'bg-surface text-ink hover:bg-surface-3')}>{label}</button>
                )
              })}
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Во сколько">{(id) => <Select id={id} value={hour} onChange={setHour} options={Array.from({ length: 15 }, (_, i) => ({ v: String(i + 6), label: `${i + 6}:00` }))} />}</Field>
          <Field label="Исполнитель">{(id) => <Select id={id} value={who} onChange={setWho} placeholder="Выберите" options={(assignees.data?.workers ?? []).map((w) => ({ v: w.id, label: w.name }))} />}</Field>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-[14px] text-ink"><input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" checked={photo} onChange={() => setPhoto((v) => !v)} /> Нужна фотофиксация</label>
        {preview.data && <p className="nums text-[13px] text-ink-2">Ближайшие: {preview.data.next.slice(0, 4).map((d) => formatDateTime(d)).join(' · ')}</p>}
        <ErrorNote>{create.error?.message}</ErrorNote>
        <div className="flex gap-2">
          <Btn icon={Plus} disabled={title.trim().length < 3 || !who} loading={create.isPending}
            onClick={() => create.mutate({ title, rrule: rule, default_assignee_id: who, requires_photo: photo, lead_time_hours: 12 })}>Создать</Btn>
          <Btn variant="soft" onClick={onClose}>Отмена</Btn>
        </div>
      </div>
    </motion.div>
  )
}

function Routine({ houseId }: { houseId: string }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const q = useQuery({ queryKey: ['house', houseId, 'recurring'], queryFn: () => api<Template[]>(`/houses/${houseId}/recurring`) })
  const toggle = useMutation({
    mutationFn: (t: Template) => api(`/houses/${houseId}/recurring/${t.id}`, { method: 'PATCH', body: { is_active: !t.is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['house', houseId, 'recurring'] }),
  })
  return (
    <Card>
      <CardHead icon={Repeat} title="Рутина по расписанию" sub="Задача появляется у работника заранее. Невыполненная не копится — закрывается как просроченная"
        aside={!adding && <Btn variant="soft" icon={Plus} onClick={() => setAdding(true)}>Шаблон</Btn>} />
      <AnimatePresence>{adding && <TemplateForm houseId={houseId} onClose={() => setAdding(false)} />}</AnimatePresence>
      {q.isPending && <Skeleton rows={2} />}
      {q.data?.length === 0 && !adding && <Empty icon={CalendarClock} title="Шаблонов нет" text="Уборка двора по будням, обход техпомещений по пятницам — задайте один раз, дальше задачи появятся сами." />}
      <ul className="flex flex-col gap-2">
        {q.data?.map((t) => (
          <li key={t.id} className={cn('flex flex-wrap items-center gap-3 rounded-[18px] bg-surface-2 px-4 py-3', !t.is_active && 'opacity-60')}>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">{t.title}</p>
              <p className="text-[13px] text-ink-2">{describeRule(t.rrule)} · {t.default_assignee?.name ?? 'без исполнителя'}{t.next[0] && ` · следующая ${formatDate(t.next[0])}`}</p>
            </div>
            {t.missed_in_row >= 3 && <Tag tone="crit" icon={TriangleAlert}>пропущено {t.missed_in_row} раза подряд</Tag>}
            <Btn variant="ghost" loading={toggle.isPending && toggle.variables?.id === t.id} onClick={() => toggle.mutate(t)}>{t.is_active ? 'Приостановить' : 'Возобновить'}</Btn>
          </li>
        ))}
      </ul>
      <ErrorNote>{toggle.error?.message}</ErrorNote>
    </Card>
  )
}

export function Tasks() {
  const { houseId = '' } = useParams()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['house', houseId, 'tasks', 'active'], queryFn: () => api<Task[]>(`/houses/${houseId}/tasks?scope=active`) })
  const review = q.data?.filter((t) => t.status === 'SUBMITTED') ?? []
  return (
    <>
      <PageHead title="Задачи" sub={review.length ? `${review.length} ждут вашего подтверждения` : 'Что сейчас в работе у персонала и подрядчиков'} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHead icon={ListTodo} title="В работе" />
          {q.isPending && <Skeleton rows={3} />}
          {q.data?.length === 0 && <Empty icon={ListTodo} title="Активных задач нет" text="Задачи назначаются из заявок или порождаются рутиной по расписанию." />}
          <ul className="flex flex-col gap-2">
            {q.data?.map((t) => (
              <li key={t.id}>
                <button type="button" disabled={!t.request} onClick={() => t.request && navigate(`/h/${houseId}/requests/${t.request.id}`)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-[18px] bg-surface-2 px-4 py-3 text-left transition-colors enabled:hover:bg-surface-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold text-ink">{t.recurring && <Repeat size={14} className="mr-1 inline text-ink-2" />}{t.title}</p>
                    <p className="text-[13px] text-ink-2">
                      {t.assignee?.name ?? t.contractor?.name ?? 'без исполнителя'}{t.request && ` · заявка №${t.request.number}`}{t.due_at && ` · до ${formatDateTime(t.due_at)}`}
                    </p>
                  </div>
                  {t.priority !== 'NORMAL' && <Tag tone={PRIORITY_TONE[t.priority] ?? 'mute'}>{PRIORITY_LABELS[t.priority]}</Tag>}
                  <Tag tone={t.status === 'SUBMITTED' ? 'warn' : 'mute'}>{TASK_STATUS_LABELS[t.status]}</Tag>
                </button>
              </li>
            ))}
          </ul>
          <ErrorNote>{q.error?.message}</ErrorNote>
        </Card>
        <Routine houseId={houseId} />
      </div>
    </>
  )
}
