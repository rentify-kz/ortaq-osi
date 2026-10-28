import { useState } from 'react'
import { motion } from 'motion/react'
import { Bot, Camera, ClipboardList, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import type { Priority } from '@ortaq/shared'
import { api } from '../shared/api/client'
import { cn, ease, formatDateTime, plural } from '../shared/lib/cn'
import { Card, Empty, ErrorNote, PageHead, Segmented, Skeleton, Tag } from '../shared/ui/kit'
import { FLAG_LABELS, PRIORITY_LABELS, PRIORITY_TONE, REQUEST_STATUS_LABELS } from './labels'

export type RequestRow = {
  id: string; number: number; title: string; category: string; location_label: string; priority: Priority; status: string
  created_at: string; progress: { done: number; total: number; current_stage: string | null }; assignee: string | null
  reports: number; photos: number; flags?: string[]; author?: { name: string; unit: string | null }; ai_reason?: string | null
}

type Filter = 'all' | 'urgent' | 'unassigned' | 'done'

/** Прогресс по этапам: жилец видит ту же полоску в приложении */
export function StageBar({ done, total }: { done: number; total: number }) {
  if (total === 0) return null
  return (
    <span className="flex gap-1" aria-label={`Этапов выполнено: ${done} из ${total}`}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={cn('h-1.5 w-6 rounded-full', i < done ? 'bg-brand-500' : 'bg-surface-3')} />)}
    </span>
  )
}

function Row({ r, onOpen }: { r: RequestRow; onOpen: () => void }) {
  return (
    <motion.li layout transition={{ duration: 0.25, ease }}>
      <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 rounded-[20px] bg-surface-2 p-4 text-left transition-colors hover:bg-surface-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-semibold text-ink"><span className="nums text-ink-2">№{r.number}</span> {r.title}</p>
            <p className="mt-0.5 text-[13.5px] text-ink-2">
              {r.location_label}{r.author && ` · ${r.author.name}${r.author.unit ? `, кв. ${r.author.unit}` : ''}`}
            </p>
          </div>
          <span className="nums shrink-0 text-[13px] text-ink-2">{formatDateTime(r.created_at)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone={PRIORITY_TONE[r.priority]}>{PRIORITY_LABELS[r.priority]}</Tag>
          <Tag tone="mute">{REQUEST_STATUS_LABELS[r.status] ?? r.status}</Tag>
          {r.flags?.map((f) => <Tag key={f} tone="warn">{FLAG_LABELS[f] ?? f}</Tag>)}
          {r.reports > 1 && <Tag tone="warn" icon={Users}>{r.reports} {plural(r.reports, ['обращение', 'обращения', 'обращений'])}</Tag>}
          {r.photos > 0 && <Tag tone="mute" icon={Camera}>{r.photos}</Tag>}
        </div>
        {r.ai_reason && r.status === 'TRIAGE' && (
          <p className="flex items-start gap-1.5 text-[13px] text-ink-2"><Bot size={15} className="mt-px shrink-0" /> ИИ: {r.ai_reason}</p>
        )}
        {(r.assignee || r.progress.total > 0) && (
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
            <StageBar done={r.progress.done} total={r.progress.total} />
            {r.progress.current_stage && <span>{r.progress.current_stage}</span>}
            {r.assignee && <span>· {r.assignee}</span>}
          </div>
        )}
      </button>
    </motion.li>
  )
}

/**
 * Входящие заявки (docs/06 §6.1): срочные вверху, ИИ подсказывает приоритет и помечает
 * подозрительное, но решение — за председателем.
 */
export function Requests() {
  const { houseId = '' } = useParams()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const query = filter === 'done' ? 'status=done' : `status=open&filter=${filter}`
  const q = useQuery({ queryKey: ['house', houseId, 'requests', filter], queryFn: () => api<RequestRow[]>(`/houses/${houseId}/requests?${query}`) })
  const waiting = q.data?.filter((r) => r.status === 'TRIAGE').length ?? 0

  return (
    <>
      <PageHead title="Заявки" sub={waiting > 0 ? `${waiting} ${plural(waiting, ['ждёт', 'ждут', 'ждут'])} вашего решения` : 'Срочные вверху. ИИ подсказывает, решаете вы'} />
      <Card>
        <Segmented id="req-filter" label="Какие заявки показать" value={filter} onChange={setFilter} options={[
          { v: 'all', label: 'Открытые' }, { v: 'urgent', label: 'Срочные' }, { v: 'unassigned', label: 'Без исполнителя' }, { v: 'done', label: 'Выполненные' },
        ]} />
        <div className="mt-5">
          {q.isPending && <Skeleton rows={4} />}
          <ErrorNote>{q.error?.message}</ErrorNote>
          {q.data?.length === 0 && <Empty icon={ClipboardList} title="Заявок нет" text="Когда жилец сообщит о проблеме, она появится здесь — срочные сверху." />}
          <ul className="flex flex-col gap-2">
            {q.data?.map((r) => <Row key={r.id} r={r} onOpen={() => navigate(`/h/${houseId}/requests/${r.id}`)} />)}
          </ul>
        </div>
      </Card>
    </>
  )
}
