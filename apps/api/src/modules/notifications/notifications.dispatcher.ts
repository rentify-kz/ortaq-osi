import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { asSystem } from '../../common/context'
import { env } from '../../config/env'
import { PrismaService } from '../../infra/prisma.service'
import { PushService } from '../../infra/push.service'
import { SmsService } from '../../infra/sms.service'

const INTERVAL_MS = 30_000
const BATCH = 200
const SMS_MAX = 300

type Due = { id: string; user_id: string; category: string; title: string; body: string; channels: string[] }

/**
 * Рассылка из исходящей очереди. Строки забираются через SKIP LOCKED, поэтому несколько
 * экземпляров API не отправят одно уведомление дважды. Отметка ставится до отправки:
 * лучше потерять push при сбое провайдера, чем прислать его жильцу пять раз.
 * Работает в процессе API; при росте нагрузки уедет в отдельный воркер с той же функцией.
 */
@Injectable()
export class NotificationsDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Notifications')
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly db: PrismaService,
    private readonly push: PushService,
    private readonly sms: SmsService,
  ) {}

  onApplicationBootstrap() {
    if (env().NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      await this.dispatchDue()
    } catch (e) {
      this.log.error(e instanceof Error ? e.stack : String(e))
    } finally {
      this.running = false
    }
  }

  async dispatchDue(now = new Date()): Promise<number> {
    const due = await asSystem(() =>
      this.db.run((tx) => tx.$queryRaw<Due[]>`
        UPDATE notifications SET sent_at = now()
        WHERE id IN (
          SELECT id FROM notifications
          WHERE sent_at IS NULL AND scheduled_for <= ${now}
          ORDER BY scheduled_for
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, user_id, category::text AS category, title, body, channels`),
    )
    if (due.length === 0) return 0

    const userIds = [...new Set(due.map((n) => n.user_id))]
    const [devices, users] = await asSystem(() =>
      this.db.run((tx) =>
        Promise.all([
          tx.deviceToken.findMany({ where: { userId: { in: userIds } }, select: { userId: true, token: true } }),
          tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, phone: true } }),
        ]),
      ),
    )
    const phones = new Map(users.map((u) => [u.id, u.phone]))

    for (const n of due) {
      try {
        if (n.channels.includes('push')) {
          const tokens = devices.filter((d) => d.userId === n.user_id).map((d) => d.token)
          await this.push.send(tokens, { title: n.title, body: n.body, data: { notification_id: n.id, category: n.category } })
        }
        const phone = phones.get(n.user_id)
        if (n.channels.includes('sms') && phone) await this.sms.send(phone, `Ortaq: ${n.title}. ${n.body}`.slice(0, SMS_MAX))
      } catch (e) {
        this.log.warn(`Не доставлено ${n.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    return due.length
  }
}
