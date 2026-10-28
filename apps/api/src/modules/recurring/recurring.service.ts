import { Injectable } from '@nestjs/common'
import type { Prisma, RecurringTaskTemplate } from '@prisma/client'
import {
  ErrorCode, recurringTemplateBody, updateRecurringTemplateBody,
  type RecurringTemplateBody, type UpdateRecurringTemplateBody,
} from '@ortaq/shared'
import { ctx } from '../../common/context'
import { notFound, unprocessable } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { occurrences, parseRule, type ParsedRule } from './rrule'

const PREVIEW_DAYS = 45
const PREVIEW_COUNT = 5

const invalidRule = () => unprocessable(ErrorCode.RRULE_INVALID, 'Расписание не распознано. Рутина — не чаще раза в день')

export function nextDates(rule: ParsedRule, count = PREVIEW_COUNT, from = new Date()): string[] {
  return occurrences(rule, from, new Date(from.getTime() + PREVIEW_DAYS * 86_400_000)).slice(0, count).map((d) => d.toISOString())
}

type Row = Prisma.RecurringTaskTemplateGetPayload<{ include: { tasks: { select: { status: true }; orderBy: { occurrenceAt: 'desc' }; take: 3 } } }>

/** Шаблоны рутинной работы (docs/07 §7.5): уборка двора по будням, обход техпомещений по пятницам */
@Injectable()
export class RecurringService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.run(async (tx) => {
      const rows = await tx.recurringTaskTemplate.findMany({
        include: { tasks: { select: { status: true }, orderBy: { occurrenceAt: 'desc' }, take: 3 } },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      })
      const ids = [...new Set(rows.map((r) => r.defaultAssigneeId).filter((x): x is string => !!x))]
      const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
      return rows.map((r) => view(r, users.find((u) => u.id === r.defaultAssigneeId)?.fullName ?? null))
    })
  }

  preview(rule: string) {
    const parsed = parseRule(rule)
    if (!parsed) throw invalidRule()
    return { next: nextDates(parsed) }
  }

  async create(input: RecurringTemplateBody) {
    const b = recurringTemplateBody.parse(input)
    if (!parseRule(b.rrule)) throw invalidRule()
    return this.db.run(async (tx) => {
      await this.checkAssignee(tx, b.default_assignee_id ?? null)
      const t = await tx.recurringTaskTemplate.create({
        data: {
          houseId: ctx().houseId ?? '', title: b.title, description: b.description ?? null, specialization: b.specialization ?? null,
          defaultAssigneeId: b.default_assignee_id ?? null, rrule: b.rrule.replace(/^RRULE:/i, ''), leadTimeHours: b.lead_time_hours,
          requiresPhoto: b.requires_photo, createdBy: ctx().userId ?? '',
        },
        include: { tasks: { select: { status: true }, orderBy: { occurrenceAt: 'desc' }, take: 3 } },
      })
      await this.audit.append(tx, { action: 'recurring.create', entityType: 'RecurringTaskTemplate', entityId: t.id, after: { title: t.title, rrule: t.rrule } })
      return view(t, null)
    })
  }

  async update(id: string, input: UpdateRecurringTemplateBody) {
    const b = updateRecurringTemplateBody.parse(input)
    if (b.rrule && !parseRule(b.rrule)) throw invalidRule()
    return this.db.run(async (tx) => {
      const before = await tx.recurringTaskTemplate.findFirst({ where: { id } })
      if (!before) throw notFound('Шаблон')
      if (b.default_assignee_id) await this.checkAssignee(tx, b.default_assignee_id)
      const t = await tx.recurringTaskTemplate.update({
        where: { id },
        data: {
          title: b.title, description: b.description, specialization: b.specialization, defaultAssigneeId: b.default_assignee_id,
          rrule: b.rrule?.replace(/^RRULE:/i, ''), leadTimeHours: b.lead_time_hours, requiresPhoto: b.requires_photo, isActive: b.is_active,
        },
        include: { tasks: { select: { status: true }, orderBy: { occurrenceAt: 'desc' }, take: 3 } },
      })
      // Выключенный шаблон не оставляет за собой открытых задач на будущее
      if (b.is_active === false) {
        await tx.task.updateMany({ where: { recurringTemplateId: id, status: 'ASSIGNED', occurrenceAt: { gt: new Date() } }, data: { status: 'CANCELLED', closedAt: new Date() } })
      }
      await this.audit.append(tx, { action: 'recurring.update', entityType: 'RecurringTaskTemplate', entityId: id, before: { rrule: before.rrule, active: before.isActive }, after: b })
      return view(t, null)
    })
  }

  private async checkAssignee(tx: Tx, userId: string | null) {
    if (userId && !(await tx.houseMembership.count({ where: { userId, role: 'WORKER', status: 'ACTIVE' } }))) {
      throw unprocessable(ErrorCode.VALIDATION, 'Исполнитель — работник этого дома')
    }
  }
}

function view(t: Row | (RecurringTaskTemplate & { tasks: { status: string }[] }), assignee: string | null) {
  const parsed = parseRule(t.rrule)
  return {
    id: t.id, title: t.title, description: t.description, specialization: t.specialization, rrule: t.rrule,
    lead_time_hours: t.leadTimeHours, requires_photo: t.requiresPhoto, is_active: t.isActive,
    default_assignee: t.defaultAssigneeId ? { id: t.defaultAssigneeId, name: assignee } : null,
    next: t.isActive && parsed ? nextDates(parsed, 3) : [],
    /** Сколько последних подряд пропущено — сигнал председателю, что рутина не делается */
    missed_in_row: countLeading(t.tasks.map((x) => x.status), 'EXPIRED'),
  }
}

function countLeading(list: string[], value: string): number {
  const i = list.findIndex((x) => x !== value)
  return i === -1 ? list.length : i
}
