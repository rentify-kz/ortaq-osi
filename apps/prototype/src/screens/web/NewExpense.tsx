import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Camera, Upload, Sparkles, Check, Paperclip, Plus, X, CircleAlert, ReceiptText, PenLine } from 'lucide-react'
import { Card } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, Field, Input, Select, Segmented, GroupLabel, Empty, type Go } from '../../components/web/ui'
import { contractors, pastVotes } from '../../data/chairman'
import { cn, ease, money } from '../../lib/cn'

/* Категории только из справочника официальной формы отчёта: благодаря этому
   отчёт собирается сам, а жильцы видят те же цифры. Частые наверху. */
const frequent = [
  { v: '6.2.1', label: '6.2.1 Услуги подрядчиков (сервисная деятельность)' },
  { v: '6.3', label: '6.3 Текущий ремонт' },
  { v: '6.5', label: '6.5 Коммунальные услуги' },
]
const all = [
  { v: '6.1.1', label: '6.1.1 Оплата труда за бухучёт' },
  { v: '6.1.2', label: '6.1.2 Оплата труда за управление' },
  { v: '6.1.3', label: '6.1.3 Обязательные платежи в бюджет' },
  { v: '6.1.4', label: '6.1.4 Банковские услуги' },
  { v: '6.7', label: '6.7 Капитальный ремонт' },
]

/** Что распознал ИИ на примере чека */
const SAMPLE = {
  file: 'chek_15-09.jpg',
  amount: '110000',
  date: '2026-09-15',
  payee: 'ТОО «Таза Сервис»',
  category: '6.2.1',
  contractor: 'ТОО «Таза Сервис»',
  title: 'Уборка МОП за первую половину сентября',
}
/** Сколько длится распознавание в прототипе */
const READ_MS = 1400

type Stage = 'upload' | 'reading' | 'form' | 'done'
type Account = 'current' | 'capital'

/* ───────────── чек ───────────── */

function Receipt({ file, recognized }: { file: string; recognized: boolean }) {
  const mark = (on: boolean) => cn('rounded-[6px] px-1 -mx-1 transition-colors', on && 'bg-brand-100')
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[18px] bg-surface p-5 font-mono text-[12.5px] leading-relaxed text-ink">
      <p className={cn('text-center font-semibold', mark(recognized))}>ТОО «Таза Сервис»</p>
      <p className="text-center text-ink-2">БИН 190340021876</p>
      <p className="mt-3 text-ink-2">Кассовый чек №4471</p>
      <p className={mark(recognized)}>15.09.2026 14:32</p>
      <div className="my-3 h-px bg-surface-3" />
      <p>Услуги по уборке МОП</p>
      <p className="text-ink-2">01.09-15.09.2026</p>
      <div className="my-3 h-px bg-surface-3" />
      <p className={cn('flex justify-between font-semibold', mark(recognized))}><span>ИТОГО</span><span>110 000,00 ₸</span></p>
      <p className="mt-3 text-center text-ink-3">{file}</p>
    </div>
  )
}

/* ───────────── экран ───────────── */

/** filled: открыть сразу форму, заполненную по примеру чека (для доски экранов) */
export function NewExpense({ go, filled }: { go: Go; filled?: boolean }) {
  const [stage, setStage] = useState<Stage>(filled ? 'form' : 'upload')
  const [file, setFile] = useState<string | null>(filled ? SAMPLE.file : null)
  const [fromReceipt, setFromReceipt] = useState(!!filled)
  const fileInput = useRef<HTMLInputElement>(null)

  const [amount, setAmount] = useState(filled ? SAMPLE.amount : '')
  const [date, setDate] = useState(filled ? SAMPLE.date : '2026-09-16')
  const [payee, setPayee] = useState(filled ? SAMPLE.payee : '')
  const [category, setCategory] = useState(filled ? SAMPLE.category : '')
  const [contractor, setContractor] = useState(filled ? SAMPLE.contractor : '')
  const [protocol, setProtocol] = useState('')
  const [title, setTitle] = useState(filled ? SAMPLE.title : '')
  const [account, setAccount] = useState<Account>('current')
  const [attachments, setAttachments] = useState<string[]>(filled ? ['Акт выполненных работ.pdf'] : [])
  const [draft, setDraft] = useState(false)

  useEffect(() => {
    if (stage !== 'reading') return
    const t = setTimeout(() => {
      setAmount(SAMPLE.amount); setDate(SAMPLE.date); setPayee(SAMPLE.payee)
      setCategory(SAMPLE.category); setContractor(SAMPLE.contractor); setTitle(SAMPLE.title)
      setAttachments(['Акт выполненных работ.pdf'])
      setFromReceipt(true)
      setStage('form')
    }, READ_MS)
    return () => clearTimeout(t)
  }, [stage])

  const read = (name: string) => { setFile(name); setStage('reading') }
  const reset = () => {
    setStage('upload'); setFile(null); setFromReceipt(false)
    setAmount(''); setDate('2026-09-16'); setPayee(''); setCategory(''); setContractor('')
    setProtocol(''); setTitle(''); setAccount('current'); setAttachments([]); setDraft(false)
  }

  // Особые статьи: подрядчик печатается в отчёте, капремонт только по решению собрания
  const sum = Number(amount.replace(/\s/g, ''))
  const problems = [
    !sum && 'укажите сумму',
    !category && 'выберите статью отчёта',
    category === '6.2.1' && !contractor && 'для статьи 6.2.1 выберите подрядчика: его название попадёт в отчёт',
    category === '6.7' && account !== 'capital' && 'капремонт оплачивается только со сберегательного счёта',
    category === '6.7' && !protocol && 'для капремонта привяжите протокол собрания',
    category === '6.3' && !attachments.some((a) => a.toLowerCase().includes('дефект')) && 'для текущего ремонта приложите дефектный акт',
  ].filter(Boolean) as string[]

  const back = { label: 'Финансы', onClick: () => go('Финансы') }

  if (stage === 'done') {
    return (
      <>
        <PageHead back={back} title="Новый расход" />
        <Card delay={0.05} lift={false} className="py-14">
          <Empty
            icon={Check}
            title={draft ? 'Черновик сохранён' : 'Расход проведён'}
            text={draft
              ? 'Его можно дополнить и провести позже. В отчёт черновики не попадают.'
              : `${money(sum)} ₸ по статье ${category} уже в отчёте за сентябрь. Жильцы увидят расход вместе с чеком.`}
            action={
              <div className="flex gap-2">
                <Btn variant="soft" onClick={() => go('Финансы')}>К финансам</Btn>
                <Btn onClick={reset}>Внести ещё</Btn>
              </div>
            }
          />
        </Card>
      </>
    )
  }

  if (stage !== 'form') {
    return (
      <>
        <PageHead back={back} title="Новый расход" sub="Начните с чека: ИИ заполнит сумму, дату и получателя" />
        <Card delay={0.05} lift={false} className="!p-6">
          <AnimatePresence mode="wait">
            {stage === 'upload' ? (
              <motion.div
                key="upload"
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-5 rounded-[22px] bg-surface-2 px-6 py-14 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) read(f.name) }}
              >
                <span className="grid size-16 place-items-center rounded-full bg-brand-600 text-white"><Camera size={28} strokeWidth={2} /></span>
                <div>
                  <p className="font-display text-[20px] font-bold text-ink">Загрузите фото чека</p>
                  <p className="mt-1 text-[14.5px] text-ink-2">Или перетащите файл сюда. Подойдёт фото, скан или PDF</p>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  aria-label="Файл чека"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f.name) }}
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <Btn onClick={() => fileInput.current?.click()}><Upload size={16} strokeWidth={2.2} /> Выбрать файл</Btn>
                  <Btn variant="ghost" className="!bg-surface hover:!bg-surface-3" onClick={() => read(SAMPLE.file)}>Попробовать на примере</Btn>
                </div>
                <button onClick={() => setStage('form')} className="text-[14px] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                  Чека нет, заполнить вручную
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="reading"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4 rounded-[22px] bg-brand-50 px-6 py-16 text-center"
                aria-live="polite"
              >
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                  className="grid size-14 place-items-center rounded-full bg-surface text-brand-600"
                >
                  <Sparkles size={24} strokeWidth={2} />
                </motion.span>
                <p className="font-display text-[18px] font-bold text-ink">Распознаю чек</p>
                <p className="text-[14px] text-ink-2">{file}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHead back={back} title="Новый расход" sub={fromReceipt ? 'Проверьте, что распознал ИИ, и выберите статью' : 'Заполните вручную и приложите документы'} />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card delay={0.05} lift={false} className="flex flex-col gap-4 bg-surface-2 xl:sticky xl:top-[92px] xl:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-display text-[15px] font-bold text-ink"><ReceiptText size={18} strokeWidth={2} /> Чек</p>
            {fromReceipt && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-[12.5px] font-semibold text-brand-700">
                <Sparkles size={13} strokeWidth={2.2} /> Распознан
              </span>
            )}
          </div>
          {file
            ? <Receipt file={file} recognized={fromReceipt} />
            : (
              <div className="flex flex-col items-center gap-3 rounded-[18px] bg-surface px-5 py-10 text-center">
                <p className="text-[14px] text-ink-2">Чек не приложен. Без него жильцы не смогут проверить расход</p>
                <Btn variant="soft" onClick={() => read(SAMPLE.file)}><Camera size={15} strokeWidth={2.2} /> Приложить чек</Btn>
              </div>
            )}
          {fromReceipt && <p className="text-[13px] text-ink-2">Подсвечено то, что ИИ перенёс в форму. Проверьте сумму перед проведением.</p>}
        </Card>

        <Card delay={0.12} lift={false} className="flex flex-col gap-5 !p-6 xl:col-span-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Сумма, ₸">
              <Input value={amount ? money(Number(amount.replace(/\s/g, '')) || 0) : ''} onChange={(v) => setAmount(v.replace(/\D/g, ''))} inputMode="decimal" placeholder="0" />
            </Field>
            <Field label="Дата">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 w-full rounded-[15px] bg-surface-2 px-4 text-[15px] text-ink outline-none transition-[background-color,box-shadow] focus:bg-surface focus:ring-[3px] focus:ring-brand-100"
              />
            </Field>
          </div>
          <Field label="Получатель">
            <Input value={payee} onChange={setPayee} placeholder="Организация или человек" />
          </Field>

          <Field label="Статья отчёта" hint="Только из официальной формы: так отчёт соберётся сам">
            <Select
              value={category}
              onChange={(v) => { setCategory(v); setAccount(v === '6.7' ? 'capital' : 'current') }}
              placeholder="Выберите статью"
              groups={[{ label: 'Часто в этом доме', options: frequent }, { label: 'Все статьи', options: all }]}
            />
          </Field>

          <AnimatePresence initial={false}>
            {category === '6.2.1' && (
              <motion.div key="contractor" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease }} className="overflow-hidden">
                <Field label="Подрядчик" hint="Его наименование печатается в отчёте">
                  <Select
                    value={contractor}
                    onChange={setContractor}
                    placeholder="Выберите подрядчика"
                    invalid={!contractor}
                    groups={[{ options: contractors.map((c) => ({ v: c.name, label: `${c.name}: ${c.service}` })) }]}
                  />
                </Field>
              </motion.div>
            )}
            {category === '6.7' && (
              <motion.div key="protocol" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease }} className="overflow-hidden">
                <Field label="Решение собрания" hint="Капремонт оплачивается только по решению общего собрания">
                  <Select
                    value={protocol}
                    onChange={setProtocol}
                    placeholder="Выберите протокол"
                    invalid={!protocol}
                    groups={[{ options: pastVotes.filter((p) => p.result === 'accepted').map((p) => ({ v: p.title, label: `${p.title}, ${p.date}` })) }]}
                  />
                </Field>
              </motion.div>
            )}
          </AnimatePresence>

          <Field label="Название для жильцов">
            <Input value={title} onChange={setTitle} placeholder="Например, уборка МОП за первую половину сентября" />
          </Field>

          <div className="flex flex-col gap-2">
            <GroupLabel>Счёт</GroupLabel>
            <Segmented
              id="acc"
              value={account}
              onChange={setAccount}
              options={[{ v: 'current', label: 'Текущий' }, { v: 'capital', label: 'Капремонт' }]}
            />
          </div>

          <div className="flex flex-col gap-2">
            <GroupLabel>Приложения</GroupLabel>
            {attachments.map((a) => (
              <div key={a} className="flex items-center gap-3 rounded-[14px] bg-surface-2 py-2 pl-4 pr-2">
                <Paperclip size={16} strokeWidth={2} className="shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1 text-[14px] text-ink">{a}</span>
                <button aria-label={`Убрать ${a}`} onClick={() => setAttachments((l) => l.filter((x) => x !== a))} className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-3">
                  <X size={15} strokeWidth={2.4} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {!attachments.includes('Акт выполненных работ.pdf') && (
                <button onClick={() => setAttachments((l) => [...l, 'Акт выполненных работ.pdf'])} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13.5px] font-semibold text-ink transition-colors hover:bg-surface-3">
                  <Plus size={14} strokeWidth={2.4} /> Акт выполненных работ
                </button>
              )}
              {category === '6.3' && !attachments.includes('Дефектный акт.pdf') && (
                <button onClick={() => setAttachments((l) => [...l, 'Дефектный акт.pdf'])} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-warning-soft px-4 text-[13.5px] font-semibold text-warning transition-colors hover:bg-[#fbebd4]">
                  <Plus size={14} strokeWidth={2.4} /> Дефектный акт
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-[18px] bg-surface-2 p-4">
            {problems.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {problems.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[13.5px] leading-snug text-ink">
                    <CircleAlert size={16} strokeWidth={2.2} className="mt-px shrink-0 text-warning" />
                    <span>Чтобы провести, {p}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="ghost" className="!bg-surface hover:!bg-surface-3" onClick={() => { setDraft(true); setStage('done') }}>
                <PenLine size={15} strokeWidth={2.2} /> Сохранить черновиком
              </Btn>
              <Btn disabled={problems.length > 0} onClick={() => { setDraft(false); setStage('done') }}>
                <Check size={16} strokeWidth={2.6} /> Провести
              </Btn>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
