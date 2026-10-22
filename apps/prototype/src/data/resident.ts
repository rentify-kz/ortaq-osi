/* Синтетические данные мобильного приложения жильца.
   Айгерим Смагулова, кв. 45: в данных председателя это «Смагулов А.»,
   автор заявки №47 и должник за 2 месяца. */

export const me = {
  name: 'Айгерим Смагулова',
  short: 'Айгерим',
  initials: 'АС',
  flat: 45,
  entrance: 2,
  floor: 4,
  area: 62.4,
  /** Вес голоса = площадь квартиры / общая площадь дома 7 696 м² */
  weight: '0,81%',
  relation: 'собственник',
  house: 'ЖК Асыл Арман, блок 3',
}

/* ───────────── начисления ───────────── */

export type ChargeStatus = 'due' | 'overdue' | 'checking'
export type Charge = { id: string; title: string; period: string; amount: number; due: string; status: ChargeStatus }

export const charges: Charge[] = [
  { id: 'aug', title: 'Взнос на содержание', period: 'август', amount: 8500, due: 'просрочен с 25 августа', status: 'overdue' },
  { id: 'sep', title: 'Взнос на содержание', period: 'сентябрь', amount: 8500, due: 'до 25 сентября', status: 'due' },
]

export const paymentHistory = [
  { period: 'Июль', title: 'Взнос', amount: 8500 },
  { period: 'Июнь', title: 'Взнос', amount: 8500 },
  { period: 'Май', title: 'Взнос', amount: 8500 },
]

/* ───────────── заявки ───────────── */

export type RStage = { title: string; state: 'done' | 'now' | 'next' }
export type REvent = { when: string; text: string; photos?: number }
export type RRequest = {
  id: number; title: string; place: string; status: 'checking' | 'progress' | 'done'
  executor?: string; stages: RStage[]; history: REvent[]; workerPhotos: number; rated?: number
}

export const myRequests: RRequest[] = [
  {
    id: 47, title: 'Течь в подвале', place: 'Подвал, 2 подъезд', status: 'progress',
    executor: 'Сергей П., сантехник', workerPhotos: 2,
    stages: [
      { title: 'Осмотр', state: 'done' },
      { title: 'Закуп материалов', state: 'done' },
      { title: 'Замена участка трубы', state: 'now' },
      { title: 'Проверка и акт', state: 'next' },
    ],
    history: [
      { when: '11 сен', text: 'Заявка принята' },
      { when: '12 сен', text: 'Назначен Сергей П., сантехник' },
      { when: '12 сен', text: 'Этап «Осмотр» выполнен', photos: 2 },
      { when: '13 сен', text: 'Этап «Закуп материалов» выполнен' },
    ],
  },
  {
    id: 38, title: 'Не горит свет на парковке', place: 'Паркинг', status: 'done',
    executor: 'Ерлан Т., электрик', workerPhotos: 1,
    stages: [
      { title: 'Осмотр', state: 'done' },
      { title: 'Замена светильника', state: 'done' },
      { title: 'Проверка', state: 'done' },
    ],
    history: [
      { when: '29 авг', text: 'Заявка принята' },
      { when: '30 авг', text: 'Назначен Ерлан Т., электрик' },
      { when: '2 сен', text: 'Работа выполнена и принята председателем', photos: 1 },
    ],
  },
]

/** Чужие открытые заявки: на них ИИ проверяет дубликаты */
export const openElsewhere = [
  { id: 44, title: 'Перегорела лампа на 5 этаже', place: '3 подъезд, 5 этаж' },
  { id: 46, title: 'Мусор у детской площадки', place: 'Двор' },
]

/* ───────────── бюджет дома ───────────── */

export type Doc = 'Чек' | 'Акт' | 'Счёт' | 'Ведомость' | 'Квитанция'
export type BudgetLine = { t: string; who?: string; v: number; docs: Doc[]; pending?: string }
export type BudgetCat = { n: string; v: number; pc: number; lines: BudgetLine[] }

export const budget = {
  balance: 6040000,
  current: 1840000,
  capital: 4200000,
  pct: 87.4,
  collected: 2100000,
  spent: 1730000,
  cats: [
    {
      n: 'Услуги подрядчиков', v: 640000, pc: 37, lines: [
        { t: 'Уборка МОП', who: 'ТОО «Таза Сервис»', v: 220000, docs: ['Чек', 'Акт'] },
        { t: 'Техобслуживание сетей', v: 200000, docs: ['Акт'] },
        { t: 'Обслуживание лифтов', who: 'ТОО «Лифт-Сервис»', v: 180000, docs: ['Акт'] },
        { t: 'Дезинсекция подвала', who: 'ИП «Дезконтроль»', v: 40000, docs: ['Чек', 'Акт'] },
      ],
    },
    {
      n: 'Оплата труда', v: 480000, pc: 28, lines: [
        { t: 'Управление домом', v: 280000, docs: ['Ведомость'] },
        { t: 'Бухгалтерский учёт', v: 200000, docs: ['Ведомость'] },
      ],
    },
    {
      n: 'Текущий ремонт', v: 310000, pc: 18, lines: [
        { t: 'Ремонт козырька, 1 подъезд', v: 120000, docs: ['Чек', 'Акт'] },
        { t: 'Замена участка трубы, подвал', v: 95000, docs: ['Чек'], pending: 'акт после завершения работ' },
        { t: 'Замена ламп в подъездах', v: 95000, docs: ['Чек'] },
      ],
    },
    {
      n: 'Коммунальные услуги', v: 180000, pc: 10, lines: [
        { t: 'Электроэнергия МОП', v: 120000, docs: ['Счёт'] },
        { t: 'Вода на уборку и полив', v: 60000, docs: ['Счёт'] },
      ],
    },
    { n: 'Налоги и отчисления', v: 85000, pc: 5, lines: [{ t: 'Обязательные платежи в бюджет', v: 85000, docs: ['Квитанция'] }] },
    { n: 'Банковские услуги', v: 35000, pc: 2, lines: [{ t: 'Обслуживание счетов', v: 35000, docs: ['Счёт'] }] },
  ] as BudgetCat[],
}

/* ───────────── объявления ───────────── */

export type RNews = { id: number; title: string; text: string; when: string; to: string; pinned?: boolean }

/** Жилец видит общие объявления и для своего подъезда. Для персонала не видит */
export const residentNews: RNews[] = [
  { id: 1, title: 'Отключение горячей воды 18-19 сентября', text: 'Плановые работы на теплотрассе. Воду дадут к 20:00 19 сентября. Наберите воду заранее.', when: 'вчера', to: 'Подъезды 1-4', pinned: true },
  { id: 2, title: 'Открыто голосование по замене лифта', text: 'Голосуйте в приложении до 26 сентября. Коммерческие предложения и дефектный акт приложены к голосованию.', when: '12 сентября', to: 'Всем жильцам' },
  { id: 3, title: 'Субботник во дворе', text: 'В субботу в 10:00 убираем двор и красим скамейки. Инвентарь выдаст дворник.', when: '5 сентября', to: 'Всем жильцам' },
]
