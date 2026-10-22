import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Pin, Send, Check, Megaphone, CircleAlert } from 'lucide-react'
import { Card, CardHead } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, Tag, Toggle, Field, Input, TextArea, GroupLabel } from '../../components/web/ui'
import { announcements as initial, type Announcement } from '../../data/chairman'
import { cn, ease } from '../../lib/cn'

/** Ниже этой доли прочтений объявление стоит продублировать */
const LOW_READ = 0.5
const ENTRANCES = [1, 2, 3, 4]
const PER_ENTRANCE = 32
const STAFF = 4

/* ───────────── карточка объявления ───────────── */

function Item({ a }: { a: Announcement }) {
  const [reminded, setReminded] = useState(false)
  const share = a.total ? a.read / a.total : 0
  const low = share < LOW_READ && !a.fresh
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      className="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        {a.pinned && <Tag tone="solid" icon={Pin}>Закреплено</Tag>}
        <Tag tone="mute">{a.audience}</Tag>
        <span className="ml-auto text-[13px] text-ink-2">{a.when}</span>
      </div>
      <div>
        <h3 className="font-display text-[17px] font-bold leading-snug text-ink">{a.title}</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{a.text}</p>
      </div>

      <div className="rounded-[14px] bg-surface p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13.5px] font-medium text-ink">Прочитали {a.read} из {a.total}</span>
          <span className={cn('nums font-display text-[16px] font-extrabold', low ? 'text-warning' : 'text-ink')}>{Math.round(share * 100)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${share * 100}%` }}
            transition={{ duration: 0.8, delay: 0.3, ease }}
            className={cn('h-full rounded-full', low ? 'bg-warning' : 'bg-brand-500')}
          />
        </div>
        {a.fresh && <p className="mt-2 text-[12.5px] text-ink-2">Статистика появится, когда жильцы откроют объявление</p>}
        {a.byEntrance && (
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
            {a.byEntrance.map((n, i) => <span key={i} className="nums">{i + 1} подъезд: {n}</span>)}
          </div>
        )}
      </div>

      {/* Низкая доля прочтений: завтра будет сорок звонков, поэтому действие рядом с цифрой */}
      {low && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[13px] text-warning">
            <CircleAlert size={15} strokeWidth={2.2} /> Прочитало меньше половины
          </span>
          <Btn className="!h-10 !rounded-full" disabled={reminded} onClick={() => setReminded(true)}>
            {reminded ? <><Check size={15} strokeWidth={2.6} /> Напомнили</> : <><Send size={14} strokeWidth={2.2} /> Напомнить непрочитавшим</>}
          </Btn>
        </div>
      )}
    </motion.article>
  )
}

/* ───────────── новое объявление ───────────── */

type Audience = 'all' | 'entrances' | 'staff'

function Composer({ onPublish }: { onPublish: (a: Announcement) => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [aud, setAud] = useState<Audience>('all')
  const [picked, setPicked] = useState<number[]>([1])
  const [pin, setPin] = useState(false)
  const [push, setPush] = useState(true)

  const ready = title.trim() && text.trim() && (aud !== 'entrances' || picked.length > 0)
  const options: { v: Audience; label: string }[] = [
    { v: 'all', label: 'Всем жильцам' },
    { v: 'entrances', label: 'Отдельным подъездам' },
    { v: 'staff', label: 'Только персоналу' },
  ]

  const publish = () => {
    const order = [...picked].sort((a, b) => a - b)
    const audience = aud === 'all' ? 'Всем жильцам'
      : aud === 'staff' ? 'Только персоналу'
      : order.length === 1 ? `${order[0]} подъезд` : `Подъезды ${order.join(', ')}`
    const total = aud === 'all' ? ENTRANCES.length * PER_ENTRANCE : aud === 'staff' ? STAFF : picked.length * PER_ENTRANCE
    onPublish({ id: Date.now(), title: title.trim(), text: text.trim(), audience, when: 'только что', read: 0, total, pinned: pin, fresh: true })
    setTitle(''); setText(''); setPin(false)
  }

  return (
    <Card delay={0.15} lift={false} className="flex flex-col gap-4 xl:sticky xl:top-[92px] xl:col-span-5">
      <CardHead title="Новое объявление" icon={<Megaphone size={18} strokeWidth={2} />} />
      <Field label="Заголовок">
        <Input value={title} onChange={setTitle} placeholder="Например, отключение воды 25 сентября" />
      </Field>
      <Field label="Текст">
        <TextArea value={text} onChange={setText} placeholder="Что случится, когда и что делать жильцам" />
      </Field>

      <div className="flex flex-col gap-2">
        <GroupLabel>Кому</GroupLabel>
        <div role="radiogroup" className="flex flex-col gap-1.5">
          {options.map((o) => {
            const on = o.v === aud
            return (
              <button
                key={o.v}
                role="radio"
                aria-checked={on}
                onClick={() => setAud(o.v)}
                className={cn('flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-left text-[14px] font-medium text-ink transition-colors', on ? 'bg-brand-50' : 'bg-surface-2 hover:bg-surface-3')}
              >
                <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', on ? 'bg-brand-600' : 'bg-surface-3')}>
                  {on && <span className="size-2 rounded-full bg-white" />}
                </span>
                {o.label}
              </button>
            )
          })}
        </div>
        <AnimatePresence initial={false}>
          {aud === 'entrances' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease }}
              className="flex gap-1.5 overflow-hidden pl-1 pt-1"
            >
              {ENTRANCES.map((n) => {
                const on = picked.includes(n)
                return (
                  <button
                    key={n}
                    aria-pressed={on}
                    aria-label={`${n} подъезд`}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== n) : [...p, n]))}
                    className={cn('nums grid size-11 place-items-center rounded-full text-[15px] font-semibold transition-colors', on ? 'bg-brand-600 text-white' : 'bg-surface-2 text-ink hover:bg-surface-3')}
                  >
                    {n}
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col">
        <Toggle on={pin} onChange={setPin} label="Закрепить сверху" />
        <Toggle on={push} onChange={setPush} label="Отправить push-уведомление" />
      </div>

      <div className="flex flex-col gap-2">
        <Btn full disabled={!ready} onClick={publish}><Send size={15} strokeWidth={2.2} /> Опубликовать</Btn>
        {!ready && <p className="text-[13px] text-ink-2">Заполните заголовок и текст, чтобы опубликовать</p>}
      </div>
    </Card>
  )
}

/* ───────────── экран ───────────── */

export function Announcements() {
  const [list, setList] = useState(initial)
  const sorted = [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))

  return (
    <>
      <PageHead title="Объявления" sub="Видно, кто прочитал. Если прочитали мало, напомните или продублируйте в чат дома" />
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card delay={0.08} lift={false} className="flex flex-col gap-3 xl:col-span-7">
          <AnimatePresence initial={false}>
            {sorted.map((a) => <Item key={a.id} a={a} />)}
          </AnimatePresence>
        </Card>
        <Composer onPublish={(a) => setList((l) => [a, ...l])} />
      </div>
    </>
  )
}
