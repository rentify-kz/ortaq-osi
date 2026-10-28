import { Injectable } from '@nestjs/common'
import type { Prisma, Task } from '@prisma/client'
import {
  approveTaskBody, completeTaskBody, createTaskBody, ErrorCode, updateTaskBody,
  type ApproveTaskBody, type CompleteTaskBody, type CreateTaskBody, type UpdateTaskBody,
} from '@ortaq/shared'
import { ctx } from '../../common/context'
import { AppError, forbidden, notFound, unprocessable } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { FilesService } from '../files/files.service'
import { NotificationsService } from '../notifications/notifications.service'
import { RequestActionsService } from '../requests/request-actions.service'
import { ACTIVE_TASK, locationLabel } from '../requests/requests.views'
import { isBoardRole } from '../requests/visibility'

const wrongState = (message: string) => new AppError(409, ErrorCode.TASK_STATE, message)
const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const

const taskInclude = {
  assignee: { select: { id: true, fullName: true } },
  contractor: { select: { id: true, name: true } },
  stage: { select: { id: true, title: true } },
  request: { select: { id: true, number: true, title: true, description: true, locationType: true, locationEntrance: true, locationFloor: true, locationDetail: true, photoFileIds: true, unit: { select: { number: true } } } },
  completions: { orderBy: { completedAt: 'desc' }, take: 1 },
} satisfies Prisma.TaskInclude

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

function view(t: TaskRow) {
  const last = t.completions[0]
  return {
    id: t.id, title: t.title, description: t.description, status: t.status, priority: t.priority, specialization: t.specialization,
    due_at: t.dueAt, requires_photo: t.requiresPhoto, source: t.source, recurring: t.recurringTemplateId !== null,
    started_at: t.startedAt, created_at: t.createdAt,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.fullName } : null,
    contractor: t.contractor ? { id: t.contractor.id, name: t.contractor.name } : null,
    stage: t.stage,
    request: t.request && {
      id: t.request.id, number: t.request.number, title: t.request.title, description: t.request.description,
      location_label: locationLabel(t.request), location_detail: t.request.locationDetail,
      // Фото от жильца работник видит до выезда — чтобы взять нужный инструмент сразу (docs/07 §7.2)
      photo_file_ids: t.request.photoFileIds,
    },
    last_completion: last && {
      note: last.note, photo_file_ids: last.photoFileIds, completed_at: last.completedAt,
      approved_at: last.approvedAt, rejection_reason: last.rejectionReason, visible_to_residents: last.visibleToResidents,
    },
  }
}

/**
 * Задачи исполнителям (docs/06 §6.2, docs/07). Работник отмечает выполнение с фото — задача
 * переходит в SUBMITTED, а не в выполненную: фото увидят жильцы только после подтверждения
 * председателем. Возврат на доработку — только с причиной.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly requests: RequestActionsService,
  ) {}

  /** Председателю — все задачи дома; «активные» — то, что ещё в работе или ждёт проверки */
  list(scope: 'active' | 'all') {
    return this.db.run(async (tx) => {
      const rows = await tx.task.findMany({
        where: scope === 'active' ? { status: { in: [...ACTIVE_TASK, 'REJECTED'] } } : {},
        include: taskInclude,
        orderBy: [{ priority: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 300,
      })
      return rows.map(view)
    })
  }

  /** Экран работника: срочное → сегодня → остальное (docs/07 §7.1) */
  mine() {
    const userId = ctx().userId ?? ''
    return this.db.run(async (tx) => {
      const rows = await tx.task.findMany({
        where: { assigneeId: userId, OR: [{ status: { in: [...ACTIVE_TASK, 'REJECTED'] } }, { status: 'APPROVED', closedAt: { gt: new Date(Date.now() - 7 * 86_400_000) } }] },
        include: taskInclude,
      })
      return rows
        .map(view)
        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.due_at?.getTime() ?? Infinity) - (b.due_at?.getTime() ?? Infinity))
    })
  }

  async detail(id: string) {
    return this.db.run(async (tx) => view(await this.findAllowed(tx, id)))
  }

  /** Кого назначить: работники с их специализациями и текущей загрузкой, подрядчики по договорам */
  assignees() {
    return this.db.run(async (tx) => {
      const workers = await tx.houseMembership.findMany({ where: { role: 'WORKER', status: 'ACTIVE' }, select: { userId: true, user: { select: { fullName: true } } } })
      const ids = workers.map((w) => w.userId)
      const [staff, load, contractors] = await Promise.all([
        tx.staffMember.findMany({ where: { userId: { in: ids }, isActive: true }, select: { userId: true, position: true, specializations: true } }),
        tx.task.groupBy({ by: ['assigneeId'], where: { assigneeId: { in: ids }, status: { in: [...ACTIVE_TASK] } }, _count: { _all: true } }),
        tx.contractor.findMany({ where: { isActive: true }, select: { id: true, name: true, specializations: true, contractTo: true } }),
      ])
      return {
        workers: workers
          .map((w) => {
            const s = staff.find((x) => x.userId === w.userId)
            return {
              id: w.userId, name: w.user.fullName, position: s?.position ?? null, specializations: s?.specializations ?? [],
              active_tasks: load.find((l) => l.assigneeId === w.userId)?._count._all ?? 0,
            }
          })
          .sort((a, b) => a.active_tasks - b.active_tasks),
        contractors: contractors.map((c) => ({ id: c.id, name: c.name, specializations: c.specializations, contract_to: c.contractTo?.toISOString().slice(0, 10) ?? null })),
      }
    })
  }

  async create(input: CreateTaskBody) {
    const b = createTaskBody.parse(input)
    const houseId = ctx().houseId ?? ''
    const task = await this.db.run(async (tx) => {
      await this.checkAssignee(tx, b.assignee_id ?? null, b.contractor_id ?? null)
      const request = b.request_id ? await tx.request.findFirst({ where: { id: b.request_id, deletedAt: null } }) : null
      if (b.request_id && !request) throw notFound('Заявка')
      if (request && ['DONE', 'REJECTED', 'CANCELLED'].includes(request.status)) throw new AppError(409, ErrorCode.REQUEST_CLOSED, 'Заявка закрыта')
      if (b.stage_id && !(await tx.requestStage.count({ where: { id: b.stage_id, requestId: b.request_id ?? '' } }))) throw unprocessable(ErrorCode.VALIDATION, 'Этап не относится к заявке')

      const t = await tx.task.create({
        data: {
          houseId, title: b.title, description: b.description ?? null, requestId: request?.id ?? null, stageId: b.stage_id ?? null,
          assigneeId: b.assignee_id ?? null, contractorId: b.contractor_id ?? null, specialization: b.specialization ?? null,
          priority: b.priority, dueAt: b.due_at ? new Date(b.due_at) : null, requiresPhoto: b.requires_photo,
          source: request ? 'FROM_REQUEST' : 'MANUAL', createdBy: ctx().userId ?? null,
        },
        include: taskInclude,
      })
      if (request) {
        if (request.status === 'ACCEPTED' || request.status === 'TRIAGE') await tx.request.update({ where: { id: request.id }, data: { status: 'IN_PROGRESS', acceptedAt: request.acceptedAt ?? new Date() } })
        await this.requests.event(tx, request, 'TASK_ASSIGNED', { title: t.title, assignee: t.assignee?.fullName ?? t.contractor?.name ?? null })
      }
      await this.audit.append(tx, { action: 'task.create', entityType: 'Task', entityId: t.id, after: { title: t.title, assignee: t.assigneeId, contractor: t.contractorId, request: request?.number ?? null } })
      return t
    })
    await this.notifyAssignee(task)
    return view(task)
  }

  async update(id: string, input: UpdateTaskBody) {
    const b = updateTaskBody.parse(input)
    const { before, task } = await this.db.run(async (tx) => {
      const before = await this.find(tx, id)
      if (['APPROVED', 'CANCELLED', 'EXPIRED'].includes(before.status)) throw wrongState('Задача уже закрыта')
      const reassign = b.assignee_id !== undefined || b.contractor_id !== undefined
      if (reassign) await this.checkAssignee(tx, b.assignee_id ?? null, b.contractor_id ?? null)
      const task = await tx.task.update({
        where: { id },
        data: {
          title: b.title, description: b.description, priority: b.priority,
          dueAt: b.due_at === undefined ? undefined : b.due_at ? new Date(b.due_at) : null,
          ...(reassign && { assigneeId: b.assignee_id ?? null, contractorId: b.contractor_id ?? null }),
          ...(b.status === 'CANCELLED' && { status: 'CANCELLED', closedAt: new Date() }),
        },
        include: taskInclude,
      })
      await this.audit.append(tx, { action: b.status === 'CANCELLED' ? 'task.cancel' : 'task.update', entityType: 'Task', entityId: id, before: { status: before.status, assignee: before.assigneeId }, after: b })
      return { before, task }
    })
    if (task.assigneeId && task.assigneeId !== before.assigneeId) await this.notifyAssignee(task)
    return view(task)
  }

  async start(id: string) {
    const task = await this.db.run(async (tx) => {
      const t = await this.findOwn(tx, id)
      if (t.status === 'IN_PROGRESS') return t
      if (!['ASSIGNED', 'REJECTED'].includes(t.status)) throw wrongState('Эту задачу нельзя начать')
      const started = await tx.task.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: t.startedAt ?? new Date() } })
      if (t.stageId) await tx.requestStage.updateMany({ where: { id: t.stageId, status: 'PENDING' }, data: { status: 'IN_PROGRESS' } })
      if (t.requestId) await tx.request.updateMany({ where: { id: t.requestId, status: 'ACCEPTED' }, data: { status: 'IN_PROGRESS' } })
      await this.audit.append(tx, { action: 'task.start', entityType: 'Task', entityId: id })
      return started
    })
    return this.detail(task.id)
  }

  /**
   * Отметка выполнения. Работает и из офлайн-очереди: повтор с тем же client_key вернёт уже
   * созданный отчёт. Если председатель успел отменить задачу, факт работы всё равно сохраняем —
   * «сервер главнее для содержания, клиент — для отметки выполнения» (docs/07 §7.3).
   */
  async complete(id: string, input: CompleteTaskBody) {
    const b = completeTaskBody.parse(input)
    const { userId = '', role } = ctx()
    const outcome = await this.db.run(async (tx) => {
      if (b.client_key) {
        const seen = await tx.taskCompletion.findUnique({ where: { clientKey: b.client_key } })
        if (seen) return null
      }
      const t = await this.find(tx, id)
      const board = isBoardRole(role)
      // Подрядчик в системе не работает: его задачу закрывает председатель по акту (docs/07 §7.7)
      if (!(t.assigneeId === userId || (board && t.contractorId))) throw forbidden('Отметить выполнение может исполнитель задачи')
      if (['SUBMITTED', 'APPROVED'].includes(t.status)) throw wrongState('Задача уже отправлена на проверку')
      if (t.requiresPhoto && b.photo_file_ids.length === 0) throw unprocessable(ErrorCode.PHOTO_REQUIRED, 'Для этой задачи нужна фотофиксация')

      const now = new Date()
      const at = b.completed_at ? new Date(Math.min(new Date(b.completed_at).getTime(), now.getTime())) : now
      const c = await tx.taskCompletion.create({
        data: { houseId: t.houseId, taskId: id, clientKey: b.client_key ?? null, completedBy: userId, note: b.note ?? null, photoFileIds: b.photo_file_ids, completedAt: at },
      })
      await this.files.attach(tx, b.photo_file_ids, 'TASK_COMPLETION', c.id, userId)
      const cancelled = t.status === 'CANCELLED' || t.status === 'EXPIRED'
      await tx.task.update({ where: { id }, data: { status: 'SUBMITTED', startedAt: t.startedAt ?? at } })
      if (t.requestId) await this.requests.event(tx, { id: t.requestId, houseId: t.houseId }, 'WORK_SUBMITTED', { task: t.title, photos: b.photo_file_ids.length }, false)
      await this.audit.append(tx, { action: 'task.complete', entityType: 'Task', entityId: id, after: { photos: b.photo_file_ids.length, was_cancelled: cancelled } })
      return t
    })
    if (outcome) {
      const board = await this.db.run((tx) => tx.houseMembership.findMany({ where: { role: 'CHAIRMAN', status: 'ACTIVE' }, select: { userId: true } }))
      await this.notifications.notify({
        userIds: board.map((m) => m.userId).filter((u) => u !== userId), houseId: outcome.houseId, category: 'REQUESTS', priority: 'HIGH',
        title: 'Работа ждёт подтверждения', body: outcome.title, payload: { task_id: outcome.id },
      })
    }
    return this.detail(id)
  }

  /** Подтверждение председателем: фото уходят жильцам и в отчёт, этап закрывается (docs/06 §6.2) */
  async approve(id: string, input: ApproveTaskBody) {
    const b = approveTaskBody.parse(input)
    const t = await this.db.run(async (tx) => {
      const t = await this.find(tx, id)
      if (t.status !== 'SUBMITTED') throw wrongState('Подтвердить можно только отправленную на проверку работу')
      const c = await tx.taskCompletion.findFirst({ where: { taskId: id }, orderBy: { completedAt: 'desc' } })
      if (!c) throw wrongState('Нет отчёта о выполнении')
      const now = new Date()
      await tx.taskCompletion.update({ where: { id: c.id }, data: { approvedBy: ctx().userId ?? null, approvedAt: now, visibleToResidents: b.visible_to_residents, includeInReport: b.include_in_report } })
      await tx.task.update({ where: { id }, data: { status: 'APPROVED', closedAt: now } })
      if (t.stageId) await tx.requestStage.update({ where: { id: t.stageId }, data: { status: 'DONE', completedAt: now, completedBy: c.completedBy } })
      if (t.requestId) {
        await this.requests.event(tx, { id: t.requestId, houseId: t.houseId }, 'WORK_APPROVED', {
          task: t.title, note: b.visible_to_residents ? c.note : null, photo_file_ids: b.visible_to_residents ? c.photoFileIds : [],
        })
      }
      await this.audit.append(tx, { action: 'task.approve', entityType: 'Task', entityId: id, after: b })
      return t
    })
    await this.notifications.notify({ userIds: t.assigneeId ? [t.assigneeId] : [], houseId: t.houseId, category: 'REQUESTS', priority: 'NORMAL', title: 'Работа принята', body: t.title, payload: { task_id: t.id } })
    if (t.requestId) {
      const r = await this.db.run((tx) => tx.request.findFirstOrThrow({ where: { id: t.requestId! } }))
      await this.requests.tell(r, 'NORMAL', `Заявка №${r.number}: работа выполнена`, b.visible_to_residents ? 'Председатель подтвердил результат — фото в заявке' : t.title)
    }
    return this.detail(id)
  }

  /** Возврат на доработку: только с причиной, прежние фото сохраняются (docs/07 §7.2) */
  async reject(id: string, reason: string) {
    const t = await this.db.run(async (tx) => {
      const t = await this.find(tx, id)
      if (t.status !== 'SUBMITTED') throw wrongState('Вернуть можно только отправленную на проверку работу')
      const c = await tx.taskCompletion.findFirst({ where: { taskId: id }, orderBy: { completedAt: 'desc' } })
      if (c) await tx.taskCompletion.update({ where: { id: c.id }, data: { rejectionReason: reason } })
      await tx.task.update({ where: { id }, data: { status: 'IN_PROGRESS' } })
      await this.audit.append(tx, { action: 'task.reject', entityType: 'Task', entityId: id, after: { reason } })
      return t
    })
    await this.notifications.notify({ userIds: t.assigneeId ? [t.assigneeId] : [], houseId: t.houseId, category: 'REQUESTS', priority: 'HIGH', title: 'Работу вернули на доработку', body: reason, payload: { task_id: t.id } })
    return this.detail(id)
  }

  /* ───────── внутреннее ───────── */

  private async checkAssignee(tx: Tx, assigneeId: string | null, contractorId: string | null) {
    if (assigneeId && !(await tx.houseMembership.count({ where: { userId: assigneeId, role: 'WORKER', status: 'ACTIVE' } }))) {
      throw unprocessable(ErrorCode.VALIDATION, 'Исполнитель — работник этого дома')
    }
    if (contractorId && !(await tx.contractor.count({ where: { id: contractorId, isActive: true } }))) throw unprocessable(ErrorCode.VALIDATION, 'Подрядчик не найден')
  }

  private async notifyAssignee(t: Task) {
    if (!t.assigneeId) return
    await this.notifications.notify({
      userIds: [t.assigneeId], houseId: t.houseId, category: 'REQUESTS', priority: t.priority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      title: t.priority === 'CRITICAL' ? 'Срочная задача' : 'Новая задача', body: t.title, payload: { task_id: t.id },
    })
  }

  private async find(tx: Tx, id: string): Promise<Task> {
    const t = await tx.task.findFirst({ where: { id } })
    if (!t) throw notFound('Задача')
    return t
  }

  private async findOwn(tx: Tx, id: string): Promise<Task> {
    const t = await this.find(tx, id)
    if (t.assigneeId !== ctx().userId) throw notFound('Задача')
    return t
  }

  /** Работник видит только свои задачи; чужая для него не существует */
  private async findAllowed(tx: Tx, id: string): Promise<TaskRow> {
    const { userId, role } = ctx()
    const t = await tx.task.findFirst({ where: { id, ...(isBoardRole(role) ? {} : { assigneeId: userId }) }, include: taskInclude })
    if (!t) throw notFound('Задача')
    return t
  }
}
