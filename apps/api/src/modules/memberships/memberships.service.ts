import { Injectable } from '@nestjs/common'
import { acceptInviteBody, createInviteBody, ErrorCode, NotificationCategory, TERMS_VERSION, type CreateInviteBody, type JoinRequestBody, type JoinRequestStatus } from '@ortaq/shared'
import type { z } from 'zod'
import { asSystem, ctx } from '../../common/context'
import { AppError, conflict, notFound, unauthenticated, unprocessable } from '../../common/errors'
import { maskPhone } from '../../common/mask'
import { env } from '../../config/env'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from '../notifications/notifications.service'

const DAY_MS = 24 * 3600 * 1000

type InviteRow = {
  id: string; type: string; targetRole: string; expiresAt: Date; maxUses: number | null
  useCount: number; revokedAt: Date | null; createdAt: Date
}

function inviteStatus(i: InviteRow, now = new Date()): 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED' {
  if (i.revokedAt) return 'REVOKED'
  if (i.expiresAt <= now) return 'EXPIRED'
  if (i.maxUses !== null && i.useCount >= i.maxUses) return 'EXHAUSTED'
  return 'ACTIVE'
}

function inviteView(i: InviteRow) {
  return {
    id: i.id, type: i.type, target_role: i.targetRole, expires_at: i.expiresAt, max_uses: i.maxUses,
    use_count: i.useCount, status: inviteStatus(i), created_at: i.createdAt,
  }
}

type IssueParams = { type: 'PUBLIC_LINK' | 'PERSONAL'; target_role: 'RESIDENT' | 'WORKER'; expires_in_days: number; max_uses: number | null }

/**
 * Приглашения и заявки на вступление (docs/04 §5–6, docs/13 §3).
 * Ссылка даёт ровно одно право — начать регистрацию в доме. Личность и право голоса
 * определяет верификация, а не ссылка: её могли переслать из общего чата кому угодно.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ───────── приглашения ───────── */

  /** Токен показывается один раз: в базе только его хеш, утечка дампа не даёт рабочих ссылок */
  createInvite(input: CreateInviteBody) {
    return this.db.run((tx) => this.issueInvite(tx, createInviteBody.parse(input)))
  }

  listInvites() {
    return this.db.run(async (tx) => (await tx.invite.findMany({ orderBy: { createdAt: 'desc' } })).map(inviteView))
  }

  revokeInvite(inviteId: string) {
    return this.db.run(async (tx) => {
      const invite = await tx.invite.findFirst({ where: { id: inviteId } })
      if (!invite) throw notFound('Приглашение')
      if (!invite.revokedAt) {
        await tx.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } })
        await this.audit.append(tx, { action: 'invite.revoke', entityType: 'Invite', entityId: invite.id })
      }
      return { revoked: true }
    })
  }

  /** «Отозвать и выпустить новую» одним действием: на случай, если ссылка ушла за пределы чата */
  reissueInvite(inviteId: string) {
    return this.db.run(async (tx) => {
      const old = await tx.invite.findFirst({ where: { id: inviteId } })
      if (!old) throw notFound('Приглашение')
      if (!old.revokedAt) {
        await tx.invite.update({ where: { id: old.id }, data: { revokedAt: new Date() } })
        await this.audit.append(tx, { action: 'invite.revoke', entityType: 'Invite', entityId: old.id, after: { reason: 'reissue' } })
      }
      const days = Math.max(1, Math.round((old.expiresAt.getTime() - old.createdAt.getTime()) / DAY_MS))
      return this.issueInvite(tx, {
        type: old.type,
        target_role: old.targetRole === 'WORKER' ? 'WORKER' : 'RESIDENT',
        expires_in_days: Math.min(days, 90),
        max_uses: old.maxUses,
      })
    })
  }

  /**
   * Единственный эндпоинт, который до входа сообщает что-то о доме. Только название и роль:
   * ни адреса, ни числа жильцов. Недействительная ссылка не раскрывает даже названия.
   */
  resolveInvite(token: string) {
    return asSystem(() =>
      this.db.run(async (tx) => {
        const invite = await tx.invite.findUnique({
          where: { tokenHash: this.crypto.sha256(token) },
          include: { house: { select: { displayName: true } } },
        })
        await this.audit.append(tx, { houseId: invite?.houseId ?? null, action: 'invite.resolve', entityType: 'Invite', entityId: invite?.id ?? null })
        if (!invite || inviteStatus(invite) !== 'ACTIVE') return { valid: false as const }
        return { valid: true as const, house_display_name: invite.house.displayName, target_role: invite.targetRole }
      }),
    )
  }

  /** Действующее приглашение по токену или ошибка. Вызывается только в системном контексте */
  private async activeInvite(tx: Tx, token: string) {
    const invite = await tx.invite.findUnique({ where: { tokenHash: this.crypto.sha256(token) }, include: { house: true } })
    if (!invite || inviteStatus(invite) !== 'ACTIVE') {
      throw new AppError(400, ErrorCode.INVITE_INVALID, 'Ссылка не работает: её отозвали, у неё истёк срок или закончились активации')
    }
    return invite
  }

  /** Номера помещений для выбора при регистрации: без фамилий и площадей */
  inviteUnits(token: string) {
    return asSystem(() =>
      this.db.run(async (tx) => {
        const invite = await this.activeInvite(tx, token)
        const units = await tx.unit.findMany({ where: { houseId: invite.houseId }, select: { number: true, entrance: true } })
        return units.sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }))
      }),
    )
  }

  /**
   * Вступление по ссылке (docs/04 §5.3). Ссылка даёт дом и роль, но не право голоса:
   * собственность остаётся PENDING до подтверждения личности через ЭЦП.
   */
  acceptInvite(token: string, input: z.input<typeof acceptInviteBody>) {
    const body = acceptInviteBody.parse(input)
    const userId = ctx().userId
    if (!userId) throw unauthenticated()
    return asSystem(() =>
      this.db.run(async (tx) => {
        const invite = await this.activeInvite(tx, token)
        const houseId = invite.houseId
        const role = invite.targetRole === 'WORKER' ? 'WORKER' : 'RESIDENT'

        const existing = await tx.houseMembership.findFirst({ where: { houseId, userId, status: { not: 'REVOKED' } } })
        if (existing) throw conflict(ErrorCode.ALREADY_MEMBER, 'Вы уже состоите в этом доме')

        let unit: { id: string; number: string } | null = null
        if (role === 'RESIDENT') {
          if (!body.unit_number || !body.relation) throw unprocessable(ErrorCode.VALIDATION, 'Укажите помещение и кем вы в нём являетесь')
          unit = await tx.unit.findFirst({ where: { houseId, number: body.unit_number }, select: { id: true, number: true } })
          if (!unit) throw unprocessable(ErrorCode.UNIT_NOT_FOUND, `Помещения №${body.unit_number} в доме нет`)
        }

        // Условный инкремент: две одновременные регистрации не превысят лимит активаций
        const claimed = await tx.$executeRaw`
          UPDATE invites SET use_count = use_count + 1
          WHERE id = ${invite.id}::uuid AND revoked_at IS NULL AND (max_uses IS NULL OR use_count < max_uses)`
        if (claimed === 0) throw new AppError(400, ErrorCode.INVITE_INVALID, 'У ссылки закончились активации')

        await tx.houseMembership.create({ data: { houseId, userId, role, status: 'ACTIVE', joinedVia: 'INVITE_LINK' } })
        if (unit && body.relation) {
          await tx.unitOwnership.create({ data: { houseId, unitId: unit.id, userId, relation: body.relation, verificationStatus: 'PENDING' } })
        }
        await tx.consent.create({ data: { userId, kind: 'TERMS', version: TERMS_VERSION } })
        if (body.notifications) await tx.consent.create({ data: { userId, kind: 'NOTIFICATIONS', version: TERMS_VERSION } })
        else {
          // Отказ от уведомлений = push выключен везде, кроме голосований: их отключить нельзя (docs/08 §8.11)
          await tx.notificationPreference.createMany({
            data: NotificationCategory.filter((c) => c !== 'VOTES').map((category) => ({ userId, category, push: false })),
            skipDuplicates: true,
          })
        }

        await this.audit.append(tx, {
          houseId, action: 'invite.accept', entityType: 'Invite', entityId: invite.id,
          after: { user_id: userId, role, unit: unit?.number ?? null, relation: body.relation ?? null },
        })
        return { house_id: houseId, house_display_name: invite.house.displayName, role }
      }),
    )
  }

  /** Вступление без ссылки (docs/04 §6): заявка председателю, решение за ним */
  createJoinRequest(body: JoinRequestBody) {
    const userId = ctx().userId
    if (!userId) throw unauthenticated()
    return asSystem(() =>
      this.db.run(async (tx) => {
        const house = await tx.house.findUnique({ where: { id: body.house_id }, select: { id: true } })
        if (!house) throw notFound('Дом')
        if (await tx.houseMembership.findFirst({ where: { houseId: house.id, userId, status: { not: 'REVOKED' } } })) {
          throw conflict(ErrorCode.ALREADY_MEMBER, 'Вы уже состоите в этом доме')
        }
        if (await tx.joinRequest.findFirst({ where: { houseId: house.id, userId, status: 'PENDING' } })) {
          throw conflict(ErrorCode.JOIN_REQUEST_EXISTS, 'Заявка уже отправлена и ждёт решения председателя')
        }
        const request = await tx.joinRequest.create({
          data: { houseId: house.id, userId, claimedUnitNumber: body.unit_number, claimedRelation: body.relation, comment: body.comment ?? null },
        })
        await this.audit.append(tx, { houseId: house.id, action: 'join_request.create', entityType: 'JoinRequest', entityId: request.id })
        const chairmen = await tx.houseMembership.findMany({ where: { houseId: house.id, role: 'CHAIRMAN', status: 'ACTIVE' }, select: { userId: true } })
        return { request, chairmen: chairmen.map((c) => c.userId), houseId: house.id }
      }),
    ).then(async ({ request, chairmen, houseId }) => {
      await this.notifications.notify({
        userIds: chairmen, houseId, category: 'MEMBERSHIP', priority: 'NORMAL',
        title: 'Новая заявка на вступление', body: `Помещение №${body.unit_number}. Проверьте и примите решение`,
        payload: { join_request_id: request.id },
      })
      return { id: request.id, status: request.status }
    })
  }

  /** Поиск дома по адресу для заявки без ссылки: только название и адрес, ничего больше */
  searchHouses(q: string) {
    return asSystem(() =>
      this.db.run(async (tx) => {
        const houses = await tx.house.findMany({
          where: { OR: [{ displayName: { contains: q, mode: 'insensitive' } }, { address: { contains: q, mode: 'insensitive' } }] },
          select: { id: true, displayName: true, address: true },
          take: 10,
        })
        return houses.map((h) => ({ id: h.id, display_name: h.displayName, address: h.address }))
      }),
    )
  }

  private async issueInvite(tx: Tx, body: IssueParams) {
    const token = this.crypto.token(16)
    const invite = await tx.invite.create({
      data: {
        houseId: ctx().houseId ?? '',
        tokenHash: this.crypto.sha256(token),
        type: body.type,
        targetRole: body.target_role,
        expiresAt: new Date(Date.now() + body.expires_in_days * DAY_MS),
        // Персональная ссылка — на одного человека
        maxUses: body.type === 'PERSONAL' ? 1 : body.max_uses,
        createdBy: ctx().userId ?? '',
      },
    })
    await this.audit.append(tx, { action: 'invite.create', entityType: 'Invite', entityId: invite.id, after: inviteView(invite) })
    // Токен во фрагменте после #: фрагмент не уходит на сервер и не оседает в логах прокси
    return { ...inviteView(invite), token, url: `${env().WEB_ORIGIN}/join#${token}` }
  }

  /* ───────── заявки на вступление ───────── */

  listJoinRequests(status: JoinRequestStatus) {
    return this.db.run(async (tx) => {
      const requests = await tx.joinRequest.findMany({
        where: { status },
        include: { user: { select: { fullName: true, phone: true } } },
        orderBy: { createdAt: 'asc' },
      })
      const numbers = [...new Set(requests.map((r) => r.claimedUnitNumber))]
      const units = await tx.unit.findMany({ where: { number: { in: numbers } }, select: { number: true } })
      const existing = new Set(units.map((u) => u.number))
      return requests.map((r) => ({
        id: r.id,
        full_name: r.user.fullName,
        phone: maskPhone(r.user.phone),
        unit_number: r.claimedUnitNumber,
        unit_exists: existing.has(r.claimedUnitNumber),
        relation: r.claimedRelation,
        comment: r.comment,
        status: r.status,
        rejection_reason: r.rejectionReason,
        created_at: r.createdAt,
        // Сверка с реестром появится вместе с импортом реестра (фаза 1)
        registry_match: null,
      }))
    })
  }

  /** Решение принимает председатель: реестр мог устареть после продажи квартиры, docs/04 §6 */
  approveJoinRequest(requestId: string) {
    return this.db.run(async (tx) => {
      const request = await this.pendingRequest(tx, requestId)
      const unit = await tx.unit.findFirst({ where: { number: request.claimedUnitNumber } })
      if (!unit) throw unprocessable(ErrorCode.UNIT_NOT_FOUND, `Помещения №${request.claimedUnitNumber} в доме нет`)

      const membership = await tx.houseMembership.findFirst({ where: { userId: request.userId, status: { not: 'REVOKED' } } })
      if (!membership) {
        await tx.houseMembership.create({ data: { houseId: request.houseId, userId: request.userId, role: 'RESIDENT', status: 'ACTIVE', joinedVia: 'JOIN_REQUEST' } })
      }
      const ownership = await tx.unitOwnership.findFirst({ where: { unitId: unit.id, userId: request.userId } })
      if (!ownership) {
        // Право голоса появится только после верификации личности через ЭЦП
        await tx.unitOwnership.create({
          data: { houseId: request.houseId, unitId: unit.id, userId: request.userId, relation: request.claimedRelation, verificationStatus: 'PENDING' },
        })
      }
      await tx.joinRequest.update({
        where: { id: request.id },
        data: { status: 'APPROVED', reviewedBy: ctx().userId ?? null, reviewedAt: new Date() },
      })
      await this.audit.append(tx, {
        action: 'join_request.approve', entityType: 'JoinRequest', entityId: request.id,
        after: { user_id: request.userId, unit: unit.number, relation: request.claimedRelation },
      })
      return { approved: true }
    })
  }

  rejectJoinRequest(requestId: string, reason: string) {
    return this.db.run(async (tx) => {
      const request = await this.pendingRequest(tx, requestId)
      await tx.joinRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED', rejectionReason: reason, reviewedBy: ctx().userId ?? null, reviewedAt: new Date() },
      })
      await this.audit.append(tx, { action: 'join_request.reject', entityType: 'JoinRequest', entityId: request.id, after: { reason } })
      return { rejected: true }
    })
  }

  private async pendingRequest(tx: Tx, requestId: string) {
    const request = await tx.joinRequest.findFirst({ where: { id: requestId } })
    if (!request) throw notFound('Заявка')
    if (request.status !== 'PENDING') throw conflict(ErrorCode.JOIN_REQUEST_DECIDED, 'По заявке уже принято решение')
    return request
  }
}
