import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, Receipt, Landmark, PiggyBank, Lock, Check, ExternalLink, Camera, Sparkles, Hourglass, CircleAlert } from 'lucide-react'
import { Scroll, Block, Group, Label, Btn } from '../../components/Bits'
import { Sheet } from '../../components/Sheet'
import { Segmented } from '../../components/web/ui'
import { useResident, RHead } from './state'
import { budget, paymentHistory, me, type BudgetLine, type Doc, type Charge } from '../../data/resident'
import { cn, ease, money } from '../../lib/cn'

const rise = { hide: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }
/** Сколько длится распознавание чека в прототипе */
const READ_MS = 1300

/** Спарклайн остатка: линия с градиентной заливкой */
function Spark() {
  const d = 'M0,34 C14,30 22,38 34,31 C46,24 54,33 68,22 C82,11 92,21 106,14 C120,7 128,16 142,9'
  return (
    <svg viewBox="0 0 142 44" className="h-11 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="res-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2e9e5b" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#2e9e5b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={`${d} L142,44 L0,44 Z`} fill="url(#res-spark)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.6 }} />
      <motion.path d={d} fill="none" stroke="#2e9e5b" strokeWidth="2.2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.35, duration: 1.1, ease }} />
    </svg>
  )
}

/* ───────────── документ ───────────── */

function DocView({ line, doc }: { line: BudgetLine; doc: Doc }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto w-full max-w-[280px] rounded-[18px] bg-surface-2 p-5 font-mono text-[12.5px] leading-relaxed text-ink">
        <p className="text-center font-semibold">{line.who ?? 'ОСИ «Асыл Арман, блок 3»'}</p>
        <p className="mt-2 text-center text-ink-2">{doc === 'Акт' ? 'Акт выполненных работ' : doc}</p>
        <div className="my-3 h-px bg-surface-3" />
        <p>{line.t}</p>
        <p className="text-ink-2">сентябрь 2026</p>
        <div className="my-3 h-px bg-surface-3" />
        <p className="flex justify-between font-semibold"><span>ИТОГО</span><span>{money(line.v)} ₸</span></p>
        {doc === 'Акт' && <p className="mt-3 text-ink-2">Подписи: исполнитель, председатель ОСИ</p>}
      </div>
      <p className="text-center text-[13px] text-ink-2">Тот же документ приложен к официальному отчёту</p>
    </div>
  )
}

/* ───────────── бюджет дома ───────────── */

function House() {
  const [open, setOpen] = useState<string | null>(budget.cats[0].n)
  const [viewing, setViewing] = useState<{ line: BudgetLine; doc: Doc } | null>(null)

  return (
    <>
      <Block className="overflow-hidden !p-0">
        <div className="p-4 pb-0">
          <p className="text-[13px] text-ink-2">Остаток на счетах</p>
          <p className="nums mt-1 font-display text-[32px] font-extrabold leading-none tracking-[-0.03em] text-ink">
            {money(budget.balance)}<span className="ml-1 text-[20px] font-bold text-ink-3">₸</span>
          </p>
        </div>
        <Spark />
        <div className="flex gap-2 p-3 pt-0">
          {[{ i: Landmark, t: 'Текущий', v: budget.current }, { i: PiggyBank, t: 'Капремонт', v: budget.capital }].map((a) => (
            <div key={a.t} className="flex-1 rounded-[16px] bg-surface-2 p-3">
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2"><a.i size={14} strokeWidth={2.1} /> {a.t}</p>
              <p className="nums mt-1 font-display text-[15.5px] font-bold text-ink">{money(a.v)}<span className="ml-0.5 text-[12px] text-ink-3">₸</span></p>
            </div>
          ))}
        </div>
      </Block>

      <Block>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] text-ink-2">Собрано взносов за сентябрь</p>
            <p className="nums mt-0.5 font-display text-[26px] font-extrabold leading-none tracking-[-0.03em] text-ink">87,4<span className="text-ink-3">%</span></p>
          </div>
        </div>
        <div className="mt-3 h-[7px] overflow-hidden rounded-full bg-surface-3">
          <motion.div initial={{ width: 0 }} animate={{ width: `${budget.pct}%` }} transition={{ delay: 0.45, duration: 1, ease }} className="h-full rounded-full bg-brand-500" />
        </div>
        <div className="mt-3 flex gap-2">
          {[{ t: 'Собрано', v: budget.collected }, { t: 'Потрачено', v: budget.spent }].map((x) => (
            <div key={x.t} className="flex-1 rounded-[14px] bg-surface-2 px-3 py-2">
              <p className="text-[12.5px] text-ink-2">{x.t}</p>
              <p className="nums font-display text-[14.5px] font-bold text-ink">{money(x.v)}<span className="ml-0.5 text-[12px] text-ink-3">₸</span></p>
            </div>
          ))}
        </div>
        {/* Поимённых должников жилец не видит: это персональные данные соседей */}
        <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-2"><Lock size={13} strokeWidth={2.2} /> Кто не оплатил, видит только правление</p>
      </Block>

      <Group>
        <Label>Куда ушли деньги</Label>
        <Block className="!p-2">
          {budget.cats.map((c, idx) => {
            const isOpen = open === c.n
            return (
              <div key={c.n}>
                <button onClick={() => setOpen(isOpen ? null : c.n)} aria-expanded={isOpen} className="w-full rounded-[16px] p-2.5 text-left">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[14.5px] font-medium text-ink">{c.n}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="nums font-display text-[14.5px] font-bold text-ink">{money(c.v)}</span>
                      <span className="nums text-[12px] text-ink-2">{c.pc}%</span>
                      <ChevronDown size={16} strokeWidth={2.2} className={cn('text-ink-3 transition-transform', isOpen && 'rotate-180')} />
                    </span>
                  </span>
                  <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full bg-surface-3">
                    <motion.span
                      className="block h-full rounded-full bg-brand-500"
                      initial={{ width: 0 }} animate={{ width: `${Math.min(c.pc * 2.7, 100)}%` }}
                      transition={{ delay: 0.5 + idx * 0.06, duration: 0.8, ease }}
                    />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease }}
                      className="overflow-hidden"
                    >
                      <div className="mx-1 mb-2 flex flex-col gap-1 rounded-[14px] bg-surface-2 p-2">
                        {c.lines.map((l) => (
                          <div key={l.t} className="flex flex-col gap-1.5 rounded-[12px] p-2">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[14px] text-ink">{l.t}{l.who && <span className="block text-[12.5px] text-ink-2">{l.who}</span>}</span>
                              <span className="nums shrink-0 text-[14px] font-semibold text-ink">{money(l.v)} ₸</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {l.docs.map((d) => (
                                <button key={d} onClick={() => setViewing({ line: l, doc: d })} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-semibold text-brand-700">
                                  <Receipt size={13} strokeWidth={2.2} /> {d}
                                </button>
                              ))}
                              {l.pending && <span className="inline-flex h-9 items-center px-1 text-[12.5px] text-ink-2">{l.pending}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </Block>
      </Group>

      <Sheet open={!!viewing} onClose={() => setViewing(null)} title={viewing ? viewing.doc : ''}>
        {viewing && <DocView line={viewing.line} doc={viewing.doc} />}
      </Sheet>
    </>
  )
}

/* ───────────── мои платежи ───────────── */

type PayStep = 'kaspi' | 'receipt' | 'reading' | 'accepted'

function Mine() {
  const { charges, setCharge } = useResident()
  const [paying, setPaying] = useState<Charge | null>(null)
  const [step, setStep] = useState<PayStep>('kaspi')

  const start = (c: Charge, s: PayStep = 'kaspi') => { setPaying(c); setStep(s) }
  const upload = () => {
    setStep('reading')
    window.setTimeout(() => { if (paying) setCharge(paying.id, 'checking'); setStep('accepted') }, READ_MS)
  }

  return (
    <>
      <Group>
        <Label>К оплате</Label>
        {charges.map((c) => (
          <motion.div key={c.id} variants={rise} className="flex flex-col gap-3 rounded-[22px] bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[15.5px] font-semibold text-ink">{c.title}</p>
                <p className="text-[13.5px] text-ink-2">{c.period}</p>
              </div>
              <p className="nums font-display text-[22px] font-extrabold tracking-[-0.02em] text-ink">{money(c.amount)}<span className="ml-0.5 text-[14px] text-ink-3">₸</span></p>
            </div>
            {c.status === 'checking' ? (
              <p className="flex items-center gap-2 rounded-[14px] bg-brand-50 px-3.5 py-3 text-[14px] text-brand-700">
                <Hourglass size={16} strokeWidth={2.2} /> Чек принят, ждёт подтверждения председателя
              </p>
            ) : (
              <>
                <p className={cn('flex items-center gap-1.5 text-[13.5px]', c.status === 'overdue' ? 'font-semibold text-warning' : 'text-ink-2')}>
                  {c.status === 'overdue' && <CircleAlert size={14} strokeWidth={2.4} />} {c.due}
                </p>
                <div className="flex gap-2">
                  <Btn className="flex-1 !h-12" onClick={() => start(c)}>Оплатить через Kaspi</Btn>
                  <Btn variant="soft" className="!h-12" onClick={() => start(c, 'receipt')}>Чек</Btn>
                </div>
              </>
            )}
          </motion.div>
        ))}
      </Group>

      <Group>
        <Label>Оплачено</Label>
        <Block className="!p-2">
          {paymentHistory.map((h) => (
            <div key={h.period} className="flex items-center gap-3 rounded-[14px] p-2.5 text-[14.5px]">
              <span className="w-16 text-ink-2">{h.period}</span>
              <span className="flex-1 text-ink">{h.title}</span>
              <span className="nums font-semibold text-ink">{money(h.amount)} ₸</span>
              <Check size={16} strokeWidth={2.6} className="text-brand-600" aria-label="оплачено" />
            </div>
          ))}
        </Block>
      </Group>

      <Sheet open={!!paying} onClose={() => step !== 'reading' && setPaying(null)} title={paying ? `${paying.title}, ${paying.period}` : ''}>
        {paying && step === 'kaspi' && (
          <>
            <div className="flex flex-col gap-2 rounded-[16px] bg-surface-2 p-4 text-[14px]">
              <p className="flex justify-between gap-3"><span className="text-ink-2">Получатель</span><span className="text-right font-medium text-ink">ОСИ «Асыл Арман, блок 3»</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink-2">Сумма</span><span className="font-semibold text-ink">{money(paying.amount)} ₸</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink-2">Назначение</span><span className="text-right font-medium text-ink">кв. {me.flat}, взнос за {paying.period}</span></p>
            </div>
            <p className="text-[14px] leading-relaxed text-ink-2">Kaspi откроется с уже заполненными реквизитами. После оплаты вернитесь сюда и загрузите чек.</p>
            <Btn full className="!h-14 !text-[16px]" onClick={() => setStep('receipt')}><ExternalLink size={17} strokeWidth={2.2} /> Открыть Kaspi</Btn>
          </>
        )}
        {paying && step === 'receipt' && (
          <>
            <p className="text-[15px] leading-relaxed text-ink">Оплатили? Загрузите чек или скриншот из Kaspi, и председатель отметит оплату.</p>
            <Btn full className="!h-14 !text-[16px]" onClick={upload}><Camera size={18} strokeWidth={2.2} /> Загрузить чек</Btn>
            <Btn full variant="soft" className="!h-12" onClick={() => setPaying(null)}>Позже</Btn>
          </>
        )}
        {step === 'reading' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center" aria-live="polite">
            <motion.span animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 1.2, repeat: Infinity }} className="grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600">
              <Sparkles size={24} strokeWidth={2} />
            </motion.span>
            <p className="text-[15px] font-semibold text-ink">Распознаю чек</p>
          </div>
        )}
        {step === 'accepted' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-brand-600 text-white"><Check size={26} strokeWidth={2.6} /></span>
            <p className="font-display text-[18px] font-bold text-ink">Чек принят</p>
            <p className="text-[14.5px] leading-relaxed text-ink-2">Сумма и дата совпали с начислением. Оплата засчитается, когда её подтвердит председатель.</p>
            <Btn full className="!h-12" onClick={() => setPaying(null)}>Готово</Btn>
          </div>
        )}
      </Sheet>
    </>
  )
}

/* ───────────── экран ───────────── */

export function RFinance() {
  const { views, setView } = useResident()
  return (
    <>
      <RHead title="Финансы" />
      <Scroll>
        <motion.div variants={rise}>
          <Segmented id="res-fin" value={views.fin} onChange={(v) => setView('fin', v)} options={[{ v: 'house', label: 'Бюджет дома' }, { v: 'mine', label: 'Мои платежи' }]} />
        </motion.div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={views.fin}
            initial="hide" animate="show" exit={{ opacity: 0 }}
            variants={{ hide: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease, staggerChildren: 0.05 } } }}
            className="flex flex-col gap-3"
          >
            {views.fin === 'house' ? <House /> : <Mine />}
          </motion.div>
        </AnimatePresence>
      </Scroll>
    </>
  )
}
