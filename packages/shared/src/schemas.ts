import { z } from 'zod'
import { InviteRole, InviteType, ManagementForm, OwnershipRelation, UnitType } from './enums.js'
import { isValidIinBin } from './iin.js'

/* Схемы запросов фазы 0. JSON в snake_case, как в docs/03-api-contract.md */

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max)

export const bin = z.string().trim().refine(isValidIinBin, 'БИН: 12 цифр с верным контрольным разрядом')

/** Пароль: длина важнее состава, проверка по утёкшим базам — на сервере */
export const PASSWORD_MIN = 12
export const password = z.string().min(PASSWORD_MIN, `Пароль не короче ${PASSWORD_MIN} символов`).max(256)

export const totpCode = z.string().trim().regex(/^\d{6}$/, 'Код из 6 цифр')

/* ───────── аутентификация ───────── */

export const passwordLoginBody = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(256),
})
export type PasswordLoginBody = z.infer<typeof passwordLoginBody>

export const passwordSetBody = z.object({
  token: z.string().min(20).max(200),
  password,
})
export type PasswordSetBody = z.infer<typeof passwordSetBody>

/** Второй шаг входа: challenge выдан после верного пароля */
export const twoFactorVerifyBody = z.object({
  challenge: z.string().min(20),
  code: totpCode,
})
export type TwoFactorVerifyBody = z.infer<typeof twoFactorVerifyBody>

export const twoFactorSetupBody = z.object({ challenge: z.string().min(20) })
export type TwoFactorSetupBody = z.infer<typeof twoFactorSetupBody>

export const stepUpBody = z.object({ code: totpCode })
export type StepUpBody = z.infer<typeof stepUpBody>

/** Ответ на вход: следующий шаг определяет сервер */
export type LoginResult =
  | { status: '2FA_REQUIRED'; challenge: string }
  | { status: '2FA_SETUP_REQUIRED'; challenge: string }
  | { status: 'OK'; user: MeResponse }

export type TwoFactorSetupResponse = { secret: string; otpauth_url: string; qr_data_url: string }

export type MembershipView = { house_id: string; house_display_name: string; role: string }
export type MeResponse = {
  id: string
  email: string | null
  phone: string | null
  full_name: string
  is_platform_admin: boolean
  memberships: MembershipView[]
}

/* ───────── админ-панель ───────── */

export const createOrganizationBody = z.object({
  name: trimmed(2, 300),
  bin,
  management_form: z.enum(ManagementForm),
  legal_address: trimmed(5, 500),
  bank_details: z
    .object({
      bank_name: trimmed(2, 200),
      iik: z.string().trim().regex(/^KZ[0-9A-Z]{18}$/, 'ИИК: KZ и 18 символов'),
      bik: z.string().trim().regex(/^[A-Z0-9]{8}$/, 'БИК: 8 символов'),
    })
    .optional(),
})
export type CreateOrganizationBody = z.infer<typeof createOrganizationBody>

export const updateOrganizationBody = createOrganizationBody.partial().extend({
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
})
export type UpdateOrganizationBody = z.infer<typeof updateOrganizationBody>

export const MAX_UNITS = 2000

export const createHouseBody = z.object({
  organization_id: z.uuid(),
  address: trimmed(5, 500),
  display_name: trimmed(2, 200),
  entrance_count: z.int().min(1).max(50),
  unit_count: z.int().min(1).max(MAX_UNITS),
  floor_count: z.int().min(1).max(60).optional(),
  built_year: z.int().min(1900).max(2100).optional(),
})
export type CreateHouseBody = z.infer<typeof createHouseBody>

export const updateHouseBody = createHouseBody
  .pick({ address: true, display_name: true, floor_count: true, built_year: true, organization_id: true })
  .partial()
export type UpdateHouseBody = z.infer<typeof updateHouseBody>

/** Ручная разбивка по подъездам: номера сквозные, диапазоны не пересекаются */
export const generateUnitsBody = z.object({
  strategy: z.literal('SEQUENTIAL'),
  entrances: z
    .array(
      z.object({
        entrance: z.int().min(1).max(50),
        from: z.int().min(1).max(100000),
        to: z.int().min(1).max(100000),
        floors: z.int().min(1).max(60),
        type: z.enum(UnitType).optional(),
      }),
    )
    .min(1)
    .max(50),
})
export type GenerateUnitsBody = z.infer<typeof generateUnitsBody>

export const assignChairmanBody = z.object({
  email: z.email().trim().toLowerCase(),
  full_name: trimmed(3, 200),
})
export type AssignChairmanBody = z.infer<typeof assignChairmanBody>

export type ReadinessResponse = {
  stage: string
  units_generated: boolean
  units_total: number
  areas_filled: number
  areas_total: number
  is_voting_ready: boolean
  registry_uploaded: boolean
  chairman_assigned: boolean
  chairman_activated: boolean
  residents_joined: number
  residents_verified: number
  blocking_issues: string[]
}

/* ───────── приглашения и заявки на вступление ───────── */

export const createInviteBody = z.object({
  type: z.enum(InviteType),
  target_role: z.enum(InviteRole).default('RESIDENT'),
  expires_in_days: z.int().min(1).max(90).default(14),
  max_uses: z.int().min(1).max(5000).nullable().default(null),
})
export type CreateInviteBody = z.input<typeof createInviteBody>

export const rejectJoinRequestBody = z.object({ reason: trimmed(3, 500) })
export type RejectJoinRequestBody = z.infer<typeof rejectJoinRequestBody>

export const joinRequestBody = z.object({
  house_id: z.uuid(),
  unit_number: trimmed(1, 20),
  relation: z.enum(OwnershipRelation).exclude(['FAMILY']),
  comment: z.string().trim().max(500).optional(),
})
export type JoinRequestBody = z.infer<typeof joinRequestBody>

/* ───────── фаза 1: жильцы ───────── */

/** Версии текстов согласий: при изменении текста нужна новая запись, старые остаются в истории */
export const TERMS_VERSION = '2026-10'
export const PERSONAL_DATA_VERSION = '2026-10'

/**
 * Мобильный номер Казахстана в E.164: +7 7XX XXX XX XX.
 * Принимает 8 777…, +7 (777)…, 7777… — как люди на самом деле пишут номер.
 */
export function normalizeKzPhone(input: string): string | null {
  let d = input.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  if (d.length === 10 && d.startsWith('7')) d = `7${d}`
  // Только мобильные коды операторов: на городской номер SMS с кодом не дойдёт
  return /^7(70[0125678]|747|75[01]|76[0-4]|77[15678])\d{7}$/.test(d) ? `+${d}` : null
}

export const phone = z.string().transform((v, ctx) => {
  const n = normalizeKzPhone(v)
  if (!n) {
    ctx.addIssue({ code: 'custom', message: 'Мобильный номер Казахстана: +7 7XX XXX XX XX' })
    return z.NEVER
  }
  return n
})

export const otpRequestBody = z.object({ phone })
export type OtpRequestBody = z.input<typeof otpRequestBody>

export const otpVerifyBody = z.object({ phone, code: z.string().trim().regex(/^\d{6}$/, 'Код из 6 цифр') })
export type OtpVerifyBody = z.input<typeof otpVerifyBody>

export const updateMeBody = z.object({ full_name: trimmed(3, 200) })
export type UpdateMeBody = z.infer<typeof updateMeBody>

/** Регистрация в доме по ссылке: дом зашит в токен, жилец выбирает своё помещение */
export const acceptInviteBody = z.object({
  unit_number: trimmed(1, 20).optional(),
  relation: z.enum(['OWNER', 'TENANT']).optional(),
  accept_terms: z.literal(true, 'Нужно согласие с правилами сервиса'),
  notifications: z.boolean().default(true),
})
export type AcceptInviteBody = z.input<typeof acceptInviteBody>

export const houseSearchQuery = z.object({ q: trimmed(3, 100) })

/* ───────── ошибки ───────── */

export type ApiError = { error: { code: string; message: string; details?: unknown } }
