import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowLeft, Camera, Repeat, ChevronRight, ChevronDown, Check, Wifi, WifiOff, CloudUpload,
  Eye, Image as ImageIcon, X, CircleAlert, Hourglass,
} from 'lucide-react'
import { AppBar, Scroll, Block, Group, Label, Btn } from '../../components/Bits'
import { Field, TextArea } from '../../components/web/ui'
import { me, workerTasks, type WTask, type WGroup } from '../../data/worker'
import { cn, ease, plural } from '../../lib/cn'

/* Работник в перчатках и в подвале: крупные кнопки, минимум ввода, работа без сети */

export type WView = { name: 'list' } | { name: 'task' | 'complete' | 'sent'; id: number }

const QUICK = ['Течи нет', 'Заменил участок', 'Поставил хомуты', 'Нужны материалы']
const MAX_PHOTOS = 6
/** Сколько длится догрузка очереди после появления сети */
const SYNC_MS = 1600

const groups: { g: WGroup; label: string }[] = [
  { g: 'urgent', label: 'Срочно' },
  { g: 'today', label: 'Сегодня' },
  { g: 'routine', label: 'По расписанию' },
]

/** Крупная кнопка под перчатки: 56 px в высоту */
function Big({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return <Btn full disabled={disabled} onClick={onClick} className="!h-14 !rounded-[18px] !text-[16px]">{children}</Btn>
}

function StateChip({ t }: { t: WTask }) {
  const map = {
    new: { label: 'Новая', cls: 'bg-danger text-white' },
    todo: { label: 'Не начата', cls: 'bg-surface-2 text-ink-2' },
    progress: { label: 'В работе', cls: 'bg-brand-600 text-white' },
    review: { label: 'На проверке', cls: 'bg-brand-50 text-brand-700' },
  }[t.state]
  return (
    <span className={cn('inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold', map.cls)}>
      {t.state === 'review' && <Hourglass size={12} strokeWidth={2.4} />}{map.label}
    </span>
  )
}

/** Метка «нужно фото» заранее: чтобы не уйти из подвала без снимка */
function Meta({ t }: { t: WTask }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StateChip t={t} />
      {t.photo && t.state !== 'review' && (
        <span className="inline-flex h-7 items-center gap-1 rounded-full bg-warning-soft px-2.5 text-[12.5px] font-semibold text-warning">
          <Camera size={12} strokeWidth={2.4} /> нужно фото
        </span>
      )}
      {t.repeat && <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2"><Repeat size={12} strokeWidth={2.4} /> {t.repeat}</span>}
    </span>
  )
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="relative z-10 shrink-0 px-4 pb-2 pt-1">
      <button onClick={onBack} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-surface pl-3 pr-4 text-[15px] font-semibold text-ink">
        <ArrowLeft size={18} strokeWidth={2.2} /> {label}
      </button>
    </div>
  )
}

function NetPill({ online, onToggle }: { online: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={!online}
      aria-label={online ? 'В сети. Нажмите, чтобы проверить работу без сети' : 'Нет сети. Нажмите, чтобы вернуть связь'}
      className={cn('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold', online ? 'bg-surface text-ink-2' : 'bg-ink text-white')}
    >
      {online ? <Wifi size={16} strokeWidth={2.2} /> : <WifiOff size={16} strokeWidth={2.2} />}
      {online ? 'В сети' : 'Нет сети'}
    </button>
  )
}

const rise = { hide: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }

/* ───────────── экран ───────────── */

export function WTasks({ initial, onUrgent }: { initial?: WView; onUrgent?: (n: number) => void }) {
  const [tasks, setTasks] = useState(workerTasks)
  const [view, setView] = useState<WView>(initial ?? { name: 'list' })
  const [online, setOnline] = useState(true)
  const [queued, setQueued] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [showLater, setShowLater] = useState(false)

  const [photos, setPhotos] = useState(0)
  const [quick, setQuick] = useState<string[]>([])
  const [comment, setComment] = useState('')

  // Появилась сеть: очередь догружается сама, работнику ничего делать не нужно
  useEffect(() => {
    if (!online || queued === 0) return
    setSyncing(true)
    const t = setTimeout(() => { setQueued(0); setSyncing(false) }, SYNC_MS)
    return () => clearTimeout(t)
  }, [online, queued])

  const patch = (id: number, p: Partial<WTask>) => {
    const next = tasks.map((t) => (t.id === id ? { ...t, ...p } : t))
    setTasks(next)
    onUrgent?.(next.filter((t) => t.state === 'new').length)
  }
  const open = (id: number) => setView({ name: 'task', id })
  const startComplete = (id: number) => { setPhotos(0); setQuick([]); setComment(''); setView({ name: 'complete', id }) }
  const submit = (t: WTask) => {
    patch(t.id, { state: 'review' })
    if (!online) setQueued((q) => q + photos)
    setView({ name: 'sent', id: t.id })
  }

  const current = view.name !== 'list' ? tasks.find((t) => t.id === view.id) ?? null : null
  const later = tasks.filter((t) => t.group === 'later')

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view.name + (current?.id ?? '')}
        initial={{ opacity: 0, x: view.name === 'list' ? -16 : 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {view.name === 'list' && (
          <>
            <AppBar
              left={
                <div>
                  <p className="text-[13px] font-medium text-ink-2">{me.short}, {me.role.toLowerCase()}</p>
                  <h1 className="mt-0.5 font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-ink">Мои задачи</h1>
                </div>
              }
              right={<NetPill online={online} onToggle={() => setOnline((o) => !o)} />}
            />
            <Scroll>
              {(queued > 0 || syncing) && (
                <motion.div variants={rise} className={cn('flex items-center gap-3 rounded-[18px] px-4 py-3 text-[14px]', syncing ? 'bg-brand-50 text-brand-700' : 'bg-surface text-ink')}>
                  <CloudUpload size={18} strokeWidth={2.2} className="shrink-0" />
                  {syncing ? 'Отправляю фото на проверку' : `${queued} ${plural(queued, ['фото ждёт', 'фото ждут', 'фото ждут'])} отправки. Уйдут сами, когда появится сеть`}
                </motion.div>
              )}

              {groups.map(({ g, label }) => {
                const list = tasks.filter((t) => t.group === g)
                if (!list.length) return null
                return (
                  <Group key={g}>
                    <Label tone={g === 'urgent' ? 'crit' : 'mute'}>
                      {g === 'urgent' && <CircleAlert size={14} strokeWidth={2.4} />}
                      {label} <span className="nums ml-auto text-ink-3">{list.length}</span>
                    </Label>
                    {list.map((t) => (t.state === 'new' ? (
                      <Block key={t.id} className="flex flex-col gap-3 bg-danger-soft">
                        <button onClick={() => open(t.id)} className="flex flex-col gap-1 text-left">
                          <span className="font-display text-[19px] font-bold leading-snug text-ink">{t.t}</span>
                          <span className="text-[14.5px] text-ink">{t.place}</span>
                          <span className="text-[13.5px] text-ink-2">{t.due}{t.req && ` · заявка №${t.req.id}`}</span>
                        </button>
                        <Big onClick={() => patch(t.id, { state: 'progress' })}>Взять</Big>
                      </Block>
                    ) : (
                      <motion.button
                        key={t.id}
                        variants={rise}
                        onClick={() => open(t.id)}
                        className="flex w-full items-center gap-3 rounded-[22px] bg-surface p-4 text-left"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="text-[16px] font-semibold leading-snug text-ink">{t.t}</span>
                          <span className="text-[14px] text-ink-2">{t.place}{t.req && ` · заявка №${t.req.id}`}</span>
                          <Meta t={t} />
                        </span>
                        <ChevronRight size={20} strokeWidth={2.2} className="shrink-0 text-ink-3" />
                      </motion.button>
                    )))}
                  </Group>
                )
              })}

              <Group>
                <button onClick={() => setShowLater((s) => !s)} aria-expanded={showLater} className="flex h-12 items-center gap-2 rounded-[18px] bg-surface px-4 text-[14.5px] font-semibold text-ink">
                  Далее на неделе <span className="nums text-ink-3">{later.length}</span>
                  <ChevronDown size={18} strokeWidth={2.2} className={cn('ml-auto text-ink-2 transition-transform', showLater && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {showLater && later.map((t) => (
                    <motion.button
                      key={t.id}
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      onClick={() => open(t.id)}
                      className="flex w-full items-center justify-between gap-3 overflow-hidden rounded-[18px] bg-surface px-4 py-3 text-left"
                    >
                      <span className="text-[15px] font-medium text-ink">{t.t}</span>
                      <span className="shrink-0 text-[13px] text-ink-2">{t.due}</span>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </Group>
            </Scroll>
          </>
        )}

        {view.name === 'task' && current && (
          <>
            <BackBar label="Задачи" onBack={() => setView({ name: 'list' })} />
            <Scroll>
              <Group>
                <h1 className="px-1 font-display text-[25px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{current.t}</h1>
                <p className="px-1 text-[16px] text-ink">{current.place}</p>
                <div className="px-1"><Meta t={current} /></div>
              </Group>
              <Block className="flex flex-col gap-2.5 text-[14.5px]">
                {current.req && <p className="flex justify-between gap-3"><span className="text-ink-2">Заявка</span><span className="text-right font-medium text-ink">№{current.req.id}, {current.req.title}</span></p>}
                <p className="flex justify-between gap-3"><span className="text-ink-2">Срок</span><span className="font-medium text-ink">{current.due}</span></p>
                <p className="flex justify-between gap-3">
                  <span className="text-ink-2">Приоритет</span>
                  <span className={cn('font-medium', current.prio === 'norm' ? 'text-ink' : current.prio === 'high' ? 'text-warning' : 'text-danger')}>
                    {{ crit: 'критичный', high: 'высокий', norm: 'обычный' }[current.prio]}
                  </span>
                </p>
              </Block>
              <Block>
                <p className="text-[13px] font-semibold text-ink-2">Что сделать</p>
                <p className="mt-1.5 text-[15.5px] leading-relaxed text-ink">{current.desc}</p>
              </Block>
              {current.residentPhotos > 0 && (
                <Block>
                  <p className="text-[13px] font-semibold text-ink-2">Фото от жильца: возьмите нужный инструмент сразу</p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {Array.from({ length: current.residentPhotos }).map((_, i) => (
                      <div key={i} className="grid aspect-[4/3] place-items-center rounded-[14px] bg-surface-3 text-ink-3"><ImageIcon size={22} strokeWidth={1.8} /></div>
                    ))}
                  </div>
                </Block>
              )}
              <Group>
                {current.state === 'review' ? (
                  <Block className="flex items-start gap-3 bg-brand-50 text-[14.5px] text-brand-700">
                    <Hourglass size={18} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                    На проверке у председателя. После подтверждения жильцы увидят фото.
                  </Block>
                ) : current.state === 'progress'
                  ? <Big onClick={() => startComplete(current.id)}><Check size={18} strokeWidth={2.6} /> Завершить</Big>
                  : <Big onClick={() => patch(current.id, { state: 'progress' })}>Начать работу</Big>}
              </Group>
            </Scroll>
          </>
        )}

        {view.name === 'complete' && current && (
          <>
            <BackBar label="Отмена" onBack={() => setView({ name: 'task', id: current.id })} />
            <Scroll>
              <Group>
                <h1 className="px-1 font-display text-[25px] font-extrabold leading-tight tracking-[-0.03em] text-ink">Завершить задачу</h1>
                <p className="px-1 text-[15px] text-ink-2">{current.t}</p>
              </Group>

              <Block className="flex flex-col gap-3">
                <p className={cn('text-[14px] font-semibold', current.photo && photos === 0 ? 'text-warning' : 'text-ink')}>
                  {current.photo ? 'Фото обязательно' : 'Фото по желанию'}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: photos }).map((_, i) => (
                    <motion.div key={i} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative grid aspect-square place-items-center rounded-[14px] bg-surface-3 text-ink-3">
                      <ImageIcon size={22} strokeWidth={1.8} />
                      <button onClick={() => setPhotos((p) => p - 1)} aria-label={`Удалить фото ${i + 1}`} className="absolute -right-1.5 -top-1.5 grid size-8 place-items-center rounded-full bg-ink text-white">
                        <X size={14} strokeWidth={2.6} />
                      </button>
                    </motion.div>
                  ))}
                  {photos < MAX_PHOTOS && (
                    <button onClick={() => setPhotos((p) => p + 1)} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[14px] bg-brand-50 text-brand-700">
                      <Camera size={24} strokeWidth={2} />
                      <span className="text-[13px] font-semibold">Снять</span>
                    </button>
                  )}
                </div>
              </Block>

              <Block className="flex flex-col gap-3">
                <p className="text-[14px] font-semibold text-ink">Комментарий</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK.map((q) => {
                    const on = quick.includes(q)
                    return (
                      <button
                        key={q}
                        aria-pressed={on}
                        onClick={() => setQuick((l) => (on ? l.filter((x) => x !== q) : [...l, q]))}
                        className={cn('inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition-colors', on ? 'bg-brand-600 text-white' : 'bg-surface-2 text-ink')}
                      >
                        {on && <Check size={14} strokeWidth={2.8} />} {q}
                      </button>
                    )
                  })}
                </div>
                <Field label="Или своими словами">
                  <TextArea rows={2} value={comment} onChange={setComment} placeholder="Необязательно" />
                </Field>
              </Block>

              {/* Предупреждение до отправки: работник снимает для жильцов, а не для отчёта */}
              {photos > 0 && (
                <Block className="flex items-start gap-3 bg-warning-soft text-[14px] leading-snug text-ink">
                  <Eye size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-warning" />
                  Фото увидят жильцы после подтверждения председателем. Снимайте так, чтобы был виден результат.
                </Block>
              )}

              <Group>
                <Big disabled={current.photo && photos === 0} onClick={() => submit(current)}>
                  {online ? 'Отправить' : 'Сохранить и отправить позже'}
                </Big>
                {current.photo && photos === 0 && <p className="text-center text-[13.5px] text-ink-2">Сделайте хотя бы одно фото результата</p>}
                {!online && <p className="flex items-center justify-center gap-1.5 text-center text-[13.5px] text-ink-2"><WifiOff size={14} strokeWidth={2.2} /> Нет сети: отметка уйдёт сама, когда появится связь</p>}
              </Group>
            </Scroll>
          </>
        )}

        {view.name === 'sent' && current && (
          <Scroll>
            <Block className="mt-16 flex flex-col items-center gap-3 py-10 text-center">
              <span className={cn('grid size-16 place-items-center rounded-full text-white', online ? 'bg-brand-600' : 'bg-ink')}>
                {online ? <Check size={30} strokeWidth={2.6} /> : <CloudUpload size={28} strokeWidth={2.2} />}
              </span>
              <p className="font-display text-[21px] font-bold text-ink">{online ? 'Отправлено на проверку' : 'Сохранено на телефоне'}</p>
              <p className="max-w-[260px] text-[15px] leading-relaxed text-ink-2">
                {online
                  ? 'Председатель подтвердит выполнение. После этого жильцы увидят результат.'
                  : `Нет сети. Отметка и ${queued} фото отправятся сами, когда появится связь.`}
              </p>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-50 px-3 text-[13px] font-semibold text-brand-700">
                <Hourglass size={13} strokeWidth={2.4} /> Статус: на проверке
              </span>
            </Block>
            <Group><Big onClick={() => setView({ name: 'list' })}>К задачам</Big></Group>
          </Scroll>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
