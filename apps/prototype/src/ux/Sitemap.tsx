import { Monitor, Smartphone, PanelBottom, CircleDot, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

/* Карта всех построенных экранов. kind: раздел навигации, вложенный экран, нижний лист, состояние экрана */

type Kind = 'section' | 'screen' | 'sheet' | 'state'
type Node = { t: string; kind?: Kind; shot?: string; children?: Node[] }
type App = { title: string; platform: string; nav: string; icon: LucideIcon; tree: Node[] }

const apps: App[] = [
  {
    title: 'Веб-кабинет председателя', platform: 'Веб', nav: 'Верхнее меню 6 разделов и боковая рейка', icon: Monitor,
    tree: [
      { t: 'Дашборд', shot: 'web-dashboard' },
      { t: 'Заявки', shot: 'web-requests', children: [{ t: 'Карточка заявки и план ИИ', kind: 'screen' }, { t: 'Назначение исполнителя', kind: 'state' }] },
      { t: 'Задачи', shot: 'web-tasks', children: [{ t: 'Приёмка работы с фото', kind: 'state' }] },
      { t: 'Голосования', shot: 'web-votes', children: [{ t: 'Новое голосование', kind: 'screen', shot: 'web-vote-wizard', children: [{ t: 'Тема и тип', kind: 'state' }, { t: 'Вопросы и материалы', kind: 'state' }, { t: 'Сроки и рассылка', kind: 'state', shot: 'web-vote-dates' }] }] },
      { t: 'Финансы', shot: 'web-finance', children: [{ t: 'Новый расход', kind: 'screen', shot: 'web-expense', children: [{ t: 'Распознавание чека', kind: 'state' }, { t: 'Форма и проведение', kind: 'state', shot: 'web-expense-form' }] }, { t: 'Должники', kind: 'screen', shot: 'web-debtors' }] },
      { t: 'Отчёты', shot: 'web-reports' },
      { t: 'Жильцы', shot: 'web-residents', children: [{ t: 'Заявки на вступление', kind: 'state' }, { t: 'Помещения и площади', kind: 'state' }] },
      { t: 'Персонал', shot: 'web-staff' },
      { t: 'Объявления', shot: 'web-news', children: [{ t: 'Новое объявление', kind: 'state' }] },
      { t: 'Документы', shot: 'web-docs' },
      { t: 'Помощник', shot: 'web-assistant' },
      { t: 'Настройки', shot: 'web-settings' },
    ],
  },
  {
    title: 'Председатель', platform: 'Мобильное', nav: 'Нижняя панель, 3 вкладки', icon: Smartphone,
    tree: [
      { t: 'Задачи', shot: 'chm-tasks', children: [{ t: 'Назначение исполнителя', kind: 'sheet' }, { t: 'Приёмка работы', kind: 'sheet' }] },
      { t: 'Поручить', shot: 'chm-voice', children: [{ t: 'Голосом: запись', kind: 'state' }, { t: 'Разбор задач ИИ', kind: 'state', shot: 'chm-voice-review' }, { t: 'Вручную: форма', kind: 'state' }] },
      { t: 'Объявления', shot: 'chm-news', children: [{ t: 'Новое объявление', kind: 'sheet' }] },
    ],
  },
  {
    title: 'Работник', platform: 'Мобильное', nav: 'Нижняя панель, 3 вкладки', icon: Smartphone,
    tree: [
      { t: 'Мои задачи', shot: 'wrk-list', children: [{ t: 'Задача', kind: 'screen', shot: 'wrk-task', children: [{ t: 'Завершение с фото', kind: 'screen', shot: 'wrk-complete' }, { t: 'Отправлено или в очереди', kind: 'state' }] }, { t: 'Далее на неделе', kind: 'state' }] },
      { t: 'Объявления', shot: 'wrk-news' },
      { t: 'Профиль' },
    ],
  },
  {
    title: 'Жилец', platform: 'Мобильное', nav: 'Нижняя панель, 4 вкладки', icon: Smartphone,
    tree: [
      { t: 'Главная', shot: 'res-home', children: [{ t: 'Голосование', kind: 'screen', shot: 'res-vote', children: [{ t: 'Подпись в eGov mobile', kind: 'sheet' }, { t: 'Голос учтён', kind: 'state', shot: 'res-voted' }] }] },
      { t: 'Заявки', children: [{ t: 'Новая заявка', kind: 'screen', shot: 'res-new', children: [{ t: 'Место, уточнение, категория, описание', kind: 'state' }, { t: 'Похожая заявка: подписка', kind: 'state' }, { t: 'Заявка принята', kind: 'state' }] }, { t: 'Ход заявки', kind: 'screen', shot: 'res-track', children: [{ t: 'Комментарий или фото', kind: 'sheet' }] }] },
      { t: 'Финансы', children: [{ t: 'Бюджет дома', kind: 'screen', shot: 'res-fin', children: [{ t: 'Чек или акт', kind: 'sheet' }] }, { t: 'Мои платежи', kind: 'screen', shot: 'res-pay', children: [{ t: 'Kaspi и загрузка чека', kind: 'sheet' }] }] },
      { t: 'Ещё', children: [{ t: 'Объявления', kind: 'screen' }, { t: 'Мой дом', kind: 'screen', shot: 'res-house' }, { t: 'Профиль', kind: 'screen' }] },
    ],
  },
]

function Pill({ n }: { n: Node }) {
  const kind = n.kind ?? 'section'
  const body = (
    <span className={cn(
      'inline-flex min-h-9 items-center gap-1.5 rounded-[12px] px-3 py-1.5 text-[14px] leading-snug',
      kind === 'section' && 'bg-ink font-semibold text-white',
      kind === 'screen' && 'bg-surface-2 font-medium text-ink',
      kind === 'sheet' && 'bg-brand-50 text-brand-800',
      kind === 'state' && 'bg-transparent px-1 text-ink-2',
    )}>
      {kind === 'sheet' && <PanelBottom size={14} strokeWidth={2.2} />}
      {kind === 'state' && <CircleDot size={12} strokeWidth={2.4} className="shrink-0 text-ink-3" />}
      {n.t}
    </span>
  )
  return n.shot ? <a href={`#shot/${n.shot}`} target="_blank" rel="noreferrer" className="transition-opacity hover:opacity-80">{body}</a> : body
}

/** Ветка дерева: линии связей нарисованы фоном, без рамок */
function Branch({ nodes }: { nodes: Node[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {nodes.map((n, i) => (
        <li key={n.t} className="relative pl-5">
          <span aria-hidden className={cn('absolute left-[7px] top-0 w-0.5 bg-surface-3', i === nodes.length - 1 ? 'h-[18px]' : 'h-full')} />
          <span aria-hidden className="absolute left-[7px] top-[17px] h-0.5 w-3 bg-surface-3" />
          <Pill n={n} />
          {n.children && <div className="mt-1.5"><Branch nodes={n.children} /></div>}
        </li>
      ))}
    </ul>
  )
}

export function Sitemap() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3 text-[13px] text-ink-2">
        <span className="inline-flex items-center gap-2"><span className="h-5 w-8 rounded-[8px] bg-ink" /> раздел навигации</span>
        <span className="inline-flex items-center gap-2"><span className="h-5 w-8 rounded-[8px] bg-surface" /> вложенный экран</span>
        <span className="inline-flex items-center gap-2"><span className="h-5 w-8 rounded-[8px] bg-brand-50" /> нижний лист</span>
        <span className="inline-flex items-center gap-2"><CircleDot size={13} strokeWidth={2.4} className="text-ink-3" /> состояние экрана</span>
        <span>Узлы со ссылкой открывают экран</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-4">
        {apps.map((a) => (
          <section key={a.title} className="flex flex-col gap-4 rounded-[26px] bg-surface p-6">
            <header className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><a.icon size={19} strokeWidth={2} /></span>
              <div>
                <p className="font-display text-[18px] font-extrabold leading-tight text-ink">{a.title}</p>
                <p className="text-[13px] text-ink-2">{a.platform}. {a.nav}</p>
              </div>
            </header>
            <Branch nodes={a.tree} />
          </section>
        ))}
      </div>
    </div>
  )
}
