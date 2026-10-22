import { motion } from 'motion/react'
import {
  Mic, Plus, ArrowUpRight, ChevronRight, Droplets, DoorClosed, ArrowUpDown, Camera, Sparkles,
  CircleAlert, Clock3, Receipt, FileText, Vote, Wallet, Landmark, PiggyBank, Users,
} from 'lucide-react'
import { Card, CardHead, IconBtn } from '../../components/Card'
import { Pill, Btn, Stepper } from '../../components/Bits'
import { Sparkline } from '../../components/Charts'
import { PageHead, HeadBtn, Tenge, Num, Dot, type Go } from '../../components/web/ui'
import { collection } from '../../data/chairman'
import { cn, ease } from '../../lib/cn'

/* ───────────── Срочные заявки ───────────── */

function Urgent({ go, delay }: { go: Go; delay: number }) {
  return (
    <Card delay={delay} lift={false} className="flex flex-col gap-4 xl:col-span-7">
      <CardHead
        title="Срочные заявки"
        sub="4 новых за сутки, 2 срочные"
        icon={<Droplets size={18} strokeWidth={2} />}
        action={<IconBtn label="Все заявки" onClick={() => go('Заявки')}><ArrowUpRight size={17} strokeWidth={2} /></IconBtn>}
      />

      {/* Критичная выделена заливкой danger, а не рамкой */}
      <div className="rounded-[20px] bg-danger-soft p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-danger">
            <Droplets size={19} strokeWidth={2.1} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="nums text-[13px] font-bold text-danger">№51</span>
              <Pill tone="crit"><Dot tone="crit" /> критично</Pill>
              <span className="ml-auto text-[12.5px] text-ink-2">2 часа назад</span>
            </div>
            <p className="mt-1 font-display text-[17px] font-bold leading-snug tracking-[-0.01em] text-ink">Прорыв трубы</p>
            <p className="mt-0.5 text-[13px] text-ink-2">Подвал, 3 подъезд · Асанов Д., кв. 78</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-surface/80 px-2.5 py-1 text-[12px] font-semibold text-ink-2">
                <Camera size={12} strokeWidth={2.2} /> 2 фото
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-700">
                <Sparkles size={12} strokeWidth={2.2} /> ИИ: риск затопления, нужен сантехник
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Btn className="flex-1" onClick={() => go('Заявки')}>Назначить сантехника</Btn>
          <Btn variant="ghost" className="flex-1 !bg-surface hover:!bg-surface-2" onClick={() => go('Заявки')}>Открыть</Btn>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <button onClick={() => go('Заявки')} className="flex items-start gap-3 rounded-[16px] p-2.5 text-left transition-colors hover:bg-surface-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
            <ArrowUpDown size={17} strokeWidth={2.1} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-ink"><span className="nums text-ink-2">№49 </span>Не работает лифт</span>
              <Pill tone="warn"><Dot tone="warn" /> высокий</Pill>
              <span className="ml-auto shrink-0 text-[12.5px] text-ink-2">вчера</span>
            </span>
            <span className="mt-0.5 block text-[12.5px] text-ink-2">2 подъезд · 4 обращения от разных жильцов</span>
            <span className="mt-2 block max-w-[260px]"><Stepper total={4} done={1} /></span>
            <span className="mt-1 block text-[12.5px] font-medium text-ink-2">Сейчас: диагностика, ТОО «Лифт-Сервис»</span>
          </span>
        </button>
        <button onClick={() => go('Заявки')} className="flex items-center gap-3 rounded-[16px] p-2.5 text-left transition-colors hover:bg-surface-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
            <DoorClosed size={17} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-ink"><span className="nums text-ink-2">№52 </span>Не закрывается дверь подъезда</span>
              <span className="ml-auto shrink-0 text-[12.5px] text-ink-2">40 мин</span>
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-2"><Dot tone="norm" /> обычный · 1 подъезд, без исполнителя</span>
          </span>
        </button>
      </div>
    </Card>
  )
}

/* ───────────── Требует внимания: застрявшее, каждое ведёт в свой раздел ───────────── */

const stuck = [
  { icon: Clock3, tone: 'warn', t: '2 заявки без исполнителя', s: 'дольше суток: №44, №46', a: 'Назначить', to: 'Заявки' },
  { icon: Receipt, tone: 'brand', t: '3 чека жильцов на проверке', s: 'кв. 45, 78, 112', a: 'Проверить', to: 'Финансы' },
  { icon: Camera, tone: 'brand', t: '2 работы ждут подтверждения', s: 'Нурлан Б., Сергей П.', a: 'Посмотреть', to: 'Задачи' },
  { icon: FileText, tone: 'warn', t: 'Отчёт за август: 2 операции без документов', s: 'сдать до 20 сентября', a: 'Открыть', to: 'Отчёты' },
  { icon: Vote, tone: 'warn', t: 'Замена лифта: явка 42%, нужно 50%', s: 'голосование закроется через 3 дня', a: 'Напомнить', to: 'Голосования' },
] as const

function Attention({ go, delay }: { go: Go; delay: number }) {
  return (
    <Card delay={delay} lift={false} className="flex flex-col gap-3 xl:col-span-5">
      <CardHead
        title="Требует внимания"
        sub="Дела, которые ждут вашего решения"
        icon={<CircleAlert size={18} strokeWidth={2} />}
        action={<span className="nums grid size-9 place-items-center rounded-full bg-warning-soft font-display text-[14px] font-extrabold text-warning">{stuck.length}</span>}
      />
      <motion.ul
        initial="hide" animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: delay + 0.2 } } }}
        className="flex flex-col gap-1"
      >
        {stuck.map((r) => (
          <motion.li
            key={r.t}
            variants={{ hide: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0, transition: { duration: 0.45, ease } } }}
          >
            <button onClick={() => go(r.to)} className="group flex w-full items-center gap-3 rounded-[16px] p-2.5 text-left transition-colors hover:bg-surface-2">
              <span className={cn(
                'grid size-10 shrink-0 place-items-center rounded-full',
                r.tone === 'warn' ? 'bg-warning-soft text-warning' : 'bg-brand-50 text-brand-600',
              )}>
                <r.icon size={17} strokeWidth={2.1} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-snug text-ink">{r.t}</span>
                <span className="block text-[12.5px] text-ink-2">{r.s}</span>
              </span>
              {/* На узкой колонке шеврон, чтобы заголовки не переносились; вся строка кликабельна */}
              <span className="hidden shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors group-hover:bg-brand-600 group-hover:text-white 2xl:block">
                {r.a}
              </span>
              <ChevronRight size={17} strokeWidth={2.2} aria-hidden className="shrink-0 text-ink-3 transition-colors group-hover:text-brand-600 2xl:hidden" />
            </button>
          </motion.li>
        ))}
      </motion.ul>
    </Card>
  )
}

/* ───────────── Сбор взносов: сколько не оплатили и куда идти ───────────── */

function Collection({ go, delay }: { go: Go; delay: number }) {
  const c = collection
  return (
    <Card delay={delay} lift={false} className="flex flex-col gap-5 xl:col-span-7">
      <CardHead
        title="Сбор взносов за сентябрь"
        sub="начислено 2 400 000 ₸"
        icon={<Wallet size={18} strokeWidth={2} />}
      />

      <div className="grid items-end gap-6 sm:grid-cols-[auto_1fr]">
        <div>
          <p className="nums font-display text-[56px] font-extrabold leading-none tracking-[-0.04em] text-ink">
            <Num to={c.debtors} />
          </p>
          <p className="mt-2 text-[15px] font-semibold text-ink">помещений не оплатили</p>
          <p className="mt-0.5 text-[13.5px] text-ink-2">к доплате 271 500 ₸</p>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] font-medium text-ink-2">Собрано</span>
            <span className="nums font-display text-[22px] font-extrabold tracking-[-0.03em] text-ink">
              <Num to={c.pct} decimals={1} /><span className="text-[15px] text-ink-3">%</span>
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${c.pct}%` }}
              transition={{ duration: 0.9, delay: delay + 0.35, ease }}
              className="h-full rounded-full bg-brand-500"
            />
          </div>
          <p className="nums mt-2 text-[13px] text-ink-2">2 098 000 из 2 400 000 ₸</p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-surface-2 p-3 pl-4">
        <span className="flex items-center gap-2.5 text-[13.5px] text-ink">
          <CircleAlert size={16} strokeWidth={2.2} className="shrink-0 text-warning" />
          3 помещения не платят 3 месяца и дольше
        </span>
        <Btn onClick={() => go('Должники')}><Users size={16} strokeWidth={2.2} /> Список должников</Btn>
      </div>
    </Card>
  )
}

/* ───────────── Счета дома: единственная акцентная заливка ───────────── */

export function Accounts({ go, delay, className }: { go?: Go; delay: number; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
      className={cn('flex flex-col overflow-hidden rounded-card bg-[linear-gradient(155deg,var(--color-brand-500),var(--color-brand-700))] p-5 text-white', className)}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-bold tracking-[-0.01em]">Счета дома</h2>
          <p className="mt-0.5 text-[12.5px] text-white/75">остаток на 16 сентября</p>
        </div>
        {go && (
          <button onClick={() => go('Финансы')} aria-label="Открыть финансы" className="grid size-9 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25">
            <ArrowUpRight size={17} strokeWidth={2} />
          </button>
        )}
      </header>

      <div className="mt-5 flex items-center gap-2 text-[12.5px] text-white/80">
        <Landmark size={14} strokeWidth={2} /> Текущий счёт · •••• 4021
      </div>
      <div className="mt-1.5"><Tenge to={1840000} size={32} light /></div>

      <div className="-mx-5 mt-3"><Sparkline id="acc-line" values={[1.42, 1.61, 1.38, 1.72, 1.55, 1.9, 1.67, 1.84]} /></div>

      <div className="mt-auto rounded-[16px] bg-white/12 p-3.5">
        <div className="flex items-center gap-2 text-[12.5px] text-white/80">
          <PiggyBank size={14} strokeWidth={2} /> Капремонт · сберегательный
        </div>
        <div className="mt-1"><Tenge to={4200000} size={21} light /></div>
        <p className="mt-1 text-[12px] text-white/75">тратится только по решению собрания</p>
      </div>
    </motion.section>
  )
}

/* ───────────── Экран ───────────── */

export function Dashboard({ go }: { go: Go }) {
  return (
    <>
      <PageHead
        title={<>С возвращением, <span className="text-ink-3">Бауыржан</span></>}
        sub="ЖК Асыл Арман, блок 3. Среда, 16 сентября"
        actions={
          <>
            <HeadBtn icon={Mic}>Задачи голосом</HeadBtn>
            <Btn className="!rounded-full" onClick={() => go('Новый расход')}><Plus size={16} strokeWidth={2.4} /> Внести расход</Btn>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <Urgent go={go} delay={0.08} />
        <Attention go={go} delay={0.15} />
        <Collection go={go} delay={0.22} />
        <Accounts go={go} delay={0.29} className="xl:col-span-5" />
      </div>
    </>
  )
}
