import { z } from 'zod'
import { Specialization } from './enums.js'

/* Фаза 2: файлы, заявки, этапы, задачи, рутина по расписанию (docs/03 §8–9, §14) */

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max)

/* ───────── файлы ───────── */

export const FilePurpose = ['REQUEST_PHOTO', 'TASK_PHOTO', 'FINANCE_DOCUMENT'] as const
export type FilePurpose = (typeof FilePurpose)[number]

/** Фото с телефона. HEIC клиент конвертирует в JPEG при выборе: сервер его не декодирует.
 *  PDF — только для финансовых документов: акты и платёжки чаще приходят файлом, а не снимком */
export const UPLOAD_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
export const MAX_REQUEST_PHOTOS = 5
export const MAX_TASK_PHOTOS = 10

export const uploadUrlBody = z.object({
  purpose: z.enum(FilePurpose),
  mime_type: z.enum(UPLOAD_MIME),
  size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'Файл больше 15 МБ'),
  name: trimmed(1, 200),
}).refine((b) => b.mime_type !== 'application/pdf' || b.purpose === 'FINANCE_DOCUMENT', { path: ['mime_type'], message: 'PDF принимается только для финансовых документов' })
export type UploadUrlBody = z.infer<typeof uploadUrlBody>

export type UploadUrlResponse = { file_id: string; upload_url: string; method: 'PUT'; headers: Record<string, string>; expires_at: string }
export type FileView = { id: string; mime_type: string; size_bytes: number; width: number | null; height: number | null }

/* ───────── заявки ───────── */

export const RequestCategory = ['PLUMBING', 'ELECTRICITY', 'HEATING', 'ELEVATOR', 'CLEANING', 'YARD', 'FACADE', 'ROOF', 'BASEMENT', 'TRASH', 'SECURITY', 'OTHER'] as const
export type RequestCategory = (typeof RequestCategory)[number]

export const LocationType = ['YARD', 'ENTRANCE', 'APARTMENT', 'FACADE', 'ROOF', 'BASEMENT', 'PARKING', 'COMMON_AREA'] as const
export type LocationType = (typeof LocationType)[number]

export const Priority = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const
export type Priority = (typeof Priority)[number]

export const RequestStatus = ['NEW', 'TRIAGE', 'REJECTED', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const
export type RequestStatus = (typeof RequestStatus)[number]

export const TriageFlag = ['NEEDS_CLARIFICATION', 'SUSPICIOUS', 'POSSIBLE_DUPLICATE', 'NO_AUTOCHECK'] as const
export type TriageFlag = (typeof TriageFlag)[number]

const photoIds = (max: number) => z.array(z.uuid()).max(max).default([])

export const createRequestBody = z
  .object({
    /** Короткий заголовок. Без него возьмём начало описания: жильцу не нужно придумывать формулировку */
    title: trimmed(3, 120).optional(),
    description: trimmed(5, 2000),
    category: z.enum(RequestCategory),
    location_type: z.enum(LocationType),
    location_entrance: z.number().int().min(1).max(50).nullable().optional(),
    location_floor: z.number().int().min(-5).max(200).nullable().optional(),
    location_detail: trimmed(1, 200).nullable().optional(),
    /** Для заявки про квартиру: номер помещения. Жильцу подставляется его собственное */
    unit_number: trimmed(1, 20).nullable().optional(),
    photo_file_ids: photoIds(MAX_REQUEST_PHOTOS),
  })
  .refine((b) => b.location_type !== 'ENTRANCE' || !!b.location_entrance, { message: 'Укажите подъезд', path: ['location_entrance'] })
export type CreateRequestBody = z.input<typeof createRequestBody>

/** Правка председателем: приоритет одним нажатием, уточнение категории и заголовка */
export const updateRequestBody = z
  .object({
    priority: z.enum(Priority).optional(),
    category: z.enum(RequestCategory).optional(),
    title: trimmed(3, 120).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Нечего менять')
export type UpdateRequestBody = z.input<typeof updateRequestBody>

export const rejectRequestBody = z.object({ reason: trimmed(3, 500) })
export const mergeRequestBody = z.object({ into_request_id: z.uuid() })
export const requestCommentBody = z.object({ text: trimmed(1, 2000), photo_file_ids: photoIds(MAX_REQUEST_PHOTOS) })
export const rateRequestBody = z.object({ rating: z.number().int().min(1).max(5), comment: trimmed(1, 500).nullable().optional() })
export type RequestCommentBody = z.input<typeof requestCommentBody>

export const requestListQuery = z.object({
  status: z.enum(['open', 'done', 'all']).default('open'),
  filter: z.enum(['all', 'urgent', 'unassigned', 'mine']).default('all'),
})

/** Подсказка ИИ при триаже: только рекомендация председателю, заявку не отклоняет (docs/08 §8.1) */
export type RequestTriage = {
  is_meaningful: boolean
  category: RequestCategory
  suggested_priority: Priority
  priority_reason: string
  duplicate_of: number | null
  duplicate_confidence: number
  needs_clarification: boolean
  clarification_hint: string | null
  spam_likelihood: number
}

/** План решения заявки от ИИ: превращается в этапы только по нажатию председателя */
export type RequestPlan = {
  steps: { order: number; title: string; specialization: Specialization | null; urgency: 'IMMEDIATE' | 'TODAY' | 'THIS_WEEK' }[]
  estimated_specialization: Specialization | null
  safety_notes: string[]
  requires_contractor: boolean
}

/* ───────── этапы ───────── */

export const StageStatus = ['PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED'] as const
export type StageStatus = (typeof StageStatus)[number]

export const createStagesBody = z.object({ titles: z.array(trimmed(2, 120)).min(1).max(15) })
export const updateStageBody = z
  .object({ status: z.enum(StageStatus).optional(), title: trimmed(2, 120).optional(), note: trimmed(1, 500).nullable().optional() })
  .refine((b) => Object.keys(b).length > 0, 'Нечего менять')
export type UpdateStageBody = z.input<typeof updateStageBody>

/* ───────── задачи ───────── */

export const TaskStatus = ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const
export type TaskStatus = (typeof TaskStatus)[number]

export const createTaskBody = z
  .object({
    title: trimmed(3, 200),
    description: trimmed(1, 2000).nullable().optional(),
    request_id: z.uuid().nullable().optional(),
    stage_id: z.uuid().nullable().optional(),
    assignee_id: z.uuid().nullable().optional(),
    contractor_id: z.uuid().nullable().optional(),
    specialization: z.enum(Specialization).nullable().optional(),
    priority: z.enum(Priority).default('NORMAL'),
    due_at: z.iso.datetime().nullable().optional(),
    requires_photo: z.boolean().default(true),
  })
  .refine((b) => !(b.assignee_id && b.contractor_id), { message: 'Исполнитель — работник или подрядчик, не оба', path: ['contractor_id'] })
export type CreateTaskBody = z.input<typeof createTaskBody>

export const updateTaskBody = z
  .object({
    title: trimmed(3, 200).optional(),
    description: trimmed(1, 2000).nullable().optional(),
    assignee_id: z.uuid().nullable().optional(),
    contractor_id: z.uuid().nullable().optional(),
    priority: z.enum(Priority).optional(),
    due_at: z.iso.datetime().nullable().optional(),
    status: z.literal('CANCELLED').optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Нечего менять')
export type UpdateTaskBody = z.input<typeof updateTaskBody>

/** Отметка выполнения. client_key и completed_at — для офлайн-очереди: повтор не создаёт второй отчёт */
export const completeTaskBody = z.object({
  note: trimmed(1, 2000).nullable().optional(),
  photo_file_ids: photoIds(MAX_TASK_PHOTOS),
  client_key: z.string().trim().min(8).max(64).optional(),
  completed_at: z.iso.datetime().optional(),
})
export type CompleteTaskBody = z.input<typeof completeTaskBody>

export const approveTaskBody = z.object({
  visible_to_residents: z.boolean().default(true),
  include_in_report: z.boolean().default(true),
})
export type ApproveTaskBody = z.input<typeof approveTaskBody>
export const rejectTaskBody = z.object({ reason: trimmed(3, 500) })

/* ───────── рутина по расписанию ───────── */

export const recurringTemplateBody = z.object({
  title: trimmed(3, 200),
  description: trimmed(1, 2000).nullable().optional(),
  specialization: z.enum(Specialization).nullable().optional(),
  default_assignee_id: z.uuid().nullable().optional(),
  /** RFC 5545 без DTSTART: «FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0» */
  rrule: trimmed(8, 300),
  lead_time_hours: z.number().int().min(0).max(168).default(12),
  requires_photo: z.boolean().default(false),
})
export type RecurringTemplateBody = z.input<typeof recurringTemplateBody>

export const updateRecurringTemplateBody = recurringTemplateBody.partial().extend({ is_active: z.boolean().optional() })
  .refine((b) => Object.keys(b).length > 0, 'Нечего менять')
export type UpdateRecurringTemplateBody = z.input<typeof updateRecurringTemplateBody>
