import type { Tone } from '../shared/ui/kit'

export const SPECIALIZATION_LABELS: Record<string, string> = {
  PLUMBER: 'сантехник', ELECTRICIAN: 'электрик', CLEANER: 'уборка', YARD_KEEPER: 'дворник',
  HANDYMAN: 'мастер', SECURITY: 'охрана', ELEVATOR: 'лифты', OTHER: 'другое',
}

export const CATEGORY_LABELS: Record<string, string> = {
  PLUMBING: 'Сантехника', ELECTRICITY: 'Электрика', HEATING: 'Отопление', ELEVATOR: 'Лифт', CLEANING: 'Уборка', YARD: 'Двор',
  FACADE: 'Фасад', ROOF: 'Кровля', BASEMENT: 'Подвал', TRASH: 'Мусор', SECURITY: 'Безопасность', OTHER: 'Другое',
}

export const PRIORITY_LABELS: Record<string, string> = { CRITICAL: 'Критично', HIGH: 'Высокий', NORMAL: 'Обычный', LOW: 'Низкий' }

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  NEW: 'Новая', TRIAGE: 'Ждёт решения', ACCEPTED: 'Принята', IN_PROGRESS: 'В работе', DONE: 'Выполнена', REJECTED: 'Отклонена', CANCELLED: 'Отменена',
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Назначена', IN_PROGRESS: 'В работе', SUBMITTED: 'Ждёт проверки', APPROVED: 'Принята', REJECTED: 'На доработке', CANCELLED: 'Отменена', EXPIRED: 'Просрочена',
}

export const FLAG_LABELS: Record<string, string> = {
  NEEDS_CLARIFICATION: 'нужно уточнить', SUSPICIOUS: 'подозрительная', POSSIBLE_DUPLICATE: 'возможный дубликат', NO_AUTOCHECK: 'без автопроверки',
}

export const PRIORITY_TONE: Record<string, Tone> = { CRITICAL: 'crit', HIGH: 'warn', NORMAL: 'brand', LOW: 'mute' }

/* ───────── финансы ───────── */

export const DOC_KIND: Record<string, string> = {
  RECEIPT: 'Чек', PAYMENT_ORDER: 'Платёжное поручение', WORK_ACT: 'Акт выполненных работ', DEFECT_ACT: 'Дефектный акт',
  CONTRACT: 'Договор', PROTOCOL: 'Протокол собрания', OTHER: 'Другой документ',
}
/** Чего не хватает: «чек» в списке недостающих означает «чек или платёжное поручение» */
export const MISSING_DOC: Record<string, string> = { ...DOC_KIND, RECEIPT: 'чек или платёжка', WORK_ACT: 'акт работ', DEFECT_ACT: 'дефектный акт', PROTOCOL: 'протокол собрания' }
export const TX_STATUS: Record<string, string> = { DRAFT: 'Черновик', CONFIRMED: 'Проведена', VOIDED: 'Аннулирована' }
export const ACCOUNT_TYPE: Record<string, string> = { CURRENT: 'Текущий счёт', SAVINGS: 'Сберегательный счёт' }

const tenge = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
export const money = (n: number) => `${tenge.format(n)} ₸`
