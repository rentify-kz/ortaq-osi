import { useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Pin, Send, Check, ImagePlus, X } from 'lucide-react'
import { Scroll, Group, Btn } from '../../components/Bits'
import { Sheet } from '../../components/Sheet'
import { Field, Input, TextArea, Toggle } from '../../components/web/ui'
import { announcements as initial, type Announcement } from '../../data/chairman'
import { MHead } from './parts'
import { cn, ease } from '../../lib/cn'

/** Ниже этой доли прочтений стоит напомнить */
const LOW_READ = 0.5
const ENTRANCES = [1, 2, 3, 4]
const PER_ENTRANCE = 32
const STAFF = 4

const rise = { hide: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }

function Item({ a }: { a: Announcement }) {
  const [reminded, setReminded] = useState(false)
  const share = a.total ? a.read / a.total : 0
  const low = share < LOW_READ && !a.fresh
  return (
    <motion.article variants={rise} layout className="flex flex-col gap-2.5 rounded-[22px] bg-surface p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {a.pinned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[12px] font-semibold text-white">
            <Pin size={11} strokeWidth={2.6} /> закреплено
          </span>
        )}
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-ink-2">{a.audience}</span>
        <span className="ml-auto text-[12.5px] text-ink-2">{a.when}</span>
      </div>
      <p className="font-display text-[16.5px] font-bold leading-snug text-ink">{a.title}</p>
      <div>
        <div className="flex items-baseline justify-between text-[13.5px]">
          <span className="text-ink-2">Прочитали {a.read} из {a.total}</span>
          <span className={cn('nums font-semibold', low ? 'text-warning' : 'text-ink')}>{Math.round(share * 100)}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${share * 100}%` }}
            transition={{ duration: 0.8, delay: 0.35, ease }}
            className={cn('h-full rounded-full', low ? 'bg-warning' : 'bg-brand-500')}
          />
        </div>
        {a.fresh && <p className="mt-1.5 text-[12.5px] text-ink-2">Статистика появится, когда жильцы откроют</p>}
      </div>
      {low && (
        <Btn full variant={reminded ? 'soft' : 'solid'} disabled={reminded} onClick={() => setReminded(true)}>
          {reminded ? <><Check size={15} strokeWidth={2.6} /> Напомнили</> : <><Send size={14} strokeWidth={2.2} /> Напомнить непрочитавшим</>}
        </Btn>
      )}
    </motion.article>
  )
}

type Audience = 'all' | 'staff' | 'entrances'

export function MNews() {
  const [list, setList] = useState(initial)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [aud, setAud] = useState<Audience>('all')
  const [picked, setPicked] = useState<number[]>([])
  const [photo, setPhoto] = useState(false)
  const [pin, setPin] = useState(false)
  const [push, setPush] = useState(true)

  const ready = title.trim() && text.trim() && (aud !== 'entrances' || picked.length > 0)
  const sorted = [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))

  const publish = () => {
    const order = [...picked].sort((a, b) => a - b)
    const audience = aud === 'all' ? 'Всем жильцам' : aud === 'staff' ? 'Только персоналу'
      : order.length === 1 ? `${order[0]} подъезд` : `Подъезды ${order.join(', ')}`
    const total = aud === 'all' ? ENTRANCES.length * PER_ENTRANCE : aud === 'staff' ? STAFF : order.length * PER_ENTRANCE
    setList((l) => [{ id: Date.now(), title: title.trim(), text: text.trim(), audience, when: 'только что', read: 0, total, pinned: pin, fresh: true }, ...l])
    setTitle(''); setText(''); setPicked([]); setPhoto(false); setPin(false); setAud('all')
    setOpen(false)
  }

  const chip = (on: boolean) => cn('h-11 rounded-full px-4 text-[14px] font-semibold transition-colors', on ? 'bg-brand-600 text-white' : 'bg-surface-2 text-ink')

  return (
    <>
      <MHead
        title="Объявления"
        right={
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => setOpen(true)}
            aria-label="Новое объявление"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white"
          >
            <Plus size={20} strokeWidth={2.4} />
          </motion.button>
        }
      />
      <Scroll>
        <Group>
          {sorted.map((a) => <Item key={a.id} a={a} />)}
        </Group>
      </Scroll>

      <Sheet open={open} onClose={() => setOpen(false)} title="Новое объявление">
        <Field label="Заголовок">
          <Input value={title} onChange={setTitle} placeholder="Например, отключение воды" />
        </Field>
        <Field label="Текст">
          <TextArea rows={3} value={text} onChange={setText} placeholder="Что, когда и что делать жильцам" />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-[13.5px] font-semibold text-ink">Кому</span>
          <div className="flex flex-wrap gap-1.5">
            <button aria-pressed={aud === 'all'} onClick={() => setAud('all')} className={chip(aud === 'all')}>Всем</button>
            <button aria-pressed={aud === 'staff'} onClick={() => setAud('staff')} className={chip(aud === 'staff')}>Персоналу</button>
            <button aria-pressed={aud === 'entrances'} onClick={() => setAud('entrances')} className={chip(aud === 'entrances')}>Подъездам</button>
          </div>
          {aud === 'entrances' && (
            <div className="flex gap-1.5">
              {ENTRANCES.map((n) => {
                const on = picked.includes(n)
                return (
                  <button
                    key={n}
                    aria-pressed={on}
                    aria-label={`${n} подъезд`}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== n) : [...p, n]))}
                    className={cn('nums grid size-11 place-items-center rounded-full text-[15px] font-semibold transition-colors', on ? 'bg-brand-600 text-white' : 'bg-surface-2 text-ink')}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {photo ? (
          <div className="flex items-center gap-3 rounded-[16px] bg-surface-2 py-2 pl-2 pr-2">
            <span className="grid size-12 place-items-center rounded-[12px] bg-surface-3 text-ink-3"><ImagePlus size={18} strokeWidth={1.8} /></span>
            <span className="flex-1 text-[14px] text-ink">Фото с камеры</span>
            <button aria-label="Убрать фото" onClick={() => setPhoto(false)} className="grid size-11 place-items-center rounded-full text-ink-2"><X size={16} strokeWidth={2.4} /></button>
          </div>
        ) : (
          <button onClick={() => setPhoto(true)} className="flex h-12 items-center justify-center gap-2 rounded-[15px] bg-surface-2 text-[14px] font-semibold text-ink">
            <ImagePlus size={17} strokeWidth={2} /> Добавить фото
          </button>
        )}

        <div className="flex flex-col">
          <Toggle on={push} onChange={setPush} label="Push-уведомление" />
          <Toggle on={pin} onChange={setPin} label="Закрепить сверху" />
        </div>

        <Btn full disabled={!ready} onClick={publish}><Send size={15} strokeWidth={2.2} /> Опубликовать</Btn>
        {!ready && <p className="-mt-2 text-center text-[13px] text-ink-2">Заполните заголовок и текст</p>}
      </Sheet>
    </>
  )
}
