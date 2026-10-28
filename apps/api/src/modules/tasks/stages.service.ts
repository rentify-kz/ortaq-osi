import { Injectable } from '@nestjs/common'
import { createStagesBody, ErrorCode, updateStageBody, type UpdateStageBody } from '@ortaq/shared'
import type { z } from 'zod'
import { ctx } from '../../common/context'
import { AppError, forbidden, notFound } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { RequestActionsService } from '../requests/request-actions.service'
import { RequestsService } from '../requests/requests.service'
import { isBoardRole } from '../requests/visibility'

const closedRequest = () => new AppError(409, ErrorCode.REQUEST_CLOSED, 'Заявка закрыта: этапы не меняются')

/**
 * Этапы работы по заявке (docs/06 §6.2). Отметка этапа сразу меняет прогресс у жильца —
 * ради этой связи этапы и существуют. Создаёт председатель (вручную или из плана ИИ),
 * отмечает он же или исполнитель задачи этого этапа.
 */
@Injectable()
export class StagesService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly requests: RequestsService,
    private readonly actions: RequestActionsService,
  ) {}

  async add(requestId: string, input: z.input<typeof createStagesBody>) {
    const b = createStagesBody.parse(input)
    await this.db.run(async (tx) => {
      const r = await this.openRequest(tx, requestId)
      const last = await tx.requestStage.findFirst({ where: { requestId }, orderBy: { order: 'desc' }, select: { order: true } })
      const start = (last?.order ?? 0) + 1
      await tx.requestStage.createMany({ data: b.titles.map((title, i) => ({ houseId: r.houseId, requestId, order: start + i, title })) })
      await this.actions.event(tx, r, 'STAGES_ADDED', { titles: b.titles })
      await this.audit.append(tx, { action: 'request.stages_add', entityType: 'Request', entityId: requestId, after: { titles: b.titles } })
    })
    return this.requests.detail(requestId)
  }

  async update(requestId: string, stageId: string, input: UpdateStageBody) {
    const b = updateStageBody.parse(input)
    const { userId = '', role } = ctx()
    const result = await this.db.run(async (tx) => {
      const r = await this.openRequest(tx, requestId)
      const stage = await tx.requestStage.findFirst({ where: { id: stageId, requestId } })
      if (!stage) throw notFound('Этап')
      if (!isBoardRole(role)) {
        // Исполнитель отмечает только ход своего этапа; названия и пропуски — решение председателя
        const mine = await tx.task.count({ where: { stageId, assigneeId: userId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'REJECTED'] } } })
        if (!mine || b.title !== undefined || (b.status !== undefined && !['IN_PROGRESS', 'DONE'].includes(b.status))) throw forbidden('Этап отмечает председатель или исполнитель его задачи')
      }
      const done = b.status === 'DONE' && stage.status !== 'DONE'
      const updated = await tx.requestStage.update({
        where: { id: stageId },
        data: {
          status: b.status, title: b.title, note: b.note,
          ...(done && { completedAt: new Date(), completedBy: userId }),
          ...(b.status && b.status !== 'DONE' && { completedAt: null, completedBy: null }),
        },
      })
      if (b.status && b.status !== 'PENDING' && r.status === 'ACCEPTED') await tx.request.update({ where: { id: r.id }, data: { status: 'IN_PROGRESS' } })
      if (done) await this.actions.event(tx, r, 'STAGE_DONE', { title: updated.title })
      await this.audit.append(tx, { action: 'request.stage_update', entityType: 'RequestStage', entityId: stageId, before: { status: stage.status }, after: b })
      return { r, done, title: updated.title }
    })
    if (result.done) await this.actions.tell(result.r, 'NORMAL', `Заявка №${result.r.number}: этап выполнен`, result.title)
    return this.requests.detail(requestId)
  }

  private async openRequest(tx: Tx, id: string) {
    const r = await tx.request.findFirst({ where: { id, deletedAt: null } })
    if (!r) throw notFound('Заявка')
    if (['DONE', 'REJECTED', 'CANCELLED'].includes(r.status)) throw closedRequest()
    return r
  }
}
