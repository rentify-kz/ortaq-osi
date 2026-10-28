import { Injectable } from '@nestjs/common'
import type { Request } from '@prisma/client'
import {
  ErrorCode, rateRequestBody, requestCommentBody, updateRequestBody,
  type RequestCommentBody, type RequestTriage, type UpdateRequestBody,
} from '@ortaq/shared'
import type { z } from 'zod'
import { ctx } from '../../common/context'
import { AppError, conflict, forbidden, notFound, unprocessable } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AiService } from '../../integrations/ai/ai.service'
import { AuditService } from '../audit/audit.service'
import { FilesService } from '../files/files.service'
import { NotificationsService } from '../notifications/notifications.service'
import type { Priority } from '../notifications/schedule'
import { aiLocation } from './requests.views'
import { RequestsService } from './requests.service'
import { isBoardRole, visibleRequestsWhere } from './visibility'

const closed = (message = 'Заявка уже закрыта') => new AppError(409, ErrorCode.REQUEST_CLOSED, message)
/** Что меняется вместе со статусом: отметки времени и причина отказа */
type TransitionData = { acceptedAt?: Date; doneAt?: Date; rejectionReason?: string }

const isClosed = (r: Request) => ['DONE', 'REJECTED', 'CANCELLED'].includes(r.status)

/**
 * Действия с заявкой. Председатель: принять, отклонить с причиной, объединить с дубликатом,
 * поменять приоритет, закрыть. Жилец: отменить свою, присоединиться к чужой, комментировать,
 * оценить решение. Каждое действие — событие в истории заявки и запись в журнале.
 */
@Injectable()
export class RequestActionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
    private readonly requests: RequestsService,
  ) {}

  /** Приоритет одним нажатием. priority_set_by = CHAIRMAN — так видно, где ИИ промахнулся */
  async update(id: string, input: UpdateRequestBody) {
    const b = updateRequestBody.parse(input)
    const r = await this.db.run(async (tx) => {
      const before = await this.find(tx, id)
      const r = await tx.request.update({
        where: { id },
        data: { priority: b.priority, category: b.category, title: b.title, ...(b.priority && { prioritySetBy: 'CHAIRMAN' as const }) },
      })
      if (b.priority && b.priority !== before.priority) {
        await this.event(tx, r, 'PRIORITY_CHANGED', { from: before.priority, to: b.priority })
      }
      await this.audit.append(tx, { action: 'request.update', entityType: 'Request', entityId: id, before: { priority: before.priority, category: before.category }, after: b })
      return { before, r }
    })
    const triage = r.before.aiTriage as (RequestTriage & { job_id?: string }) | null
    if (b.priority && triage?.job_id) await this.ai.decide(triage.job_id, b.priority === triage.suggested_priority ? 'ACCEPTED' : 'MODIFIED')
    return this.requests.detail(id)
  }

  async accept(id: string) {
    const r = await this.transition(id, ['NEW', 'TRIAGE'], 'ACCEPTED', 'ACCEPTED', { acceptedAt: new Date() })
    const triage = r.aiTriage as (RequestTriage & { job_id?: string }) | null
    if (triage?.job_id && r.prioritySetBy === 'AI_SUGGESTED') await this.ai.decide(triage.job_id, 'ACCEPTED')
    await this.tell(r, 'NORMAL', `Заявка №${r.number} принята`, 'Председатель взял её в работу')
    return this.requests.detail(id)
  }

  async reject(id: string, reason: string) {
    const r = await this.transition(id, ['NEW', 'TRIAGE', 'ACCEPTED'], 'REJECTED', 'REJECTED', { rejectionReason: reason }, { reason })
    await this.tell(r, 'NORMAL', `Заявка №${r.number} отклонена`, reason)
    return this.requests.detail(id)
  }

  /**
   * Дубликат: заявка закрывается со ссылкой на основную, автор следит за основной.
   * У основной растёт число обращений — сигнал о массовости проблемы (docs/06 §6.1)
   */
  async merge(id: string, intoId: string) {
    const { source, target } = await this.db.run(async (tx) => {
      const source = await this.find(tx, id)
      if (isClosed(source)) throw closed()
      let target = await this.find(tx, intoId)
      if (target.duplicateOfId) target = await this.find(tx, target.duplicateOfId)
      if (target.id === source.id) throw unprocessable(ErrorCode.VALIDATION, 'Нельзя объединить заявку с самой собой')
      if (isClosed(target)) throw closed('Основная заявка уже закрыта')

      await tx.request.update({ where: { id: source.id }, data: { status: 'CANCELLED', duplicateOfId: target.id } })
      await tx.requestFollower.upsert({
        where: { requestId_userId: { requestId: target.id, userId: source.authorId } },
        create: { houseId: target.houseId, requestId: target.id, userId: source.authorId },
        update: {},
      })
      await this.event(tx, source, 'MERGED_INTO', { number: target.number, title: target.title })
      await this.event(tx, target, 'DUPLICATE_ADDED', { number: source.number })
      await this.audit.append(tx, { action: 'request.merge', entityType: 'Request', entityId: source.id, after: { into: target.number } })
      return { source, target }
    })
    await this.notifications.notify({
      userIds: [source.authorId], houseId: source.houseId, category: 'REQUESTS', priority: 'NORMAL',
      title: `Заявка №${source.number} объединена с №${target.number}`,
      body: 'Об этой проблеме уже сообщили. Вы будете получать новости по общей заявке', payload: { request_id: target.id },
    })
    return this.requests.detail(target.id)
  }

  async close(id: string) {
    const r = await this.transition(id, ['ACCEPTED', 'IN_PROGRESS'], 'DONE', 'DONE', { doneAt: new Date() })
    await this.tell(r, 'NORMAL', `Заявка №${r.number} выполнена`, 'Посмотрите результат и оцените решение')
    return this.requests.detail(id)
  }

  /** Автор отзывает свою заявку, пока её не закрыли */
  async cancel(id: string) {
    const userId = ctx().userId
    const r = await this.db.run((tx) => this.find(tx, id))
    if (r.authorId !== userId) throw forbidden('Отменить заявку может только её автор')
    await this.transition(id, ['NEW', 'TRIAGE', 'ACCEPTED'], 'CANCELLED', 'CANCELLED', {})
    return this.requests.detail(id)
  }

  /** «Об этом уже сообщили» — следить за чужой заявкой вместо подачи своей */
  async follow(id: string) {
    const userId = ctx().userId ?? ''
    await this.db.run(async (tx) => {
      const r = await this.findVisible(tx, id)
      if (isClosed(r)) throw closed()
      if (r.authorId === userId) return
      await tx.requestFollower.upsert({
        where: { requestId_userId: { requestId: id, userId } },
        create: { houseId: r.houseId, requestId: id, userId },
        update: {},
      })
    })
    return this.requests.detail(id)
  }

  async comment(id: string, input: RequestCommentBody) {
    const b = requestCommentBody.parse(input)
    const { userId = '', role } = ctx()
    await this.db.run(async (tx) => {
      const r = await this.findVisible(tx, id)
      if (isClosed(r)) throw closed()
      const follower = await tx.requestFollower.count({ where: { requestId: id, userId } })
      if (!isBoardRole(role) && r.authorId !== userId && follower === 0) throw forbidden('Комментировать может автор заявки или присоединившийся к ней')
      const ev = await this.event(tx, r, 'COMMENT', { text: b.text, photo_file_ids: b.photo_file_ids })
      await this.files.attach(tx, b.photo_file_ids, 'REQUEST_EVENT', ev.id, userId, 'REQUEST_PHOTO')
    })
    return this.requests.activity(id)
  }

  /** Оценка решения — обратная связь председателю о работе персонала (docs/05 §5.3) */
  async rate(id: string, input: z.input<typeof rateRequestBody>) {
    const b = rateRequestBody.parse(input)
    await this.db.run(async (tx) => {
      const r = await this.find(tx, id)
      if (r.authorId !== ctx().userId) throw forbidden('Оценить может автор заявки')
      if (r.status !== 'DONE') throw unprocessable(ErrorCode.VALIDATION, 'Оценить можно выполненную заявку')
      if (r.rating !== null) throw conflict(ErrorCode.CONFLICT, 'Оценка уже поставлена')
      await tx.request.update({ where: { id }, data: { rating: b.rating, ratingComment: b.comment ?? null } })
      await this.event(tx, r, 'RATED', { rating: b.rating }, false)
    })
    return this.requests.detail(id)
  }

  /** План решения от ИИ — черновик: этапы из него создаёт председатель отдельным действием */
  async suggest(id: string) {
    const { r, names } = await this.db.run(async (tx) => {
      const r = await this.find(tx, id)
      const members = await tx.houseMembership.findMany({ where: { status: 'ACTIVE' }, select: { user: { select: { fullName: true } } } })
      return { r, names: members.map((m) => m.user.fullName).filter(Boolean) }
    })
    const res = await this.ai.suggest({ id: r.id, houseId: r.houseId, text: `${r.title}. ${r.description}`, category: r.category, location: aiLocation(r) }, names)
    if (!res) throw new AppError(503, ErrorCode.CONFLICT, 'Подсказка сейчас недоступна. Добавьте этапы вручную')
    return { job_id: res.jobId, ...res.plan }
  }

  /* ───────── внутреннее ───────── */

  private async transition(id: string, from: string[], to: Request['status'], eventType: string, data: TransitionData, eventData?: object) {
    return this.db.run(async (tx) => {
      const r = await this.find(tx, id)
      if (!from.includes(r.status)) throw closed(`Заявка в статусе «${r.status}», это действие недоступно`)
      const updated = await tx.request.update({ where: { id }, data: { ...data, status: to } })
      await this.event(tx, updated, eventType, eventData)
      await this.audit.append(tx, { action: `request.${eventType.toLowerCase()}`, entityType: 'Request', entityId: id, before: { status: r.status }, after: { status: to, ...eventData } })
      return updated
    })
  }

  event(tx: Tx, r: Pick<Request, 'id' | 'houseId'>, type: string, data?: object, pub = true) {
    return tx.requestEvent.create({ data: { houseId: r.houseId, requestId: r.id, actorId: ctx().userId ?? null, type, data: data ?? undefined, public: pub } })
  }

  /** Автору и тем, кто присоединился к заявке; не тому, кто сделал действие */
  async tell(r: Request, priority: Priority, title: string, body: string) {
    const followers = await this.db.run((tx) => tx.requestFollower.findMany({ where: { requestId: r.id }, select: { userId: true } }))
    await this.notifications.notify({
      userIds: [r.authorId, ...followers.map((f) => f.userId)].filter((u) => u !== ctx().userId),
      houseId: r.houseId, category: 'REQUESTS', priority, title, body, payload: { request_id: r.id },
    })
  }

  private async find(tx: Tx, id: string): Promise<Request> {
    const r = await tx.request.findFirst({ where: { id, deletedAt: null } })
    if (!r) throw notFound('Заявка')
    return r
  }

  private async findVisible(tx: Tx, id: string): Promise<Request> {
    const { userId = '', role } = ctx()
    const r = await tx.request.findFirst({ where: { id, ...visibleRequestsWhere(userId, role) } })
    if (!r) throw notFound('Заявка')
    return r
  }
}
