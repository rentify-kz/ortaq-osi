import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Mic, Square, Sparkles, Check, MapPin, MessageSquare, ChevronDown } from 'lucide-react'
import { Scroll, Block, Group, Label, Btn } from '../../components/Bits'
import { Segmented, Field, Input, TextArea, Toggle } from '../../components/web/ui'
import { workers } from '../../data/chairman'
import { MHead, WorkerPicker } from './parts'
import { cn, ease, plural } from '../../lib/cn'

/* Сценарий из docs/06 §6.10: председатель идёт по дому и надиктовывает всё, что заметил */
const TRANSCRIPT = 'Так, в третьем подъезде опять лампочка на пятом этаже не горит, надо заменить. Во дворе возле детской площадки мусор не убран второй день. И ещё Сергею скажи, чтобы проверил давление в системе, жильцы со второго подъезда жалуются, что батареи еле тёплые.'
const WORDS = TRANSCRIPT.split(' ')
const WORD_MS = 160
const PARSE_MS = 1100

const DUES = ['Сегодня', 'Завтра', 'На неделе'] as const
const PRIOS = ['Обычный', 'Высокий', 'Срочно'] as const
const next = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length]

type Extracted = {
  id: number; on: boolean; t: string; place: string; role: string; who: string
  due: (typeof DUES)[number]; prio: (typeof PRIOS)[number]; note?: string
}
const extracted: Extracted[] = [
  { id: 1, on: true, t: 'Заменить лампу на 5 этаже', place: '3 подъезд, 5 этаж', role: 'Электрик', who: 'Ерлан Т.', due: 'Сегодня', prio: 'Обычный' },
  { id: 2, on: true, t: 'Убрать мусор у детской площадки', place: 'Двор', role: 'Дворник', who: 'Нурлан Б.', due: 'Сегодня', prio: 'Высокий' },
  { id: 3, on: true, t: 'Проверить давление в системе отопления', place: '2 подъезд', role: 'Сантехник', who: 'Сергей П.', due: 'Сегодня', prio: 'Высокий', note: 'Жалобы на холодные батареи' },
]

type Stage = 'idle' | 'rec' | 'parse' | 'review' | 'sent'

const staffNames = workers.filter((w) => !w.contractor).map((w) => w.name)

/* ───────────── голосом ───────────── */

function Voice({ review }: { review?: boolean }) {
  const [stage, setStage] = useState<Stage>(review ? 'review' : 'idle')
  const [words, setWords] = useState(review ? WORDS.length : 0)
  const [list, setList] = useState(extracted)

  // Расшифровка появляется по словам, пока идёт запись
  useEffect(() => {
    if (stage !== 'rec') return
    const t = setInterval(() => setWords((w) => Math.min(w + 1, WORDS.length)), WORD_MS)
    return () => clearInterval(t)
  }, [stage])

  useEffect(() => {
    if (stage !== 'parse') return
    const t = setTimeout(() => setStage('review'), PARSE_MS)
    return () => clearTimeout(t)
  }, [stage])

  const seconds = Math.round((words * WORD_MS) / 1000 * 2.2)
  const chosen = list.filter((x) => x.on)
  const patch = (id: number, p: Partial<Extracted>) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const restart = () => { setWords(0); setList(extracted); setStage('idle') }

  if (stage === 'review') {
    return (
      <Group>
        <Label><Sparkles size={14} strokeWidth={2.4} className="text-brand-600" /> Найдено {list.length} {plural(list.length, ['задача', 'задачи', 'задач'])}</Label>
        <p className="px-1 text-[13.5px] leading-snug text-ink-2">Проверьте исполнителей и сроки. Лишнее снимите галочкой, без вашего подтверждения ничего не уйдёт.</p>
        {list.map((x) => (
          <motion.div
            key={x.id}
            layout
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: x.on ? 1 : 0.55, y: 0 }}
            transition={{ duration: 0.35, ease }}
            className="flex flex-col gap-2.5 rounded-[22px] bg-surface p-4"
          >
            <button
              role="checkbox"
              aria-checked={x.on}
              onClick={() => patch(x.id, { on: !x.on })}
              className="flex min-h-11 items-start gap-3 text-left"
            >
              <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-[8px] transition-colors', x.on ? 'bg-brand-600 text-white' : 'bg-surface-3')}>
                {x.on && <Check size={15} strokeWidth={3} />}
              </span>
              <span className="text-[15.5px] font-semibold leading-snug text-ink">{x.t}</span>
            </button>
            <p className="flex items-center gap-2 text-[13.5px] text-ink-2"><MapPin size={14} strokeWidth={2.2} /> {x.place}</p>
            <label className="relative flex items-center gap-2 rounded-[14px] bg-surface-2 py-1 pl-3.5 pr-2 text-[14px]">
              <span className="shrink-0 text-ink-2">{x.role}</span>
              <select
                value={x.who}
                onChange={(e) => patch(x.id, { who: e.target.value })}
                aria-label={`Исполнитель: ${x.t}`}
                className="h-10 min-w-0 flex-1 appearance-none bg-transparent pr-7 text-right font-semibold text-ink outline-none"
              >
                {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown size={16} strokeWidth={2.2} className="pointer-events-none absolute right-3 text-ink-2" />
            </label>
            <div className="flex gap-2">
              <button onClick={() => patch(x.id, { due: next(DUES, x.due) })} className="h-10 flex-1 rounded-full bg-surface-2 text-[13.5px] font-semibold text-ink">{x.due}</button>
              <button
                onClick={() => patch(x.id, { prio: next(PRIOS, x.prio) })}
                className={cn('h-10 flex-1 rounded-full text-[13.5px] font-semibold', x.prio === 'Обычный' ? 'bg-surface-2 text-ink' : x.prio === 'Высокий' ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger')}
              >
                {x.prio}
              </button>
            </div>
            {x.note && <p className="flex items-center gap-2 text-[13.5px] text-ink-2"><MessageSquare size={14} strokeWidth={2.2} /> {x.note}</p>}
          </motion.div>
        ))}
        <Btn full disabled={chosen.length === 0} onClick={() => setStage('sent')}>
          Создать {chosen.length} {plural(chosen.length, ['задачу', 'задачи', 'задач'])} и уведомить
        </Btn>
        <button onClick={restart} className="mx-auto h-11 text-[14px] font-medium text-ink-2">Записать заново</button>
      </Group>
    )
  }

  if (stage === 'sent') {
    return (
      <Block className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-brand-600 text-white"><Check size={26} strokeWidth={2.6} /></span>
        <p className="font-display text-[19px] font-bold text-ink">Отправлено {chosen.length} {plural(chosen.length, ['задача', 'задачи', 'задач'])}</p>
        <ul className="flex flex-col gap-1 text-[14px] text-ink-2">
          {chosen.map((x) => <li key={x.id}><span className="font-semibold text-ink">{x.who}</span>: {x.t.toLowerCase()}</li>)}
        </ul>
        <Btn variant="soft" onClick={restart}><Mic size={16} strokeWidth={2.2} /> Надиктовать ещё</Btn>
      </Block>
    )
  }

  const rec = stage === 'rec'
  return (
    <>
      <Block className="flex flex-col items-center gap-4 py-7 text-center">
        <div className="relative grid place-items-center">
          {rec && (
            <motion.span
              aria-hidden
              className="absolute size-28 rounded-full bg-brand-200"
              animate={{ scale: [1, 1.25, 1], opacity: [0.7, 0.2, 0.7] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => (rec ? setStage('parse') : stage === 'idle' && setStage('rec'))}
            aria-label={rec ? 'Остановить запись' : 'Начать запись'}
            className={cn('relative grid size-24 place-items-center rounded-full text-white transition-colors', rec ? 'bg-brand-800' : 'bg-brand-600')}
          >
            {rec ? <Square size={28} strokeWidth={2.4} fill="currentColor" /> : <Mic size={34} strokeWidth={2} />}
          </motion.button>
        </div>
        {stage === 'idle' && (
          <div>
            <p className="font-display text-[18px] font-bold text-ink">Надиктуйте, что заметили</p>
            <p className="mt-1 text-[14px] leading-snug text-ink-2">ИИ разобьёт на задачи и подберёт исполнителей по специальности</p>
          </div>
        )}
        {rec && <p className="nums font-display text-[18px] font-bold text-ink">0:{String(seconds).padStart(2, '0')}</p>}
        {stage === 'parse' && (
          <p className="flex items-center gap-2 text-[15px] font-semibold text-brand-700" aria-live="polite">
            <Sparkles size={16} strokeWidth={2.2} /> Ищу задачи в записи
          </p>
        )}
      </Block>

      <AnimatePresence>
        {words > 0 && (
          <motion.div initial="hide" animate="show" exit={{ opacity: 0 }} variants={{ hide: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
            <Block>
              <p className="text-[13px] font-semibold text-ink-2">Расшифровка</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink">«{WORDS.slice(0, words).join(' ')}{words < WORDS.length ? '…' : '»'}</p>
            </Block>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* ───────────── вручную ───────────── */

function Manual() {
  const [what, setWhat] = useState('')
  const [where, setWhere] = useState('')
  const [who, setWho] = useState('')
  const [due, setDue] = useState<string>(DUES[0])
  const [photo, setPhoto] = useState(true)
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <Block className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-brand-600 text-white"><Check size={26} strokeWidth={2.6} /></span>
        <p className="font-display text-[19px] font-bold text-ink">Поручено: {who}</p>
        <p className="text-[14px] text-ink-2">{what.trim()}. Срок: {due.toLowerCase()}</p>
        <Btn variant="soft" onClick={() => { setWhat(''); setWhere(''); setWho(''); setSent(false) }}>Новое поручение</Btn>
      </Block>
    )
  }

  return (
    <Block className="flex flex-col gap-4">
      <Field label="Что сделать">
        <TextArea rows={3} value={what} onChange={setWhat} placeholder="Например, покрасить скамейку у 2 подъезда" />
      </Field>
      <Field label="Где">
        <Input value={where} onChange={setWhere} placeholder="Подъезд, этаж или двор" />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-[13.5px] font-semibold text-ink">Кому</span>
        <WorkerPicker value={who} onChange={setWho} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13.5px] font-semibold text-ink">Срок</span>
        <Segmented id="due" value={due} onChange={setDue} options={DUES.map((d) => ({ v: d, label: d }))} />
      </div>
      <Toggle on={photo} onChange={setPhoto} label="Нужно фото выполнения" />
      <Btn full disabled={!what.trim() || !who} onClick={() => setSent(true)}>Поручить</Btn>
      {(!what.trim() || !who) && <p className="-mt-2 text-center text-[13px] text-ink-2">Опишите задачу и выберите исполнителя</p>}
    </Block>
  )
}

/* ───────────── экран ───────────── */

/** review: открыть сразу на разборе надиктованных задач (для доски экранов) */
export function MDelegate({ review }: { review?: boolean }) {
  const [mode, setMode] = useState<'voice' | 'manual'>('voice')
  return (
    <>
      <MHead title="Поручить" />
      <Scroll>
        <motion.div variants={{ hide: { opacity: 0 }, show: { opacity: 1 } }}>
          <Segmented id="mode" value={mode} onChange={setMode} options={[{ v: 'voice', label: 'Голосом' }, { v: 'manual', label: 'Вручную' }]} />
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial="hide" animate="show" exit={{ opacity: 0 }}
            variants={{ hide: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease } } }}
            className="flex flex-col gap-3"
          >
            {mode === 'voice' ? <Voice review={review} /> : <Manual />}
          </motion.div>
        </AnimatePresence>
      </Scroll>
    </>
  )
}
