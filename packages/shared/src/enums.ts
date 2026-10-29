/* Перечисления домена. Совпадают с enum'ами Prisma-схемы apps/api/prisma/schema.prisma */

export const HouseRole = ['CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT'] as const
export type HouseRole = (typeof HouseRole)[number]

export const Specialization = ['PLUMBER', 'ELECTRICIAN', 'CLEANER', 'YARD_KEEPER', 'HANDYMAN', 'SECURITY', 'ELEVATOR', 'OTHER'] as const
export type Specialization = (typeof Specialization)[number]

export const AnnouncementAudience = ['ALL', 'STAFF', 'SPECIFIC_USERS', 'ENTRANCE'] as const
export type AnnouncementAudience = (typeof AnnouncementAudience)[number]

export const NotificationCategory = ['VOTES', 'REQUESTS', 'ANNOUNCEMENTS', 'PAYMENTS', 'REPORTS', 'MEMBERSHIP', 'SUMMARY'] as const
export type NotificationCategory = (typeof NotificationCategory)[number]

export const ManagementForm = ['OSI', 'PT'] as const
export type ManagementForm = (typeof ManagementForm)[number]

export const UnitType = ['APARTMENT', 'COMMERCIAL', 'PARKING', 'STORAGE'] as const
export type UnitType = (typeof UnitType)[number]

export const InviteType = ['PUBLIC_LINK', 'PERSONAL'] as const
export type InviteType = (typeof InviteType)[number]

/** Кого можно пригласить по ссылке: председателя и бухгалтера заводит только админ */
export const InviteRole = ['RESIDENT', 'WORKER'] as const
export type InviteRole = (typeof InviteRole)[number]

export const OwnershipRelation = ['OWNER', 'TENANT', 'FAMILY'] as const
export type OwnershipRelation = (typeof OwnershipRelation)[number]

export const JoinRequestStatus = ['PENDING', 'APPROVED', 'REJECTED'] as const
export type JoinRequestStatus = (typeof JoinRequestStatus)[number]

/** Состояние подключения дома, docs/04 §9 */
export const HouseStage = ['CREATED', 'UNITS_GENERATED', 'CHAIRMAN_ACTIVE', 'AREAS_COMPLETE', 'OPERATIONAL'] as const
export type HouseStage = (typeof HouseStage)[number]

/** Коды ошибок API. Клиент ветвится по коду, а не по тексту */
export const ErrorCode = {
  VALIDATION: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  STEP_UP_REQUIRED: 'STEP_UP_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_CODE: 'INVALID_CODE',
  TOKEN_INVALID: 'TOKEN_INVALID',
  PASSWORD_WEAK: 'PASSWORD_WEAK',
  PASSWORD_BREACHED: 'PASSWORD_BREACHED',
  BIN_TAKEN: 'BIN_TAKEN',
  CHAIRMAN_EXISTS: 'CHAIRMAN_EXISTS',
  UNITS_LOCKED: 'UNITS_LOCKED',
  UNITS_RANGE_INVALID: 'UNITS_RANGE_INVALID',
  JOIN_REQUEST_DECIDED: 'JOIN_REQUEST_DECIDED',
  UNIT_NOT_FOUND: 'UNIT_NOT_FOUND',
  INVITE_REVOKED: 'INVITE_REVOKED',
  INVITE_INVALID: 'INVITE_INVALID',
  OTP_INVALID: 'OTP_INVALID',
  USE_EMAIL_LOGIN: 'USE_EMAIL_LOGIN',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  JOIN_REQUEST_EXISTS: 'JOIN_REQUEST_EXISTS',
  VERIFICATION_NOT_SIGNED: 'VERIFICATION_NOT_SIGNED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  REGISTRY_INVALID: 'REGISTRY_INVALID',
  IDENTITY_REQUIRED: 'IDENTITY_REQUIRED',
  OWNERSHIP_DECIDED: 'OWNERSHIP_DECIDED',
  MEMBER_PROTECTED: 'MEMBER_PROTECTED',
  FILE_NOT_UPLOADED: 'FILE_NOT_UPLOADED',
  FILE_REJECTED: 'FILE_REJECTED',
  REQUEST_CLOSED: 'REQUEST_CLOSED',
  TASK_STATE: 'TASK_STATE',
  PHOTO_REQUIRED: 'PHOTO_REQUIRED',
  RRULE_INVALID: 'RRULE_INVALID',
  ACCOUNT_EXISTS: 'ACCOUNT_EXISTS',
  ACCOUNT_MISMATCH: 'ACCOUNT_MISMATCH',
  CATEGORY_INVALID: 'CATEGORY_INVALID',
  CONTRACTOR_REQUIRED: 'CONTRACTOR_REQUIRED',
  TRANSACTION_STATE: 'TRANSACTION_STATE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  PAYMENT_STATE: 'PAYMENT_STATE',
  PAYMENT_SETTINGS_MISSING: 'PAYMENT_SETTINGS_MISSING',
  FLAGS_NOT_ACKNOWLEDGED: 'FLAGS_NOT_ACKNOWLEDGED',
  ACCOUNT_MISSING: 'ACCOUNT_MISSING',
  PERIOD_CLOSED: 'PERIOD_CLOSED',
  REPORT_STATE: 'REPORT_STATE',
  HOUSE_NOT_VOTING_READY: 'HOUSE_NOT_VOTING_READY',
  VOTE_STATE: 'VOTE_STATE',
  NOTICE_TOO_SHORT: 'NOTICE_TOO_SHORT',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  ALREADY_VOTED: 'ALREADY_VOTED',
  PROTOCOL_STATE: 'PROTOCOL_STATE',
} as const
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]
