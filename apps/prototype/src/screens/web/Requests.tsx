import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Camera, Sparkles, Check, Plus, Copy, X, Users, Image as ImageIcon } from 'lucide-react'
import { Card } from '../../components/Card'
import { Btn, Pill, Stepper } from '../../components/Bits'
import { PageHead, Segmented, Dot, GroupLabel, Empty } from '../../components/web/ui'
import { requests as initial, workers, type Request, type Prio, type Stage } from '../../data/chairman'
import { cn, ease } from '../../lib/cn'

type Filter = 'all' | 'urgent' | 'free' | 'progress'

const prioMeta: Record<Prio, { label: string; dot: 'crit' | 'warn' | 'norm'; pill: 'crit' | 'warn' | 'brand' }> = {
  crit: { label: 'Критично', dot: 'crit', pill: 'crit' },
  high: { label: 'Высокий', dot: 'warn', pill: 'warn' },
  norm: { label: 'Обычный', dot: 'norm', pill: 'brand' },
}

const match = (r: Request, f: Filter) =>
  f === 'all' ||
  (f === 'urgent' && r.prio !== 'norm') ||
  (f === 'free' && !r.executor) ||
  (f === 'progress' && r.status === 'progress')

/* ───────────── строка списка ───────────── */

function ReqRow({ r, on, onPick }: { r: Request; on: boolean; onPick: () => void }) {
  const crit = r.prio === 'crit'
  const done = r.stages?.filter((s) => s.state === 'done').length ?? 0
  const now = r.stages?.find((s) => s.state === 'now')
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease }}
      onClick={onPick}
      aria-pressed={on}
      className={cn(
        'relative flex w-full flex-col gap-1.5 overflow-hidden rounded-[18px] py-3.5 pl-5 pr-4 text-left transition-colors',
        crit && (on ? 'bg-[#f9dcd9]' : 'bg-danger-soft hover:bg-[#fbe3e1]'),
        !crit && (on ? 'bg-brand-50' : 'bg-surface-2 hover:bg-surface-3'),
      )}
    >
      {/* Критичная заявка получает красную полосу слева: заливкой, а не рамкой */}
      {crit && <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-danger" />}
      <span className="flex items-baseline gap-2">
        <span className="nums text-[13.5px] font-semibold text-ink-2">№{r.id}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{r.title}</span>
        <span className="shrink-0 text-[12.5px] text-ink-2">{r.ago}</span>
      </span>
      <span className="text-[13px] text-ink-2">{r.place} · {r.author}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
        {r.executor
          ? <span className="rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink">{r.executor}</span>
          : <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[12px] font-semibold text-warning">без исполнителя</span>}
        {r.photos > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink-2">
            <Camera size={12} strokeWidth={2.2} /> {r.photos}
          </span>
        )}
        {now && (
          <span className="ml-auto flex min-w-[180px] items-center gap-2.5 text-[12.5px] text-ink-2">
            <span className="w-[90px]"><Stepper total={r.stages!.length} done={done} /></span>
            {now.title}
          </span>
        )}
      </span>
    </motion.button>
  )
}

/* ───────────── этапы заявки ───────────── */

function Stages({ stages }: { stages: Stage[] }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {stages.map((s, i) => (
        <li key={s.title} className={cn('flex items-center gap-3 rounded-[14px] px-3 py-2.5', s.state === 'now' ? 'bg-brand-50' : 'bg-surface-2')}>
          <span className={cn(
            'grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-bold',
            s.state === 'done' && 'bg-brand-600 text-white',
            s.state === 'now' && 'bg-brand-200 text-brand-800',
            s.state === 'next' && 'bg-surface-3 text-ink-2',
          )}>
            {s.state === 'done' ? <Check size={14} strokeWidth={3} /> : i + 1}
          </span>
          <span className="min-w-0 flex-1 text-[14px] font-medium text-ink">{s.title}</span>
          <span className="shrink-0 text-[12.5px] text-ink-2">
            {s.state === 'next' ? 'не начат' : [s.who, s.when].filter(Boolean).join(', ')}
          </span>
        </li>
      ))}
    </ol>
  )
}

/* ───────────── назначение исполнителя ───────────── */

function Assign({ hint, onDone, onCancel }: { hint?: string; onDone: (who: string) => void; onCancel: () => void }) {
  const staff = workers.filter((w) => !w.contractor).sort((a, b) => a.load - b.load)
  // По умолчанию выбран специалист из подсказки ИИ, иначе самый свободный
  const suggested = staff.find((w) => hint?.includes(w.role))
  const [pick, setPick] = useState((suggested ?? staff[0]).name)
  const groups = [
    { label: 'Свободны сейчас', list: staff.filter((w) => w.load <= 2) },
    { label: 'Загружены', list: staff.filter((w) => w.load > 2) },
    { label: 'Подрядчики', list: workers.filter((w) => w.contractor) },
  ]
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease }}
      className="flex flex-col gap-3"
    >
      <p className="font-display text-[16px] font-bold text-ink">Кому поручить</p>
      {groups.map((g) => g.list.length > 0 && (
        <div key={g.label} className="flex flex-col gap-1.5">
          <GroupLabel>{g.label}</GroupLabel>
          {g.list.map((w) => {
            const on = w.name === pick
            return (
              <button
                key={w.name}
                role="radio"
                aria-checked={on}
                onClick={() => setPick(w.name)}
                className={cn('flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors', on ? 'bg-brand-50' : 'bg-surface-2 hover:bg-surface-3')}
              >
                <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', on ? 'bg-brand-600' : 'bg-surface-3')}>
                  {on && <span className="size-2 rounded-full bg-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                    {w.name}
                    {w === suggested && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11.5px] font-semibold text-brand-700">
                        <Sparkles size={11} strokeWidth={2.4} /> советует ИИ
                      </span>
                    )}
                  </span>
                  <span className="block text-[12.5px] text-ink-2">{w.role}</span>
                </span>
                <span className={cn('nums shrink-0 text-[12.5px] font-medium', w.load > 2 ? 'text-warning' : 'text-ink-2')}>
                  {w.load === 0 ? 'нет задач' : `${w.load} ${w.load === 1 ? 'задача' : w.load < 5 ? 'задачи' : 'задач'}`}
                </span>
              </button>
            )
          })}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Btn className="flex-1" onClick={() => onDone(pick)}>Назначить и уведомить</Btn>
        <Btn variant="soft" onClick={onCancel}>Отмена</Btn>
      </div>
    </motion.div>
  )
}

/* ───────────── карточка выбранной заявки ───────────── */

function Detail({ r, onUpdate }: { r: Request; onUpdate: (patch: Partial<Request>) => void }) {
  const [assigning, setAssigning] = useState(false)
  const meta = prioMeta[r.prio]

  const assign = (who: string) => {
    setAssigning(false)
    onUpdate({
      executor: who,
      status: 'progress',
      stages: r.stages ?? [
        { title: 'Осмотр', who, when: 'в работе', state: 'now' },
        { title: 'Ремонт', state: 'next' },
        { title: 'Проверка и акт', state: 'next' },
      ],
    })
  }

  const fromPlan = () => onUpdate({
    plan: undefined,
    stages: r.plan!.map((p, i) => ({ title: p.step, who: i === 0 ? p.who : undefined, state: i === 0 ? 'now' : 'next' })),
  })

  return (
    <motion.div
      key={r.id}
      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease }}
      className="flex flex-col gap-5"
    >
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="nums text-[14px] font-semibold text-ink-2">№{r.id}</span>
          <Pill tone={meta.pill}><Dot tone={meta.dot} /> {meta.label.toLowerCase()}</Pill>
          <span className="ml-auto text-[13px] text-ink-2">{r.ago}</span>
        </div>
        <h2 className="mt-2 font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-ink">{r.title}</h2>
        <p className="mt-1 text-[14px] text-ink-2">{r.place} · {r.author}</p>
      </header>

      <blockquote className="rounded-[16px] bg-surface-2 p-4 text-[14.5px] leading-relaxed text-ink">«{r.quote}»</blockquote>

      {r.photos > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: Math.min(r.photos, 3) }).map((_, i) => (
            <div key={i} className="grid aspect-[4/3] place-items-center rounded-[14px] bg-surface-3 text-ink-3">
              <ImageIcon size={22} strokeWidth={1.8} />
            </div>
          ))}
        </div>
      )}

      {/* ИИ готовит, человек решает: предложение визуально отделено и всегда с кнопками */}
      {r.ai && !r.executor && (
        <div className="rounded-[16px] bg-brand-50 p-4">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-brand-700">
            <Sparkles size={16} strokeWidth={2.2} /> {r.ai}
          </p>
          {r.plan && (
            <>
              <ol className="mt-3 flex flex-col gap-1.5">
                {r.plan.map((p, i) => (
                  <li key={p.step} className="flex gap-3 text-[13.5px]">
                    <span className="nums w-4 shrink-0 font-semibold text-brand-700">{i + 1}.</span>
                    <span className="min-w-0 flex-1 text-ink">{p.step}</span>
                    <span className="shrink-0 text-ink-2">{p.who}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                <Btn className="!h-10" onClick={fromPlan}>Создать этапы из плана</Btn>
                <Btn variant="ghost" className="!h-10 !bg-surface hover:!bg-surface-2">Изменить</Btn>
                <Btn variant="ghost" className="!h-10 !bg-surface hover:!bg-surface-2" onClick={() => onUpdate({ plan: undefined })}>Отклонить</Btn>
              </div>
            </>
          )}
        </div>
      )}

      {r.stages && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="font-display text-[16px] font-bold text-ink">Этапы работы</p>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-3">
              <Plus size={14} strokeWidth={2.4} /> Добавить
            </button>
          </div>
          <Stages stages={r.stages} />
          {r.executor && <p className="text-[13px] text-ink-2">Исполнитель: <span className="font-semibold text-ink">{r.executor}</span>. Жильцы видят прогресс по этапам.</p>}
        </div>
      )}

      <AnimatePresence mode="wait">
        {!r.executor && (assigning
          ? <Assign key="assign" hint={r.ai} onDone={assign} onCancel={() => setAssigning(false)} />
          : (
            <motion.div key="actions" exit={{ opacity: 0 }} className="flex flex-wrap gap-2">
              <Btn className="flex-1" onClick={() => setAssigning(true)}><Users size={16} strokeWidth={2.2} /> Назначить исполнителя</Btn>
              <Btn variant="soft"><Copy size={15} strokeWidth={2.2} /> Дубликат</Btn>
              <Btn variant="soft"><X size={15} strokeWidth={2.4} /> Отклонить</Btn>
            </motion.div>
          ))}
      </AnimatePresence>
    </motion.div>
  )
}

/* ───────────── экран ───────────── */

export function Requests() {
  const [list, setList] = useState(initial)
  const [f, setF] = useState<Filter>('all')
  const [sel, setSel] = useState(initial[0].id)

  const shown = list.filter((r) => match(r, f))
  const current = list.find((r) => r.id === sel) ?? shown[0]
  const count = (x: Filter) => list.filter((r) => match(r, x)).length
  const update = (id: number, patch: Partial<Request>) =>
    setList((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  return (
    <>
      <PageHead title="Заявки" sub="4 новых за сутки, 2 срочные. Срочные всегда сверху" />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card delay={0.08} lift={false} className="flex flex-col gap-4 xl:col-span-7">
          <Segmented
            id="req"
            value={f}
            onChange={setF}
            options={[
              { v: 'all', label: 'Все', n: count('all') },
              { v: 'urgent', label: 'Срочные', n: count('urgent') },
              { v: 'free', label: 'Без исполнителя', n: count('free') },
              { v: 'progress', label: 'В работе', n: count('progress') },
            ]}
          />

          {shown.length === 0 && (
            <div className="rounded-[18px] bg-surface-2 px-5 py-10">
              <Empty icon={Check} title="Здесь пусто" text="Все заявки в этом фильтре уже разобраны. Новые появятся сверху, как только жильцы их отправят." />
            </div>
          )}

          {(['crit', 'high', 'norm'] as Prio[]).map((p) => {
            const group = shown.filter((r) => r.prio === p)
            if (!group.length) return null
            return (
              <section key={p} className="flex flex-col gap-2">
                <GroupLabel tone={p === 'crit' ? 'crit' : p === 'high' ? 'warn' : 'mute'}>
                  <Dot tone={prioMeta[p].dot} /> {prioMeta[p].label}
                  <span className="nums font-medium text-ink-3">{group.length}</span>
                </GroupLabel>
                <AnimatePresence initial={false}>
                  {group.map((r) => <ReqRow key={r.id} r={r} on={r.id === current?.id} onPick={() => setSel(r.id)} />)}
                </AnimatePresence>
              </section>
            )
          })}
        </Card>

        <Card delay={0.15} lift={false} className="xl:sticky xl:top-[92px] xl:col-span-5">
          {current
            ? <Detail key={current.id} r={current} onUpdate={(patch) => update(current.id, patch)} />
            : <Empty icon={Check} title="Выберите заявку" text="Слева список, справа подробности и действия по выбранной заявке." />}
        </Card>
      </div>
    </>
  )
}
