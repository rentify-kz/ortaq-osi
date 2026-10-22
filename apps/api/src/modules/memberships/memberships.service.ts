import { Injectable } from '@nestjs/common'
import { createInviteBody, ErrorCode, type CreateInviteBody, type JoinRequestStatus } from '@ortaq/shared'
import { asSystem, ctx } from '../../common/context'
import { conflict, notFound, unprocessable } from '../../common/errors'
import { maskPhone } from '../../common/mask'
import { env } from '../../config/env'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'

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
