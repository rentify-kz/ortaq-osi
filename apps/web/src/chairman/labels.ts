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
