import { Injectable } from '@nestjs/common'
import type { Announcement, AnnouncementTarget, Prisma } from '@prisma/client'
import {
  createAnnouncementBody, ErrorCode, updateAnnouncementBody,
  type CreateAnnouncementBody, type UpdateAnnouncementBody,
} from '@ortaq/shared'
import { ctx } from '../../common/context'
import { AppError, notFound, unprocessable } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from '../notifications/notifications.service'

const LIST_LIMIT = 100
const REMIND_COOLDOWN_MS = 3600_000
const PREVIEW_CHARS = 140

type Recipient = { userId: string; entrance: number | null }

const isBoard = () => ctx().role === 'CHAIRMAN' || ctx().role === 'ACCOUNTANT'

/**
 * Объявления дома (docs/06 §6.4): всем жильцам, персоналу, отдельным людям или подъездам.
 * Получатели вычисляются одной функцией — и для ленты, и для push, и для статистики,
 * иначе «прочитали 34 из 128» считалось бы не от тех 128, кому объявление ушло.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    const userId = ctx().userId ?? ''
    return this.db.run(async (tx) => {
      const now = new Date()
      const where: Prisma.AnnouncementWhereInput = isBoard()
        ? { deletedAt: null }
        : { deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], AND: [{ OR: await this.visibleTo(tx, userId) }] }
      const rows = await tx.announcement.findMany({
        where,
        include: { reads: { where: { userId }, select: { readAt: true } } },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        take: LIST_LIMIT,
      })
      return rows.map((a) => ({ ...view(a), is_read: a.reads.length > 0 }))
    })
  }

  async create(input: CreateAnnouncementBody) {
    const b = createAnnouncementBody.parse(input)
    const houseId = ctx().houseId ?? ''
    const { announcement, recipients } = await this.db.run(async (tx) => {
      const house = await tx.house.findUniqueOrThrow({ where: { id: houseId }, select: { entranceCount: true } })
      if (b.audience === 'ENTRANCE' && b.entrances!.some((e) => e > house.entranceCount)) {
        throw unprocessable(ErrorCode.VALIDATION, `В доме ${house.entranceCount} подъезд(а)`)
      }
      if (b.audience === 'SPECIFIC_USERS') {
        const members = await tx.houseMembership.count({ where: { userId: { in: b.user_ids! }, status: 'ACTIVE' } })
        if (members !== new Set(b.user_ids).size) throw unprocessable(ErrorCode.VALIDATION, 'Часть получателей не состоит в доме')
      }
      const a = await tx.announcement.create({
        data: {
          houseId, authorId: ctx().userId ?? '', title: b.title, body: b.body, audience: b.audience, isPinned: b.pinned,
          expiresAt: b.expires_at ? new Date(b.expires_at) : null,
        },
      })
      const targets = b.audience === 'SPECIFIC_USERS'
        ? [...new Set(b.user_ids)].map((userId) => ({ houseId, announcementId: a.id, userId }))
        : b.audience === 'ENTRANCE' ? [...new Set(b.entrances)].map((entrance) => ({ houseId, announcementId: a.id, entrance })) : []
      if (targets.length > 0) await tx.announcementTarget.createMany({ data: targets })
      await this.audit.append(tx, { action: 'announcement.publish', entityType: 'Announcement', entityId: a.id, after: { title: a.title, audience: a.audience } })
      return { announcement: a, recipients: await this.recipients(tx, a) }
    })

    await this.notifications.notify({
      userIds: recipients.map((r) => r.userId).filter((id) => id !== announcement.authorId),
      houseId, category: 'ANNOUNCEMENTS', priority: b.push ? 'NORMAL' : 'LOW',
      title: announcement.title, body: preview(announcement.body), payload: { announcement_id: announcement.id },
    })
    return { ...view(announcement), recipients: recipients.length }
  }

  update(id: string, input: UpdateAnnouncementBody) {
    const b = updateAnnouncementBody.parse(input)
    return this.db.run(async (tx) => {
      const before = await this.find(tx, id)
      const a = await tx.announcement.update({
        where: { id },
        data: {
          title: b.title, body: b.body, isPinned: b.pinned,
          expiresAt: b.expires_at === undefined ? undefined : b.expires_at ? new Date(b.expires_at) : null,
        },
      })
      await this.audit.append(tx, { action: 'announcement.update', entityType: 'Announcement', entityId: id, before: { title: before.title, body: before.body }, after: b })
      return view(a)
    })
  }

  /** Мягкое удаление: прочтения и журнал остаются */
  remove(id: string) {
    return this.db.run(async (tx) => {
      const a = await this.find(tx, id)
      await tx.announcement.update({ where: { id }, data: { deletedAt: new Date() } })
      await this.audit.append(tx, { action: 'announcement.delete', entityType: 'Announcement', entityId: id, before: { title: a.title } })
      return { deleted: true }
    })
  }

  markRead(id: string) {
    const userId = ctx().userId ?? ''
    return this.db.run(async (tx) => {
      const a = await this.find(tx, id)
      if (!isBoard() && !(await this.isAddressedTo(tx, a, userId))) throw notFound('Объявление')
      await tx.announcementRead.upsert({
        where: { announcementId_userId: { announcementId: id, userId } },
        create: { houseId: a.houseId, announcementId: id, userId },
        update: {},
      })
      return { read: true }
    })
  }

  stats(id: string) {
    return this.db.run(async (tx) => {
      const a = await this.find(tx, id)
      const recipients = await this.recipients(tx, a)
      const reads = new Set((await tx.announcementRead.findMany({ where: { announcementId: id }, select: { userId: true } })).map((r) => r.userId))
      const byEntrance = new Map<number | null, { recipients: number; read: number }>()
      for (const r of recipients) {
        const bucket = byEntrance.get(r.entrance) ?? { recipients: 0, read: 0 }
        bucket.recipients++
        if (reads.has(r.userId)) bucket.read++
        byEntrance.set(r.entrance, bucket)
      }
      const read = recipients.filter((r) => reads.has(r.userId)).length
      return {
        recipients: recipients.length,
        read,
        percent: recipients.length ? Math.round((read / recipients.length) * 100) : 0,
        by_entrance: [...byEntrance.entries()]
          .sort(([x], [y]) => (x ?? Infinity) - (y ?? Infinity))
          .map(([entrance, v]) => ({ entrance, ...v })),
      }
    })
  }

  /** «Напомнить непрочитавшим» — не чаще раза в час, иначе это спам, а не напоминание */
  async remind(id: string) {
    const houseId = ctx().houseId ?? ''
    const { a, unread } = await this.db.run(async (tx) => {
      const a = await this.find(tx, id)
      const recent = await tx.auditLog.count({
        where: { houseId, action: 'announcement.remind', entityId: id, createdAt: { gt: new Date(Date.now() - REMIND_COOLDOWN_MS) } },
      })
      if (recent > 0) throw new AppError(429, ErrorCode.RATE_LIMITED, 'Напоминание уже отправлено. Следующее — через час')
      const reads = new Set((await tx.announcementRead.findMany({ where: { announcementId: id }, select: { userId: true } })).map((r) => r.userId))
      const unread = (await this.recipients(tx, a)).filter((r) => !reads.has(r.userId)).map((r) => r.userId)
      await this.audit.append(tx, { action: 'announcement.remind', entityType: 'Announcement', entityId: id, after: { recipients: unread.length } })
      return { a, unread }
    })
    await this.notifications.notify({
      userIds: unread, houseId, category: 'ANNOUNCEMENTS', priority: 'NORMAL',
      title: `Напоминание: ${a.title}`, body: preview(a.body), payload: { announcement_id: a.id },
    })
    return { reminded: unread.length }
  }

  private async find(tx: Tx, id: string): Promise<Announcement & { targets: AnnouncementTarget[] }> {
    const a = await tx.announcement.findFirst({ where: { id, deletedAt: null }, include: { targets: true } })
    if (!a) throw notFound('Объявление')
    return a
  }

  /** Кому адресовано: жильцам, работникам, перечисленным людям или жильцам подъездов */
  private async recipients(tx: Tx, a: Announcement): Promise<Recipient[]> {
    const houseId = a.houseId
    const members = await tx.houseMembership.findMany({
      where: { houseId, status: 'ACTIVE' },
      select: { userId: true, role: true, user: { select: { ownerships: { where: { houseId, verificationStatus: { not: 'REJECTED' } }, select: { unit: { select: { entrance: true } } } } } } },
    })
    const targets = await tx.announcementTarget.findMany({ where: { announcementId: a.id } })
    const entranceOf = (m: (typeof members)[number]) => m.user.ownerships.map((o) => o.unit.entrance).find((e) => e !== null) ?? null
    const pick = (m: (typeof members)[number]): boolean => {
      switch (a.audience) {
        case 'ALL': return m.role === 'RESIDENT'
        case 'STAFF': return m.role === 'WORKER'
        case 'SPECIFIC_USERS': return targets.some((t) => t.userId === m.userId)
        case 'ENTRANCE': {
          const wanted = new Set(targets.map((t) => t.entrance))
          return m.role === 'RESIDENT' && m.user.ownerships.some((o) => wanted.has(o.unit.entrance))
        }
      }
    }
    return members.filter(pick).map((m) => ({ userId: m.userId, entrance: entranceOf(m) }))
  }

  private async isAddressedTo(tx: Tx, a: Announcement, userId: string): Promise<boolean> {
    return (await this.recipients(tx, a)).some((r) => r.userId === userId)
  }

  /** Те же правила, что в recipients(), в виде фильтра для ленты участника */
  private async visibleTo(tx: Tx, userId: string): Promise<Prisma.AnnouncementWhereInput[]> {
    const houseId = ctx().houseId ?? ''
    const role = ctx().role
    const ownerships = await tx.unitOwnership.findMany({
      where: { userId, verificationStatus: { not: 'REJECTED' } },
      select: { unit: { select: { entrance: true } } },
    })
    const entrances = [...new Set(ownerships.map((o) => o.unit.entrance).filter((e): e is number => e !== null))]
    const filters: Prisma.AnnouncementWhereInput[] = [{ audience: 'SPECIFIC_USERS', targets: { some: { houseId, userId } } }]
    if (role === 'RESIDENT') filters.push({ audience: 'ALL' })
    if (role === 'WORKER') filters.push({ audience: 'STAFF' })
    if (role === 'RESIDENT' && entrances.length > 0) filters.push({ audience: 'ENTRANCE', targets: { some: { houseId, entrance: { in: entrances } } } })
    return filters
  }
}

function preview(body: string): string {
  return body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS - 1)}…` : body
}

function view(a: Announcement & { targets?: AnnouncementTarget[] }) {
  return {
    id: a.id, title: a.title, body: a.body, audience: a.audience, pinned: a.isPinned,
    published_at: a.publishedAt, expires_at: a.expiresAt,
    ...(isBoard() && a.targets && {
      user_ids: a.targets.flatMap((t) => (t.userId ? [t.userId] : [])),
      entrances: a.targets.flatMap((t) => (t.entrance !== null ? [t.entrance] : [])),
    }),
  }
}
