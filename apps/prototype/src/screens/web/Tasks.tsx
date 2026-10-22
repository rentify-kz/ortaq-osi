import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Mic, Plus, Camera, Repeat, CircleCheck, Undo2, Image as ImageIcon } from 'lucide-react'
import { Card, CardHead } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, HeadBtn, Segmented, Toggle, Tag, Table, Row, Td, Cell, Empty } from '../../components/web/ui'
import { ease } from '../../lib/cn'
import { tasks, approvals as initial, type Approval, type Task } from '../../data/chairman'

/* ───────────── приёмка работы ───────────── */

function ApprovalCard({ a, onDone }: { a: Approval; onDone: () => void }) {
  const [show, setShow] = useState(true)
  const [report, setReport] = useState(true)
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease }}
      className="flex flex-col gap-4 rounded-[20px] bg-surface-2 p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[16.5px] font-bold text-ink">{a.t}</p>
          <p className="mt-0.5 text-[13px] text-ink-2">{a.who}, {a.when}</p>
        </div>
        <Tag tone="mute" icon={Camera}>{a.photos} фото</Tag>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: a.photos }).map((_, i) => (
          <div key={i} className="grid aspect-[4/3] place-items-center rounded-[12px] bg-surface-3 text-ink-3">
            <ImageIcon size={20} strokeWidth={1.8} />
          </div>
        ))}
      </div>

      <p className="text-[14px] leading-relaxed text-ink">«{a.comment}»</p>

      {/* Два переключателя закрывают два требования: фото жильцам и фото в отчёт */}
      <div className="flex flex-col">
        <Toggle on={show} onChange={setShow} label="Показать фото жильцам" />
        <Toggle on={report} onChange={setReport} label="Включить в отчёт за месяц" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn className="flex-1" onClick={onDone}><CircleCheck size={16} strokeWidth={2.2} /> Подтвердить</Btn>
        <Btn variant="ghost" className="!bg-surface hover:!bg-surface-3"><Undo2 size={15} strokeWidth={2.2} /> Вернуть на доработку</Btn>
      </div>
    </motion.article>
  )
}

/* ───────────── все задачи ───────────── */

type Filter = 'all' | 'today' | 'overdue' | 'scheduled'

const match = (t: Task, f: Filter) =>
  f === 'all' || (f === 'today' && t.due === 'сегодня') || t.state === f

const stateTag = (t: Task) =>
  t.state === 'overdue' ? <Tag tone="warn">Просрочено</Tag>
    : t.state === 'scheduled' ? <Tag tone="mute" icon={Repeat}>По расписанию</Tag>
    : <Tag tone="brand">В работе</Tag>

export function Tasks() {
  const [queue, setQueue] = useState(initial)
  const [f, setF] = useState<Filter>('all')
  const rows = tasks.filter((t) => match(t, f))
  const count = (x: Filter) => tasks.filter((t) => match(t, x)).length

  return (
    <>
      <PageHead
        title="Задачи"
        sub="7 задач у персонала, одна просрочена"
        actions={
          <>
            <HeadBtn icon={Mic}>Задачи голосом</HeadBtn>
            <Btn className="!rounded-full"><Plus size={16} strokeWidth={2.4} /> Поручение</Btn>
          </>
        }
      />

      <Card delay={0.08} lift={false} className="flex flex-col gap-4">
        <CardHead
          title="Ждут подтверждения"
          sub="Фото увидят жильцы только после вашего подтверждения"
          icon={<CircleCheck size={18} strokeWidth={2} />}
        />
        {queue.length === 0 ? (
          <div className="rounded-[18px] bg-surface-2 px-5 py-8">
            <Empty icon={CircleCheck} title="Все работы приняты" text="Когда работник отметит задачу выполненной, она появится здесь вместе с фото." />
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <AnimatePresence initial={false}>
              {queue.map((a) => (
                <ApprovalCard key={a.t} a={a} onDone={() => setQueue((q) => q.filter((x) => x.t !== a.t))} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </Card>

      <Card delay={0.15} lift={false} className="!p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[24px] font-extrabold tracking-[-0.03em] text-ink">Все задачи</h2>
          <Segmented
            id="tasks"
            value={f}
            onChange={setF}
            options={[
              { v: 'all', label: 'Все', n: count('all') },
              { v: 'today', label: 'Сегодня', n: count('today') },
              { v: 'overdue', label: 'Просрочено', n: count('overdue') },
              { v: 'scheduled', label: 'По расписанию', n: count('scheduled') },
            ]}
          />
        </div>
        <div className="mt-4">
          <Table cols={[{ label: 'Задача' }, { label: 'Исполнитель' }, { label: 'Срок' }, { label: 'Фото' }, { label: 'Статус', right: true }]}>
            {rows.map((t, i) => (
              <Row key={t.t} i={i}>
                <Td><Cell title={t.t} sub={t.req ? `${t.place} · заявка №${t.req}` : t.place} /></Td>
                <Td>{t.who}</Td>
                <Td className={t.state === 'overdue' ? 'font-semibold text-warning' : ''}>{t.due}</Td>
                <Td>{t.photo ? <span className="inline-flex items-center gap-1.5 text-ink-2"><Camera size={14} strokeWidth={2.2} /> нужно</span> : <span className="text-ink-3">не нужно</span>}</Td>
                <Td right>{stateTag(t)}</Td>
              </Row>
            ))}
          </Table>
        </div>
      </Card>
    </>
  )
}
