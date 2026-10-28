import { Injectable } from '@nestjs/common'
import { Prisma, type Charge, type ChargeType, type Tariff, type TariffBasis, type Unit, type UnitType } from '@prisma/client'
import {
  cancelChargeBody, chargeListQuery, collectionBody, DEFAULT_UNIT_TYPES, ErrorCode, generateChargesBody, tariffBody, updateChargeBody,
  type CancelChargeBody, type ChargeListQuery, type ChargeRunView, type ChargeView, type CollectionBody, type GenerateChargesBody,
  type TariffBody, type TariffView, type UpdateChargeBody,
} from '@ortaq/shared'
import { ctx } from '../../common/context'
import { conflict, notFound, unprocessable } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { FilesService } from '../files/files.service'
import { NotificationsService } from '../notifications/notifications.service'
import { almatyToday, dateStr, dec, num, periodOf, toDate } from './finance.util'

const TITLE: Record<ChargeType, string> = {
  MAINTENANCE: 'Взнос на управление и содержание', CAPITAL_REPAIR: 'Взнос на капремонт', PARKING: 'Содержание парковочного места, кладовки',
  TARGETED: 'Целевой взнос', OTHER: 'Прочее начисление',
}
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
export const monthName = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`

/** Срок оплаты — последний день отчётного месяца: в этот день неоплаченное становится долгом (docs/10 §6) */
export function dueDateOf(p: string): Date {
  const [y, m] = p.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0))
}

/** Сумма по тарифу. null — посчитать нельзя: тариф за м², а площади нет */
function amountFor(basis: TariffBasis, rate: Prisma.Decimal, unit: Unit): { amount: Prisma.Decimal; area?: number } | null {
  if (basis === 'FIXED') return { amount: rate }
  if (!unit.area) return null
  return { amount: rate.mul(unit.area).toDecimalPlaces(2), area: num(unit.area) }
}

const include = { unit: { select: { id: true, number: true, type: true, entrance: true } } } satisfies Prisma.ChargeInclude
type Row = Prisma.ChargeGetPayload<{ include: typeof include }>
const OPEN = ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] as const

/**
 * Начисления (docs/10 §4). Ежемесячные — по тарифам дома, 1 числа и вручную; целевые — только
 * по решению собрания. Повторный запуск безопасен: начисление уникально по помещению, месяцу и виду.
 */
@Injectable()
export class ChargesService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ───────── тарифы ───────── */

  async tariffs(): Promise<TariffView[]> {
    const rows = await this.db.run((tx) => tx.tariff.findMany({ orderBy: [{ type: 'asc' }, { effectiveFrom: 'desc' }] }))
    return rows.map(tariffView)
  }

  /** Новый тариф закрывает действующий того же вида. Задним числом — нельзя: уже начисленное он не пересчитает */
  async createTariff(input: TariffBody): Promise<TariffView> {
    const b = tariffBody.parse(input)
    if (b.effective_from < periodOf(almatyToday())) {
      throw unprocessable(ErrorCode.VALIDATION, 'Тариф вводится с текущего месяца или позже', { fields: [{ path: 'effective_from', message: 'Не раньше текущего месяца' }] })
    }
    const houseId = ctx().houseId ?? ''
    const tariff = await this.db.run(async (tx) => {
      const same = await tx.tariff.findFirst({ where: { type: b.type, effectiveFrom: b.effective_from } })
      if (same) {
        if (await tx.charge.count({ where: { tariffId: same.id } })) throw conflict(ErrorCode.CONFLICT, 'По тарифу с этого месяца уже начислено: введите новый со следующего месяца')
        await tx.tariff.delete({ where: { id: same.id } })
      }
      if (await tx.tariff.count({ where: { type: b.type, effectiveFrom: { gt: b.effective_from } } })) {
        throw conflict(ErrorCode.CONFLICT, 'Уже запланирован тариф с более позднего месяца')
      }
      await tx.tariff.updateMany({ where: { type: b.type, effectiveFrom: { lt: b.effective_from }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: b.effective_from } }] }, data: { effectiveTo: b.effective_from } })
      const t = await tx.tariff.create({
        data: {
          houseId, type: b.type, basis: b.basis, rate: dec(b.rate), unitTypes: b.unit_types ?? DEFAULT_UNIT_TYPES[b.type],
          effectiveFrom: b.effective_from, decisionNote: b.decision_note ?? null, createdBy: ctx().userId ?? '',
        },
      })
      await this.audit.append(tx, { action: 'finance.tariff_set', entityType: 'Tariff', entityId: t.id, before: same ? tariffView(same) : undefined, after: tariffView(t) })
      return t
    })
    return tariffView(tariff)
  }

  /* ───────── ежемесячное начисление ───────── */

  async generate(input: GenerateChargesBody): Promise<ChargeRunView & { created: number }> {
    const { period } = generateChargesBody.parse(input)
    const current = periodOf(almatyToday())
    const previous = periodOf(dateStr(new Date(dueDateOf(current).getTime() - 40 * 86_400_000)))
    if (period > current || period < previous) {
      throw unprocessable(ErrorCode.VALIDATION, 'Начислить можно за текущий или прошлый месяц', { fields: [{ path: 'period', message: 'Текущий или прошлый месяц' }] })
    }
    return this.run(period, ctx().userId ?? null)
  }

  /** Начисление за месяц. Вызывают председатель и планировщик; контекст дома уже установлен */
  async run(period: string, actorId: string | null): Promise<ChargeRunView & { created: number }> {
    const houseId = ctx().houseId ?? ''
    const created = await this.db.run(async (tx) => {
      const tariffs = await tx.tariff.findMany({ where: { effectiveFrom: { lte: period }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: period } }] } })
      if (tariffs.length === 0) throw unprocessable(ErrorCode.VALIDATION, 'Сначала задайте тарифы: без них начислять нечего')
      const units = await tx.unit.findMany()
      const due = dueDateOf(period)
      const rows: Prisma.ChargeCreateManyInput[] = []
      for (const t of tariffs) {
        for (const u of units.filter((x) => t.unitTypes.includes(x.type))) {
          const a = amountFor(t.basis, t.rate, u)
          if (!a || a.amount.lte(0)) continue
          rows.push({
            houseId, unitId: u.id, period, type: t.type, title: `${TITLE[t.type]} за ${monthName(period)}`, amount: a.amount,
            calculationBasis: { kind: t.basis, rate: num(t.rate), ...(a.area !== undefined && { area: a.area }) },
            dueDate: due, tariffId: t.id, createdBy: actorId,
          })
        }
      }
      const fresh = rows.length ? await tx.charge.createManyAndReturn({ data: rows, skipDuplicates: true, select: { id: true, unitId: true, amount: true } }) : []
      const totals = await tx.charge.aggregate({ where: { period, collectionKey: '', status: { not: 'CANCELLED' } }, _sum: { amount: true } })
      const charged = await tx.charge.groupBy({ by: ['unitId'], where: { period, collectionKey: '', status: { not: 'CANCELLED' } } })
      const skipped = this.skipped(tariffs, units).length
      await tx.chargeRun.upsert({
        where: { houseId_period: { houseId, period } },
        create: { houseId, period, unitsCharged: charged.length, unitsSkipped: skipped, total: totals._sum.amount ?? 0, createdBy: actorId },
        update: { unitsCharged: charged.length, unitsSkipped: skipped, total: totals._sum.amount ?? 0 },
      })
      await this.audit.append(tx, { action: 'finance.charges_generate', entityType: 'ChargeRun', after: { period, created: fresh.length, skipped, by: actorId ? 'user' : 'schedule' } })
      return fresh
    })
    await this.tellOwners(houseId, period, created, `Начисления за ${monthName(period)}`)
    return { ...(await this.summary(period)), created: created.length }
  }

  async summary(period: string): Promise<ChargeRunView> {
    return this.db.run(async (tx) => {
      const run = await tx.chargeRun.findFirst({ where: { period } })
      const tariffs = await tx.tariff.findMany({ where: { effectiveFrom: { lte: period }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: period } }] } })
      const units = await tx.unit.findMany()
      return {
        period, units_charged: run?.unitsCharged ?? 0, units_skipped: run?.unitsSkipped ?? 0, total: num(run?.total),
        created_at: run?.createdAt.toISOString() ?? '', updated_at: run?.updatedAt.toISOString() ?? '',
        skipped_units: this.skipped(tariffs, units).map((u) => ({ id: u.id, number: u.number })),
      }
    })
  }

  /** Помещения, которые тариф за м² пропустил: площадь не заполнена */
  private skipped(tariffs: Tariff[], units: Unit[]): Unit[] {
    const perSqm = new Set<UnitType>(tariffs.filter((t) => t.basis === 'PER_SQM').flatMap((t) => t.unitTypes))
    return units.filter((u) => perSqm.has(u.type) && !u.area)
  }

  /* ───────── целевые сборы ───────── */

  async createCollection(input: CollectionBody): Promise<{ id: string; created: number }> {
    const b = collectionBody.parse(input)
    const { userId = '', houseId = '' } = ctx()
    const result = await this.db.run(async (tx) => {
      const c = await tx.chargeCollection.create({
        data: {
          houseId, type: b.type, title: b.title, basis: b.basis, rate: dec(b.rate), unitTypes: b.unit_types, period: b.period,
          dueDate: toDate(b.due_date), decisionNote: b.decision_note, protocolFileId: b.protocol_file_id ?? null, createdBy: userId,
        },
      })
      if (b.protocol_file_id) await this.files.attach(tx, [b.protocol_file_id], 'CHARGE_COLLECTION', c.id, userId, 'FINANCE_DOCUMENT')
      const units = await tx.unit.findMany({ where: { type: { in: b.unit_types } } })
      const rows = units.flatMap((u) => {
        const a = amountFor(b.basis, c.rate, u)
        return a && a.amount.gt(0) ? [{
          houseId, unitId: u.id, period: b.period, type: b.type, title: b.title, amount: a.amount, collectionId: c.id, collectionKey: c.id,
          calculationBasis: { kind: b.basis, rate: b.rate, ...(a.area !== undefined && { area: a.area }) }, dueDate: c.dueDate, createdBy: userId,
        }] : []
      })
      const fresh = await tx.charge.createManyAndReturn({ data: rows, select: { id: true, unitId: true, amount: true } })
      await this.audit.append(tx, { action: 'finance.collection_create', entityType: 'ChargeCollection', entityId: c.id, after: { ...b, charges: fresh.length } })
      return { id: c.id, fresh }
    })
    await this.tellOwners(houseId, b.period, result.fresh, b.title)
    return { id: result.id, created: result.fresh.length }
  }

  /* ───────── просмотр и правка ───────── */

  async list(input: ChargeListQuery): Promise<ChargeView[]> {
    const q = chargeListQuery.parse(input)
    const rows = await this.db.run((tx) =>
      tx.charge.findMany({
        where: {
          ...(q.period && { period: q.period }),
          ...(q.unit_id && { unitId: q.unit_id }),
          ...(q.status === 'open' ? { status: { in: [...OPEN] } } : q.status !== 'all' && { status: q.status }),
        },
        include,
        orderBy: [{ period: 'desc' }, { unit: { number: 'asc' } }, { type: 'asc' }],
        take: 2000,
      }),
    )
    return rows.map(chargeView)
  }

  /** Начисления жильца: только по помещениям, где его собственность подтверждена */
  async mine(): Promise<{ charges: ChargeView[]; due: number; overdue: number }> {
    const userId = ctx().userId ?? ''
    const rows = await this.db.run(async (tx) => {
      const units = await tx.unitOwnership.findMany({ where: { userId, verificationStatus: 'VERIFIED' }, select: { unitId: true } })
      if (units.length === 0) return []
      return tx.charge.findMany({
        where: { unitId: { in: units.map((u) => u.unitId) }, status: { not: 'CANCELLED' } },
        include, orderBy: [{ period: 'desc' }, { type: 'asc' }], take: 120,
      })
    })
    const open = rows.filter((r) => (OPEN as readonly string[]).includes(r.status))
    const left = (r: Row) => num(r.amount) - num(r.paidAmount)
    const round = (n: number) => Math.round(n * 100) / 100
    return {
      charges: rows.map(chargeView),
      due: round(open.reduce((s, r) => s + left(r), 0)),
      overdue: round(open.filter((r) => r.status === 'OVERDUE').reduce((s, r) => s + left(r), 0)),
    }
  }

  /** Исправление суммы — пока по начислению ничего не оплачено. Формула помечается ручной правкой */
  async update(id: string, input: UpdateChargeBody): Promise<ChargeView> {
    const b = updateChargeBody.parse(input)
    return this.db.run(async (tx) => {
      const c = await this.untouched(tx, id)
      const basis = { ...(c.calculationBasis as Record<string, unknown>), manual: { amount: b.amount, reason: b.reason, previous: num(c.amount) } }
      const updated = await tx.charge.update({ where: { id }, data: { amount: dec(b.amount), calculationBasis: basis }, include })
      await this.audit.append(tx, { action: 'finance.charge_update', entityType: 'Charge', entityId: id, before: { amount: num(c.amount) }, after: b })
      return chargeView(updated)
    })
  }

  async cancel(id: string, input: CancelChargeBody): Promise<ChargeView> {
    const b = cancelChargeBody.parse(input)
    return this.db.run(async (tx) => {
      const c = await this.untouched(tx, id)
      const updated = await tx.charge.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: ctx().userId, cancelReason: b.reason }, include })
      await this.audit.append(tx, { action: 'finance.charge_cancel', entityType: 'Charge', entityId: id, before: { status: c.status, amount: num(c.amount) }, after: { reason: b.reason } })
      return chargeView(updated)
    })
  }

  /** Просрочка: срок прошёл, а начисление не оплачено. Системный проход по всем домам */
  async markOverdue(tx: Tx, today: string): Promise<number> {
    const r = await tx.charge.updateMany({ where: { status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { lt: toDate(today) } }, data: { status: 'OVERDUE' } })
    return r.count
  }

  private async untouched(tx: Tx, id: string): Promise<Charge> {
    await tx.$queryRaw`SELECT id FROM charges WHERE id = ${id}::uuid FOR UPDATE`
    const c = await tx.charge.findFirst({ where: { id } })
    if (!c) throw notFound('Начисление')
    if (c.status === 'CANCELLED') throw conflict(ErrorCode.CONFLICT, 'Начисление уже отменено')
    if (c.paidAmount.gt(0)) throw conflict(ErrorCode.CONFLICT, 'По начислению уже есть оплата: исправьте через возврат или новое начисление')
    return c
  }

  /** Каждому собственнику — одно уведомление с суммой по его помещениям */
  private async tellOwners(houseId: string, period: string, created: { unitId: string; amount: Prisma.Decimal }[], title: string) {
    if (created.length === 0) return
    const owners = await this.db.run((tx) => tx.unitOwnership.findMany({
      where: { unitId: { in: [...new Set(created.map((c) => c.unitId))] }, verificationStatus: 'VERIFIED' },
      select: { userId: true, unitId: true, unit: { select: { number: true } } },
    }))
    const byUser = new Map<string, { units: Set<string>; sum: number }>()
    for (const o of owners) {
      const entry = byUser.get(o.userId) ?? { units: new Set<string>(), sum: 0 }
      if (!entry.units.has(o.unit.number)) {
        entry.units.add(o.unit.number)
        entry.sum += created.filter((c) => c.unitId === o.unitId).reduce((s, c) => s + num(c.amount), 0)
      }
      byUser.set(o.userId, entry)
    }
    const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
    for (const [userId, e] of byUser) {
      await this.notifications.notify({
        userIds: [userId], houseId, category: 'PAYMENTS', priority: 'NORMAL', title,
        body: `${[...e.units].map((n) => `№${n}`).join(', ')}: ${fmt.format(e.sum)} ₸. Срок — до конца месяца`,
        payload: { type: 'charges', period },
      })
    }
  }
}

function tariffView(t: Tariff): TariffView {
  return {
    id: t.id, type: t.type as TariffView['type'], basis: t.basis, rate: num(t.rate), unit_types: t.unitTypes,
    effective_from: t.effectiveFrom, effective_to: t.effectiveTo, decision_note: t.decisionNote, created_at: t.createdAt.toISOString(),
  }
}

export function chargeView(c: Row): ChargeView {
  const basis = c.calculationBasis as { kind: TariffBasis; rate: number; area?: number }
  return {
    id: c.id, period: c.period, type: c.type, title: c.title, unit: c.unit,
    amount: num(c.amount), paid_amount: num(c.paidAmount), due_date: dateStr(c.dueDate), status: c.status,
    basis: { kind: basis.kind, rate: basis.rate, ...(basis.area !== undefined && { area: basis.area }) }, cancel_reason: c.cancelReason,
  }
}
