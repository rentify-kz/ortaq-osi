import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Droplets, DoorClosed, Camera, Sparkles, Check, ChevronRight, CircleAlert, Image as ImageIcon, Undo2, Repeat } from 'lucide-react'
import { Scroll, Block, Group, Label, Pill, Btn } from '../../components/Bits'
import { Sheet } from '../../components/Sheet'
import { Toggle } from '../../components/web/ui'
import { requests, approvals as initialApprovals, tasks, type Request, type Approval } from '../../data/chairman'
import { MHead, WorkerPicker } from './parts'
import { cn, ease } from '../../lib/cn'

/** Заявки, пришедшие сегодня: с ними председатель разбирается с телефона */
const TODAY_IDS = [51, 52]
const fresh = requests.filter((r) => TODAY_IDS.includes(r.id))
const inWork = tasks.filter((t) => t.state !== 'scheduled')

/** Специализация из подсказки ИИ: «Нужен сантехник» → «сантехник» */
const roleFromAi = (ai?: string) => ['сантехник', 'электрик', 'дворник', 'уборщица'].find((r) => ai?.includes(r))

const rise = { hide: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }

/* ───────────── новая заявка ───────────── */

function NewRequest({ r, who, onAssign }: { r: Request; who?: string; onAssign: () => void }) {
  const crit = r.prio === 'crit'
  const Icon = crit ? Droplets : DoorClosed
  return (
    <motion.div variants={rise} layout className={cn('rounded-[22px] p-4', crit ? 'bg-danger-soft' : 'bg-surface')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', crit ? 'bg-surface text-danger' : 'bg-surface-2 text-ink-2')}>
          <Icon size={19} strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('nums text-[13px] font-bold', crit ? 'text-danger' : 'text-ink-2')}>№{r.id}</span>
            {crit && <Pill tone="crit">критично</Pill>}
          </div>
          <p className="mt-0.5 font-display text-[17px] font-bold leading-snug text-ink">{r.title}</p>
          <p className="mt-0.5 text-[13.5px] text-ink-2">{r.place} · {r.ago}</p>
          {r.photos > 0 && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface/80 px-2.5 py-1 text-[12.5px] font-semibold text-ink-2">
              <Camera size={12} strokeWidth={2.2} /> {r.photos} фото
            </span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {who ? (
          <motion.p
            key="done"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3.5 flex items-center gap-2 rounded-[14px] bg-surface px-3.5 py-3 text-[14px] text-ink"
          >
            <Check size={17} strokeWidth={2.6} className="text-brand-600" /> Назначено: <span className="font-semibold">{who}</span>
          </motion.p>
        ) : (
          <motion.div key="act" exit={{ opacity: 0 }} className="mt-3.5 flex gap-2">
            <Btn className="flex-1" onClick={onAssign}>Назначить</Btn>
            <Btn variant="ghost" className="flex-1 !bg-surface">Открыть</Btn>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ───────────── экран ───────────── */

export function MTasks() {
  const [assigned, setAssigned] = useState<Record<number, string>>({})
  const [assigning, setAssigning] = useState<Request | null>(null)
  const [pick, setPick] = useState('')
  const [queue, setQueue] = useState(initialApprovals)
  const [reviewing, setReviewing] = useState<Approval | null>(null)
  const [show, setShow] = useState(true)
  const [report, setReport] = useState(true)

  const openAssign = (r: Request) => {
    const role = roleFromAi(r.ai)
    setPick(role === 'сантехник' ? 'Сергей П.' : role === 'электрик' ? 'Ерлан Т.' : 'Нурлан Б.')
    setAssigning(r)
  }
  const openReview = (a: Approval) => { setShow(true); setReport(true); setReviewing(a) }
  const closeReview = () => {
    if (reviewing) setQueue((q) => q.filter((x) => x.t !== reviewing.t))
    setReviewing(null)
  }

  return (
    <>
      <MHead title="Задачи" />
      <Scroll>
        <Group>
          <Label tone="crit"><CircleAlert size={14} strokeWidth={2.4} /> Новые заявки <span className="nums ml-auto text-ink-3">{fresh.length}</span></Label>
          {fresh.map((r) => <NewRequest key={r.id} r={r} who={assigned[r.id]} onAssign={() => openAssign(r)} />)}
        </Group>

        <Group>
          <Label>Ждут подтверждения <span className="nums ml-auto text-ink-3">{queue.length}</span></Label>
          {queue.length === 0 ? (
            <Block className="flex items-center gap-3 text-[14px] text-ink-2">
              <Check size={18} strokeWidth={2.6} className="text-brand-600" /> Все работы приняты
            </Block>
          ) : (
            <Block className="!p-2">
              {queue.map((a) => (
                <button key={a.t} onClick={() => openReview(a)} className="flex w-full items-center gap-3 rounded-[16px] p-2.5 text-left transition-colors hover:bg-surface-2">
                  <span className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-surface-3 text-ink-3">
                    <ImageIcon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold text-ink">{a.t}</span>
                    <span className="block text-[13px] text-ink-2">{a.who}, {a.photos} фото</span>
                  </span>
                  <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-ink-3" />
                </button>
              ))}
            </Block>
          )}
        </Group>

        <Group>
          <Label>В работе <span className="nums ml-auto text-ink-3">{inWork.length}</span></Label>
          <Block className="!p-2">
            {inWork.map((t) => (
              <div key={t.t} className="flex items-center gap-3 rounded-[16px] p-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium text-ink">{t.t}</span>
                  <span className="block text-[13px] text-ink-2">{t.who}</span>
                </span>
                <span className={cn('shrink-0 text-[13px]', t.state === 'overdue' ? 'font-semibold text-warning' : 'text-ink-2')}>
                  {t.state === 'overdue' ? 'просрочено' : t.due}
                </span>
              </div>
            ))}
          </Block>
          <p className="flex items-center gap-1.5 px-1 text-[13px] text-ink-2"><Repeat size={13} strokeWidth={2.2} /> Плановые задачи по расписанию в веб-кабинете</p>
        </Group>
      </Scroll>

      {/* От push до назначенного исполнителя три нажатия: Назначить, выбор, Назначить и уведомить */}
      <Sheet open={!!assigning} onClose={() => setAssigning(null)} title={assigning ? `№${assigning.id} · ${assigning.title}` : ''}>
        {assigning?.ai && (
          <p className="flex items-start gap-2 rounded-[16px] bg-brand-50 p-3.5 text-[14px] text-brand-700">
            <Sparkles size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" /> {assigning.ai}
          </p>
        )}
        <WorkerPicker value={pick} onChange={setPick} suggest={roleFromAi(assigning?.ai)} />
        <Btn full onClick={() => { if (assigning) setAssigned((a) => ({ ...a, [assigning.id]: pick })); setAssigning(null) }}>
          Назначить и уведомить
        </Btn>
      </Sheet>

      <Sheet open={!!reviewing} onClose={() => setReviewing(null)} title={reviewing?.t ?? ''}>
        {reviewing && (
          <>
            <p className="-mt-2 text-[14px] text-ink-2">{reviewing.who}, {reviewing.when}</p>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: reviewing.photos }).map((_, i) => (
                <div key={i} className={cn('grid aspect-square place-items-center rounded-[16px] bg-surface-3 text-ink-3', i === 0 && reviewing.photos % 2 === 1 && 'col-span-2 aspect-[2/1]')}>
                  <ImageIcon size={24} strokeWidth={1.8} />
                </div>
              ))}
            </div>
            <p className="text-[15px] leading-relaxed text-ink">«{reviewing.comment}»</p>
            <div className="flex flex-col">
              <Toggle on={show} onChange={setShow} label="Показать фото жильцам" />
              <Toggle on={report} onChange={setReport} label="Включить в отчёт за месяц" />
            </div>
            <div className="flex gap-2">
              <Btn className="flex-1" onClick={closeReview}><Check size={16} strokeWidth={2.6} /> Подтвердить</Btn>
              <Btn variant="soft" onClick={() => setReviewing(null)}><Undo2 size={15} strokeWidth={2.2} /> Вернуть</Btn>
            </div>
          </>
        )}
      </Sheet>
    </>
  )
}
