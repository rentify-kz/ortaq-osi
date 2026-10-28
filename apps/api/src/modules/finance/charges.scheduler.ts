import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { asSystem, runWithContext } from '../../common/context'
import { env } from '../../config/env'
import { PrismaService } from '../../infra/prisma.service'
import { ChargesService } from './charges.service'
import { almatyToday, periodOf } from './finance.util'

const INTERVAL_MS = 60 * 60_000

/**
 * Начисления 1 числа (docs/10 §4) и просрочка после срока (docs/10 §6). Раз в час: месяц
 * начисляется у дома, если есть действующие тарифы и за этот месяц ещё не было прогона.
 * Упавший час догонит следующий — повторный прогон безопасен.
 */
@Injectable()
export class ChargesScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Charges')
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly db: PrismaService,
    private readonly charges: ChargesService,
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

  async run(now = new Date()): Promise<{ houses: number; overdue: number }> {
    const today = almatyToday(now)
    const period = periodOf(today)
    // Дома с тарифами на этот месяц, у которых месяц ещё не начислен
    const due = await asSystem(() => this.db.run((tx) => tx.$queryRaw<{ house_id: string }[]>`
      SELECT DISTINCT t.house_id FROM tariffs t
      WHERE t.effective_from <= ${period} AND (t.effective_to IS NULL OR t.effective_to > ${period})
        AND NOT EXISTS (SELECT 1 FROM charge_runs r WHERE r.house_id = t.house_id AND r.period = ${period})`))
    let houses = 0
    for (const { house_id: houseId } of due) {
      try {
        await runWithContext({ houseId }, () => this.charges.run(period, null))
        houses++
      } catch (e) {
        // Один дом с ошибкой не останавливает начисление остальным
        this.log.error(`Начисление дома ${houseId} за ${period}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const overdue = await asSystem(() => this.db.run((tx) => this.charges.markOverdue(tx, today)))
    return { houses, overdue }
  }
}
