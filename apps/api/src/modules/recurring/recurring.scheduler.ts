import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { asSystem } from '../../common/context'
import { env } from '../../config/env'
import { PrismaService } from '../../infra/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { endOfLocalDay, occurrences, parseRule } from './rrule'

const INTERVAL_MS = 10 * 60_000
const MISSED_ALERT = 3

/**
 * Порождение рутинных задач. Задача появляется заранее (lead_time_hours), чтобы работник
 * видел её с утра. Невыполненная не копится: когда наступает следующее вхождение, старая
 * закрывается как просроченная, а после трёх пропусков подряд председатель получает сигнал
 * (docs/07 §7.5). Повторный запуск безопасен: вхождение уникально по шаблону и времени.
 */
@Injectable()
export class RecurringScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Recurring')
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly db: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    if (env().NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS)
    this.timer.unref()
    void this.tick()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      await this.run()
    } catch (e) {
      this.log.error(e instanceof Error ? e.stack : String(e))
    } finally {
      this.running = false
    }
  }

  async run(now = new Date()): Promise<{ created: number; expired: number }> {
    const templates = await asSystem(() => this.db.run((tx) => tx.recurringTaskTemplate.findMany({ where: { isActive: true } })))
    let created = 0
    let expired = 0
    for (const t of templates) {
      const rule = parseRule(t.rrule)
      if (!rule) continue
      // Вхождения с начала сегодняшнего дня до горизонта заблаговременности. Прошлое не догоняем:
      // вчерашняя уборка, которую никто не сделал, сегодня уже не задача, а новый шаблон не порождает прошлого
      const todayStart = new Date(endOfLocalDay(now).getTime() - (24 * 3600_000 - 60_000))
      const from = new Date(Math.max(todayStart.getTime(), t.createdAt.getTime() - 60_000))
      const due = occurrences(rule, from, new Date(now.getTime() + t.leadTimeHours * 3600_000))
      const result = await asSystem(() =>
        this.db.run(async (tx) => {
          const made = await tx.task.createMany({
            data: due.map((at) => ({
              houseId: t.houseId, recurringTemplateId: t.id, occurrenceAt: at, title: t.title, description: t.description,
              specialization: t.specialization, assigneeId: t.defaultAssigneeId, requiresPhoto: t.requiresPhoto,
              priority: 'NORMAL' as const, dueAt: endOfLocalDay(at), source: 'RECURRING' as const, createdBy: null,
            })),
            skipDuplicates: true,
          })
          // Всё, что старше последнего наступившего вхождения и не начато сдаваться, — просрочено
          const latest = due.filter((d) => d <= now).at(-1)
          const old = latest
            ? await tx.task.updateMany({
                where: { recurringTemplateId: t.id, occurrenceAt: { lt: latest }, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'] } },
                data: { status: 'EXPIRED', closedAt: now },
              })
            : { count: 0 }
          // Сигнал один раз — ровно на третьем пропуске подряд, а не на каждом следующем
          const recent = await tx.task.findMany({ where: { recurringTemplateId: t.id, occurrenceAt: { lte: now } }, orderBy: { occurrenceAt: 'desc' }, take: MISSED_ALERT + 2, select: { status: true } })
          const prior = recent.slice(1)
          const missed = prior.slice(0, MISSED_ALERT).length === MISSED_ALERT && prior.slice(0, MISSED_ALERT).every((x) => x.status === 'EXPIRED') && prior[MISSED_ALERT]?.status !== 'EXPIRED'
          return { made: made.count, expired: old.count, alert: old.count > 0 && missed }
        }),
      )
      created += result.made
      expired += result.expired
      if (result.alert) await this.alertBoard(t.houseId, t.title)
    }
    return { created, expired }
  }

  private async alertBoard(houseId: string, title: string) {
    const board = await asSystem(() => this.db.run((tx) => tx.houseMembership.findMany({ where: { houseId, role: 'CHAIRMAN', status: 'ACTIVE' }, select: { userId: true } })))
    await this.notifications.notify({
      userIds: board.map((b) => b.userId), houseId, category: 'REQUESTS', priority: 'HIGH',
      title: 'Рутина не выполняется', body: `«${title}» пропущена ${MISSED_ALERT} раза подряд`,
    })
  }
}
