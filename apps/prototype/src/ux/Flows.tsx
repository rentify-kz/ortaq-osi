import { Fragment } from 'react'
import { motion } from 'motion/react'
import { ArrowUpRight, Sparkles, CircleHelp, ChevronDown, Target } from 'lucide-react'
import { cn, ease } from '../lib/cn'

/* Потоки описаны маленьким языком: шаги идут сверху вниз, развилка делит поток на «да» и «нет»,
   после развилки поток снова сходится. Ветка, которая заканчивается узлом end, дальше не идёт. */

type Screen = { id: string; label: string }
type F =
  | { k: 'start' | 'end' | 'action' | 'system'; t: string; screen?: Screen }
  | { k: 'decision'; t: string; yes: F[]; no: F[]; yesLabel?: string; noLabel?: string }

type Flow = { title: string; who: string; goal: string; metric: string; steps: F[] }

const flows: Flow[] = [
  {
    title: 'Сообщить о проблеме', who: 'Жилец', goal: 'Заявка принята и видна председателю', metric: '1 минута, 5 касаний',
    steps: [
      { k: 'start', t: 'Заметила проблему в доме' },
      { k: 'action', t: '«Сообщить о проблеме» на главной', screen: { id: 'res-home', label: 'Главная' } },
      { k: 'action', t: 'Место плиткой, подъезд и этаж', screen: { id: 'res-new', label: 'Новая заявка' } },
      { k: 'action', t: 'Категория, описание, фото' },
      { k: 'system', t: 'ИИ ищет похожие открытые заявки' },
      {
        k: 'decision', t: 'Похожая заявка уже есть?',
        yes: [{ k: 'action', t: 'Подписаться на неё' }, { k: 'end', t: 'Получает уведомления о ходе работ' }],
        no: [{ k: 'system', t: 'Заявка уходит председателю' }, { k: 'end', t: '«Заявка №53 принята»' }],
      },
    ],
  },
  {
    title: 'От push до исполнителя', who: 'Председатель, телефон', goal: 'Аварийная заявка назначена до выхода из дома', metric: '3 нажатия',
    steps: [
      { k: 'start', t: 'Push: «Новая заявка №51, прорыв трубы»' },
      { k: 'action', t: 'Открыть карточку заявки', screen: { id: 'chm-tasks', label: 'Задачи' } },
      { k: 'system', t: 'ИИ: критично, нужен сантехник' },
      { k: 'action', t: '«Назначить»: список, свободные сверху' },
      {
        k: 'decision', t: 'Подходит исполнитель, которого советует ИИ?',
        yes: [], no: [{ k: 'action', t: 'Выбрать другого, видна загрузка' }],
      },
      { k: 'action', t: '«Назначить и уведомить»' },
      { k: 'end', t: 'Сантехник получил задачу' },
    ],
  },
  {
    title: 'Выполнить задачу', who: 'Работник', goal: 'Работа отмечена с фото, даже в подвале без связи', metric: 'Без ввода текста',
    steps: [
      { k: 'start', t: 'Открыл «Мои задачи»', screen: { id: 'wrk-list', label: 'Мои задачи' } },
      { k: 'action', t: '«Взять» срочную задачу' },
      { k: 'action', t: 'Смотрит фото жильца, начинает работу', screen: { id: 'wrk-task', label: 'Задача' } },
      { k: 'action', t: 'Снимает результат, комментарий касанием', screen: { id: 'wrk-complete', label: 'Завершение' } },
      {
        k: 'decision', t: 'Есть сеть?',
        yes: [{ k: 'system', t: 'Отправлено на проверку' }],
        no: [{ k: 'system', t: 'Сохранено в очередь' }, { k: 'system', t: 'Появилась сеть: догрузилось само' }],
      },
      { k: 'action', t: 'Председатель принимает работу', screen: { id: 'web-tasks', label: 'Задачи' } },
      { k: 'end', t: 'Жильцы видят фото результата' },
    ],
  },
  {
    title: 'Провести голосование', who: 'Председатель, веб', goal: 'Законное голосование, протокол которого не оспорят', metric: '3 шага мастера',
    steps: [
      { k: 'start', t: 'Нужно решение собрания' },
      { k: 'action', t: 'Тема и тип решения', screen: { id: 'web-vote-wizard', label: 'Новое голосование' } },
      { k: 'system', t: 'Порог выводится сам: 2/3 или большинство' },
      { k: 'action', t: 'Вопросы и материалы' },
      { k: 'action', t: 'Дата начала', screen: { id: 'web-vote-dates', label: 'Сроки' } },
      {
        k: 'decision', t: 'Не раньше чем через 5 дней?',
        yes: [], no: [{ k: 'system', t: 'Ошибка объясняет закон' }, { k: 'end', t: 'Выбрать дату позже' }],
      },
      {
        k: 'decision', t: 'У всех помещений есть площадь?',
        yes: [], no: [{ k: 'action', t: 'Загрузить реестр', screen: { id: 'web-residents', label: 'Жильцы' } }],
      },
      { k: 'action', t: '«Разослать уведомление»' },
      { k: 'system', t: 'Жильцы подписывают голос в eGov, напоминания за 3 дня, 1 день, 4 часа' },
      { k: 'end', t: 'Протокол формируется сам' },
    ],
  },
  {
    title: 'Оплатить взнос', who: 'Жилец', goal: 'Взнос оплачен и засчитан без бумажных квитанций', metric: '2 минуты',
    steps: [
      { k: 'start', t: 'На главной: «Взносы 17 000 ₸»', screen: { id: 'res-home', label: 'Главная' } },
      { k: 'action', t: '«Оплатить через Kaspi»', screen: { id: 'res-pay', label: 'Мои платежи' } },
      { k: 'action', t: 'Оплата в Kaspi с готовыми реквизитами' },
      { k: 'action', t: '«Загрузить чек»' },
      { k: 'system', t: 'ИИ сверяет сумму и дату с начислением' },
      {
        k: 'decision', t: 'Совпало?',
        yes: [{ k: 'system', t: '«Чек принят, ждёт подтверждения»' }],
        no: [{ k: 'system', t: 'Флаг для председателя: сумма меньше' }],
      },
      { k: 'action', t: 'Председатель подтверждает', screen: { id: 'web-finance', label: 'Финансы' } },
      { k: 'end', t: 'Взнос засчитан, просрочка исчезает' },
    ],
  },
  {
    title: 'Внести расход', who: 'Председатель, веб', goal: 'Расход в нужной строке отчёта, с документом для жильцов', metric: 'От чека, а не от формы',
    steps: [
      { k: 'start', t: 'Оплатил услугу подрядчика' },
      { k: 'action', t: 'Фото чека', screen: { id: 'web-expense', label: 'Новый расход' } },
      { k: 'system', t: 'ИИ заполнил сумму, дату, получателя' },
      { k: 'action', t: 'Выбрать статью из справочника', screen: { id: 'web-expense-form', label: 'Форма' } },
      {
        k: 'decision', t: 'Статья требует документ или подрядчика?',
        yes: [{ k: 'action', t: 'Приложить акт или выбрать подрядчика' }], no: [],
      },
      { k: 'action', t: '«Провести»' },
      { k: 'end', t: 'Расход в отчёте и в бюджете у жильцов' },
    ],
  },
]

/* ───────────── отрисовка ───────────── */

function Link({ s }: { s: Screen }) {
  return (
    <a href={`#shot/${s.id}`} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-full bg-surface px-2.5 text-[12px] font-semibold text-brand-700 hover:bg-brand-100">
      {s.label} <ArrowUpRight size={12} strokeWidth={2.4} />
    </a>
  )
}

function Line() {
  return (
    <span aria-hidden className="flex flex-col items-center">
      <span className="h-4 w-0.5 bg-surface-3" />
      <ChevronDown size={14} strokeWidth={2.6} className="-mt-1 text-ink-3" />
    </span>
  )
}

function Node({ f }: { f: Exclude<F, { k: 'decision' }> }) {
  const base = 'flex max-w-[240px] flex-col items-center text-center text-[13.5px] leading-snug'
  if (f.k === 'start' || f.k === 'end') {
    return (
      <div className={base}>
        <span className={cn('rounded-full px-4 py-2 font-semibold', f.k === 'start' ? 'bg-ink text-white' : 'bg-brand-600 text-white')}>{f.t}</span>
        {f.screen && <Link s={f.screen} />}
      </div>
    )
  }
  return (
    <div className={cn(base, 'rounded-[14px] px-3.5 py-2.5', f.k === 'system' ? 'bg-brand-50 text-brand-800' : 'bg-surface-2 text-ink')}>
      {f.k === 'system' && <span className="mb-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-700"><Sparkles size={11} strokeWidth={2.4} /> система</span>}
      <span className={f.k === 'action' ? 'font-medium' : ''}>{f.t}</span>
      {f.screen && <Link s={f.screen} />}
    </div>
  )
}

function Stack({ steps }: { steps: F[] }) {
  return (
    <div className="flex flex-col items-center">
      {steps.map((f, i) => (
        <Fragment key={i}>
          {i > 0 && <Line />}
          {f.k === 'decision' ? (
            <div className="flex w-full flex-col items-center">
              <div className="flex max-w-[240px] items-center gap-2 rounded-[14px] bg-warning-soft px-3.5 py-2.5 text-center text-[13.5px] font-semibold leading-snug text-ink">
                <CircleHelp size={15} strokeWidth={2.4} className="shrink-0 text-warning" /> {f.t}
              </div>
              <div className="mt-1 grid w-full grid-cols-2 gap-2">
                {([['yes', f.yesLabel ?? 'Да', f.yes], ['no', f.noLabel ?? 'Нет', f.no]] as const).map(([key, label, branch]) => (
                  <div key={key} className="flex flex-col items-center">
                    <Line />
                    <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-bold', key === 'yes' ? 'bg-brand-100 text-brand-800' : 'bg-surface-3 text-ink-2')}>{label}</span>
                    {branch.length > 0
                      ? <><Line /><Stack steps={branch} /></>
                      : <span className="mt-1 text-[12px] text-ink-3">дальше</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : <Node f={f} />}
        </Fragment>
      ))}
    </div>
  )
}

export function Flows() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3 text-[13px] text-ink-2">
        <span className="inline-flex items-center gap-2"><span className="h-5 w-8 rounded-full bg-ink" /> начало</span>
        <span className="inline-flex items-center gap-2"><span className="h-5 w-8 rounded-[8px] bg-surface" /> действие пользователя</span>
        <span className="inline-flex items-center gap-2"><span className="h-5 w-8 rounded-[8px] bg-brand-50" /> система или ИИ</span>
        <span className="inline-flex items-center gap-2"><span className="h-5 w-8 rounded-[8px] bg-warning-soft" /> развилка</span>
        <span className="inline-flex items-center gap-2"><span className="h-5 w-8 rounded-full bg-brand-600" /> результат</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        {flows.map((fl, i) => (
          <motion.section
            key={fl.title}
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.5, delay: (i % 3) * 0.06, ease }}
            className="flex flex-col gap-5 rounded-[26px] bg-surface p-6"
          >
            <header>
              <span className="inline-flex h-7 items-center rounded-full bg-surface-2 px-3 text-[12.5px] font-semibold text-ink-2">{fl.who}</span>
              <h3 className="mt-2 font-display text-[20px] font-extrabold tracking-[-0.02em] text-ink">{fl.title}</h3>
              <p className="mt-1 flex items-start gap-1.5 text-[13.5px] text-ink-2"><Target size={14} strokeWidth={2.2} className="mt-0.5 shrink-0" /> {fl.goal}</p>
              <span className="mt-2 inline-flex h-7 items-center rounded-full bg-brand-50 px-3 text-[12.5px] font-semibold text-brand-700">{fl.metric}</span>
            </header>
            <Stack steps={fl.steps} />
          </motion.section>
        ))}
      </div>
    </div>
  )
}
