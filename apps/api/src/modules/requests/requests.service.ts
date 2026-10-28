import { Injectable } from '@nestjs/common'
import type { Prisma, Request } from '@prisma/client'
import { createRequestBody, ErrorCode, requestListQuery, type CreateRequestBody, type RequestTriage, type TriageFlag } from '@ortaq/shared'
import type { z } from 'zod'
import { ctx } from '../../common/context'
import { notFound, unprocessable } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AiService } from '../../integrations/ai/ai.service'
import { similarity } from '../../integrations/ai/rules-ai.provider'
import { AuditService } from '../audit/audit.service'
import { FilesService } from '../files/files.service'
import { NotificationsService } from '../notifications/notifications.service'
import { aiLocation, deriveTitle, listInclude, listView, OPEN_STATUSES, progress } from './requests.views'
import { isBoardRole, visibleRequestsWhere } from './visibility'

const DUPLICATE_WINDOW_MS = 3600_000
const EXACT_DUPLICATE = 0.8
const CANDIDATE_DAYS = 30
const LIST_LIMIT = 200

const viewer = () => {
  const { userId = '', role, houseId = '' } = ctx()
  return { userId, role, houseId, board: isBoardRole(role) }
}

/**
 * Заявки жильцов (docs/05 §5.2, docs/06 §6.1, docs/08 §8.1). Цепочка подачи: точный дубликат
 * от того же жильца за час склеивается сам → кандидаты в дубли по локации → подсказка ИИ.
 * ИИ ничего не отклоняет: всё уходит председателю, подозрительное — с пометкой.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(input: CreateRequestBody) {
    const b = createRequestBody.parse(input)
    const v = viewer()
    const description = b.description

    // Шаг 1: двойное нажатие «Отправить» — та же проблема от того же жильца в течение часа
    if (!v.board) {
      const twin = await this.db.run((tx) => this.recentTwin(tx, v.userId, b.location_type, b.location_entrance ?? null, description))
      if (twin) {
        if (b.photo_file_ids.length > 0) {
          await this.db.run(async (tx) => {
            const ev = await tx.requestEvent.create({ data: { houseId: v.houseId, requestId: twin.id, actorId: v.userId, type: 'COMMENT', data: { text: 'Дополнительные фото', photo_file_ids: b.photo_file_ids } } })
            await this.files.attach(tx, b.photo_file_ids, 'REQUEST_EVENT', ev.id, v.userId)
          })
        }
        return { ...(await this.detail(twin.id)), merged: true }
      }
    }

    const created = await this.db.run(async (tx) => {
      const unitId = b.location_type === 'APARTMENT' ? await this.resolveUnit(tx, v, b.unit_number ?? null) : null
      // Номер в доме — счётчиком под блокировкой строки дома: две заявки не получат один номер
      const seq = await tx.$queryRaw<{ request_seq: number }[]>`
        UPDATE houses SET request_seq = request_seq + 1 WHERE id = ${v.houseId}::uuid RETURNING request_seq`
      const number = seq[0]?.request_seq
      if (!number) throw notFound('Дом')
      const r = await tx.request.create({
        data: {
          houseId: v.houseId, number, authorId: v.userId, title: b.title ?? deriveTitle(description), description,
          category: b.category, locationType: b.location_type, locationEntrance: b.location_entrance ?? null,
          locationFloor: b.location_floor ?? null, locationDetail: b.location_detail ?? null, unitId,
          // Заявку председателя триаж не проверяет: он сам её и разбирает
          status: v.board ? 'ACCEPTED' : 'TRIAGE', acceptedAt: v.board ? new Date() : null,
          prioritySetBy: v.board ? 'CHAIRMAN' : null, photoFileIds: b.photo_file_ids,
        },
      })
      await this.files.attach(tx, b.photo_file_ids, 'REQUEST', r.id, v.userId)
      await tx.requestEvent.create({ data: { houseId: v.houseId, requestId: r.id, actorId: v.userId, type: 'CREATED' } })
      await this.audit.append(tx, { action: 'request.create', entityType: 'Request', entityId: r.id, after: { number, category: r.category, location: r.locationType } })
      return r
    })

    const triaged = v.board ? created : await this.triage(created)
    await this.notifyBoard(triaged)
    return this.detail(created.id)
  }

  list(input: z.input<typeof requestListQuery>) {
    const q = requestListQuery.parse(input)
    const v = viewer()
    const where: Prisma.RequestWhereInput[] = [visibleRequestsWhere(v.userId, v.role)]
    if (q.status === 'open') where.push({ status: { in: [...OPEN_STATUSES] } })
    if (q.status === 'done') where.push({ status: 'DONE' })
    if (q.filter === 'urgent') where.push({ priority: { in: ['CRITICAL', 'HIGH'] } })
    if (q.filter === 'mine') where.push({ authorId: v.userId })
    if (q.filter === 'unassigned') where.push({ status: { in: ['ACCEPTED', 'IN_PROGRESS'] }, tasks: { none: { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED'] } } } })

    return this.db.run(async (tx) => {
      const rows = await tx.request.findMany({
        where: { AND: where },
        include: listInclude,
        // Срочные вверху (docs/06 §6.1): порядок значений enum в базе — от CRITICAL к LOW
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: LIST_LIMIT,
      })
      return rows.map((r) => listView(r, v))
    })
  }

  async detail(id: string) {
    const v = viewer()
    return this.db.run(async (tx) => {
      const r = await tx.request.findFirst({
        where: { id, ...visibleRequestsWhere(v.userId, v.role) },
        include: {
          ...listInclude,
          stages: { orderBy: { order: 'asc' } },
          duplicateOf: { select: { id: true, number: true, title: true } },
          followers: { where: { userId: v.userId }, select: { userId: true } },
          tasks: {
            include: {
              assignee: { select: { fullName: true } },
              contractor: { select: { name: true } },
              completions: { orderBy: { completedAt: 'desc' } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!r) throw notFound('Заявка')
      const triage = r.aiTriage as (RequestTriage & { job_id?: string }) | null
      const possible = triage?.duplicate_of
        ? await tx.request.findFirst({ where: { number: triage.duplicate_of, ...visibleRequestsWhere(v.userId, v.role) }, select: { id: true, number: true, title: true } })
        : null
      // Фото работы жильцам — только подтверждённые председателем (docs/07 §7.2)
      const workPhotos = r.tasks.flatMap((t) => t.completions.filter((c) => v.board || (c.approvedAt && c.visibleToResidents)).flatMap((c) => c.photoFileIds))

      return {
        ...listView({ ...r, tasks: r.tasks.filter((t) => ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED'].includes(t.status)) }, v),
        description: r.description,
        location: { type: r.locationType, entrance: r.locationEntrance, floor: r.locationFloor, detail: r.locationDetail, unit_number: r.unit?.number ?? null },
        photo_file_ids: r.photoFileIds,
        work_photo_file_ids: workPhotos,
        stages: r.stages.map((s) => ({ id: s.id, order: s.order, title: s.title, status: s.status, completed_at: s.completedAt, note: s.note })),
        progress: progress(r.stages),
        tasks: r.tasks.map((t) => ({
          id: t.id, title: t.title, status: t.status, stage_id: t.stageId, due_at: t.dueAt,
          assignee: t.assignee?.fullName ?? t.contractor?.name ?? null,
        })),
        duplicate_of: r.duplicateOf,
        possible_duplicate: possible && possible.id !== r.id ? possible : null,
        is_following: r.followers.length > 0,
        rejection_reason: r.rejectionReason,
        rating: r.authorId === v.userId || v.board ? r.rating : null,
        done_at: r.doneAt,
        ...(v.board && { ai_triage: triage, priority_set_by: r.prioritySetBy }),
      }
    })
  }

  /** История заявки. Жильцу — публичные события; имена соседей не показываем, только «Жилец» */
  async activity(id: string) {
    const v = viewer()
    return this.db.run(async (tx) => {
      const r = await tx.request.findFirst({ where: { id, ...visibleRequestsWhere(v.userId, v.role) }, select: { id: true } })
      if (!r) throw notFound('Заявка')
      const events = await tx.requestEvent.findMany({ where: { requestId: id, ...(v.board ? {} : { public: true }) }, orderBy: { createdAt: 'asc' } })
      const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))]
      const members = await tx.houseMembership.findMany({ where: { userId: { in: actorIds } }, select: { userId: true, role: true, user: { select: { fullName: true } } } })
      const actor = (id: string | null) => {
        if (!id) return { name: 'Система', role: null }
        if (id === v.userId) return { name: 'Вы', role: null }
        const m = members.find((x) => x.userId === id)
        const staff = m && m.role !== 'RESIDENT'
        return { name: v.board || staff ? (m?.user.fullName ?? 'Участник') : 'Жилец', role: m?.role ?? null }
      }
      return events.map((e) => ({ id: e.id, type: e.type, data: e.data, created_at: e.createdAt, actor: actor(e.actorId), ...(v.board && { public: e.public }) }))
    })
  }

  /* ───────── внутреннее ───────── */

  private async recentTwin(tx: Tx, userId: string, locationType: string, entrance: number | null, description: string): Promise<Request | null> {
    const recent = await tx.request.findMany({
      where: {
        authorId: userId, locationType: locationType as Request['locationType'], locationEntrance: entrance,
        createdAt: { gt: new Date(Date.now() - DUPLICATE_WINDOW_MS) }, status: { in: [...OPEN_STATUSES] }, deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    return recent.find((r) => similarity(r.description, description) >= EXACT_DUPLICATE) ?? null
  }

  /** Квартира в заявке: жильцу — только своя, председатель указывает любую */
  private async resolveUnit(tx: Tx, v: ReturnType<typeof viewer>, number: string | null): Promise<string> {
    if (v.board) {
      if (!number) throw unprocessable(ErrorCode.VALIDATION, 'Укажите номер квартиры')
      const unit = await tx.unit.findFirst({ where: { number }, select: { id: true } })
      if (!unit) throw unprocessable(ErrorCode.UNIT_NOT_FOUND, `Помещения №${number} в доме нет`)
      return unit.id
    }
    const own = await tx.unitOwnership.findMany({ where: { userId: v.userId, verificationStatus: { not: 'REJECTED' } }, include: { unit: { select: { id: true, number: true } } } })
    const pick = number ? own.find((o) => o.unit.number === number) : own[0]
    if (!pick) throw unprocessable(ErrorCode.UNIT_NOT_FOUND, 'Заявку про квартиру можно подать только по своему помещению')
    return pick.unit.id
  }

  /** Шаги 2–3: кандидаты в дубли по локации и подсказка ИИ. Без ответа модели — «без автопроверки» */
  private async triage(r: Request): Promise<Request> {
    const { candidates, names } = await this.db.run(async (tx) => {
      const candidates = await tx.request.findMany({
        where: {
          id: { not: r.id }, status: { in: ['TRIAGE', 'ACCEPTED', 'IN_PROGRESS'] }, locationType: r.locationType,
          ...(r.locationEntrance ? { locationEntrance: r.locationEntrance } : {}),
          createdAt: { gt: new Date(Date.now() - CANDIDATE_DAYS * 86_400_000) }, deletedAt: null,
        },
        select: { number: true, title: true, description: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      const members = await tx.houseMembership.findMany({ where: { status: 'ACTIVE' }, select: { user: { select: { fullName: true } } } })
      return { candidates, names: members.map((m) => m.user.fullName).filter(Boolean) }
    })

    const res = await this.ai.triage(
      { id: r.id, houseId: r.houseId, text: `${r.title}. ${r.description}`, category: r.category, location: aiLocation(r) },
      candidates.map((c) => ({ number: c.number, text: `${c.title}. ${c.description}` })),
      names,
    )
    const flags: TriageFlag[] = []
    if (!res) flags.push('NO_AUTOCHECK')
    else {
      if (res.triage.needs_clarification) flags.push('NEEDS_CLARIFICATION')
      if (!res.triage.is_meaningful || res.triage.spam_likelihood >= 0.7) flags.push('SUSPICIOUS')
      if (res.triage.duplicate_of && res.triage.duplicate_confidence >= 0.5) flags.push('POSSIBLE_DUPLICATE')
    }
    return this.db.run(async (tx) => {
      const updated = await tx.request.update({
        where: { id: r.id },
        data: {
          priority: res?.triage.suggested_priority ?? 'NORMAL',
          prioritySetBy: res ? 'AI_SUGGESTED' : null,
          aiTriage: res ? { ...res.triage, job_id: res.jobId } : undefined,
          triageFlags: flags,
        },
      })
      await tx.requestEvent.create({ data: { houseId: r.houseId, requestId: r.id, type: 'TRIAGED', public: false, data: { flags, priority: updated.priority } } })
      return updated
    })
  }

  /** Новая заявка — председателю. Критическая будит и по SMS (docs/08 §8.11) */
  private async notifyBoard(r: Request) {
    const chairmen = await this.db.run((tx) => tx.houseMembership.findMany({ where: { role: 'CHAIRMAN', status: 'ACTIVE', userId: { not: r.authorId } }, select: { userId: true } }))
    await this.notifications.notify({
      userIds: chairmen.map((c) => c.userId), houseId: r.houseId, category: 'REQUESTS',
      priority: r.priority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      title: r.priority === 'CRITICAL' ? `Срочная заявка №${r.number}` : `Новая заявка №${r.number}`,
      body: r.title, payload: { request_id: r.id },
    })
  }
}
