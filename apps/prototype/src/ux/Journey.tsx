import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import { Segmented } from '../components/web/ui'
import { cn, ease } from '../lib/cn'

/* Сквозные пути через роли: каждый шаг привязан к построенному экрану */

type Step = {
  stage: string
  who: 'Айгерим' | 'Бауыржан' | 'Сергей'
  does: string
  screen?: { id: string; label: string }
  thinks: string
  /** Эмоция от -2 (раздражение) до 2 (удовлетворение) */
  mood: number
  moodLabel: string
  pain: string
  gain: string
}

const journeys: Record<'request' | 'money', { title: string; sub: string; steps: Step[] }> = {
  request: {
    title: 'Проблема в доме',
    sub: 'Течь в подвале: от того, кто заметил, до того, кто увидел результат',
    steps: [
      { stage: 'Заметила', who: 'Айгерим', does: 'Утром видит лужу в подвале 2 подъезда', thinks: 'Опять течёт. Написать в чат? Там утонет', mood: -1.6, moodLabel: 'тревога', pain: 'Непонятно, кому писать и приняли ли сообщение', gain: 'Кнопка «Сообщить о проблеме» на главной' },
      { stage: 'Сообщила', who: 'Айгерим', does: 'Место плиткой, подъезд, категория, фото', screen: { id: 'res-new', label: 'Новая заявка' }, thinks: 'Минута, и у меня есть номер заявки', mood: 0.2, moodLabel: 'спокойнее', pain: 'Звонить председателю, объяснять на словах', gain: 'Заявка за минуту, ИИ проверил дубликаты' },
      { stage: 'Разобрал', who: 'Бауыржан', does: 'Push, карточка, «Назначить», сантехник по совету ИИ', screen: { id: 'chm-tasks', label: 'Задачи' }, thinks: 'Три нажатия, и я поехал на работу', mood: 0.9, moodLabel: 'контроль', pain: 'Заявка ждёт, пока председатель дойдёт до компьютера', gain: 'От push до исполнителя три нажатия' },
      { stage: 'Выполнил', who: 'Сергей', does: 'Видит фото жильца, берёт инструмент, без сети отмечает работу', screen: { id: 'wrk-complete', label: 'Завершение' }, thinks: 'Отметил и пошёл, фото уйдут сами', mood: 1, moodLabel: 'ясность', pain: 'Нет связи, потом спорят, сделал ли', gain: 'Офлайн-очередь и фото как доказательство' },
      { stage: 'Принял', who: 'Бауыржан', does: 'Смотрит фото, включает «жильцам» и «в отчёт»', screen: { id: 'web-tasks', label: 'Задачи' }, thinks: 'Фото сразу и для жильцов, и для отчёта', mood: 1.4, moodLabel: 'уверенность', pain: 'Акт теряется к отчёту', gain: 'Одно подтверждение закрывает два требования' },
      { stage: 'Увидела', who: 'Айгерим', does: 'Открывает ход заявки, смотрит фото, ставит оценку', screen: { id: 'res-track', label: 'Ход заявки' }, thinks: 'Видно, кто и что сделал', mood: 2, moodLabel: 'доверие', pain: '«Непонятно, что делает ОСИ»', gain: 'Этапы, исполнитель и фото в одном экране' },
    ],
  },
  money: {
    title: 'Взнос и отчёт',
    sub: 'Деньги дома за месяц: от напоминания жильцу до опубликованного отчёта',
    steps: [
      { stage: 'Напоминание', who: 'Айгерим', does: 'На главной видит «Взносы 17 000 ₸, есть просрочка»', screen: { id: 'res-home', label: 'Главная' }, thinks: 'Я и забыла про август', mood: -0.8, moodLabel: 'неловкость', pain: 'Бумажная квитанция в почтовом ящике', gain: 'Сумма и срок первым блоком на главной' },
      { stage: 'Оплата', who: 'Айгерим', does: 'Kaspi с реквизитами, затем фото чека', screen: { id: 'res-pay', label: 'Мои платежи' }, thinks: 'Не надо ничего переписывать', mood: 0.9, moodLabel: 'легко', pain: 'Реквизиты вручную, чек потом не найти', gain: 'Реквизиты подставлены, чек распознан' },
      { stage: 'Проверка', who: 'Бауыржан', does: 'Подтверждает чеки жильцов в финансах', screen: { id: 'web-finance', label: 'Финансы' }, thinks: 'Сумма и дата уже сверены', mood: 0.6, moodLabel: 'рутина', pain: 'Сверять переводы по выписке вручную', gain: 'ИИ сверил, решение за человеком' },
      { stage: 'Расход', who: 'Бауыржан', does: 'Оплатил уборку, сфотографировал чек, провёл по статье 6.2.1', screen: { id: 'web-expense-form', label: 'Новый расход' }, thinks: 'Чек не потеряется до вечера', mood: 1, moodLabel: 'порядок', pain: 'Чеки в кармане, статьи угадываются', gain: 'Расход от чека, статья из справочника' },
      { stage: 'Отчёт', who: 'Бауыржан', does: 'Черновик собран сам, приложил недостающий акт, подписал', screen: { id: 'web-reports', label: 'Отчёт' }, thinks: 'Узнал про акт за 4 дня до срока, а не на собрании', mood: 1.5, moodLabel: 'облегчение', pain: 'Ночь сверок перед 20 числом', gain: 'Предупреждение о документах до подписи' },
      { stage: 'Прозрачность', who: 'Айгерим', does: 'Открывает бюджет дома, смотрит чек на уборку', screen: { id: 'res-fin', label: 'Бюджет дома' }, thinks: 'Вижу, куда ушли мои деньги', mood: 2, moodLabel: 'доверие', pain: 'Недоверие к ОСИ и споры на собраниях', gain: 'Те же цифры, что в отчёте, до каждого чека' },
    ],
  },
}

const whoTone = { Айгерим: 'bg-surface-2 text-ink', Бауыржан: 'bg-brand-600 text-white', Сергей: 'bg-brand-100 text-brand-800' }

function RowLabel({ children }: { children: ReactNode }) {
  return <div className="flex items-start pt-3 text-[13.5px] font-semibold text-ink-2">{children}</div>
}

/** Кривая эмоций по шагам: точки на центрах колонок */
function Mood({ steps }: { steps: Step[] }) {
  const n = steps.length
  const y = (m: number) => 50 - m * 20 // -2..2 → 90..10 в процентах высоты
  const pts = steps.map((s, i) => [((i + 0.5) / n) * 100, y(s.mood)] as const)
  const d = pts.map(([x, yy], i) => `${i ? 'L' : 'M'} ${x} ${yy}`).join(' ')
  return (
    <div className="relative h-[150px] rounded-[16px] bg-surface-2" style={{ gridColumn: `span ${n}` }}>
      <span aria-hidden className="absolute inset-x-3 top-1/2 h-px bg-surface-3" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {/* pathLength несовместим с non-scaling-stroke: штрихи считаются в экранных px и линия рвётся */}
        <motion.path
          d={d} fill="none" stroke="var(--color-brand-500)" strokeWidth={2.5} vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round"
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          transition={{ duration: 0.8, ease }}
        />
      </svg>
      {steps.map((s, i) => (
        // Точка стоит ровно в вершине линии, подпись висит под ней
        <div key={s.stage} className="absolute" style={{ left: `${pts[i][0]}%`, top: `${pts[i][1]}%` }}>
          <span className={cn('absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full', s.mood < 0 ? 'bg-warning' : 'bg-brand-600')} />
          <span className={cn('absolute top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-[12px] font-semibold', s.mood < 0 ? 'text-warning' : 'text-brand-700')}>{s.moodLabel}</span>
        </div>
      ))}
    </div>
  )
}

export function Journey() {
  const [key, setKey] = useState<'request' | 'money'>('request')
  const j = journeys[key]
  const cell = 'rounded-[16px] p-3 text-[14px] leading-snug'

  return (
    <div className="rounded-[26px] bg-surface p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-[20px] font-extrabold tracking-[-0.02em] text-ink">{j.title}</p>
          <p className="mt-1 text-[14px] text-ink-2">{j.sub}</p>
        </div>
        <Segmented id="journey" value={key} onChange={setKey} options={[{ v: 'request', label: 'Проблема в доме' }, { v: 'money', label: 'Взнос и отчёт' }]} />
      </div>

      <div className="-mx-2 mt-6 overflow-x-auto px-2 pb-2">
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}
          className="grid min-w-[1180px] gap-2"
          style={{ gridTemplateColumns: `150px repeat(${j.steps.length}, minmax(0, 1fr))` }}
        >
          <span />
          {j.steps.map((s, i) => (
            <div key={s.stage} className="flex items-center gap-2 rounded-[16px] bg-ink px-3 py-2.5 text-white">
              <span className="nums grid size-6 shrink-0 place-items-center rounded-full bg-white/15 text-[12px] font-bold">{i + 1}</span>
              <span className="font-display text-[15px] font-bold">{s.stage}</span>
            </div>
          ))}

          <RowLabel>Кто</RowLabel>
          {j.steps.map((s) => <div key={s.stage} className="pt-1"><span className={cn('inline-flex h-7 items-center rounded-full px-3 text-[13px] font-semibold', whoTone[s.who])}>{s.who}</span></div>)}

          <RowLabel>Что делает</RowLabel>
          {j.steps.map((s) => <div key={s.stage} className={cn(cell, 'bg-surface-2 text-ink')}>{s.does}</div>)}

          <RowLabel>Экран Ortaq</RowLabel>
          {j.steps.map((s) => (
            <div key={s.stage} className="pt-1">
              {s.screen
                ? <a href={`#shot/${s.screen.id}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-50 px-3 text-[13px] font-semibold text-brand-700 hover:bg-brand-100">{s.screen.label} <ArrowUpRight size={13} strokeWidth={2.2} /></a>
                : <span className="text-[13px] text-ink-3">вне приложения</span>}
            </div>
          ))}

          <RowLabel>Мысли</RowLabel>
          {j.steps.map((s) => <div key={s.stage} className={cn(cell, 'bg-surface-2 font-medium text-ink')}>«{s.thinks}»</div>)}

          <RowLabel>Эмоция</RowLabel>
          <Mood steps={j.steps} />

          <RowLabel>Боль без Ortaq</RowLabel>
          {j.steps.map((s) => <div key={s.stage} className={cn(cell, 'bg-warning-soft text-ink')}>{s.pain}</div>)}

          <RowLabel>Что даёт Ortaq</RowLabel>
          {j.steps.map((s) => <div key={s.stage} className={cn(cell, 'bg-brand-50 text-ink')}>{s.gain}</div>)}
        </motion.div>
      </div>
    </div>
  )
}
