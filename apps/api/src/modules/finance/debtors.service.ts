import { Injectable } from '@nestjs/common'
import { remindDebtorsBody, type DebtLevel, type DebtorView, type RemindDebtorsBody } from '@ortaq/shared'
import { asSystem, ctx } from '../../common/context'
import { PrismaService } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from '../notifications/notifications.service'
import { num } from './finance.util'

/** Повторное напоминание тому же помещению — не чаще раза в трое суток: это напоминание, а не давление */
const REMIND_GAP_MS = 3 * 86_400_000
const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

/** Градация docs/10 §6: месяц — напоминание, 2–3 — повторное, больше трёх — основание для досудебной работы */
const levelOf = (months: number): DebtLevel => (months <= 1 ? 'REMIND' : months <= 3 ? 'REPEAT' : 'PRETRIAL')

/**
 * Должники (docs/10 §6). Поимённый список — только правлению и с записью в аудит каждого
 * просмотра: жильцам виден лишь процент собираемости (docs/14 §4). Напоминание идёт лично
 * собственнику, а не в общий чат.
 */
@Injectable()
export class DebtorsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(): Promise<DebtorView[]> {
    const debtors = await this.collect()
    await this.db.run((tx) => this.audit.append(tx, { action: 'finance.debtors_view', entityType: 'House', entityId: ctx().houseId, after: { count: debtors.length } }))
    return debtors
  }

  async remind(input: RemindDebtorsBody): Promise<{ sent: number; skipped: number }> {
    const b = remindDebtorsBody.parse(input)
    const houseId = ctx().houseId ?? ''
    const chosen = (await this.collect()).filter((d) => b.unit_ids.includes(d.unit.id))
    let sent = 0
    for (const d of chosen) {
      if (d.owners.length === 0 || (d.last_reminded_at && Date.now() - Date.parse(d.last_reminded_at) < REMIND_GAP_MS)) continue
      await this.notifications.notify({
        userIds: d.owners.map((o) => o.id), houseId, category: 'PAYMENTS', priority: d.level === 'REMIND' ? 'NORMAL' : 'HIGH',
        title: d.level === 'REMIND' ? 'Напоминание об оплате' : 'Задолженность по взносам',
        body: `Помещение №${d.unit.number}: ${fmt.format(d.debt)} ₸ за ${d.months} мес. Оплатить можно в приложении`,
        payload: { type: 'debt', unitId: d.unit.id },
      })
      sent++
    }
    await this.db.run((tx) => this.audit.append(tx, { action: 'finance.debtors_remind', entityType: 'House', entityId: houseId, after: { units: chosen.map((d) => d.unit.id), sent } }))
    return { sent, skipped: b.unit_ids.length - sent }
  }

  private async collect(): Promise<DebtorView[]> {
    const houseId = ctx().houseId ?? ''
    const { charges, owners } = await this.db.run(async (tx) => {
      const charges = await tx.charge.findMany({
        where: { status: 'OVERDUE' },
        select: { unitId: true, period: true, amount: true, paidAmount: true, unit: { select: { id: true, number: true, entrance: true } } },
      })
      const owners = await tx.unitOwnership.findMany({
        where: { unitId: { in: [...new Set(charges.map((c) => c.unitId))] }, verificationStatus: 'VERIFIED' },
        select: { unitId: true, user: { select: { id: true, fullName: true } } },
      })
      return { charges, owners }
    })
    // Когда напоминали: уведомления пишет система, читаем их тоже системно — только отметку времени
    const reminders = charges.length === 0 ? [] : await asSystem(() => this.db.run((tx) => tx.notification.findMany({
      where: { houseId, payload: { path: ['type'], equals: 'debt' } }, select: { payload: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5000,
    })))
    const byUnit = new Map<string, DebtorView>()
    for (const c of charges) {
      const d = byUnit.get(c.unitId) ?? {
        unit: c.unit, owners: [], debt: 0, months: 0, oldest_period: c.period, level: 'REMIND' as DebtLevel,
        last_reminded_at: reminders.find((r) => (r.payload as { unitId?: string } | null)?.unitId === c.unitId)?.createdAt.toISOString() ?? null,
      }
      d.debt = Math.round((d.debt + num(c.amount) - num(c.paidAmount)) * 100) / 100
      if (c.period < d.oldest_period) d.oldest_period = c.period
      byUnit.set(c.unitId, d)
    }
    for (const [unitId, d] of byUnit) {
      d.months = new Set(charges.filter((c) => c.unitId === unitId).map((c) => c.period)).size
      d.level = levelOf(d.months)
      d.owners = owners.filter((o) => o.unitId === unitId).map((o) => ({ id: o.user.id, name: o.user.fullName }))
    }
    return [...byUnit.values()].filter((d) => d.debt > 0).sort((a, b) => b.debt - a.debt)
  }
}
