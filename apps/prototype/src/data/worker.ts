/* Синтетические данные мобильного приложения работника.
   Сергей Попов, сантехник. Те же задачи, что председатель раздал в своём прототипе. */

export const me = {
  name: 'Сергей Попов',
  short: 'Сергей П.',
  role: 'Сантехник',
  house: 'ЖК Асыл Арман, блок 3',
  schedule: 'пн-пт, 9:00-18:00',
  phone: '+7 701 512 34 08',
  chairman: { name: 'Бауыржан Кенжебаев', phone: '+7 701 777 12 40' },
}

export type WState = 'new' | 'todo' | 'progress' | 'review'
export type WGroup = 'urgent' | 'today' | 'routine' | 'later'

export type WTask = {
  id: number
  t: string
  place: string
  req?: { id: number; title: string }
  due: string
  prio: 'crit' | 'high' | 'norm'
  desc: string
  photo: boolean
  residentPhotos: number
  group: WGroup
  state: WState
  repeat?: string
}

export const workerTasks: WTask[] = [
  {
    id: 1, t: 'Перекрыть стояк', place: 'Подвал, 3 подъезд', req: { id: 51, title: 'Прорыв трубы' },
    due: 'до 10:00', prio: 'crit', photo: true, residentPhotos: 2, group: 'urgent', state: 'new',
    desc: 'Из трубы в подвале хлещет вода. Перекрыть стояк холодной воды 3 подъезда, затем осмотреть участок.',
  },
  {
    id: 2, t: 'Замена участка трубы', place: 'Подвал, 2 подъезд', req: { id: 47, title: 'Течь в подвале' },
    due: 'сегодня до 18:00', prio: 'high', photo: true, residentPhotos: 2, group: 'today', state: 'progress',
    desc: 'Заменить прогнивший участок трубы холодного водоснабжения. Материалы закуплены, лежат в подсобке.',
  },
  {
    id: 3, t: 'Проверить давление в системе отопления', place: '2 подъезд',
    due: 'сегодня', prio: 'high', photo: false, residentPhotos: 0, group: 'today', state: 'todo',
    desc: 'Жильцы жалуются на холодные батареи. Проверить давление на вводе и стравить воздух в стояках.',
  },
  {
    id: 4, t: 'Ремонт козырька', place: '1 подъезд',
    due: 'вчера', prio: 'norm', photo: true, residentPhotos: 0, group: 'today', state: 'review',
    desc: 'Заменить лист и загерметизировать стык над входом.',
  },
  {
    id: 5, t: 'Обход техпомещений', place: 'Подвал, все подъезды', repeat: 'каждую пятницу',
    due: 'пятница', prio: 'norm', photo: true, residentPhotos: 0, group: 'routine', state: 'todo',
    desc: 'Осмотреть узлы учёта, задвижки и стояки. Сфотографировать показания счётчиков.',
  },
  {
    id: 6, t: 'Промывка фильтров ИТП', place: 'Тепловой пункт', due: '18 сентября',
    prio: 'norm', photo: true, residentPhotos: 0, group: 'later', state: 'todo',
    desc: 'Промыть грязевики перед началом отопительного сезона.',
  },
  {
    id: 7, t: 'Осмотр стояков 4 подъезда', place: '4 подъезд', due: '19 сентября',
    prio: 'norm', photo: false, residentPhotos: 0, group: 'later', state: 'todo',
    desc: 'Плановый осмотр перед отопительным сезоном.',
  },
]

export type WNews = { id: number; title: string; text: string; when: string; staff: boolean; unread: boolean }

/** Работник видит только объявления для всех и для персонала */
export const workerNews: WNews[] = [
  { id: 1, title: 'Новый график дежурств с 15 сентября', text: 'Дежурный сантехник по выходным: суббота Сергей П., воскресенье по вызову через председателя.', when: 'вчера', staff: true, unread: true },
  { id: 2, title: 'Отключение горячей воды 18-19 сентября', text: 'Плановые работы на теплотрассе. Воду дадут к 20:00 19 сентября.', when: 'вчера', staff: false, unread: true },
  { id: 3, title: 'Инструктаж по электробезопасности', text: 'В четверг в 14:00 в помещении ОСИ. Присутствие обязательно для всего персонала.', when: '3 дня назад', staff: true, unread: false },
  { id: 4, title: 'Открыто голосование по замене лифта', text: 'Голосуют собственники в приложении до 26 сентября.', when: '4 дня назад', staff: false, unread: false },
]
