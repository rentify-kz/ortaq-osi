/* Синтетические данные прототипа веб-кабинета председателя.
   Сценарий брифа: ЖК Асыл Арман, блок 3, 16 сентября 2026. */

/* ───────────── заявки ───────────── */

export type Prio = 'crit' | 'high' | 'norm'
export type ReqStatus = 'new' | 'progress'
export type Stage = { title: string; who?: string; when?: string; state: 'done' | 'now' | 'next' }

export type Request = {
  id: number
  title: string
  prio: Prio
  status: ReqStatus
  place: string
  author: string
  ago: string
  photos: number
  quote: string
  executor?: string
  reports?: number
  ai?: string
  plan?: { step: string; who: string }[]
  stages?: Stage[]
}

export const requests: Request[] = [
  {
    id: 51, title: 'Прорыв трубы', prio: 'crit', status: 'new',
    place: 'Подвал, 3 подъезд', author: 'Асанов Д., кв. 78', ago: '2 часа назад', photos: 2,
    quote: 'Из трубы в подвале хлещет вода, уже затопило половину',
    ai: 'Критический приоритет: риск затопления. Нужен сантехник',
    plan: [
      { step: 'Перекрыть стояк в подвале', who: 'сантехник, сразу' },
      { step: 'Осмотреть и определить объём', who: 'сантехник, сегодня' },
      { step: 'Закупить материалы', who: 'председатель' },
      { step: 'Заменить участок трубы', who: 'сантехник' },
      { step: 'Проверить и составить акт', who: 'председатель' },
    ],
  },
  {
    id: 52, title: 'Не закрывается дверь подъезда', prio: 'norm', status: 'new',
    place: '1 подъезд', author: 'Ким С., кв. 112', ago: '40 минут назад', photos: 1,
    quote: 'Сломался доводчик, дверь не закрывается до конца',
    ai: 'Обычный приоритет. Подойдёт дворник или электрик',
  },
  {
    id: 46, title: 'Мусор у детской площадки', prio: 'norm', status: 'new',
    place: 'Двор', author: 'Оспанова А., кв. 14', ago: 'вчера', photos: 1,
    quote: 'Возле горки уже третий день стоят пакеты с мусором',
  },
  {
    id: 44, title: 'Перегорела лампа на 5 этаже', prio: 'norm', status: 'new',
    place: '3 подъезд, 5 этаж', author: 'Галиев Р., кв. 31', ago: '2 дня назад', photos: 0,
    quote: 'Вечером на площадке совсем темно',
  },
  {
    id: 49, title: 'Не работает лифт', prio: 'high', status: 'progress',
    place: '2 подъезд', author: '4 обращения от разных жильцов', ago: 'вчера', photos: 3, reports: 4,
    quote: 'Лифт стоит между 6 и 7 этажом, кнопки не реагируют',
    executor: 'ТОО «Лифт-Сервис»',
    stages: [
      { title: 'Вызов мастера', who: 'председатель', when: '15 сен', state: 'done' },
      { title: 'Диагностика', who: 'ТОО «Лифт-Сервис»', when: 'в работе', state: 'now' },
      { title: 'Ремонт', state: 'next' },
      { title: 'Проверка и акт', state: 'next' },
    ],
  },
  {
    id: 47, title: 'Течь в подвале', prio: 'norm', status: 'progress',
    place: 'Подвал, 2 подъезд', author: 'Смагулов А., кв. 45', ago: '5 дней назад', photos: 2,
    quote: 'Под трубой отопления лужа, капает постоянно',
    executor: 'Сергей П.',
    stages: [
      { title: 'Осмотр', who: 'Сергей П.', when: '12 сен', state: 'done' },
      { title: 'Закуп материалов', who: 'Иванов И.', when: '13 сен', state: 'done' },
      { title: 'Замена участка трубы', who: 'Сергей П.', when: 'в работе', state: 'now' },
      { title: 'Проверка и акт', state: 'next' },
    ],
  },
]

/* ───────────── персонал ───────────── */

export type Worker = { name: string; role: string; load: number; contractor?: boolean }

export const workers: Worker[] = [
  { name: 'Сергей П.', role: 'сантехник', load: 2 },
  { name: 'Нурлан Б.', role: 'дворник', load: 0 },
  { name: 'Ерлан Т.', role: 'электрик', load: 1 },
  { name: 'Айгуль К.', role: 'уборщица', load: 5 },
  { name: 'ТОО «Лифт-Сервис»', role: 'лифты, договор до 31.12', load: 1, contractor: true },
]

/* ───────────── задачи ───────────── */

export type Task = {
  t: string; place: string; who: string; due: string
  state: 'progress' | 'overdue' | 'scheduled'; photo: boolean; req?: number
}

export const tasks: Task[] = [
  { t: 'Замена участка трубы', place: 'Подвал, 2 подъезд', who: 'Сергей П.', due: 'сегодня', state: 'progress', photo: true, req: 47 },
  { t: 'Проверить давление в системе', place: '2 подъезд', who: 'Сергей П.', due: 'сегодня', state: 'progress', photo: false },
  { t: 'Заменить лампу на 5 этаже', place: '3 подъезд, 5 этаж', who: 'Ерлан Т.', due: 'вчера', state: 'overdue', photo: true, req: 44 },
  { t: 'Диагностика лифта', place: '2 подъезд', who: 'ТОО «Лифт-Сервис»', due: '17 сен', state: 'progress', photo: true, req: 49 },
  { t: 'Влажная уборка МОП', place: 'все подъезды', who: 'Айгуль К.', due: 'каждый день', state: 'scheduled', photo: false },
  { t: 'Обход техпомещений', place: 'подвал', who: 'Сергей П.', due: 'каждую пятницу', state: 'scheduled', photo: true },
  { t: 'Покос травы у фасада', place: 'двор', who: 'Нурлан Б.', due: '18 сен', state: 'progress', photo: true },
]

export type Approval = { t: string; who: string; when: string; photos: number; comment: string }

export const approvals: Approval[] = [
  { t: 'Дезинсекция подвала', who: 'Нурлан Б.', when: 'сегодня, 11:20', photos: 3, comment: 'Обработал все три секции, двери закрыл на сутки' },
  { t: 'Ремонт козырька, 1 подъезд', who: 'Сергей П.', when: 'вчера, 17:05', photos: 2, comment: 'Заменил лист и герметик, течи нет' },
]

/* ───────────── голосования ───────────── */

export const activeVote = {
  title: 'Замена лифта во 2 подъезде',
  kind: 'Крупный расход, нужно 2/3 голосов',
  turnout: 42.3,
  need: 50,
  voted: 54,
  total: 128,
  left: '3 дня 4 часа',
  ends: '26 сентября',
}

export type PastVote = {
  title: string; date: string; quorum: number
  result: 'accepted' | 'rejected' | 'failed'; protocol: 'signed' | 'unsigned'
}

export const pastVotes: PastVote[] = [
  { title: 'Утверждение сметы на 2026 год', date: '28.08.2026', quorum: 63.8, result: 'accepted', protocol: 'unsigned' },
  { title: 'Установка шлагбаума во дворе', date: '14.06.2026', quorum: 58.1, result: 'rejected', protocol: 'signed' },
  { title: 'Ремонт кровли над 3 подъездом', date: '02.04.2026', quorum: 71.4, result: 'accepted', protocol: 'signed' },
  { title: 'Смена обслуживающей организации', date: '18.02.2026', quorum: 44.9, result: 'failed', protocol: 'signed' },
]

/* ───────────── финансы ───────────── */

export type OpStatus = 'draft' | 'done' | 'missing'
export type Op = { date: string; t: string; sub: string; who: string; amount: number; status: OpStatus }

export const ops: Op[] = [
  { date: '16.09.2026', t: 'Уборка МОП, 1-15 сентября', sub: 'Статья 6.2.1 · чек, акт', who: 'ТОО «Таза Сервис»', amount: -110000, status: 'draft' },
  { date: '15.09.2026', t: 'Взносы через Kaspi', sub: 'Статья 5.1 · 38 платежей', who: 'Собственники', amount: 323000, status: 'done' },
  { date: '13.09.2026', t: 'Труба ПП 32 мм, хомуты', sub: 'Статья 6.3 · заявка №47, чек', who: 'Строймаркет', amount: -18400, status: 'missing' },
  { date: '12.09.2026', t: 'Обслуживание лифтов', sub: 'Статья 6.2.2 · акт', who: 'ТОО «Лифт-Сервис»', amount: -180000, status: 'done' },
  { date: '11.09.2026', t: 'Электроэнергия МОП, август', sub: 'Статья 6.2.3 · счёт', who: 'Энергосбыт', amount: -64300, status: 'done' },
  { date: '10.09.2026', t: 'Оплата труда дворника, август', sub: 'Статья 6.1.2 · ведомость', who: 'Нурлан Б.', amount: -120000, status: 'done' },
]

export type Check = { flat: number; owner: string; amount: number; when: string; what: string }

export const checks: Check[] = [
  { flat: 45, owner: 'Смагулов А.', amount: 8500, when: 'сегодня, 09:12', what: 'Взнос за сентябрь' },
  { flat: 78, owner: 'Асанов Д.', amount: 17000, when: 'вчера, 21:40', what: 'Взносы за апрель и май' },
  { flat: 112, owner: 'Ким С.', amount: 8500, when: '14 сен, 18:03', what: 'Взнос за сентябрь' },
]

export const collection = { pct: 87.4, collected: 2098000, charged: 2400000, debtors: 16, debt: 271500, longDebtors: 3 }

/* ───────────── должники ───────────── */

export type Debtor = { flat: number; owner: string; debt: number; months: number; last: string }

export const debtors: Debtor[] = [
  { flat: 78, owner: 'Асанов Д.', debt: 42500, months: 5, last: '12 апреля' },
  { flat: 9, owner: 'Жумабаев Е.', debt: 42500, months: 5, last: '3 апреля' },
  { flat: 112, owner: 'Ким С.', debt: 25500, months: 3, last: '20 июня' },
  { flat: 45, owner: 'Смагулов А.', debt: 17000, months: 2, last: '15 июля' },
  { flat: 23, owner: 'Ли В.', debt: 17000, months: 2, last: '9 июля' },
  { flat: 61, owner: 'Нуртаева Г.', debt: 17000, months: 2, last: '22 июля' },
  { flat: 90, owner: 'Петренко О.', debt: 16500, months: 2, last: '30 июля' },
  { flat: 101, owner: 'Сейткали М.', debt: 17000, months: 2, last: '18 июля' },
  { flat: 127, owner: 'Абенов Т.', debt: 17000, months: 2, last: '11 июля' },
  { flat: 14, owner: 'Оспанова А.', debt: 8500, months: 1, last: '19 августа' },
  { flat: 31, owner: 'Галиев Р.', debt: 8500, months: 1, last: '24 августа' },
  { flat: 56, owner: 'Иванова Н.', debt: 8500, months: 1, last: '21 августа' },
  { flat: 70, owner: 'Бекова Д.', debt: 8500, months: 1, last: '25 августа' },
  { flat: 84, owner: 'Тлеубаев К.', debt: 8500, months: 1, last: '17 августа' },
  { flat: 96, owner: 'Мамырова С.', debt: 8500, months: 1, last: '28 августа' },
  { flat: 118, owner: 'Хасенов Б.', debt: 8500, months: 1, last: '23 августа' },
]

/* ───────────── отчёт ───────────── */

export type ReportLine = { code: string; t: string; v: number; sub?: boolean }

export const report = {
  income: [
    { code: '5.1', t: 'Ежемесячные взносы', v: 1740000 },
    { code: '5.2', t: 'Взносы на капремонт', v: 320000 },
    { code: '5.3', t: 'Аренда общего имущества', v: 40000 },
  ] as ReportLine[],
  expense: [
    { code: '6.1', t: 'Управление объектом', v: 600000 },
    { code: '6.1.1', t: 'Оплата труда за бухучёт', v: 200000, sub: true },
    { code: '6.1.2', t: 'Оплата труда за управление', v: 280000, sub: true },
    { code: '6.1.3', t: 'Обязательные платежи в бюджет', v: 85000, sub: true },
    { code: '6.1.4', t: 'Банковские услуги', v: 35000, sub: true },
    { code: '6.2', t: 'Содержание общего имущества', v: 640000 },
    { code: '6.3', t: 'Текущий ремонт', v: 310000 },
    { code: '6.5', t: 'Коммунальные услуги', v: 180000 },
  ] as ReportLine[],
  missing: [
    { t: 'Текущий ремонт', doc: 'акт', v: 95000, date: '22.08.2026' },
    { t: 'Хозрасходы', doc: 'чек', v: 18000, date: '27.08.2026' },
  ],
  works: 12,
}

/* ───────────── жильцы и помещения ───────────── */

export type JoinRequest = {
  name: string; flat: number; phone: string; relation: 'собственник' | 'наниматель'; note: string
  registry: { kind: 'match' | 'mismatch' | 'tenant'; text: string }
}

export const joinRequests: JoinRequest[] = [
  {
    name: 'Тулегенов Арман', flat: 63, phone: '+7 707 ••• •• 32', relation: 'собственник',
    note: 'Купил квартиру в июне, прошу добавить',
    registry: { kind: 'match', text: 'В реестре: кв. 63, Тулегенов А. С.' },
  },
  {
    name: 'Ким Виктория', flat: 112, phone: '+7 701 ••• •• 85', relation: 'собственник',
    note: 'Квартира перешла мне по наследству от отца',
    registry: { kind: 'mismatch', text: 'В реестре: кв. 112, Ким С. ФИО не совпадает' },
  },
  {
    name: 'Сарсенова Айым', flat: 15, phone: '+7 747 ••• •• 10', relation: 'наниматель',
    note: 'Снимаю квартиру с сентября, хочу получать объявления',
    registry: { kind: 'tenant', text: 'Наниматель: голосовать не сможет' },
  },
]

export type UnitStatus = 'verified' | 'pending' | 'absent'
export type Unit = {
  flat: number; entrance: number; floor: number; area: number | null
  owner: string; residents: number; status: UnitStatus
}

/** Помещения без площади: пока они есть, голосования заблокированы */
export const NO_AREA = [17, 33, 48, 64, 81, 97, 105, 122]

const knownOwners: Record<number, string> = {
  9: 'Жумабаев Е.', 14: 'Оспанова А.', 23: 'Ли В.', 31: 'Галиев Р.', 45: 'Смагулов А.', 56: 'Иванова Н.',
  61: 'Нуртаева Г.', 63: 'Тулегенов А.', 70: 'Бекова Д.', 78: 'Асанов Д.', 84: 'Тлеубаев К.', 90: 'Петренко О.',
  96: 'Мамырова С.', 101: 'Сейткали М.', 112: 'Ким С.', 118: 'Хасенов Б.', 127: 'Абенов Т.',
}
const surnames = [
  'Ахметова Л.', 'Байжанов Р.', 'Волкова Е.', 'Габдуллин М.', 'Демченко И.', 'Ермекова А.', 'Жакупов С.',
  'Исаева М.', 'Калиев Б.', 'Лукпанова Ж.', 'Мусин Т.', 'Назарова О.', 'Омаров К.', 'Пак Д.', 'Рахимова Н.',
  'Садыков А.', 'Тимофеев П.', 'Уалиева Д.', 'Федорова Т.', 'Хамитов Е.', 'Цой А.', 'Шаймерденов Н.',
]
const areas = [62.4, 48.7, 74.1, 55.3]

// 4 подъезда по 32 помещения, 8 этажей по 4 квартиры
export const units: Unit[] = Array.from({ length: 128 }, (_, i) => {
  const flat = i + 1
  const status: UnitStatus = flat % 7 === 0 ? 'pending' : flat % 5 === 0 ? 'absent' : 'verified'
  return {
    flat,
    entrance: Math.ceil(flat / 32),
    floor: Math.ceil((((flat - 1) % 32) + 1) / 4),
    area: NO_AREA.includes(flat) ? null : areas[(flat - 1) % 4],
    owner: knownOwners[flat] ?? surnames[i % surnames.length],
    residents: status === 'absent' ? 0 : 1 + (flat % 3 === 0 ? 1 : 0),
    status,
  }
})

/* ───────────── персонал и подрядчики ───────────── */

export type Staff = { name: string; role: string; schedule: string; phone: string; today: number; visible: boolean }

export const staff: Staff[] = [
  { name: 'Сергей Попов', role: 'Сантехник', schedule: 'пн-пт, 9:00-18:00', phone: '+7 701 512 34 08', today: 2, visible: true },
  { name: 'Нурлан Бекенов', role: 'Дворник', schedule: 'ежедневно, 7:00-16:00', phone: '+7 705 118 72 41', today: 1, visible: true },
  { name: 'Ерлан Тасмагамбетов', role: 'Электрик', schedule: 'по вызову', phone: '+7 777 903 15 66', today: 1, visible: true },
  { name: 'Айгуль Касымова', role: 'Уборщица', schedule: 'пн-сб, 8:00-14:00', phone: '+7 708 440 27 19', today: 5, visible: false },
]

export type Contractor = { name: string; bin: string; service: string; until: string; daysLeft: number; visible: boolean }

export const contractors: Contractor[] = [
  { name: 'ТОО «Таза Сервис»', bin: '190340021876', service: 'Уборка МОП', until: '10.10.2026', daysLeft: 24, visible: true },
  { name: 'ТОО «Лифт-Сервис»', bin: '180540012345', service: 'Обслуживание лифтов', until: '31.12.2026', daysLeft: 106, visible: true },
  { name: 'ИП «Дезконтроль»', bin: '850712300554', service: 'Дезинсекция и дератизация', until: '31.03.2027', daysLeft: 196, visible: true },
]

/* ───────────── объявления ───────────── */

export type Announcement = {
  id: number; title: string; text: string; audience: string; when: string
  read: number; total: number; byEntrance?: number[]; pinned?: boolean
  /** Только что опубликовано: рано судить о прочтениях */
  fresh?: boolean
}

export const announcements: Announcement[] = [
  {
    id: 4, title: 'Отключение горячей воды 18-19 сентября',
    text: 'Плановые работы на теплотрассе. Воду дадут к 20:00 19 сентября.',
    audience: 'Всем жильцам', when: 'вчера, 18:30', read: 34, total: 128, byEntrance: [12, 9, 8, 5], pinned: true,
  },
  {
    id: 3, title: 'Дезинсекция подвала в четверг',
    text: 'С 10:00 до 13:00 подвал будет закрыт. Не оставляйте вещи у дверей подвала.',
    audience: '3 подъезд', when: '14 сентября', read: 26, total: 32,
  },
  {
    id: 2, title: 'Открыто голосование по замене лифта',
    text: 'Голосуйте в приложении до 26 сентября. Материалы и коммерческие предложения приложены.',
    audience: 'Всем жильцам', when: '12 сентября', read: 101, total: 128, byEntrance: [27, 24, 26, 24],
  },
  {
    id: 1, title: 'График уборки на сентябрь',
    text: 'Влажная уборка МОП ежедневно, мытьё окон в подъездах 25 сентября.',
    audience: 'Только персоналу', when: '1 сентября', read: 4, total: 4,
  },
]

/* ───────────── документы ───────────── */

export type DocKind = 'report' | 'protocol' | 'contract' | 'act' | 'other'
export type Doc = {
  title: string; kind: DocKind; date: string; size: string
  access: 'public' | 'board'; sign: 'signed' | 'unsigned' | 'none'
}

export const documents: Doc[] = [
  { title: 'Протокол №5: утверждение сметы на 2026 год', kind: 'protocol', date: '28.08.2026', size: 'PDF, 180 КБ', access: 'public', sign: 'unsigned' },
  { title: 'Отчёт за июль 2026', kind: 'report', date: '12.08.2026', size: 'PDF, 420 КБ', access: 'public', sign: 'signed' },
  { title: 'Акт: обслуживание лифтов, август', kind: 'act', date: '31.08.2026', size: 'PDF, 96 КБ', access: 'public', sign: 'signed' },
  { title: 'Отчёт за июнь 2026', kind: 'report', date: '14.07.2026', size: 'PDF, 398 КБ', access: 'public', sign: 'signed' },
  { title: 'Протокол №4: установка шлагбаума', kind: 'protocol', date: '14.06.2026', size: 'PDF, 164 КБ', access: 'public', sign: 'signed' },
  { title: 'Акт: ремонт кровли над 3 подъездом', kind: 'act', date: '20.05.2026', size: 'PDF, 1,2 МБ', access: 'public', sign: 'signed' },
  { title: 'Договор с ТОО «Лифт-Сервис»', kind: 'contract', date: '01.01.2026', size: 'PDF, 610 КБ', access: 'board', sign: 'signed' },
  { title: 'Договор с ТОО «Таза Сервис»', kind: 'contract', date: '10.10.2025', size: 'PDF, 540 КБ', access: 'board', sign: 'signed' },
  { title: 'Устав ОСИ', kind: 'other', date: '15.03.2024', size: 'PDF, 290 КБ', access: 'public', sign: 'none' },
  { title: 'Технический паспорт дома', kind: 'other', date: '02.02.2024', size: 'PDF, 8,4 МБ', access: 'board', sign: 'none' },
]
