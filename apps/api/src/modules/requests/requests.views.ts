import type { Prisma } from '@prisma/client'

/** Где проблема — по-человечески: «Подвал, 2 подъезд», «Квартира 45, 3 этаж» */
const PLACE: Record<string, string> = {
  YARD: 'Двор', ENTRANCE: 'Подъезд', APARTMENT: 'Квартира', FACADE: 'Фасад', ROOF: 'Кровля',
  BASEMENT: 'Подвал', PARKING: 'Паркинг', COMMON_AREA: 'Общее имущество',
}

/** Локация для модели: номер квартиры — персональные данные, наружу уходит только «Квартира» */
export function aiLocation(r: { locationType: string; locationEntrance: number | null; locationFloor: number | null }): string {
  return locationLabel({ ...r, unit: null })
}

export function locationLabel(r: { locationType: string; locationEntrance: number | null; locationFloor: number | null; unit?: { number: string } | null }): string {
  const parts: string[] = []
  if (r.locationType === 'ENTRANCE' && r.locationEntrance) parts.push(`${r.locationEntrance} подъезд`)
  else if (r.locationType === 'APARTMENT' && r.unit) parts.push(`Квартира ${r.unit.number}`)
  else parts.push(PLACE[r.locationType] ?? r.locationType)
  if (r.locationType !== 'ENTRANCE' && r.locationEntrance) parts.push(`${r.locationEntrance} подъезд`)
  if (r.locationFloor !== null && r.locationFloor !== undefined) parts.push(`${r.locationFloor} этаж`)
  return parts.join(', ')
}

/** Заголовок из описания: жильцу не нужно придумывать формулировку */
export function deriveTitle(description: string): string {
  // Конец предложения — знак и заглавная буква после него: «кв. 6» предложение не обрывает
  const first = description.trim().split(/(?<=[.!?])\s+(?=\p{Lu})|\n/u)[0] ?? description
  return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first
}

export const OPEN_STATUSES = ['NEW', 'TRIAGE', 'ACCEPTED', 'IN_PROGRESS'] as const
export const CLOSED_STATUSES = ['DONE', 'REJECTED', 'CANCELLED'] as const
/** Задачи, которые ещё в работе: по ним считается «назначен исполнитель» и загрузка работника */
export const ACTIVE_TASK = ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED'] as const

export const listInclude = {
  unit: { select: { number: true } },
  author: { select: { fullName: true } },
  stages: { select: { status: true, title: true, order: true }, orderBy: { order: 'asc' } },
  tasks: {
    where: { status: { in: [...ACTIVE_TASK] } },
    select: { assignee: { select: { fullName: true } }, contractor: { select: { name: true } } },
  },
  _count: { select: { duplicates: true } },
} satisfies Prisma.RequestInclude

export type ListRow = Prisma.RequestGetPayload<{ include: typeof listInclude }>

export function progress(stages: { status: string; title: string }[]) {
  const counted = stages.filter((s) => s.status !== 'SKIPPED')
  const done = counted.filter((s) => s.status === 'DONE').length
  const current = stages.find((s) => s.status === 'IN_PROGRESS') ?? stages.find((s) => s.status === 'PENDING')
  return { done, total: counted.length, current_stage: current?.title ?? null }
}

export function listView(r: ListRow, viewer: { userId: string; board: boolean }) {
  const assignee = r.tasks[0]?.assignee?.fullName ?? r.tasks[0]?.contractor?.name ?? null
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    category: r.category,
    location_type: r.locationType,
    location_label: locationLabel(r),
    priority: r.priority,
    status: r.status,
    created_at: r.createdAt,
    progress: progress(r.stages),
    assignee,
    /** «4 обращения от разных жильцов»: заявка плюс объединённые с ней дубликаты */
    reports: 1 + r._count.duplicates,
    photos: r.photoFileIds.length,
    is_mine: r.authorId === viewer.userId,
    ...(viewer.board && {
      flags: r.triageFlags,
      author: { name: r.author.fullName, unit: r.unit?.number ?? null },
      ai_reason: (r.aiTriage as { priority_reason?: string } | null)?.priority_reason ?? null,
    }),
  }
}
