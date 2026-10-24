import { Injectable } from '@nestjs/common'
import type { Notification } from '@prisma/client'
import { NotificationCategory, type DeviceBody, type NotificationSettingsBody } from '@ortaq/shared'
import { asSystem, ctx } from '../../common/context'
import { notFound, unauthenticated } from '../../common/errors'
import { PrismaService } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { channelsFor, deliveryTime, type Priority } from './schedule'

export type NotifyInput = {
  userIds: string[]
  houseId: string | null
  category: NotificationCategory
  priority: Priority
  title: string
  body: string
  payload?: Record<string, string>
}

const PAGE = 50
/** Юридически значимое извещение собственника: не отключается (docs/08 §8.11) */
const LOCKED: NotificationCategory[] = ['VOTES']

/**
 * Уведомления через исходящую очередь в базе: событие пишет строки, диспетчер рассылает.
 * Запись идёт отдельной системной транзакцией после основной: политика RLS не даёт
 * председателю писать строки чужих пользователей, и это правильно.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async notify(input: NotifyInput): Promise<number> {
    const userIds = [...new Set(input.userIds)]
    if (userIds.length === 0) return 0
    const now = new Date()
    return asSystem(() =>
      this.db.run(async (tx) => {
        const muted = LOCKED.includes(input.category)
          ? new Set<string>()
          : new Set((await tx.notificationPreference.findMany({ where: { userId: { in: userIds }, category: input.category, push: false } })).map((p) => p.userId))
        const scheduledFor = deliveryTime(now, input.priority)
        const created = await tx.notification.createMany({
          data: userIds.map((userId) => {
            const channels = channelsFor(input.priority, !muted.has(userId))
            return {
              userId, houseId: input.houseId, category: input.category, priority: input.priority,
              title: input.title, body: input.body, payload: input.payload, channels,
              // Без внешних каналов отправлять нечего: уведомление только в ленте
              scheduledFor, sentAt: channels.length === 0 ? now : null,
            }
          }),
        })
        return created.count
      }),
    )
  }

  list(before?: string) {
    const userId = this.userId()
    return this.db.run(async (tx) => {
      const items = await tx.notification.findMany({
        where: { userId, ...(before && { createdAt: { lt: new Date(before) } }) },
        orderBy: { createdAt: 'desc' },
        take: PAGE,
      })
      const unread = await tx.notification.count({ where: { userId, readAt: null } })
      return { items: items.map(view), unread_count: unread }
    })
  }

  markRead(id: string) {
    const userId = this.userId()
    return this.db.run(async (tx) => {
      const n = await tx.notification.findFirst({ where: { id, userId } })
      if (!n) throw notFound('Уведомление')
      if (!n.readAt) await tx.notification.update({ where: { id }, data: { readAt: new Date() } })
      return { read: true }
    })
  }

  markAllRead() {
    const userId = this.userId()
    return this.db.run(async (tx) => ({ updated: (await tx.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })).count }))
  }

  /** Токен устройства уникален: телефон мог сменить владельца, тогда токен переходит к новому */
  async registerDevice(body: DeviceBody) {
    const userId = this.userId()
    const device = await asSystem(() =>
      this.db.run((tx) =>
        tx.deviceToken.upsert({
          where: { token: body.token },
          create: { userId, token: body.token, platform: body.platform },
          update: { userId, platform: body.platform, lastSeenAt: new Date() },
        }),
      ),
    )
    await this.db.run((tx) => this.audit.append(tx, { houseId: null, action: 'device.register', entityType: 'DeviceToken', entityId: device.id, after: { platform: body.platform } }))
    return { id: device.id, platform: device.platform }
  }

  removeDevice(id: string) {
    const userId = this.userId()
    return this.db.run(async (tx) => {
      const removed = await tx.deviceToken.deleteMany({ where: { id, userId } })
      if (removed.count === 0) throw notFound('Устройство')
      await this.audit.append(tx, { houseId: null, action: 'device.remove', entityType: 'DeviceToken', entityId: id })
      return { removed: true }
    })
  }

  settings() {
    const userId = this.userId()
    return this.db.run(async (tx) => {
      const prefs = await tx.notificationPreference.findMany({ where: { userId } })
      const off = new Set(prefs.filter((p) => !p.push).map((p) => p.category))
      return {
        push: Object.fromEntries(NotificationCategory.map((c) => [c, LOCKED.includes(c) || !off.has(c)])),
        locked: LOCKED,
      }
    })
  }

  async updateSettings(body: NotificationSettingsBody) {
    const userId = this.userId()
    await this.db.run(async (tx) => {
      for (const [category, push] of Object.entries(body.push) as [NotificationCategory, boolean][]) {
        if (LOCKED.includes(category)) continue
        await tx.notificationPreference.upsert({
          where: { userId_category: { userId, category } },
          create: { userId, category, push },
          update: { push },
        })
      }
      await this.audit.append(tx, { houseId: null, action: 'notifications.settings', entityType: 'User', entityId: userId, after: body.push })
    })
    return this.settings()
  }

  private userId(): string {
    const id = ctx().userId
    if (!id) throw unauthenticated()
    return id
  }
}

function view(n: Notification) {
  return {
    id: n.id, house_id: n.houseId, category: n.category, priority: n.priority, title: n.title, body: n.body,
    payload: n.payload, created_at: n.createdAt, read_at: n.readAt,
  }
}
