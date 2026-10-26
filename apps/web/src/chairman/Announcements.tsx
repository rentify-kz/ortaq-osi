import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BarChart3, Bell, BellOff, Megaphone, Pin, Send, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import type { CreateAnnouncementBody } from '@ortaq/shared'
import { api } from '../shared/api/client'
import { cn, ease, formatDateTime, plural } from '../shared/lib/cn'
import { Btn, Card, CardHead, Empty, ErrorNote, Field, fieldCls, Input, PageHead, Segmented, Skeleton, Tag } from '../shared/ui/kit'

type Audience = CreateAnnouncementBody['audience']
type Announcement = {
  id: string; title: string; body: string; audience: Audience; pinned: boolean; published_at: string
  expires_at: string | null; user_ids?: string[]; entrances?: number[]
}
type Stats = { recipients: number; read: number; percent: number; by_entrance: { entrance: number | null; recipients: number; read: number }[] }
type Member = { user_id: string; full_name: string; role: string; units: { number: string }[] }
type House = { entrance_count: number }

const AUDIENCE_LABEL: Record<Audience, string> = { ALL: 'всем жильцам', STAFF: 'персоналу', SPECIFIC_USERS: 'отдельным жильцам', ENTRANCE: 'подъездам' }

function Composer({ houseId }: { houseId: string }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('ALL')
  const [entrances, setEntrances] = useState<number[]>([])
  const [userIds, setUserIds] = useState<string[]>([])
  const [pinned, setPinned] = useState(false)
  const [push, setPush] = useState(true)
  const [sent, setSent] = useState<number | null>(null)
  const house = useQuery({ queryKey: ['house', houseId], queryFn: () => api<House>(`/houses/${houseId}`) })
  const members = useQuery({
    queryKey: ['house', houseId, 'members'], queryFn: () => api<Member[]>(`/houses/${houseId}/members`), enabled: audience === 'SPECIFIC_USERS',
  })
  const publish = useMutation({
    mutationFn: () => api<{ recipients: number }>(`/houses/${houseId}/announcements`, {
      method: 'POST',
      body: {
        title, body, audience, pinned, push,
        ...(audience === 'ENTRANCE' && { entrances }),
        ...(audience === 'SPECIFIC_USERS' && { user_ids: userIds }),
      } satisfies CreateAnnouncementBody,
    }),
    onSuccess: async (r) => {
      setSent(r.recipients)
      setTitle(''); setBody(''); setEntrances([]); setUserIds([]); setPinned(false)
      await qc.invalidateQueries({ queryKey: ['house', houseId, 'announcements'] })
    },
  })
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const ready = title.trim().length >= 3 && body.trim().length > 0
    && (audience !== 'ENTRANCE' || entrances.length > 0) && (audience !== 'SPECIFIC_USERS' || userIds.length > 0)

  return (
    <Card>
      <CardHead icon={Megaphone} title="Новое объявление" />
      <div className="flex flex-col gap-4">
        <Field label="Заголовок">{(id) => <Input id={id} value={title} onChange={setTitle} maxLength={200} placeholder="Отключение горячей воды 12–14 сентября" />}</Field>
        <Field label="Текст">
          {(id) => <textarea id={id} value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={10_000} className={cn(fieldCls, 'resize-y py-3 leading-relaxed')} />}
        </Field>
        <div className="flex flex-col gap-2">
          <p className="text-[13.5px] font-semibold text-ink">Кому</p>
          <Segmented id="audience" label="Кому" value={audience} onChange={setAudience} options={[
            { v: 'ALL', label: 'Всем жильцам' }, { v: 'STAFF', label: 'Персоналу' },
            { v: 'ENTRANCE', label: 'Подъездам' }, { v: 'SPECIFIC_USERS', label: 'Отдельным' },
          ]} />
        </div>
        <AnimatePresence initial={false}>
          {audience === 'ENTRANCE' && house.data && (
            <motion.div key="entrances" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div role="group" aria-label="Подъезды" className="flex flex-wrap gap-1.5">
                {Array.from({ length: house.data.entrance_count }, (_, i) => i + 1).map((e) => (
                  <button key={e} type="button" aria-pressed={entrances.includes(e)} onClick={() => setEntrances((l) => toggle(l, e))}
                    className={cn('nums h-11 min-w-11 rounded-full px-4 text-[14px] font-semibold transition-colors', entrances.includes(e) ? 'bg-brand-600 text-white' : 'bg-surface-2 text-ink hover:bg-surface-3')}>
                    {e}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
          {audience === 'SPECIFIC_USERS' && (
            <motion.div key="people" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              {members.isPending ? <Skeleton rows={2} /> : (
                <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
                  {members.data?.filter((m) => m.role === 'RESIDENT' || m.role === 'WORKER').map((m) => (
                    <li key={m.user_id}>
                      <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-[14px] px-4 py-2 transition-colors', userIds.includes(m.user_id) ? 'bg-brand-50' : 'bg-surface-2 hover:bg-surface-3')}>
                        <input type="checkbox" checked={userIds.includes(m.user_id)} onChange={() => setUserIds((l) => toggle(l, m.user_id))} className="size-4 accent-[var(--color-brand-600)]" />
                        <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{m.full_name || 'Без имени'}</span>
                        <span className="nums text-[13px] text-ink-2">{m.units.map((u) => `кв. ${u.number}`).join(', ') || 'персонал'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex flex-wrap gap-2">
          <Btn variant={pinned ? 'solid' : 'soft'} icon={Pin} onClick={() => setPinned((v) => !v)}>{pinned ? 'Закреплено' : 'Закрепить'}</Btn>
          <Btn variant={push ? 'solid' : 'soft'} icon={push ? Bell : BellOff} onClick={() => setPush((v) => !v)}>{push ? 'С push-уведомлением' : 'Только в ленте'}</Btn>
        </div>
        {!push && <p className="-mt-2 text-[12.5px] text-ink-2">Без push объявление появится в ленте, но телефон не зазвонит. Подходит для несрочного</p>}
        <ErrorNote>{publish.error?.message}</ErrorNote>
        <AnimatePresence>
          {sent !== null && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="nums rounded-[15px] bg-brand-50 px-4 py-3 text-[14px] text-brand-800">
              {sent > 0
                ? `Опубликовано: ${sent} ${plural(sent, ['получатель', 'получателя', 'получателей'])}`
                : 'Опубликовано, но получателей пока нет: в выбранной аудитории никто не зарегистрирован'}
            </motion.p>
          )}
        </AnimatePresence>
        <Btn icon={Send} loading={publish.isPending} disabled={!ready} onClick={() => { setSent(null); publish.mutate() }} className="self-start">Опубликовать</Btn>
      </div>
    </Card>
  )
}

function StatsPanel({ houseId, id }: { houseId: string; id: string }) {
  const [reminded, setReminded] = useState<number | null>(null)
  const stats = useQuery({ queryKey: ['house', houseId, 'announcements', id, 'stats'], queryFn: () => api<Stats>(`/houses/${houseId}/announcements/${id}/stats`) })
  const remind = useMutation({
    mutationFn: () => api<{ reminded: number }>(`/houses/${houseId}/announcements/${id}/remind`, { method: 'POST' }),
    onSuccess: (r) => setReminded(r.reminded),
  })
  if (stats.isPending) return <Skeleton rows={1} />
  if (!stats.data) return <ErrorNote>{stats.error?.message}</ErrorNote>
  const s = stats.data
  return (
    <div className="flex flex-col gap-3 rounded-[16px] bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="nums text-[14.5px] text-ink">Прочитали <b>{s.read}</b> из {s.recipients}</p>
        <span className="nums font-display text-[20px] font-bold text-ink">{s.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <motion.div initial={{ width: 0 }} animate={{ width: `${s.percent}%` }} transition={{ duration: 0.6, ease }} className="h-full rounded-full bg-brand-500" />
      </div>
      {s.by_entrance.length > 1 && (
        <p className="nums text-[13px] text-ink-2">
          {s.by_entrance.map((e) => `${e.entrance ? `${e.entrance} подъезд` : 'без помещения'} — ${e.read} из ${e.recipients}`).join(' · ')}
        </p>
      )}
      {s.read < s.recipients && (
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="soft" icon={Bell} loading={remind.isPending} disabled={reminded !== null} onClick={() => remind.mutate()}>Напомнить непрочитавшим</Btn>
          {reminded !== null && <span className="nums text-[13px] text-ink-2">Отправлено {reminded}</span>}
        </div>
      )}
      <ErrorNote>{remind.error?.message}</ErrorNote>
    </div>
  )
}

function Feed({ houseId }: { houseId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['house', houseId, 'announcements'], queryFn: () => api<Announcement[]>(`/houses/${houseId}/announcements`) })
  const patch = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api(`/houses/${houseId}/announcements/${id}`, { method: 'PATCH', body: { pinned } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['house', houseId, 'announcements'] }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/houses/${houseId}/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['house', houseId, 'announcements'] }),
  })
  return (
    <Card>
      <CardHead icon={BarChart3} title="Опубликованные" sub="Объявление, которое прочитала четверть дома, лучше продублировать" />
      {q.isPending && <Skeleton rows={3} />}
      {q.data?.length === 0 && <Empty icon={Megaphone} title="Объявлений пока нет" text="Первое объявление появится у жильцов в ленте и придёт push-уведомлением." />}
      <ul className="flex flex-col gap-2">
        {q.data?.map((a) => (
          <motion.li key={a.id} layout transition={{ duration: 0.3, ease }} className="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px] font-semibold text-ink">{a.title}</p>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  {formatDateTime(a.published_at)} · {AUDIENCE_LABEL[a.audience]}{a.entrances?.length ? ` ${a.entrances.join(', ')}` : ''}
                </p>
              </div>
              {a.pinned && <Tag icon={Pin}>Закреплено</Tag>}
            </div>
            <p className="line-clamp-3 whitespace-pre-line text-[14px] text-ink">{a.body}</p>
            <AnimatePresence initial={false}>
              {open === a.id && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <StatsPanel houseId={houseId} id={a.id} />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="-mx-2 flex flex-wrap gap-1">
              <Btn variant="ghost" icon={BarChart3} onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Скрыть' : 'Прочтения'}</Btn>
              <Btn variant="ghost" icon={Pin} loading={patch.isPending && patch.variables?.id === a.id} onClick={() => patch.mutate({ id: a.id, pinned: !a.pinned })}>
                {a.pinned ? 'Открепить' : 'Закрепить'}
              </Btn>
              <Btn variant="ghost" icon={Trash2} loading={remove.isPending && remove.variables === a.id} onClick={() => remove.mutate(a.id)}>Удалить</Btn>
            </div>
          </motion.li>
        ))}
      </ul>
    </Card>
  )
}

export function Announcements() {
  const { houseId = '' } = useParams()
  return (
    <>
      <PageHead title="Объявления" sub="Всем жильцам, персоналу, подъездам или отдельным людям — со статистикой прочтений" />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Composer houseId={houseId} />
        <Feed houseId={houseId} />
      </div>
    </>
  )
}
