import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { asSystem, runWithContext } from '../../common/context'
import { env } from '../../config/env'
import { PrismaService } from '../../infra/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { monthName } from './charges.service'
import { almatyToday, periodOf } from './finance.util'
import { periodsBack } from './overview.service'
import { ReportsService } from './reports.service'

const INTERVAL_MS = 60 * 60_000
/** Черновик — 15 числа: пять дней запаса до срока 20-го на недостающие документы */
const DRAFT_DAY = 15
const REMIND_DAYS = [18, 19]

/**
 * Отчёт за прошлый месяц (docs/10 §7): 15 числа черновик для каждого дома со счетами,
 * 18 и 19 — напоминание правлению, если отчёт ещё не подписан. Повторный прогон безопасен.
 */
@Injectable()
export class ReportsScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Reports')
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly db: PrismaService,
    private readonly reports: ReportsService,
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

  async run(now = new Date()): Promise<{ drafted: number; reminded: number }> {
    const today = almatyToday(now)
    const day = Number(today.slice(8, 10))
    const period = periodsBack(periodOf(today), 2)[0]!
    let drafted = 0
    let reminded = 0
    if (day < DRAFT_DAY) return { drafted, reminded }

    const due = await asSystem(() => this.db.run((tx) => tx.$queryRaw<{ house_id: string }[]>`
      SELECT DISTINCT a.house_id FROM finance_accounts a
      WHERE NOT EXISTS (SELECT 1 FROM reports r WHERE r.house_id = a.house_id AND r.type = 'MONTHLY' AND r.period = ${period})`))
    for (const { house_id: houseId } of due) {
      try {
        const id = await runWithContext({ houseId }, () => this.reports.run(period, null))
        await this.tellBoard(houseId, `Черновик отчёта за ${monthName(period)}`, 'Проверьте недостающие документы и подпишите до 20 числа', id, `draft-${period}`)
        drafted++
      } catch (e) {
        this.log.error(`Отчёт дома ${houseId} за ${period}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (REMIND_DAYS.includes(day)) {
      const unsigned = await asSystem(() => this.db.run((tx) => tx.report.findMany({ where: { type: 'MONTHLY', period, status: 'DRAFT' }, select: { id: true, houseId: true } })))
      for (const r of unsigned) {
        if (await this.tellBoard(r.houseId, `Отчёт за ${monthName(period)} не подписан`, `Срок сдачи — 20 число. Осталось дней: ${20 - day}`, r.id, `remind-${period}-${day}`)) reminded++
      }
    }
    return { drafted, reminded }
  }

  /** Одно уведомление на событие: ключ в payload не даёт повторить его каждый час */
  private async tellBoard(houseId: string, title: string, body: string, reportId: string, key: string): Promise<boolean> {
    const sent = await asSystem(() => this.db.run((tx) => tx.notification.count({ where: { houseId, payload: { path: ['key'], equals: key } } })))
    if (sent) return false
    const board = await asSystem(() => this.db.run((tx) => tx.houseMembership.findMany({ where: { houseId, role: { in: ['CHAIRMAN', 'ACCOUNTANT'] }, status: 'ACTIVE' }, select: { userId: true } })))
    await this.notifications.notify({ userIds: board.map((m) => m.userId), houseId, category: 'REPORTS', priority: 'HIGH', title, body, payload: { type: 'report', id: reportId, key } })
    return true
  }
}
