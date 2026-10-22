import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Scale, Plus, Trash2, Paperclip, X, CircleAlert, Check, Send, ArrowRight, ArrowLeft, Ruler } from 'lucide-react'
import { Card, CardHead } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, Field, Input, TextArea, Toggle, Segmented, GroupLabel, Empty, type Go } from '../../components/web/ui'
import { useHouse } from './HouseContext'
import { cn, ease, plural } from '../../lib/cn'

/* Порог выводится из типа решения, председатель его не выбирает:
   ошибка здесь даёт юридически ничтожный протокол. */
type Kind = 'ordinary' | 'big' | 'management' | 'capital'
const kinds: { v: Kind; label: string; threshold: string }[] = [
  { v: 'ordinary', label: 'Обычное решение', threshold: 'простое большинство' },
  { v: 'big', label: 'Крупный расход', threshold: '2/3 голосов' },
  { v: 'management', label: 'Смена способа управления', threshold: '2/3 голосов' },
  { v: 'capital', label: 'Использование капремонта', threshold: '2/3 голосов' },
]
type Form = 'electronic' | 'written'

/** Закон требует уведомить собственников не позднее чем за 5 календарных дней */
const NOTICE_DAYS = 5
const TODAY = new Date(2026, 8, 16)
const DURATIONS = [7, 10, 14] as const
const TOTAL_UNITS = 128

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const human = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const MIN_START = addDays(TODAY, NOTICE_DAYS)

const steps = ['Тема и тип', 'Вопросы', 'Сроки']

type Duration = (typeof DURATIONS)[number]
type Draft = {
  step: number; topic: string; kind: Kind; form: Form; questions: string[]; files: string[]
  start: string; duration: Duration; reminders: { d3: boolean; d1: boolean; h4: boolean }
}
const blank = (): Draft => ({
  step: 0, topic: '', kind: 'big', form: 'electronic', questions: [''],
  files: ['Коммерческие предложения (3)', 'Дефектный акт'],
  start: iso(MIN_START), duration: 10, reminders: { d3: true, d1: true, h4: true },
})
/** Черновик переживает уход на другой экран, например чтобы заполнить площади */
let saved: Draft | null = null

/* ───────────── общие части ───────────── */

function Radio({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn('flex min-h-12 items-center gap-3 rounded-[14px] px-4 py-2.5 text-left transition-colors', on ? 'bg-brand-50' : 'bg-surface-2 hover:bg-surface-3')}
    >
      <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', on ? 'bg-brand-600' : 'bg-surface-3')}>
        {on && <span className="size-2 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1 text-[14.5px] font-medium text-ink">{title}</span>
      {sub && <span className="shrink-0 text-[13px] text-ink-2">{sub}</span>}
    </button>
  )
}

function Law({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[16px] bg-surface-2 p-4 text-[14px] leading-snug text-ink">
      <Scale size={18} strokeWidth={2} className="mt-px shrink-0 text-brand-600" />
      <div>{children}</div>
    </div>
  )
}

function StepBar({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-col gap-2">
          <span className="h-[5px] overflow-hidden rounded-full bg-surface-3">
            <motion.span
              className="block h-full rounded-full bg-brand-600"
              initial={false}
              animate={{ width: i < step ? '100%' : i === step ? '50%' : '0%' }}
              transition={{ duration: 0.45, ease }}
            />
          </span>
          <span className={cn('text-[13px]', i === step ? 'font-semibold text-ink' : 'text-ink-2')}>{i + 1}. {s}</span>
        </li>
      ))}
    </ol>
  )
}

/* ───────────── экран ───────────── */

/** preset: заполненный черновик на нужном шаге (для доски экранов) */
export function VoteWizard({ go, preset }: { go: Go; preset?: Partial<Draft> }) {
  const { missing } = useHouse()
  const [d, setD] = useState<Draft>(() => (preset ? { ...blank(), ...preset } : saved ?? blank()))
  const [sent, setSent] = useState(false)
  useEffect(() => { saved = sent ? null : d }, [d, sent])

  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const { step, topic, kind, form, questions, files, start, duration, reminders } = d
  const setStep = (f: (s: number) => number) => patch({ step: f(step) })
  const setTopic = (topic: string) => patch({ topic })
  const setKind = (kind: Kind) => patch({ kind })
  const setForm = (form: Form) => patch({ form })
  const setQuestions = (f: (q: string[]) => string[]) => patch({ questions: f(questions) })
  const setFiles = (f: (q: string[]) => string[]) => patch({ files: f(files) })
  const setStart = (start: string) => patch({ start })
  const setDuration = (duration: Duration) => patch({ duration })
  const setReminders = (f: (r: Draft['reminders']) => Draft['reminders']) => patch({ reminders: f(reminders) })

  const meta = kinds.find((k) => k.v === kind)!
  const startDate = new Date(`${start}T00:00`)
  const tooEarly = !start || startDate < MIN_START
  const end = addDays(startDate, duration)
  const filledQuestions = questions.filter((q) => q.trim())

  const canNext = [topic.trim().length > 0, filledQuestions.length > 0, !tooEarly][step]

  if (sent) {
    return (
      <>
        <PageHead back={{ label: 'Голосования', onClick: () => go('Голосования') }} title="Новое голосование" />
        <Card delay={0.05} lift={false} className="py-14">
          <Empty
            icon={Check}
            title="Уведомление разослано"
            text={`${TOTAL_UNITS} собственников получили уведомление. Голосование «${topic}» начнётся ${human(startDate)} и закончится ${human(end)}.`}
            action={<Btn onClick={() => go('Голосования')}>К голосованиям</Btn>}
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHead
        back={{ label: 'Голосования', onClick: () => go('Голосования') }}
        title="Новое голосование"
        sub={`Шаг ${step + 1} из 3`}
      />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card delay={0.05} lift={false} className="flex flex-col gap-6 !p-6 xl:col-span-8">
          <StepBar step={step} />

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.3, ease }}
              className="flex flex-col gap-5"
            >
              {step === 0 && (
                <>
                  <Field label="Тема голосования">
                    <Input value={topic} onChange={setTopic} placeholder="Например, замена лифта во 2 подъезде" />
                  </Field>
                  <div className="flex flex-col gap-2">
                    <GroupLabel>Тип решения</GroupLabel>
                    <div role="radiogroup" className="flex flex-col gap-1.5">
                      {kinds.map((k) => <Radio key={k.v} on={kind === k.v} onClick={() => setKind(k.v)} title={k.label} sub={k.threshold} />)}
                    </div>
                  </div>
                  <Law>
                    <p className="font-semibold">Требуется {meta.threshold} от участвующих</p>
                    <p className="mt-0.5 text-ink-2">Кворум: более 50% по площади. Порог задаётся типом решения, его нельзя изменить вручную.</p>
                  </Law>
                  <div className="flex flex-col gap-2">
                    <GroupLabel>Форма проведения</GroupLabel>
                    <div role="radiogroup" className="flex flex-col gap-1.5">
                      <Radio on={form === 'electronic'} onClick={() => setForm('electronic')} title="Электронное голосование" sub="ст. 44" />
                      <Radio on={form === 'written'} onClick={() => setForm('written')} title="Письменный опрос" sub="ст. 43" />
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  {questions.map((q, i) => (
                    <div key={i} className="flex flex-col gap-2 rounded-[18px] bg-surface-2 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[13.5px] font-semibold text-ink">Вопрос {i + 1}</span>
                        {questions.length > 1 && (
                          <button
                            aria-label={`Удалить вопрос ${i + 1}`}
                            onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                            className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-3 hover:text-danger"
                          >
                            <Trash2 size={16} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                      <TextArea
                        rows={2}
                        value={q}
                        onChange={(v) => setQuestions((qs) => qs.map((x, j) => (j === i ? v : x)))}
                        placeholder="Утвердить замену лифта во 2 подъезде за счёт средств капитального ремонта?"
                      />
                      <p className="text-[13px] text-ink-2">Варианты ответа: За, Против, Воздержался</p>
                    </div>
                  ))}
                  <button
                    onClick={() => setQuestions((qs) => [...qs, ''])}
                    className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-surface-2 px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-3"
                  >
                    <Plus size={16} strokeWidth={2.4} /> Добавить вопрос
                  </button>

                  <div className="flex flex-col gap-2">
                    <GroupLabel>Материалы для собственников</GroupLabel>
                    {files.map((f) => (
                      <div key={f} className="flex items-center gap-3 rounded-[14px] bg-surface-2 py-2 pl-4 pr-2">
                        <Paperclip size={16} strokeWidth={2} className="shrink-0 text-ink-2" />
                        <span className="min-w-0 flex-1 text-[14px] text-ink">{f}</span>
                        <button aria-label={`Убрать ${f}`} onClick={() => setFiles((fs) => fs.filter((x) => x !== f))} className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-3">
                          <X size={15} strokeWidth={2.4} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setFiles((fs) => (fs.includes('Смета работ') ? fs : [...fs, 'Смета работ']))}
                      className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-surface-2 px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-3"
                    >
                      <Paperclip size={15} strokeWidth={2.2} /> Прикрепить файл
                    </button>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Уведомление уйдёт">
                      <div className="flex h-12 items-center rounded-[15px] bg-surface-2 px-4 text-[15px] text-ink-2">сегодня, {human(TODAY)}</div>
                    </Field>
                    <Field label="Начало голосования" hint={tooEarly ? undefined : `не раньше ${human(MIN_START)}`}>
                      <input
                        type="date"
                        value={start}
                        min={iso(MIN_START)}
                        onChange={(e) => setStart(e.target.value)}
                        className={cn(
                          'h-12 w-full rounded-[15px] px-4 text-[15px] text-ink outline-none transition-[background-color,box-shadow] focus:bg-surface focus:ring-[3px]',
                          tooEarly ? 'bg-danger-soft focus:ring-danger-soft' : 'bg-surface-2 focus:ring-brand-100',
                        )}
                      />
                    </Field>
                  </div>

                  {/* Ошибка объясняет закон, а не просто запрещает */}
                  {tooEarly ? (
                    <div className="flex items-start gap-3 rounded-[16px] bg-danger-soft p-4 text-[14px] leading-snug text-ink">
                      <CircleAlert size={18} strokeWidth={2.2} className="mt-px shrink-0 text-danger" />
                      Нельзя начать раньше {human(MIN_START)}: закон требует уведомить собственников за {NOTICE_DAYS} календарных дней.
                    </div>
                  ) : (
                    <Law>
                      Закон требует уведомить не позднее чем за {NOTICE_DAYS} календарных дней. Поэтому самая ранняя дата начала: {human(MIN_START)}.
                    </Law>
                  )}

                  <div className="flex flex-col gap-2">
                    <GroupLabel>Сколько длится</GroupLabel>
                    <Segmented
                      id="dur"
                      value={String(duration)}
                      onChange={(v) => setDuration(Number(v) as Duration)}
                      options={DURATIONS.map((d) => ({ v: String(d), label: `${d} дней` }))}
                    />
                    {!tooEarly && <p className="text-[14px] text-ink">Закончится {human(end)}, протокол сформируется сам</p>}
                  </div>

                  <div className="flex flex-col">
                    <GroupLabel>Напоминания тем, кто не проголосовал</GroupLabel>
                    <Toggle on={reminders.d3} onChange={(v) => setReminders((r) => ({ ...r, d3: v }))} label="За 3 дня до конца" />
                    <Toggle on={reminders.d1} onChange={(v) => setReminders((r) => ({ ...r, d1: v }))} label="За 1 день" />
                    <Toggle on={reminders.h4} onChange={(v) => setReminders((r) => ({ ...r, h4: v }))} label="За 4 часа" />
                  </div>

                  {missing > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-warning-soft py-3 pl-4 pr-3">
                      <p className="flex items-start gap-2.5 text-[14px] leading-snug text-ink">
                        <Ruler size={18} strokeWidth={2.2} className="mt-px shrink-0 text-warning" />
                        <span>
                          Разослать пока нельзя: у {missing} помещений нет площади.
                          <span className="block text-[13px] text-ink-2">Голоса считаются по площади, без неё протокол оспорят. Черновик сохранится.</span>
                        </span>
                      </p>
                      <Btn className="!h-10 !rounded-full" onClick={() => go('Жильцы')}>Заполнить площади</Btn>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {step > 0
              ? <Btn variant="soft" onClick={() => setStep((s) => s - 1)}><ArrowLeft size={16} strokeWidth={2.2} /> Назад</Btn>
              : <span />}
            {step < 2
              ? <Btn disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Дальше <ArrowRight size={16} strokeWidth={2.2} /></Btn>
              : <Btn disabled={!canNext || missing > 0} onClick={() => setSent(true)}><Send size={15} strokeWidth={2.2} /> Разослать уведомление</Btn>}
          </div>
        </Card>

        <Card delay={0.12} lift={false} className="flex flex-col gap-4 xl:sticky xl:top-[92px] xl:col-span-4">
          <CardHead title="Что получат собственники" />
          <dl className="flex flex-col gap-3 text-[14px]">
            {[
              ['Тема', topic.trim() || 'не указана'],
              ['Решение', `${meta.label}, ${meta.threshold}`],
              ['Кворум', 'более 50% площади'],
              ['Форма', form === 'electronic' ? 'электронно, ст. 44' : 'письменный опрос, ст. 43'],
              ['Вопросов', String(filledQuestions.length || 'пока нет')],
              ['Материалы', files.length ? `${files.length} ${plural(files.length, ['файл', 'файла', 'файлов'])}` : 'нет'],
              ['Сроки', tooEarly ? 'дата не выбрана' : `${human(startDate)} - ${human(end)}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 rounded-[14px] bg-surface-2 px-4 py-3">
                <dt className="text-ink-2">{k}</dt>
                <dd className="text-right font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  )
}
