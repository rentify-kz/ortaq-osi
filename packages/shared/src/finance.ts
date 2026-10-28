import { z } from 'zod'

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
