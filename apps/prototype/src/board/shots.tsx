import type { ReactNode } from 'react'
import { LayoutGroup } from 'motion/react'
import { Phone } from '../components/Phone'
import { ChairmanWeb } from '../screens/web/ChairmanWeb'
import { ChairmanApp } from '../screens/mobile/ChairmanApp'
import { WorkerApp } from '../screens/worker/WorkerApp'
import { ResidentApp } from '../screens/resident/ResidentApp'

/* Реестр всех экранов прототипа: из него строятся доска экранов и экспорт PNG.
   Каждый экран рендерится живым интерфейсом, а не картинкой. */

export type Kind = 'web' | 'phone'
export type Group = 'web' | 'chair' | 'worker' | 'resident'
export type Shot = { id: string; group: Group; kind: Kind; title: string; ux: string; render: () => ReactNode }

export const WEB = { w: 1440, h: 900 }
export const PHONE = { w: 352, h: 822 }

// Своя LayoutGroup на кадр: иначе пилюля навигации (layoutId) перелетает между веб-кадрами доски
const web = (initial: string) => () => <LayoutGroup id={`b-web-${initial}`}><ChairmanWeb initial={initial} /></LayoutGroup>
const phone = (node: ReactNode) => () => <Phone>{node}</Phone>

export const groups: { g: Group; title: string; sub: string }[] = [
  { g: 'web', title: 'Веб-кабинет председателя', sub: 'Вдумчивая работа за столом: отчёты, голосования, финансы, реестр' },
  { g: 'chair', title: 'Председатель · мобильное', sub: 'Реактивная работа на ходу: заявки, поручения, объявления' },
  { g: 'worker', title: 'Работник · мобильное', sub: 'Один экран с тем, что делать сегодня. В перчатках и без сети' },
  { g: 'resident', title: 'Жилец · мобильное', sub: 'Участие в жизни дома и прозрачность бюджета' },
]

export const shots: Shot[] = [
  /* ───────── веб-кабинет ───────── */
  { id: 'web-dashboard', group: 'web', kind: 'web', title: 'Дашборд', render: web('Дашборд'),
    ux: 'Четыре блока: что срочно, что застряло, кто не оплатил, сколько на счетах. Каждый ведёт в свой раздел.' },
  { id: 'web-requests', group: 'web', kind: 'web', title: 'Заявки', render: web('Заявки'),
    ux: 'Срочные сверху, критичная с красной полосой. Справа план ИИ и назначение исполнителя в три клика.' },
  { id: 'web-tasks', group: 'web', kind: 'web', title: 'Задачи', render: web('Задачи'),
    ux: 'Сначала приёмка работ с фото и переключателями «жильцам» и «в отчёт», ниже все задачи.' },
  { id: 'web-votes', group: 'web', kind: 'web', title: 'Голосования', render: web('Голосования'),
    ux: 'Явка с отметкой порога 50%. Распределение голосов скрыто до закрытия, чтобы никто не напоминал выборочно.' },
  { id: 'web-vote-wizard', group: 'web', kind: 'web', title: 'Новое голосование · тип', render: web('Новое голосование'),
    ux: 'Порог выводится из типа решения автоматически: ошибку, которая делает протокол ничтожным, допустить нельзя.' },
  { id: 'web-vote-dates', group: 'web', kind: 'web', title: 'Новое голосование · сроки', render: web('Новое голосование · сроки'),
    ux: 'Начать раньше чем через 5 дней нельзя, ошибка объясняет закон. Без площадей рассылка заблокирована.' },
  { id: 'web-finance', group: 'web', kind: 'web', title: 'Финансы', render: web('Финансы'),
    ux: 'Чеки жильцов на подтверждение сверху. Операции в таблице, каждая с чеком или актом.' },
  { id: 'web-expense', group: 'web', kind: 'web', title: 'Новый расход · чек', render: web('Новый расход'),
    ux: 'Расход начинается с фото чека, а не с пустой формы.' },
  { id: 'web-expense-form', group: 'web', kind: 'web', title: 'Новый расход · форма', render: web('Новый расход · форма'),
    ux: 'ИИ заполнил форму, на чеке подсвечено распознанное. Статья только из справочника официального отчёта.' },
  { id: 'web-debtors', group: 'web', kind: 'web', title: 'Должники', render: web('Должники'),
    ux: 'Видит только правление. Фильтр по сроку долга, напоминание одним нажатием.' },
  { id: 'web-reports', group: 'web', kind: 'web', title: 'Отчёт', render: web('Отчёты'),
    ux: 'Подписать нельзя, пока не приложены документы: проблему видно за 4 дня до срока, а не на собрании.' },
  { id: 'web-residents', group: 'web', kind: 'web', title: 'Жильцы', render: web('Жильцы'),
    ux: 'Вступление со сверкой по реестру. Площади, без которых нельзя голосовать, заполняются прямо в таблице.' },
  { id: 'web-staff', group: 'web', kind: 'web', title: 'Персонал', render: web('Персонал'),
    ux: 'Истекающий договор сверху. Переключатель «виден жильцам» управляет прозрачностью.' },
  { id: 'web-news', group: 'web', kind: 'web', title: 'Объявления', render: web('Объявления'),
    ux: 'Статистика прочтений по подъездам. Прочитало меньше половины: кнопка напоминания рядом с цифрой.' },
  { id: 'web-docs', group: 'web', kind: 'web', title: 'Документы', render: web('Документы'),
    ux: 'Неподписанное всегда сверху. Отчёты и протоколы публикуются жильцам после подписи.' },
  { id: 'web-assistant', group: 'web', kind: 'web', title: 'Юридический помощник', render: web('Помощник'),
    ux: 'Ответ только со ссылкой на статью закона, иначе честное «не нашёл». В конце кнопка действия.' },
  { id: 'web-settings', group: 'web', kind: 'web', title: 'Настройки', render: web('Настройки'),
    ux: 'Уведомления, приглашение бухгалтера по телефону, язык интерфейса.' },

  /* ───────── председатель, мобильное ───────── */
  { id: 'chm-tasks', group: 'chair', kind: 'phone', title: 'Задачи', render: phone(<ChairmanApp id="b-chm-tasks" initial={0} />),
    ux: 'От push до назначенного исполнителя три нажатия. Работы принимаются с фото.' },
  { id: 'chm-voice', group: 'chair', kind: 'phone', title: 'Поручить · запись', render: phone(<ChairmanApp id="b-chm-voice" initial={1} />),
    ux: 'Обход дома голосом: одна кнопка, без формы.' },
  { id: 'chm-voice-review', group: 'chair', kind: 'phone', title: 'Поручить · разбор', render: phone(<ChairmanApp id="b-chm-review" initial={1} voiceReview />),
    ux: 'ИИ разбил запись на задачи и подобрал исполнителей. Ничего не уходит без проверки.' },
  { id: 'chm-news', group: 'chair', kind: 'phone', title: 'Объявления', render: phone(<ChairmanApp id="b-chm-news" initial={2} />),
    ux: 'Объявление об аварии уходит в дом за минуту, прямо со двора.' },

  /* ───────── работник ───────── */
  { id: 'wrk-list', group: 'worker', kind: 'phone', title: 'Мои задачи', render: phone(<WorkerApp id="b-wrk-list" />),
    ux: 'Срочно, сегодня, по расписанию. Метка «нужно фото» заранее, чтобы не возвращаться в подвал.' },
  { id: 'wrk-task', group: 'worker', kind: 'phone', title: 'Задача', render: phone(<WorkerApp id="b-wrk-task" initialView={{ name: 'task', id: 2 }} />),
    ux: 'Фото от жильца до выезда: мастер сразу берёт нужный инструмент.' },
  { id: 'wrk-complete', group: 'worker', kind: 'phone', title: 'Завершение', render: phone(<WorkerApp id="b-wrk-done" initialView={{ name: 'complete', id: 2 }} />),
    ux: 'Кнопки 56 px под перчатки, комментарий в одно касание. Без сети отметка уходит в очередь.' },
  { id: 'wrk-news', group: 'worker', kind: 'phone', title: 'Объявления', render: phone(<WorkerApp id="b-wrk-news" initialTab={1} />),
    ux: 'Только для всех и для персонала. Финансы и чужие заявки работник не видит.' },

  /* ───────── жилец ───────── */
  { id: 'res-home', group: 'resident', kind: 'phone', title: 'Главная', render: phone(<ResidentApp id="b-res-home" />),
    ux: 'Сначала то, что ждёт участия: взносы и голосование. Когда ничего не нужно, блок исчезает.' },
  { id: 'res-vote', group: 'resident', kind: 'phone', title: 'Голосование', render: phone(<ResidentApp id="b-res-vote" initialViews={{ home: 'vote' }} />),
    ux: 'Крупные варианты ответа, порог решения рядом с вопросом, подпись через eGov mobile.' },
  { id: 'res-voted', group: 'resident', kind: 'phone', title: 'Голос учтён', render: phone(<ResidentApp id="b-res-voted" initialViews={{ home: 'vote' }} initialVote={{ choice: 'За', at: '16 сентября, 14:32' }} />),
    ux: 'Вес голоса по площади показан явно: жилец ждёт «один человек, один голос».' },
  { id: 'res-new', group: 'resident', kind: 'phone', title: 'Новая заявка', render: phone(<ResidentApp id="b-res-new" initialTab={1} initialViews={{ req: { name: 'new' } }} />),
    ux: 'Место плитками, а не списком. Дальше уточнение, категория, описание и фото.' },
  { id: 'res-track', group: 'resident', kind: 'phone', title: 'Ход заявки', render: phone(<ResidentApp id="b-res-track" initialTab={1} initialViews={{ req: { name: 'track', id: 47 } }} />),
    ux: 'Этапы, исполнитель и фото, принятые председателем. Видно, что проблемой занимаются.' },
  { id: 'res-fin', group: 'resident', kind: 'phone', title: 'Бюджет дома', render: phone(<ResidentApp id="b-res-fin" initialTab={2} />),
    ux: 'Главный экран доверия: каждая строка раскрывается до чека и акта. Должники поимённо скрыты.' },
  { id: 'res-pay', group: 'resident', kind: 'phone', title: 'Мои платежи', render: phone(<ResidentApp id="b-res-pay" initialTab={2} initialViews={{ fin: 'mine' }} />),
    ux: 'Kaspi с заполненными реквизитами, затем фото чека. Зачёт подтверждает председатель.' },
  { id: 'res-house', group: 'resident', kind: 'phone', title: 'Мой дом', render: phone(<ResidentApp id="b-res-house" initialTab={3} initialViews={{ more: 'house' }} />),
    ux: 'Кто работает в доме, подрядчики, опубликованные отчёты и протоколы.' },
]
