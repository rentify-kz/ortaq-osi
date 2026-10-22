import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Plus, ChevronRight, Check, Building2, Trees, Car, House, BrickWall, Warehouse, Droplets, Zap, Flame,
  ArrowUpDown, SprayCan, Trash2, ShieldAlert, CircleHelp, Camera, Image as ImageIcon, X, Sparkles,
  Star, MessageSquarePlus, Bell, type LucideIcon,
} from 'lucide-react'
import { Scroll, Block, Group, Label, Btn, Stepper } from '../../components/Bits'
import { Sheet } from '../../components/Sheet'
import { Field, TextArea } from '../../components/web/ui'
import { useResident, RHead, BackBar } from './state'
import { me, openElsewhere, type RRequest } from '../../data/resident'
import { cn, ease } from '../../lib/cn'

const rise = { hide: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }

/* ───────────── справочники ───────────── */

type Place = 'entrance' | 'yard' | 'parking' | 'flat' | 'facade' | 'basement'
const places: { v: Place; label: string; icon: LucideIcon }[] = [
  { v: 'entrance', label: 'В подъезде', icon: Building2 },
  { v: 'yard', label: 'Во дворе', icon: Trees },
  { v: 'parking', label: 'Паркинг', icon: Car },
  { v: 'flat', label: 'В квартире', icon: House },
  { v: 'facade', label: 'Фасад, кровля', icon: BrickWall },
  { v: 'basement', label: 'Подвал', icon: Warehouse },
]
const ZONES = ['Детская площадка', 'Парковка во дворе', 'Газон', 'Мусорные баки']
const ENTRANCES = [1, 2, 3, 4]
const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8]

type Cat = 'plumbing' | 'electric' | 'heating' | 'lift' | 'cleaning' | 'trash' | 'security' | 'other'
const cats: { v: Cat; label: string; icon: LucideIcon }[] = [
  { v: 'plumbing', label: 'Сантехника', icon: Droplets },
  { v: 'electric', label: 'Электрика', icon: Zap },
  { v: 'heating', label: 'Отопление', icon: Flame },
  { v: 'lift', label: 'Лифт', icon: ArrowUpDown },
  { v: 'cleaning', label: 'Уборка', icon: SprayCan },
  { v: 'trash', label: 'Мусор', icon: Trash2 },
  { v: 'security', label: 'Безопасность', icon: ShieldAlert },
  { v: 'other', label: 'Другое', icon: CircleHelp },
]

const MAX_PHOTOS = 5
const CHECK_MS = 1200
const NEW_ID = 53

const statusChip: Record<RRequest['status'], { label: string; cls: string }> = {
  checking: { label: 'Проверяется', cls: 'bg-surface-2 text-ink-2' },
  progress: { label: 'В работе', cls: 'bg-brand-600 text-white' },
  done: { label: 'Выполнена', cls: 'bg-brand-50 text-brand-700' },
}

function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={cn('nums inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-4 text-[15px] font-semibold transition-colors', on ? 'bg-brand-600 text-white' : 'bg-surface-2 text-ink')}
    >
      {children}
    </button>
  )
}

/* ───────────── новая заявка ───────────── */

function NewRequest() {
  const { setView, addRequest, subscribe } = useResident()
  const [step, setStep] = useState(0)
  const [place, setPlace] = useState<Place | null>(null)
  const [entrance, setEntrance] = useState<number>(me.entrance)
  const [floor, setFloor] = useState<number | null>(null)
  const [zone, setZone] = useState<string | null>(null)
  const [side, setSide] = useState<'двора' | 'улицы'>('двора')
  const [cat, setCat] = useState<Cat | null>(null)
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState(0)
  const [stage, setStage] = useState<'form' | 'checking' | 'dup' | 'done' | 'subscribed'>('form')

  const where = (() => {
    switch (place) {
      case 'entrance': return `${entrance} подъезд, ${floor} этаж`
      case 'yard': return `Двор, ${zone?.toLowerCase()}`
      case 'parking': return 'Паркинг'
      case 'flat': return `кв. ${me.flat}`
      case 'facade': return `Фасад, ${entrance} подъезд, со стороны ${side}`
      case 'basement': return `Подвал, ${entrance} подъезд`
      default: return ''
    }
  })()

  // ИИ не отклоняет заявки сам, только подсказывает похожую
  const dup = place === 'entrance' && entrance === 3 && floor === 5 && cat === 'electric' ? openElsewhere[0]
    : place === 'yard' && zone === 'Детская площадка' && cat === 'trash' ? openElsewhere[1]
    : null

  const create = () => {
    const title = text.trim().length > 42 ? `${text.trim().slice(0, 40)}…` : text.trim()
    addRequest({
      id: NEW_ID, title, place: where, status: 'checking', workerPhotos: 0,
      stages: [{ title: 'Проверка председателем', state: 'now' }, { title: 'Исполнение', state: 'next' }, { title: 'Приёмка', state: 'next' }],
      history: [{ when: 'сейчас', text: 'Заявка принята, проверяется', photos: photos || undefined }],
    })
    setStage('done')
  }

  const submit = () => {
    setStage('checking')
    window.setTimeout(() => (dup ? setStage('dup') : create()), CHECK_MS)
  }

  const refined = place === 'entrance' ? floor !== null : place === 'yard' ? zone !== null : place !== null
  const canNext = [place !== null, refined, cat !== null, text.trim().length >= 3][step]
  const toList = () => setView('req', { name: 'list' })

  if (stage === 'checking') {
    return (
      <Scroll>
        <Block className="mt-24 flex flex-col items-center gap-3 py-10 text-center" >
          <motion.span animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.2, repeat: Infinity }} className="grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600">
            <Sparkles size={24} strokeWidth={2} />
          </motion.span>
          <p className="font-display text-[18px] font-bold text-ink">Проверяю, не сообщали ли об этом</p>
        </Block>
      </Scroll>
    )
  }

  if (stage === 'dup' && dup) {
    return (
      <>
        <BackBar label="Заявки" onBack={toList} />
        <Scroll>
          <Group>
            <h1 className="px-1 font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-ink">Похоже, об этом уже сообщили</h1>
            <p className="px-1 text-[15px] leading-relaxed text-ink-2">Подпишитесь, и вы будете получать уведомления о ходе работ. Так председатель увидит, что проблема касается многих.</p>
          </Group>
          <Block className="flex flex-col gap-1">
            <p className="nums text-[13px] font-semibold text-ink-2">Заявка №{dup.id}</p>
            <p className="text-[16px] font-semibold text-ink">{dup.title}</p>
            <p className="text-[14px] text-ink-2">{dup.place}</p>
          </Block>
          <Group>
            <Btn full className="!h-14 !text-[16px]" onClick={() => { subscribe(dup.id); setStage('subscribed') }}><Bell size={17} strokeWidth={2.2} /> Подписаться на №{dup.id}</Btn>
            <Btn full variant="soft" className="!h-12" onClick={create}>Это другая проблема, отправить</Btn>
          </Group>
        </Scroll>
      </>
    )
  }

  if (stage === 'done' || stage === 'subscribed') {
    return (
      <Scroll>
        <Block className="mt-16 flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-brand-600 text-white"><Check size={30} strokeWidth={2.6} /></span>
          <p className="font-display text-[21px] font-bold text-ink">{stage === 'done' ? `Заявка №${NEW_ID} принята` : `Вы подписаны на №${dup?.id}`}</p>
          <p className="max-w-[260px] text-[15px] leading-relaxed text-ink-2">
            {stage === 'done' ? 'Председатель уже видит её. Ход работ появится в заявках.' : 'Сообщим, когда назначат исполнителя и когда работу примут.'}
          </p>
        </Block>
        <Group>
          {stage === 'done' && <Btn full className="!h-14 !text-[16px]" onClick={() => setView('req', { name: 'track', id: NEW_ID })}>Открыть заявку</Btn>}
          <Btn full variant="soft" className="!h-12" onClick={toList}>К заявкам</Btn>
        </Group>
      </Scroll>
    )
  }

  return (
    <>
      <BackBar label={step === 0 ? 'Заявки' : 'Назад'} onBack={() => (step === 0 ? toList() : setStep((s) => s - 1))} />
      <div className="flex shrink-0 gap-1.5 px-5 pb-3">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-[5px] flex-1 rounded-full transition-colors duration-300', i < step ? 'bg-brand-600' : i === step ? 'bg-brand-300' : 'bg-surface-3')} />
        ))}
      </div>
      <Scroll>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease }}
            className="flex flex-col gap-3"
          >
            {step === 0 && (
              <>
                <h1 className="px-1 font-display text-[24px] font-extrabold tracking-[-0.03em] text-ink">Где проблема?</h1>
                <div className="grid grid-cols-2 gap-2">
                  {places.map((p) => {
                    const on = place === p.v
                    return (
                      <button
                        key={p.v}
                        aria-pressed={on}
                        onClick={() => { setPlace(p.v); setStep(1) }}
                        className={cn('flex min-h-[104px] flex-col items-start justify-between gap-3 rounded-[20px] p-4 text-left transition-colors', on ? 'bg-brand-600 text-white' : 'bg-surface text-ink')}
                      >
                        <p.icon size={26} strokeWidth={1.9} className={on ? 'text-white' : 'text-brand-600'} />
                        <span className="text-[15.5px] font-semibold leading-tight">{p.label}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h1 className="px-1 font-display text-[24px] font-extrabold tracking-[-0.03em] text-ink">Уточните место</h1>
                {(place === 'entrance' || place === 'facade' || place === 'basement') && (
                  <Block className="flex flex-col gap-2.5">
                    <p className="text-[14px] font-semibold text-ink">Подъезд</p>
                    <div className="flex flex-wrap gap-2">{ENTRANCES.map((n) => <Chip key={n} on={entrance === n} onClick={() => setEntrance(n)} label={`${n} подъезд`}>{n}</Chip>)}</div>
                  </Block>
                )}
                {place === 'entrance' && (
                  <Block className="flex flex-col gap-2.5">
                    <p className="text-[14px] font-semibold text-ink">Этаж</p>
                    <div className="flex flex-wrap gap-2">{FLOORS.map((n) => <Chip key={n} on={floor === n} onClick={() => setFloor(n)} label={`${n} этаж`}>{n}</Chip>)}</div>
                  </Block>
                )}
                {place === 'facade' && (
                  <Block className="flex flex-col gap-2.5">
                    <p className="text-[14px] font-semibold text-ink">С какой стороны</p>
                    <div className="flex flex-wrap gap-2">{(['двора', 'улицы'] as const).map((s) => <Chip key={s} on={side === s} onClick={() => setSide(s)}>Со стороны {s}</Chip>)}</div>
                  </Block>
                )}
                {place === 'yard' && (
                  <Block className="flex flex-col gap-2">
                    {ZONES.map((z) => <Chip key={z} on={zone === z} onClick={() => setZone(z)}>{z}</Chip>)}
                  </Block>
                )}
                {place === 'flat' && (
                  <Block className="text-[15px] leading-relaxed text-ink">
                    Заявка о вашей квартире <span className="font-semibold">№{me.flat}</span>. Её увидят только вы, председатель и назначенный мастер.
                  </Block>
                )}
                {place === 'parking' && <Block className="text-[15px] text-ink">Подземный паркинг дома</Block>}
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="px-1 font-display text-[24px] font-extrabold tracking-[-0.03em] text-ink">Что случилось?</h1>
                <div className="grid grid-cols-2 gap-2">
                  {cats.map((c) => {
                    const on = cat === c.v
                    return (
                      <button
                        key={c.v}
                        aria-pressed={on}
                        onClick={() => { setCat(c.v); setStep(3) }}
                        className={cn('flex min-h-14 items-center gap-3 rounded-[18px] px-4 text-left text-[15px] font-semibold transition-colors', on ? 'bg-brand-600 text-white' : 'bg-surface text-ink')}
                      >
                        <c.icon size={20} strokeWidth={2} className={on ? 'text-white' : 'text-brand-600'} /> {c.label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="px-1 font-display text-[24px] font-extrabold tracking-[-0.03em] text-ink">Опишите проблему</h1>
                <p className="px-1 text-[14px] text-ink-2">{where}</p>
                <Block className="flex flex-col gap-4">
                  <Field label="Что случилось">
                    <TextArea rows={3} value={text} onChange={setText} placeholder="Например, не горит лампа на площадке" />
                  </Field>
                  <div className="flex flex-col gap-2">
                    <p className="text-[13.5px] font-semibold text-ink">Фото, до {MAX_PHOTOS}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: photos }).map((_, i) => (
                        <div key={i} className="relative grid aspect-square place-items-center rounded-[14px] bg-surface-3 text-ink-3">
                          <ImageIcon size={20} strokeWidth={1.8} />
                          <button onClick={() => setPhotos((p) => p - 1)} aria-label={`Удалить фото ${i + 1}`} className="absolute -right-1.5 -top-1.5 grid size-8 place-items-center rounded-full bg-ink text-white"><X size={14} strokeWidth={2.6} /></button>
                        </div>
                      ))}
                      {photos < MAX_PHOTOS && (
                        <button onClick={() => setPhotos((p) => p + 1)} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[14px] bg-brand-50 text-brand-700">
                          <Camera size={22} strokeWidth={2} /><span className="text-[13px] font-semibold">Добавить</span>
                        </button>
                      )}
                    </div>
                    {photos === 0 && <p className="text-[13px] text-ink-2">Фото ускоряет решение: мастер сразу возьмёт нужный инструмент</p>}
                  </div>
                </Block>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {step >= 1 && (
          <Group>
            {step < 3
              ? <Btn full disabled={!canNext} className="!h-14 !text-[16px]" onClick={() => setStep((s) => s + 1)}>Дальше</Btn>
              : <Btn full disabled={!canNext} className="!h-14 !text-[16px]" onClick={submit}>Отправить заявку</Btn>}
          </Group>
        )}
      </Scroll>
    </>
  )
}

/* ───────────── отслеживание ───────────── */

function Track({ id }: { id: number }) {
  const { requests, setView, patchRequest } = useResident()
  const r = requests.find((x) => x.id === id)
  const [sheet, setSheet] = useState(false)
  const [note, setNote] = useState('')
  if (!r) return null

  const done = r.stages.filter((s) => s.state === 'done').length
  const now = r.stages.find((s) => s.state === 'now')
  const chip = statusChip[r.status]

  return (
    <>
      <BackBar label="Заявки" onBack={() => setView('req', { name: 'list' })} />
      <Scroll>
        <Group>
          <div className="flex items-center gap-2 px-1">
            <span className="nums text-[14px] font-semibold text-ink-2">№{r.id}</span>
            <span className={cn('inline-flex h-7 items-center rounded-full px-2.5 text-[12.5px] font-semibold', chip.cls)}>{chip.label}</span>
          </div>
          <h1 className="px-1 font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{r.title}</h1>
          <p className="px-1 text-[15px] text-ink-2">{r.place}</p>
        </Group>

        <Block className="flex flex-col gap-3">
          <Stepper total={r.stages.length} done={done} />
          <p className="text-[14.5px] text-ink">{now ? <>Сейчас: <span className="font-semibold text-brand-700">{now.title}</span></> : 'Все этапы выполнены'}</p>
          <ol className="flex flex-col gap-1.5">
            {r.stages.map((s) => (
              <li key={s.title} className="flex items-center gap-3 text-[14.5px]">
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', s.state === 'done' ? 'bg-brand-600 text-white' : s.state === 'now' ? 'bg-brand-200' : 'bg-surface-3')}>
                  {s.state === 'done' && <Check size={13} strokeWidth={3} />}
                </span>
                <span className={s.state === 'next' ? 'text-ink-2' : 'text-ink'}>{s.title}</span>
              </li>
            ))}
          </ol>
          {r.executor && <p className="text-[14px] text-ink-2">Исполнитель: <span className="font-semibold text-ink">{r.executor}</span></p>}
        </Block>

        {r.workerPhotos > 0 && (
          <Block>
            <p className="text-[13.5px] font-semibold text-ink-2">Фото работ, принятых председателем</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {Array.from({ length: r.workerPhotos }).map((_, i) => (
                <div key={i} className="grid aspect-[4/3] place-items-center rounded-[14px] bg-surface-3 text-ink-3"><ImageIcon size={22} strokeWidth={1.8} /></div>
              ))}
            </div>
          </Block>
        )}

        <Group>
          <Label>История</Label>
          <Block className="flex flex-col gap-3">
            {r.history.map((h, i) => (
              <div key={i} className="flex gap-3 text-[14px]">
                <span className="nums w-14 shrink-0 text-ink-2">{h.when}</span>
                <span className="text-ink">
                  {h.text}
                  {h.photos && <span className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-2"><Camera size={13} strokeWidth={2.2} /> {h.photos} фото</span>}
                </span>
              </div>
            ))}
          </Block>
        </Group>

        {r.status === 'done' ? (
          <Block className="flex flex-col items-center gap-3 text-center">
            <p className="text-[15px] font-semibold text-ink">{r.rated ? 'Спасибо за оценку' : 'Оцените, как решили проблему'}</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} aria-label={`Оценка ${n}`} onClick={() => patchRequest(r.id, { rated: n })} className="grid size-11 place-items-center">
                  <Star size={28} strokeWidth={1.8} className={n <= (r.rated ?? 0) ? 'fill-warning text-warning' : 'text-ink-3'} />
                </button>
              ))}
            </div>
          </Block>
        ) : (
          <Group>
            <Btn full variant="ghost" className="!h-12 !bg-surface" onClick={() => setSheet(true)}><MessageSquarePlus size={17} strokeWidth={2.2} /> Добавить комментарий или фото</Btn>
          </Group>
        )}
      </Scroll>

      <Sheet open={sheet} onClose={() => setSheet(false)} title={`Комментарий к №${r.id}`}>
        <Field label="Что добавить">
          <TextArea rows={3} value={note} onChange={setNote} placeholder="Например, утром течёт сильнее" />
        </Field>
        <Btn
          full
          disabled={!note.trim()}
          className="!h-12"
          onClick={() => {
            patchRequest(r.id, { history: [...r.history, { when: 'сейчас', text: `Вы: ${note.trim()}` }] })
            setNote(''); setSheet(false)
          }}
        >
          Отправить
        </Btn>
      </Sheet>
    </>
  )
}

/* ───────────── список ───────────── */

export function RRequests() {
  const { views, setView, requests, subscribed } = useResident()
  const v = views.req
  if (v.name === 'new') return <NewRequest key="new" />
  if (v.name === 'track') return <Track id={v.id} />

  const active = requests.filter((r) => r.status !== 'done')
  const closed = requests.filter((r) => r.status === 'done')
  const subs = openElsewhere.filter((o) => subscribed.includes(o.id))

  const item = (r: RRequest) => {
    const chip = statusChip[r.status]
    return (
      <motion.button key={r.id} variants={rise} onClick={() => setView('req', { name: 'track', id: r.id })} className="flex w-full items-center gap-3 rounded-[22px] bg-surface p-4 text-left">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <span className="nums text-[13px] font-semibold text-ink-2">№{r.id}</span>
            <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold', chip.cls)}>{chip.label}</span>
          </span>
          <span className="text-[16px] font-semibold leading-snug text-ink">{r.title}</span>
          <span className="text-[13.5px] text-ink-2">{r.place}</span>
        </span>
        <ChevronRight size={20} strokeWidth={2.2} className="shrink-0 text-ink-3" />
      </motion.button>
    )
  }

  return (
    <>
      <RHead
        title="Заявки"
        right={
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => setView('req', { name: 'new' })} aria-label="Новая заявка" className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
            <Plus size={20} strokeWidth={2.4} />
          </motion.button>
        }
      />
      <Scroll>
        {active.length > 0 && <Group><Label>Активные</Label>{active.map(item)}</Group>}
        {subs.length > 0 && (
          <Group>
            <Label>Вы подписаны</Label>
            {subs.map((s) => (
              <motion.div key={s.id} variants={rise} className="flex items-center gap-3 rounded-[22px] bg-surface p-4">
                <Bell size={18} strokeWidth={2.2} className="shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">№{s.id} {s.title}</span>
                  <span className="block text-[13.5px] text-ink-2">{s.place}</span>
                </span>
              </motion.div>
            ))}
          </Group>
        )}
        {closed.length > 0 && <Group><Label>Завершённые</Label>{closed.map(item)}</Group>}
      </Scroll>
    </>
  )
}
