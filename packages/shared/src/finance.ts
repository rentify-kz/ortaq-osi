import { z } from 'zod'
import { UnitType } from './enums.js'

/* Фаза 3: план счетов, счета дома, операции (docs/03 §12, docs/10) */

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max)
const isoDate = z.iso.date()

export const AccountType = ['CURRENT', 'SAVINGS'] as const
export type AccountType = (typeof AccountType)[number]

export const TransactionStatus = ['DRAFT', 'CONFIRMED', 'VOIDED'] as const
export type TransactionStatus = (typeof TransactionStatus)[number]

export const DocumentKind = ['RECEIPT', 'PAYMENT_ORDER', 'WORK_ACT', 'DEFECT_ACT', 'CONTRACT', 'PROTOCOL', 'OTHER'] as const
export type DocumentKind = (typeof DocumentKind)[number]

/** Документы, любой из которых подтверждает сам факт оплаты расхода */
export const PAYMENT_PROOF: readonly DocumentKind[] = ['RECEIPT', 'PAYMENT_ORDER']

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/
export const period = z.string().regex(PERIOD_RE, 'Период в формате ГГГГ-ММ')

/** Тенге с тиынами: положительное, не больше двух знаков после запятой */
export const money = z
  .number()
  .positive('Сумма должна быть больше нуля')
  .max(1_000_000_000_000, 'Слишком большая сумма')
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Не больше двух знаков после запятой')

/* ───────── счета ───────── */

/** Номер счёта не храним: только последние 4 цифры для строк 1–2 отчёта */
const accountNumber = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, '').toUpperCase())
  .pipe(z.string().regex(/^(KZ[0-9A-Z]{18}|\d{4})$/, 'IBAN вида KZ… или последние 4 цифры'))

export const createAccountBody = z.object({
  type: z.enum(AccountType),
  bank_name: trimmed(2, 120),
  account_number: accountNumber.optional(),
  opening_balance: z.number().min(0).max(1_000_000_000_000).default(0),
  opened_on: isoDate,
})
export type CreateAccountBody = z.input<typeof createAccountBody>

export const updateAccountBody = z
  .object({
    bank_name: trimmed(2, 120).optional(),
    account_number: accountNumber.nullable().optional(),
    opening_balance: z.number().min(0).max(1_000_000_000_000).optional(),
    opened_on: isoDate.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Нечего менять')
export type UpdateAccountBody = z.infer<typeof updateAccountBody>

/* ───────── операции ───────── */

const documentRef = z.object({ file_id: z.uuid(), kind: z.enum(DocumentKind) })

export const createTransactionBody = z.object({
  /** Клиент генерирует ключ один раз на форму: повтор после обрыва связи не проведёт расход дважды */
  idempotency_key: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Ключ из латиницы, цифр, - и _'),
  account_id: z.uuid(),
  category_code: z.string().trim().max(10),
  amount: money,
  occurred_on: isoDate,
  /** По умолчанию — месяц даты операции */
  period: period.optional(),
  description: trimmed(3, 500),
  contractor_id: z.uuid().nullable().optional(),
  counterparty: trimmed(2, 200).nullable().optional(),
  documents: z.array(documentRef).max(10).default([]).refine((d) => new Set(d.map((x) => x.file_id)).size === d.length, 'Один файл приложен дважды'),
  /** Председатель проводит сразу; запись бухгалтера ждёт подтверждения председателя */
  confirm: z.boolean().default(false),
  /** Исправление аннулированной операции: связь видна в журнале */
  corrects_id: z.uuid().optional(),
})
export type CreateTransactionBody = z.input<typeof createTransactionBody>

export const updateTransactionBody = z
  .object({
    account_id: z.uuid().optional(),
    category_code: z.string().trim().max(10).optional(),
    amount: money.optional(),
    occurred_on: isoDate.optional(),
    period: period.optional(),
    description: trimmed(3, 500).optional(),
    contractor_id: z.uuid().nullable().optional(),
    counterparty: trimmed(2, 200).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Нечего менять')
export type UpdateTransactionBody = z.infer<typeof updateTransactionBody>

/** revision — та версия черновика, которую председатель видел: правка после просмотра не проскочит */
export const confirmTransactionBody = z.object({ revision: z.string().min(8).max(64) })
export type ConfirmTransactionBody = z.infer<typeof confirmTransactionBody>

export const voidTransactionBody = z.object({ reason: trimmed(5, 500) })
export type VoidTransactionBody = z.infer<typeof voidTransactionBody>

export const addDocumentBody = documentRef
export type AddDocumentBody = z.infer<typeof addDocumentBody>

/** Изъятие из проведённой операции — только председателем и с причиной */
export const removeDocumentBody = z.object({ reason: trimmed(5, 500).optional() })
export type RemoveDocumentBody = z.infer<typeof removeDocumentBody>

export const transactionListQuery = z.object({
  period: period.optional(),
  status: z.enum([...TransactionStatus, 'all']).default('all'),
  account_id: z.uuid().optional(),
  /** Код строки или раздела: 7.2 вернёт и 7.2.1.10 */
  category: z.string().trim().max(10).optional(),
})
export type TransactionListQuery = z.input<typeof transactionListQuery>

/* ───────── ответы ───────── */

export type BudgetCategoryView = {
  code: string
  parent_code: string | null
  section: 'BALANCE' | 'INCOME' | 'EXPENSE'
  name: string
  short_name: string
  is_leaf: boolean
  in_form: boolean
  allowed_accounts: AccountType[]
  requires_contractor: boolean
  requires_assembly_decision: boolean
  required_documents: DocumentKind[]
}

export type AccountView = {
  id: string
  type: AccountType
  bank_name: string
  account_number_masked: string | null
  opening_balance: number
  opened_on: string
  balance: number
  pending_drafts: number
}

export type TransactionView = {
  id: string
  number: number
  status: TransactionStatus
  /** Отпечаток содержимого черновика: передаётся в confirm */
  revision: string
  account: { id: string; type: AccountType }
  category: { code: string; short_name: string; name: string }
  direction: 'IN' | 'OUT'
  amount: number
  occurred_on: string
  period: string
  description: string
  contractor: { id: string; name: string } | null
  counterparty: string | null
  documents: { id: string; kind: DocumentKind; file_id: string; mime_type: string; added_at: string }[]
  /** Чего не хватает для отчёта. Проведению не мешает — только предупреждает (docs/10 §3) */
  missing_documents: DocumentKind[]
  created_at: string
  confirmed_at: string | null
  voided_at: string | null
  void_reason: string | null
  corrects: { id: string; number: number } | null
  corrected_by: { id: string; number: number } | null
  /** Только для председателя и бухгалтера */
  created_by?: { id: string; name: string }
}

/* ───────── тарифы и начисления (docs/10 §4) ───────── */

export const ChargeType = ['MAINTENANCE', 'CAPITAL_REPAIR', 'PARKING', 'TARGETED', 'OTHER'] as const
export type ChargeType = (typeof ChargeType)[number]
export const TariffType = ['MAINTENANCE', 'CAPITAL_REPAIR', 'PARKING'] as const
export type TariffType = (typeof TariffType)[number]
export const TariffBasis = ['PER_SQM', 'FIXED'] as const
export type TariffBasis = (typeof TariffBasis)[number]
export const ChargeStatus = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const
export type ChargeStatus = (typeof ChargeStatus)[number]

/** Строка поступлений формы, куда ляжет оплата начисления */
export const CHARGE_CATEGORY: Record<ChargeType, string> = { MAINTENANCE: '6.1', PARKING: '6.2', CAPITAL_REPAIR: '6.3', TARGETED: '6.5', OTHER: '6.7' }

/** Кому что начисляется по умолчанию: взносы — квартирам и нежилым, парковка — местам и кладовкам */
export const DEFAULT_UNIT_TYPES: Record<TariffType, UnitType[]> = {
  MAINTENANCE: ['APARTMENT', 'COMMERCIAL'],
  CAPITAL_REPAIR: ['APARTMENT', 'COMMERCIAL'],
  PARKING: ['PARKING', 'STORAGE'],
}

const unitTypes = z.array(z.enum(UnitType)).min(1, 'Выберите виды помещений').max(4)

export const tariffBody = z.object({
  type: z.enum(TariffType),
  basis: z.enum(TariffBasis),
  rate: money,
  unit_types: unitTypes.optional(),
  effective_from: period,
  decision_note: trimmed(3, 300).optional(),
})
export type TariffBody = z.input<typeof tariffBody>

export const generateChargesBody = z.object({ period })
export type GenerateChargesBody = z.infer<typeof generateChargesBody>

export const collectionBody = z.object({
  type: z.enum(['TARGETED', 'OTHER']),
  title: trimmed(3, 120),
  basis: z.enum(TariffBasis),
  rate: money,
  unit_types: unitTypes,
  period,
  due_date: isoDate,
  /** Целевой сбор — только по решению собрания (docs/10 §4) */
  decision_note: trimmed(5, 300),
  protocol_file_id: z.uuid().optional(),
})
export type CollectionBody = z.input<typeof collectionBody>

export const updateChargeBody = z.object({ amount: money, reason: trimmed(5, 300) })
export type UpdateChargeBody = z.infer<typeof updateChargeBody>
export const cancelChargeBody = z.object({ reason: trimmed(5, 300) })
export type CancelChargeBody = z.infer<typeof cancelChargeBody>

export const chargeListQuery = z.object({
  period: period.optional(),
  status: z.enum([...ChargeStatus, 'open', 'all']).default('all'),
  unit_id: z.uuid().optional(),
})
export type ChargeListQuery = z.input<typeof chargeListQuery>

export type TariffView = {
  id: string; type: TariffType; basis: TariffBasis; rate: number; unit_types: UnitType[]
  effective_from: string; effective_to: string | null; decision_note: string | null; created_at: string
}

export type ChargeView = {
  id: string; period: string; type: ChargeType; title: string
  unit: { id: string; number: string; type: UnitType; entrance: number | null }
  amount: number; paid_amount: number; due_date: string; status: ChargeStatus
  /** Формула для жильца: «45,5 м² × 120 ₸» */
  basis: { kind: TariffBasis; rate: number; area?: number }
  cancel_reason: string | null
}

export type ChargeRunView = {
  period: string; units_charged: number; units_skipped: number; total: number; created_at: string; updated_at: string
  /** Помещения, которым тариф за м² начислить не смог: нет площади */
  skipped_units: { id: string; number: string }[]
}

/* ───────── оплаты и чеки (docs/10 §5) ───────── */

export const PaymentStatus = ['PENDING_REVIEW', 'CONFIRMED', 'REJECTED', 'FLAGGED'] as const
export type PaymentStatus = (typeof PaymentStatus)[number]
export const PaymentMethod = ['KASPI_LINK', 'RECEIPT_UPLOAD', 'KASPI_API', 'CASH', 'BANK_TRANSFER'] as const
export type PaymentMethod = (typeof PaymentMethod)[number]

/** Что насторожило в оплате. Автоматического отказа нет ни по одному флагу */
export const PaymentFlag = ['DUPLICATE_FILE', 'SIMILAR_IMAGE', 'DUPLICATE_REF', 'AMOUNT_MISMATCH', 'RECIPIENT_MISMATCH', 'NOT_RECOGNIZED'] as const
export type PaymentFlag = (typeof PaymentFlag)[number]

const externalRef = z.string().trim().min(4).max(64).regex(/^[\p{L}\p{N}\-_/]+$/u, 'Номер операции — буквы, цифры, - _ /')

/** Реквизиты Kaspi: ссылка на оплату из Kaspi Pay и получатель, как он печатается в чеке */
export const paymentSettingsBody = z.object({
  pay_url: z.url({ protocol: /^https$/, hostname: /(^|\.)kaspi\.kz$/ }).max(300),
  recipient_name: trimmed(2, 120),
})
export type PaymentSettingsBody = z.infer<typeof paymentSettingsBody>

export const submitPaymentBody = z.object({
  file_id: z.uuid(),
  /** Пусто — возьмём из чека; распознать не удалось — попросим ввести */
  amount: money.optional(),
  external_ref: externalRef.optional(),
  paid_at: z.iso.datetime({ offset: true }).optional(),
})
export type SubmitPaymentBody = z.infer<typeof submitPaymentBody>

/** Наличные или перевод по выписке: председатель или бухгалтер вносит сразу подтверждённым */
export const manualPaymentBody = z.object({
  charge_id: z.uuid(),
  amount: money,
  method: z.enum(['CASH', 'BANK_TRANSFER']),
  paid_on: isoDate,
  external_ref: externalRef.optional(),
})
export type ManualPaymentBody = z.infer<typeof manualPaymentBody>

export const confirmPaymentBody = z.object({
  /** Сколько зачесть; по умолчанию — заявленная сумма, но не больше остатка */
  amount: money.optional(),
  /** Флаги видел и всё равно подтверждаю — явное решение человека */
  acknowledge_flags: z.boolean().default(false),
})
export type ConfirmPaymentBody = z.input<typeof confirmPaymentBody>
export const rejectPaymentBody = z.object({ reason: trimmed(5, 300) })
export type RejectPaymentBody = z.infer<typeof rejectPaymentBody>

export const paymentListQuery = z.object({ status: z.enum([...PaymentStatus, 'review', 'all']).default('review') })
export type PaymentListQuery = z.input<typeof paymentListQuery>

export const scanReceiptBody = z.object({ file_id: z.uuid() })
export type ScanReceiptBody = z.infer<typeof scanReceiptBody>

export type ReceiptFields = { amount: number | null; date: string | null; ref: string | null; recipient: string | null }

export type PaymentLinkView = { mode: 'RECEIPT' | 'KASPI_API'; pay_url: string; recipient_name: string; amount: number; purpose: string }

export type PaymentView = {
  id: string; status: PaymentStatus; method: PaymentMethod; amount: number; confirmed_amount: number | null
  paid_at: string | null; external_ref: string | null; created_at: string; confirmed_at: string | null; rejection_reason: string | null
  flags: { code: PaymentFlag; message: string }[]
  charge: { id: string; title: string; period: string; amount: number; paid_amount: number }
  unit: { id: string; number: string }
  receipt: { file_id: string; recognized: ReceiptFields | null } | null
  /** Только для правления */
  paid_by?: { id: string; name: string }
}

export type ReceiptScanView = { receipt_id: string; recognized: ReceiptFields | null; duplicate: boolean }

/* ───────── дашборд и должники (docs/10 §6, §8) ───────── */

export const overviewQuery = z.object({ period: period.optional() })
export type OverviewQuery = z.input<typeof overviewQuery>

export type CategoryTotal = { code: string; name: string; amount: number; transaction_count: number }

/** Одна структура для жильца и правления: цифры те же, что попадут в отчёт */
export type FinanceOverview = {
  period: string
  accounts: { type: AccountType; bank_name: string; balance: number }[]
  income_total: number
  expense_total: number
  /** Доля оплаченного от начисленного за месяц, %. null — начислений не было */
  collection_rate: number | null
  income_by_category: CategoryTotal[]
  expense_by_category: CategoryTotal[]
  months: { period: string; income: number; expense: number }[]
  /** Только правлению */
  board?: { drafts: number; missing_documents: number; payments_to_review: number; debt_total: number }
}

export type DebtLevel = 'REMIND' | 'REPEAT' | 'PRETRIAL'
export type DebtorView = {
  unit: { id: string; number: string; entrance: number | null }
  owners: { id: string; name: string }[]
  debt: number
  months: number
  oldest_period: string
  level: DebtLevel
  last_reminded_at: string | null
}

export const remindDebtorsBody = z.object({ unit_ids: z.array(z.uuid()).min(1).max(500) })
export type RemindDebtorsBody = z.infer<typeof remindDebtorsBody>

/* ───────── отчётность (docs/10 §7) ───────── */

export const ReportStatus = ['DRAFT', 'SIGNED', 'PUBLISHED'] as const
export type ReportStatus = (typeof ReportStatus)[number]

export const generateReportBody = z.object({ period })
export type GenerateReportBody = z.infer<typeof generateReportBody>

export type ReportRow = {
  code: string
  label: string
  /** Глубина вложенности кода: 6 → 0, 6.1 → 1, 7.1.1 → 2 */
  level: number
  amount: number
  /** Для 7.2.1: исполнители и виды услуг — форма печатает их наименования */
  lines?: { payee: string; service: string; amount: number }[]
}

export type ReportIssue = {
  kind: 'MISSING_DOCUMENTS' | 'UNPOSTED_DRAFTS' | 'PAYMENTS_TO_REVIEW' | 'UNITS_WITHOUT_AREA'
  message: string
  transaction?: { id: string; number: number; amount: number; category: string; missing: DocumentKind[] }
}

export type ReportSignatureView = { name: string; signed_at: string } | null

export type ReportView = {
  id: string; period: string; status: ReportStatus; due_date: string; generated_at: string; published_at: string | null
  legal_source: string
  header: { address: string; management_form: string; organization: string; bin: string; legal_address: string; period_from: string; period_to: string; banks: { CURRENT: string | null; SAVINGS: string | null } }
  rows: ReportRow[]
  issues: ReportIssue[]
  work: { task_id: string; title: string; completed_at: string; photo_file_ids: string[] }[]
  signatures: { chairman: ReportSignatureView; accountant: ReportSignatureView; accountant_required: boolean }
}

export type ReportListItem = { id: string; period: string; status: ReportStatus; due_date: string; generated_at: string; published_at: string | null; issues: number }

export type SigningStartView = { external_id: string; qr_url: string; deeplink: string; expires_at: string }
