export const CATEGORY: Record<string, string> = {
  PLUMBING: 'Сантехника', ELECTRICITY: 'Электрика', HEATING: 'Отопление', ELEVATOR: 'Лифт', CLEANING: 'Уборка', YARD: 'Двор',
  FACADE: 'Фасад', ROOF: 'Кровля', BASEMENT: 'Подвал', TRASH: 'Мусор', SECURITY: 'Безопасность', OTHER: 'Другое',
}

/** Где проблема — визуальный выбор, а не выпадающий список (docs/05 §5.2) */
export const PLACES = [
  { v: 'ENTRANCE', label: 'В подъезде' }, { v: 'YARD', label: 'Во дворе' }, { v: 'PARKING', label: 'Паркинг' },
  { v: 'APARTMENT', label: 'В квартире' }, { v: 'FACADE', label: 'Фасад, кровля' }, { v: 'BASEMENT', label: 'Подвал' },
] as const

export const REQUEST_STATUS: Record<string, string> = {
  NEW: 'Новая', TRIAGE: 'Проверяется', ACCEPTED: 'Принята', IN_PROGRESS: 'В работе', DONE: 'Выполнена', REJECTED: 'Отклонена', CANCELLED: 'Отменена',
}

export const TASK_STATUS: Record<string, string> = {
  ASSIGNED: 'Назначена', IN_PROGRESS: 'В работе', SUBMITTED: 'На проверке', APPROVED: 'Принята', REJECTED: 'На доработке', CANCELLED: 'Отменена', EXPIRED: 'Просрочена',
}

export const PRIORITY: Record<string, string> = { CRITICAL: 'Срочно', HIGH: 'Высокий', NORMAL: 'Обычный', LOW: 'Низкий' }

export type RequestRow = {
  id: string; number: number; title: string; category: string; location_label: string; priority: string; status: string
  created_at: string; progress: { done: number; total: number; current_stage: string | null }; assignee: string | null
  reports: number; photos: number; is_mine: boolean
}

/* ───────── оплаты ───────── */

export const CHARGE_TYPE: Record<string, string> = {
  MAINTENANCE: 'Взнос на управление', CAPITAL_REPAIR: 'Взнос на капремонт', PARKING: 'Парковка, кладовка', TARGETED: 'Целевой взнос', OTHER: 'Прочее',
}
export const CHARGE_STATUS: Record<string, string> = { PENDING: 'к оплате', PARTIALLY_PAID: 'оплачено частично', PAID: 'оплачено', OVERDUE: 'просрочено', CANCELLED: 'отменено' }
export const PAYMENT_STATUS: Record<string, string> = { PENDING_REVIEW: 'на проверке', FLAGGED: 'на проверке', CONFIRMED: 'зачтено', REJECTED: 'не принято' }

const tenge = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
export const money = (n: number) => `${tenge.format(n)} ₸`

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
/** «2026-10» → «октябрь 2026» */
export const month = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`
