import type { ReadinessResponse } from '@ortaq/shared'

/* Ответы админ-API: apps/api/src/modules/admin/admin.service.ts */

export type Organization = {
  id: string; name: string; bin: string; management_form: 'OSI' | 'PT'; legal_address: string
  status: 'ACTIVE' | 'SUSPENDED'; created_at: string; house_count?: number
}

export type HouseRow = {
  id: string; organization_id: string; organization_name: string; address: string; display_name: string
  entrance_count: number; unit_count: number; floor_count: number | null; units_total: number
  is_voting_ready: boolean; created_at: string; chairman: { full_name: string; activated: boolean } | null
}

export type EntranceLayout = { entrance: number; from: number; to: number; floors: number }

export type HouseDetail = {
  id: string; address: string; display_name: string; entrance_count: number; unit_count: number
  floor_count: number | null; built_year: number | null; total_area: string; is_voting_ready: boolean
  organization: Organization
  chairman: { user_id: string; full_name: string; email: string | null; activated: boolean; assigned_at: string } | null
  layout: EntranceLayout[]
  readiness: ReadinessResponse
}

export type Unit = {
  id: string; number: string; type: string; area: string | null; entrance: number | null; floor: number | null; is_excluded_from_voting: boolean
}

export type AuditItem = {
  id: string; house_id: string | null; actor_name: string | null; actor_role: string | null
  action: string; entity_type: string; entity_id: string | null; ip: string | null; created_at: string
}

export type ChainCheck = { valid: boolean; checked: number; broken_at: string | null }

/** Человеческие подписи событий журнала */
export const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Вход',
  'auth.login_failed': 'Неудачный вход',
  'auth.password_set': 'Задан пароль',
  'auth.2fa_enabled': 'Подключена 2FA',
  'auth.2fa_failed': 'Неверный код 2FA',
  'auth.step_up': 'Подтверждение действия',
  'session.reuse_detected': 'Повторное использование токена: сессии отозваны',
  'organization.create': 'Создана организация',
  'organization.update': 'Изменена организация',
  'house.create': 'Создан дом',
  'house.update': 'Изменён дом',
  'house.units_regenerate': 'Перегенерированы помещения',
  'house.chairman_assign': 'Назначен председатель',
  'house.chairman_revoke': 'Отозван председатель',
  'invite.create': 'Создана ссылка-приглашение',
  'invite.revoke': 'Отозвана ссылка-приглашение',
  'invite.resolve': 'Открыта ссылка-приглашение',
  'join_request.approve': 'Заявка на вступление одобрена',
  'join_request.reject': 'Заявка на вступление отклонена',
}

export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: 'админ платформы',
  CHAIRMAN: 'председатель',
  ACCOUNTANT: 'бухгалтер',
  WORKER: 'работник',
  RESIDENT: 'жилец',
}
