import { motion } from 'motion/react'
import { Monitor, Smartphone, Clock3, Sparkles, ArrowUpRight } from 'lucide-react'
import { cn, ease } from '../lib/cn'

/* Персонажи вымышленные: собраны из ролей, сценариев docs/ и того, что построено в прототипе */

type Persona = {
  initials: string
  name: string
  meta: string
  role: string
  quote: string
  context: { icon: 'desk' | 'phone' | 'time'; text: string }[]
  tech: number
  goals: string[]
  pains: string[]
  helps: string[]
  screens: { id: string; label: string }[]
}

const personas: Persona[] = [
  {
    initials: 'БК', name: 'Бауыржан Кенжебаев', meta: '44 года, инженер, председатель ОСИ второй год', role: 'Председатель',
    quote: 'Заявки тонут в WhatsApp, чеки лежат в кармане, а до 20-го надо сдать отчёт',
    context: [{ icon: 'desk', text: 'Ноутбук вечером, 20-40 минут' }, { icon: 'phone', text: 'Телефон на обходе, 30 секунд' }], tech: 4,
    goals: ['Не терять заявки и быстро раздавать работу', 'Сдать отчёт до 20 числа без ночных сверок', 'Провести голосование, которое не оспорят', 'Показать жильцам, куда уходят деньги'],
    pains: ['Сотни сообщений в общем чате', 'Чеки теряются до вечера', 'Закон наизусть не знает, боится ошибиться', 'Собрание не собрать физически'],
    helps: ['«Требует внимания» показывает застрявшее, а не ленту', 'Поручения голосом на обходе', 'Расход от фото чека, статья из справочника', 'Мастер голосования сам ставит порог и сроки'],
    screens: [{ id: 'web-dashboard', label: 'Дашборд' }, { id: 'chm-voice-review', label: 'Поручить' }, { id: 'web-expense-form', label: 'Новый расход' }, { id: 'web-vote-dates', label: 'Голосование' }],
  },
  {
    initials: 'АС', name: 'Айгерим Смагулова', meta: '34 года, менеджер в банке, собственница кв. 45', role: 'Жилец',
    quote: 'Плачу каждый месяц, а куда уходят деньги, непонятно',
    context: [{ icon: 'phone', text: 'Телефон между делами, 1-2 минуты' }, { icon: 'time', text: 'Двое детей, на собрания нет времени' }], tech: 5,
    goals: ['Сообщить о проблеме и видеть, что ей занимаются', 'Платить без квитанций и очередей', 'Голосовать, не выходя из дома'],
    pains: ['Заявка в чате уходит вверх и забывается', 'Нет прозрачности расходов', 'Не понимает, почему её голос «весит» иначе'],
    helps: ['Заявка за минуту, место плитками, фото', 'Ход заявки по этапам с фото работ', 'Бюджет раскрывается до чека и акта', 'Вес голоса по площади объяснён словами'],
    screens: [{ id: 'res-home', label: 'Главная' }, { id: 'res-new', label: 'Новая заявка' }, { id: 'res-fin', label: 'Бюджет дома' }, { id: 'res-voted', label: 'Голос учтён' }],
  },
  {
    initials: 'РП', name: 'Раиса Петровна', meta: '71 год, пенсионерка, собственница кв. 12', role: 'Жилец, пожилой',
    quote: 'Мелкие буквы не вижу, а в чате всё быстро убегает наверх',
    context: [{ icon: 'phone', text: 'Android, системный шрифт увеличен' }, { icon: 'time', text: 'Помогает внучка по выходным' }], tech: 2,
    goals: ['Понять, сколько платить и за что', 'Проголосовать без похода во двор', 'Дозвониться председателю'],
    pains: ['Мелкий серый текст', 'Длинные формы и выпадающие списки', 'Страх нажать не то и что-то сломать'],
    helps: ['Крупные кнопки и плитки вместо списков', 'Макет держит 200% системного шрифта', 'Перед подписью голоса явное подтверждение', 'Кнопка звонка председателю в «Мой дом»'],
    screens: [{ id: 'res-vote', label: 'Голосование' }, { id: 'res-pay', label: 'Мои платежи' }, { id: 'res-house', label: 'Мой дом' }],
  },
  {
    initials: 'СП', name: 'Сергей Попов', meta: '39 лет, сантехник ОСИ в штате', role: 'Работник',
    quote: 'Скажите, что делать и где, а не три сообщения в разных чатах',
    context: [{ icon: 'phone', text: 'Подвалы без связи' }, { icon: 'time', text: 'В перчатках, одной рукой' }], tech: 3,
    goals: ['Понятный список на день', 'Отметить работу без писанины', 'Не ходить в подвал дважды'],
    pains: ['Поручения по телефону забываются', 'В подвале нет сети', 'Спорят, сделал ли он работу'],
    helps: ['Задачи по срочности, рутина отдельно', '«Нужно фото» видно заранее', 'Кнопки 56 px и комментарий в одно касание', 'Без сети отметка уходит в очередь сама'],
    screens: [{ id: 'wrk-list', label: 'Мои задачи' }, { id: 'wrk-task', label: 'Задача' }, { id: 'wrk-complete', label: 'Завершение' }],
  },
]

const ctxIcon = { desk: Monitor, phone: Smartphone, time: Clock3 }

function Tech({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-2 text-[13px] text-ink-2">
      Уверенность с техникой
      <span className="flex gap-1" aria-label={`${n} из 5`}>
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className={cn('h-2 w-5 rounded-full', i <= n ? 'bg-brand-500' : 'bg-surface-3')} />)}
      </span>
    </span>
  )
}

function List({ title, items, tone }: { title: string; items: string[]; tone: 'mute' | 'warn' | 'brand' }) {
  return (
    <div className={cn('rounded-[18px] p-4', tone === 'brand' ? 'bg-brand-50' : tone === 'warn' ? 'bg-warning-soft' : 'bg-surface-2')}>
      <p className={cn('flex items-center gap-1.5 text-[13.5px] font-semibold', tone === 'brand' ? 'text-brand-700' : tone === 'warn' ? 'text-warning' : 'text-ink')}>
        {tone === 'brand' && <Sparkles size={14} strokeWidth={2.2} />} {title}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((i) => <li key={i} className="text-[14px] leading-snug text-ink">{i}</li>)}
      </ul>
    </div>
  )
}

/* ───────────── связи ролей ───────────── */

function Ecosystem() {
  const node = (x: number, y: number, label: string, sub: string, fill: string, ink = 'var(--color-ink)') => (
    <g>
      <rect x={x - 96} y={y - 34} width={192} height={68} rx={34} fill={fill} />
      <text x={x} y={y - 4} textAnchor="middle" fontFamily="Manrope" fontWeight={800} fontSize={17} fill={ink}>{label}</text>
      <text x={x} y={y + 17} textAnchor="middle" fontFamily="Onest" fontSize={13} fill={ink} opacity={0.8}>{sub}</text>
    </g>
  )
  const label = (x: number, y: number, text: string) => (
    <g>
      <rect x={x - text.length * 3.7 - 10} y={y - 14} width={text.length * 7.4 + 20} height={26} rx={13} fill="var(--color-surface)" />
      <text x={x} y={y + 4} textAnchor="middle" fontFamily="Onest" fontSize={12.5} fill="var(--color-ink-2)">{text}</text>
    </g>
  )
  const arrow = (d: string) => <path d={d} fill="none" stroke="var(--color-brand-400)" strokeWidth={2} markerEnd="url(#persona-arrow)" />
  return (
    <svg viewBox="0 0 900 310" className="h-auto w-full" role="img" aria-label="Связи ролей: жильцы, председатель, работник">
      <defs>
        <marker id="persona-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-brand-400)" />
        </marker>
      </defs>
      {arrow('M 246 98 C 360 40, 510 40, 620 98')}
      {arrow('M 620 128 C 510 180, 360 180, 246 128')}
      {arrow('M 720 148 C 720 220, 640 252, 552 252')}
      {arrow('M 348 252 C 250 252, 150 222, 150 150')}
      {node(150, 114, 'Жильцы', 'Айгерим, Раиса Петровна', 'var(--color-surface-2)')}
      {node(720, 114, 'Председатель', 'Бауыржан', 'var(--color-brand-600)', '#fff')}
      {node(450, 252, 'Работник', 'Сергей', 'var(--color-surface-2)')}
      {label(433, 52, 'заявка, взнос, голос')}
      {label(433, 172, 'ход работ, отчёт, объявления')}
      {label(700, 236, 'поручение')}
      {label(222, 236, 'фото после приёмки')}
    </svg>
  )
}

export function Personas() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[26px] bg-surface p-6">
        <p className="font-display text-[17px] font-bold text-ink">Кто с кем связан</p>
        <p className="mt-1 text-[14px] text-ink-2">Председатель в центре: всё, что делают жильцы и работник, проходит через его решение</p>
        <div className="mx-auto mt-4 max-w-[900px]"><Ecosystem /></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {personas.map((p, i) => (
          <motion.article
            key={p.name}
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.5, delay: (i % 2) * 0.08, ease }}
            className="flex flex-col gap-4 rounded-[26px] bg-surface p-6"
          >
            <header className="flex items-start gap-4">
              <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-100 font-display text-[20px] font-extrabold text-brand-700">{p.initials}</span>
              <div className="min-w-0 flex-1">
                <span className="inline-flex h-7 items-center rounded-full bg-brand-600 px-3 text-[12.5px] font-semibold text-white">{p.role}</span>
                <h3 className="mt-2 font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-ink">{p.name}</h3>
                <p className="text-[14px] text-ink-2">{p.meta}</p>
              </div>
            </header>

            <blockquote className="font-display text-[19px] font-bold leading-snug tracking-[-0.01em] text-ink">«{p.quote}»</blockquote>

            <div className="flex flex-wrap gap-2">
              {p.context.map((c) => {
                const Icon = ctxIcon[c.icon]
                return (
                  <span key={c.text} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[13px] text-ink">
                    <Icon size={14} strokeWidth={2.2} /> {c.text}
                  </span>
                )
              })}
            </div>
            <Tech n={p.tech} />

            <div className="grid gap-3 sm:grid-cols-2">
              <List title="Цели" items={p.goals} tone="mute" />
              <List title="Боли сегодня" items={p.pains} tone="warn" />
            </div>
            <List title="Как помогает Ortaq" items={p.helps} tone="brand" />

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-ink-2">Ключевые экраны</span>
              {p.screens.map((s) => (
                <a key={s.id} href={`#shot/${s.id}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full bg-surface-2 px-3 text-[13px] font-medium text-ink transition-colors hover:bg-brand-50 hover:text-brand-700">
                  {s.label} <ArrowUpRight size={13} strokeWidth={2.2} />
                </a>
              ))}
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  )
}
