import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { asSystem, runWithContext } from '../../common/context'
import { env } from '../../config/env'
import { PrismaService } from '../../infra/prisma.service'
import { VotesService } from './votes.service'

const INTERVAL_MS = 5 * 60_000
const HOUR = 3_600_000
/** Напоминания непроголосовавшим: за 3 дня, за сутки и за 4 часа до окончания (docs/05 §5.4) */
export const REMINDERS = [
  { key: '3d', before: 72 * HOUR, title: 'До конца голосования 3 дня' },
  { key: '1d', before: 24 * HOUR, title: 'До конца голосования сутки' },
  { key: '4h', before: 4 * HOUR, title: 'До конца голосования 4 часа' },
] as const

/**
 * Жизненный цикл по времени (docs/08 §8.6): старт в дату из уведомления, закрытие по сроку —
 * без участия председателя, иначе продление «до нужного итога» стало бы возможным.
 * Каждый шаг идемпотентен: повторный прогон ничего не удвоит.
 */
@Injectable()
export class VotesScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Votes')
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly db: PrismaService,
    private readonly votes: VotesService,
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

  async run(now = new Date()): Promise<{ activated: number; closed: number; reminded: number }> {
    const due = await asSystem(() => this.db.run((tx) => tx.vote.findMany({
      where: { OR: [{ status: 'NOTICE_SENT', startsAt: { lte: now } }, { status: 'ACTIVE' }] },
      select: { id: true, houseId: true, status: true, startsAt: true, endsAt: true, activatedAt: true },
    })))
    let activated = 0
    let closed = 0
    let reminded = 0
    for (const v of due) {
      await runWithContext({ houseId: v.houseId }, async () => {
        try {
          if (v.status === 'NOTICE_SENT') {
            // Сервер лежал весь срок — стартовать уже нечего: председатель отменит и проведёт новое
            if (now >= v.endsAt!) return
            await this.votes.activate(v.id, now)
            activated++
          } else if (now >= v.endsAt!) {
            await this.votes.close(v.id, now)
            closed++
          } else {
            reminded += await this.remind(v.id, v.houseId, v.endsAt!, v.activatedAt!, now)
          }
        } catch (e) {
          this.log.error(`Голосование ${v.id}: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
    }
    return { activated, closed, reminded }
  }

  /** Одно напоминание каждого вида: ключ в payload. Не шлём то, чей момент наступил ещё до старта */
  private async remind(voteId: string, houseId: string, endsAt: Date, activatedAt: Date, now: Date): Promise<number> {
    const left = endsAt.getTime() - now.getTime()
    const r = [...REMINDERS].reverse().find((x) => left <= x.before && endsAt.getTime() - x.before >= activatedAt.getTime())
    if (!r) return 0
    const key = `vote-${voteId}-${r.key}`
    const sent = await asSystem(() => this.db.run((tx) => tx.notification.count({ where: { houseId, payload: { path: ['key'], equals: key } } })))
    if (sent) return 0
    await this.votes.remind(voteId, { key, title: r.title })
    return 1
  }
}
