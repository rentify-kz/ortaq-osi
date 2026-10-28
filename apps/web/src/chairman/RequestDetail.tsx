import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Bot, Check, CircleCheck, ClipboardList, GitMerge, History, ListChecks, Plus, Send, Undo2, UserCheck, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import type { CreateTaskBody, Priority, RequestPlan, RequestTriage } from '@ortaq/shared'
import { api } from '../shared/api/client'
import { cn, ease, formatDateTime } from '../shared/lib/cn'
import { Btn, Card, CardHead, ErrorNote, Field, Input, PageHead, Segmented, Select, Skeleton, Tag } from '../shared/ui/kit'
import { Photos } from '../shared/ui/Photos'
import { CATEGORY_LABELS, FLAG_LABELS, PRIORITY_LABELS, REQUEST_STATUS_LABELS, SPECIALIZATION_LABELS, TASK_STATUS_LABELS } from './labels'
import { StageBar, type RequestRow } from './Requests'

type Stage = { id: string; order: number; title: string; status: string; completed_at: string | null; note: string | null }
type TaskLite = { id: string; title: string; status: string; stage_id: string | null; due_at: string | null; assignee: string | null }
type Detail = RequestRow & {
  description: string; photo_file_ids: string[]; work_photo_file_ids: string[]; stages: Stage[]; tasks: TaskLite[]
  possible_duplicate: { id: string; number: number; title: string } | null; duplicate_of: { id: string; number: number } | null
  rejection_reason: string | null; rating: number | null; ai_triage?: (RequestTriage & { job_id?: string }) | null; priority_set_by?: string | null
}
type Event = { id: string; type: string; data: Record<string, unknown> | null; created_at: string; actor: { name: string }; public?: boolean }
type TaskFull = { id: string; title: string; status: string; last_completion: { note: string | null; photo_file_ids: string[]; completed_at: string; rejection_reason: string | null } | null; assignee: { name: string } | null; contractor: { name: string } | null }
type Assignees = {
  workers: { id: string; name: string; position: string | null; specializations: string[]; active_tasks: number }[]
  contractors: { id: string; name: string; specializations: string[]; contract_to: string | null }[]
}

const EVENT_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  CREATED: () => 'Заявка подана',
  TRIAGED: (d) => `Автопроверка: приоритет «${PRIORITY_LABELS[String(d.priority)] ?? d.priority}»`,
  ACCEPTED: () => 'Заявка принята',
  REJECTED: (d) => `Отклонена: ${String(d.reason ?? '')}`,
  PRIORITY_CHANGED: (d) => `Приоритет: ${PRIORITY_LABELS[String(d.to)] ?? d.to}`,
  STAGES_ADDED: (d) => `Этапы: ${(d.titles as string[]).join(', ')}`,
  STAGE_DONE: (d) => `Этап «${String(d.title)}» выполнен`,
  TASK_ASSIGNED: (d) => `Задача «${String(d.title)}»${d.assignee ? ` — ${String(d.assignee)}` : ''}`,
  WORK_SUBMITTED: (d) => `Работа «${String(d.task)}» отправлена на проверку`,
  WORK_APPROVED: (d) => `Работа «${String(d.task)}» подтверждена`,
  COMMENT: (d) => String(d.text ?? ''),
  MERGED_INTO: (d) => `Объединена с заявкой №${String(d.number)}`,
  DUPLICATE_ADDED: (d) => `Добавлен дубликат №${String(d.number)}`,
  DONE: () => 'Заявка выполнена',
  CANCELLED: () => 'Заявка отменена',
  RATED: (d) => `Оценка жильца: ${String(d.rating)} из 5`,
}

function useInvalidate(houseId: string, id: string) {
  const qc = useQueryClient()
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ['house', houseId, 'request', id] }),
    qc.invalidateQueries({ queryKey: ['house', houseId, 'requests'] }),
    qc.invalidateQueries({ queryKey: ['house', houseId, 'tasks'] }),
  ])
}

/* ───────── решение по новой заявке ───────── */

function Triage({ r, houseId }: { r: Detail; houseId: string }) {
  const navigate = useNavigate()
  const done = useInvalidate(houseId, r.id)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) => api<Detail>(`/houses/${houseId}/requests/${r.id}/${path}`, { method: 'POST', body }),
    onSuccess: async (res) => { await done(); if (res.id !== r.id) navigate(`/h/${houseId}/requests/${res.id}`) },
  })
  const t = r.ai_triage
  return (
    <Card>
      <CardHead icon={Bot} title="Решение по заявке" sub="ИИ подсказывает — решаете вы. Отклонить заявку сам он не может" />
      {t ? (
        <div className="flex flex-col gap-2 rounded-[18px] bg-surface-2 p-4 text-[14px]">
          <p className="text-ink"><b>Приоритет «{PRIORITY_LABELS[t.suggested_priority]}»:</b> {t.priority_reason}</p>
          {t.clarification_hint && <p className="text-ink-2">Уточнить у жильца: {t.clarification_hint}</p>}
          {t.category !== r.category && <p className="text-ink-2">Похоже на категорию «{CATEGORY_LABELS[t.category]}», жилец выбрал «{CATEGORY_LABELS[r.category]}»</p>}
        </div>
      ) : <p className="text-[14px] text-ink-2">Автопроверка не проводилась: ИИ был недоступен</p>}
      {r.possible_duplicate && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[18px] bg-warning-soft p-4">
          <p className="min-w-0 flex-1 text-[14px] text-ink">Похоже на заявку №{r.possible_duplicate.number} «{r.possible_duplicate.title}»</p>
          <Btn variant="soft" icon={GitMerge} loading={act.isPending} onClick={() => act.mutate({ path: 'merge', body: { into_request_id: r.possible_duplicate!.id } })}>Объединить</Btn>
        </div>
      )}
      <ErrorNote>{act.error?.message}</ErrorNote>
      <AnimatePresence mode="wait" initial={false}>
        {rejecting ? (
          <motion.div key="rej" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 flex flex-col gap-2">
            <Field label="Причина отказа" hint="Жилец получит её в уведомлении">{(id, d) => <Input id={id} describedBy={d} value={reason} onChange={setReason} autoFocus />}</Field>
            <div className="flex gap-2">
              <Btn variant="danger" loading={act.isPending} disabled={reason.trim().length < 3} onClick={() => act.mutate({ path: 'reject', body: { reason } })}>Отклонить</Btn>
              <Btn variant="soft" onClick={() => setRejecting(false)}>Назад</Btn>
            </div>
          </motion.div>
        ) : (
          <motion.div key="act" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 flex flex-wrap gap-2">
            <Btn icon={Check} loading={act.isPending} onClick={() => act.mutate({ path: 'accept' })}>Принять</Btn>
            <Btn variant="soft" icon={X} onClick={() => setRejecting(true)}>Отклонить</Btn>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

/* ───────── этапы ───────── */

function Stages({ r, houseId }: { r: Detail; houseId: string }) {
  const done = useInvalidate(houseId, r.id)
  const [title, setTitle] = useState('')
  const [plan, setPlan] = useState<(RequestPlan & { job_id: string }) | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  const open = !['DONE', 'REJECTED', 'CANCELLED'].includes(r.status)
  const add = useMutation({
    mutationFn: (titles: string[]) => api(`/houses/${houseId}/requests/${r.id}/stages`, { method: 'POST', body: { titles } }),
    onSuccess: async () => { setTitle(''); setPlan(null); await done() },
  })
  const mark = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/houses/${houseId}/requests/${r.id}/stages/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: done,
  })
  const suggest = useMutation({
    mutationFn: () => api<RequestPlan & { job_id: string }>(`/houses/${houseId}/requests/${r.id}/ai/suggest`, { method: 'POST' }),
    onSuccess: (p) => { setPlan(p); setPicked(p.steps.map((s) => s.order)) },
  })
  return (
    <Card>
      <CardHead icon={ListChecks} title="Этапы работы" sub="Отметка этапа сразу двигает полоску прогресса у жильца"
        aside={<StageBar done={r.progress.done} total={r.progress.total} />} />
      <ul className="flex flex-col gap-1.5">
        {r.stages.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-[16px] bg-surface-2 px-4 py-2.5">
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', s.status === 'DONE' ? 'bg-brand-600 text-white' : s.status === 'IN_PROGRESS' ? 'bg-warning-soft text-warning' : 'bg-surface-3 text-ink-3')}>
              {s.status === 'DONE' ? <Check size={15} strokeWidth={2.6} /> : <span className="nums text-[12px] font-bold">{s.order}</span>}
            </span>
            <span className={cn('min-w-0 flex-1 text-[14.5px]', s.status === 'SKIPPED' ? 'text-ink-3 line-through' : 'text-ink')}>{s.title}</span>
            {open && (s.status === 'DONE'
              ? <Btn variant="ghost" icon={Undo2} onClick={() => mark.mutate({ id: s.id, status: 'IN_PROGRESS' })}>Вернуть</Btn>
              : <Btn variant="ghost" icon={CircleCheck} loading={mark.isPending && mark.variables?.id === s.id} onClick={() => mark.mutate({ id: s.id, status: 'DONE' })}>Выполнен</Btn>)}
          </li>
        ))}
      </ul>
      <AnimatePresence>
        {plan && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 flex flex-col gap-2 rounded-[18px] bg-brand-50 p-4">
              <p className="flex items-center gap-1.5 text-[14px] font-semibold text-brand-800"><Bot size={16} /> Предлагаемый план — отметьте нужное</p>
              {plan.steps.map((s) => (
                <label key={s.order} className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px] text-ink">
                  <input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" checked={picked.includes(s.order)}
                    onChange={() => setPicked((p) => (p.includes(s.order) ? p.filter((x) => x !== s.order) : [...p, s.order]))} />
                  <span className="flex-1">{s.title}</span>
                  {s.specialization && <span className="text-[12.5px] text-ink-2">{SPECIALIZATION_LABELS[s.specialization]}</span>}
                </label>
              ))}
              {plan.safety_notes.length > 0 && <p className="text-[13px] text-warning">{plan.safety_notes.join('. ')}</p>}
              <div className="flex gap-2">
                <Btn icon={Plus} disabled={picked.length === 0} loading={add.isPending} onClick={() => add.mutate(plan.steps.filter((s) => picked.includes(s.order)).map((s) => s.title))}>Создать этапы</Btn>
                <Btn variant="soft" onClick={() => setPlan(null)}>Не нужно</Btn>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {open && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1"><Field label="Новый этап">{(id) => <Input id={id} value={title} onChange={setTitle} placeholder="Осмотр на месте" />}</Field></div>
          <Btn variant="soft" icon={Plus} disabled={title.trim().length < 2} loading={add.isPending && !plan} onClick={() => add.mutate([title])}>Добавить</Btn>
          {!plan && <Btn variant="ghost" icon={Bot} loading={suggest.isPending} onClick={() => suggest.mutate()}>План от ИИ</Btn>}
        </div>
      )}
      <ErrorNote>{(add.error ?? mark.error ?? suggest.error)?.message}</ErrorNote>
    </Card>
  )
}

/* ───────── задачи и приёмка ───────── */

function Review({ task, houseId, requestId }: { task: TaskLite; houseId: string; requestId: string }) {
  const done = useInvalidate(houseId, requestId)
  const [visible, setVisible] = useState(true)
  const [report, setReport] = useState(true)
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const full = useQuery({ queryKey: ['house', houseId, 'tasks', task.id], queryFn: () => api<TaskFull>(`/houses/${houseId}/tasks/${task.id}`) })
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) => api(`/houses/${houseId}/tasks/${task.id}/${path}`, { method: 'POST', body }),
    onSuccess: done,
  })
  const c = full.data?.last_completion
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-[18px] bg-warning-soft p-4">
      <p className="text-[14px] font-semibold text-ink">Работа ждёт подтверждения{c && ` · ${formatDateTime(c.completed_at)}`}</p>
      {c?.note && <p className="text-[14px] text-ink">«{c.note}»</p>}
      {c && <Photos houseId={houseId} ids={c.photo_file_ids} />}
      <label className="flex min-h-11 items-center gap-3 text-[14px] text-ink"><input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" checked={visible} onChange={() => setVisible((v) => !v)} /> Показать фото жильцам</label>
      <label className="flex min-h-11 items-center gap-3 text-[14px] text-ink"><input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" checked={report} onChange={() => setReport((v) => !v)} /> Включить в ежемесячный отчёт</label>
      {rejecting && <Field label="Что исправить" hint="Без причины работник не поймёт, что не так">{(id, d) => <Input id={id} describedBy={d} value={reason} onChange={setReason} autoFocus />}</Field>}
      <ErrorNote>{act.error?.message}</ErrorNote>
      <div className="flex flex-wrap gap-2">
        {rejecting ? (
          <>
            <Btn variant="danger" disabled={reason.trim().length < 3} loading={act.isPending} onClick={() => act.mutate({ path: 'reject', body: { reason } })}>Вернуть на доработку</Btn>
            <Btn variant="soft" onClick={() => setRejecting(false)}>Назад</Btn>
          </>
        ) : (
          <>
            <Btn icon={Check} loading={act.isPending} onClick={() => act.mutate({ path: 'approve', body: { visible_to_residents: visible, include_in_report: report } })}>Подтвердить</Btn>
            <Btn variant="soft" icon={Undo2} onClick={() => setRejecting(true)}>На доработку</Btn>
          </>
        )}
      </div>
    </div>
  )
}

function AssignForm({ r, houseId, onClose }: { r: Detail; houseId: string; onClose: () => void }) {
  const done = useInvalidate(houseId, r.id)
  const assignees = useQuery({ queryKey: ['house', houseId, 'assignees'], queryFn: () => api<Assignees>(`/houses/${houseId}/tasks/assignees`) })
  const nextStage = r.stages.find((s) => s.status !== 'DONE' && s.status !== 'SKIPPED')
  const [title, setTitle] = useState(nextStage?.title ?? r.title)
  const [stage, setStage] = useState(nextStage?.id ?? '')
  const [who, setWho] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority>(r.priority)
  const [photo, setPhoto] = useState(true)
  const create = useMutation({
    mutationFn: () => {
      const [kind, id] = who.split(':')
      const body: CreateTaskBody = {
        title, request_id: r.id, stage_id: stage || null, priority, requires_photo: photo,
        due_at: due ? new Date(`${due}T18:00:00+05:00`).toISOString() : null,
        ...(kind === 'w' ? { assignee_id: id } : { contractor_id: id }),
      }
      return api(`/houses/${houseId}/tasks`, { method: 'POST', body })
    },
    onSuccess: async () => { await done(); onClose() },
  })
  const options = [
    ...(assignees.data?.workers ?? []).map((w) => ({ v: `w:${w.id}`, label: `${w.name}${w.position ? `, ${w.position.toLowerCase()}` : ''} — задач: ${w.active_tasks}` })),
    ...(assignees.data?.contractors ?? []).map((c) => ({ v: `c:${c.id}`, label: `${c.name} (подрядчик)` })),
  ]
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
      <div className="mt-3 flex flex-col gap-3 rounded-[18px] bg-surface-2 p-4">
        <Field label="Что сделать">{(id) => <Input id={id} value={title} onChange={setTitle} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Исполнитель" hint="Сначала свободные">{(id) => <Select id={id} value={who} onChange={setWho} options={options} placeholder={assignees.isPending ? 'Загрузка…' : 'Выберите'} />}</Field>
          <Field label="Этап">{(id) => <Select id={id} value={stage} onChange={setStage} options={[{ v: '', label: 'Без этапа' }, ...r.stages.filter((s) => s.status !== 'DONE').map((s) => ({ v: s.id, label: `${s.order}. ${s.title}` }))]} />}</Field>
          <Field label="Срок">{(id) => <input id={id} type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-12 w-full rounded-[15px] bg-surface px-3 text-[15px] text-ink" />}</Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13.5px] font-semibold text-ink">Приоритет</span>
            <Segmented id="task-prio" label="Приоритет" value={priority} onChange={setPriority} options={[{ v: 'CRITICAL', label: 'Критично' }, { v: 'HIGH', label: 'Высокий' }, { v: 'NORMAL', label: 'Обычный' }]} />
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-[14px] text-ink"><input type="checkbox" className="size-4 accent-[var(--color-brand-600)]" checked={photo} onChange={() => setPhoto((v) => !v)} /> Требуется фотофиксация</label>
        <ErrorNote>{create.error?.message}</ErrorNote>
        <div className="flex gap-2">
          <Btn icon={Send} disabled={!who || title.trim().length < 3} loading={create.isPending} onClick={() => create.mutate()}>Назначить и уведомить</Btn>
          <Btn variant="soft" onClick={onClose}>Отмена</Btn>
        </div>
      </div>
    </motion.div>
  )
}

function Tasks({ r, houseId }: { r: Detail; houseId: string }) {
  const [assigning, setAssigning] = useState(false)
  const open = !['DONE', 'REJECTED', 'CANCELLED', 'TRIAGE'].includes(r.status)
  return (
    <Card>
      <CardHead icon={UserCheck} title="Исполнители" sub="Работник получит push сразу. Фото жильцы увидят только после вашего подтверждения"
        aside={open && !assigning && <Btn variant="soft" icon={Plus} onClick={() => setAssigning(true)}>Назначить</Btn>} />
      <AnimatePresence>{assigning && <AssignForm r={r} houseId={houseId} onClose={() => setAssigning(false)} />}</AnimatePresence>
      {r.tasks.length === 0 && !assigning && <p className="text-[14px] text-ink-2">{r.status === 'TRIAGE' ? 'Сначала примите заявку' : 'Исполнитель ещё не назначен'}</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {r.tasks.map((t) => (
          <li key={t.id}>
            <div className="flex flex-wrap items-center gap-3 rounded-[16px] bg-surface-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold text-ink">{t.title}</p>
                <p className="text-[13px] text-ink-2">{t.assignee ?? 'без исполнителя'}{t.due_at && ` · до ${formatDateTime(t.due_at)}`}</p>
              </div>
              <Tag tone={t.status === 'SUBMITTED' ? 'warn' : t.status === 'APPROVED' ? 'brand' : 'mute'}>{TASK_STATUS_LABELS[t.status] ?? t.status}</Tag>
            </div>
            {t.status === 'SUBMITTED' && <Review task={t} houseId={houseId} requestId={r.id} />}
          </li>
        ))}
      </ul>
      {r.work_photo_file_ids.length > 0 && <div className="mt-4"><p className="mb-2 text-[13.5px] font-semibold text-ink">Фото выполненной работы</p><Photos houseId={houseId} ids={r.work_photo_file_ids} /></div>}
    </Card>
  )
}

/* ───────── страница ───────── */

export function RequestDetail() {
  const { houseId = '', requestId = '' } = useParams()
  const navigate = useNavigate()
  const done = useInvalidate(houseId, requestId)
  const q = useQuery({ queryKey: ['house', houseId, 'request', requestId], queryFn: () => api<Detail>(`/houses/${houseId}/requests/${requestId}`) })
  const events = useQuery({ queryKey: ['house', houseId, 'request', requestId, 'activity'], queryFn: () => api<Event[]>(`/houses/${houseId}/requests/${requestId}/activity`) })
  const patch = useMutation({ mutationFn: (priority: Priority) => api(`/houses/${houseId}/requests/${requestId}`, { method: 'PATCH', body: { priority } }), onSuccess: done })
  const close = useMutation({ mutationFn: () => api(`/houses/${houseId}/requests/${requestId}/close`, { method: 'POST' }), onSuccess: done })
  const back = { label: 'Заявки', onClick: () => navigate(`/h/${houseId}/requests`) }

  if (q.isPending) return <><PageHead title="Заявка" back={back} /><Skeleton rows={5} /></>
  if (!q.data) return <><PageHead title="Заявка" back={back} /><ErrorNote>{q.error?.message}</ErrorNote></>
  const r = q.data
  const open = ['ACCEPTED', 'IN_PROGRESS'].includes(r.status)

  return (
    <>
      <PageHead back={back} title={<><span className="nums text-ink-2">№{r.number}</span> {r.title}</>}
        sub={`${r.location_label} · ${CATEGORY_LABELS[r.category]} · ${formatDateTime(r.created_at)}`}
        actions={open && <Btn icon={CircleCheck} loading={close.isPending} onClick={() => close.mutate()}>Заявка выполнена</Btn>} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHead icon={ClipboardList} title="Что случилось" sub={r.author && `${r.author.name}${r.author.unit ? `, кв. ${r.author.unit}` : ''}`}
              aside={<Tag tone="mute">{REQUEST_STATUS_LABELS[r.status]}</Tag>} />
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{r.description}</p>
            {r.photo_file_ids.length > 0 && <div className="mt-4"><Photos houseId={houseId} ids={r.photo_file_ids} /></div>}
            {(r.flags?.length ?? 0) > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{r.flags!.map((f) => <Tag key={f} tone="warn">{FLAG_LABELS[f] ?? f}</Tag>)}</div>}
            {r.rejection_reason && <p className="mt-4 rounded-[15px] bg-surface-2 px-4 py-3 text-[14px] text-ink">Причина отказа: {r.rejection_reason}</p>}
            {r.rating && <p className="mt-4 text-[14px] text-ink-2">Оценка жильца: {r.rating} из 5</p>}
            <ErrorNote>{close.error?.message}</ErrorNote>
          </Card>
          {(r.status === 'TRIAGE' || r.status === 'NEW') && <Triage r={r} houseId={houseId} />}
          <Stages r={r} houseId={houseId} />
          <Tasks r={r} houseId={houseId} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHead title="Приоритет" sub={r.priority_set_by === 'AI_SUGGESTED' ? 'Предложен ИИ — поправьте, если не согласны' : 'Установлен вами'} />
            <Segmented id="req-prio" label="Приоритет" value={r.priority} onChange={(p) => patch.mutate(p)} options={[
              { v: 'CRITICAL', label: 'Критично' }, { v: 'HIGH', label: 'Высокий' }, { v: 'NORMAL', label: 'Обычный' }, { v: 'LOW', label: 'Низкий' },
            ]} />
            <ErrorNote>{patch.error?.message}</ErrorNote>
          </Card>
          <Card>
            <CardHead icon={History} title="История" sub="Серым — служебное, жильцы этого не видят" />
            {events.isPending && <Skeleton rows={3} />}
            <ol className="flex flex-col gap-3">
              {events.data?.map((e) => (
                <li key={e.id} className={cn('flex flex-col gap-1 border-l-2 pl-3', e.public === false ? 'border-surface-3 text-ink-3' : 'border-brand-200')}>
                  <span className="nums text-[12.5px] text-ink-2">{formatDateTime(e.created_at)} · {e.actor.name}</span>
                  <span className={cn('text-[14px]', e.public === false ? 'text-ink-2' : 'text-ink')}>{(EVENT_TEXT[e.type] ?? (() => e.type))(e.data ?? {})}</span>
                  {Array.isArray(e.data?.photo_file_ids) && (e.data.photo_file_ids as string[]).length > 0 && <Photos houseId={houseId} ids={e.data.photo_file_ids as string[]} />}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  )
}
