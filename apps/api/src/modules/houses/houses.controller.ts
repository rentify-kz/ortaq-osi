import { Controller, Get, Param } from '@nestjs/common'
import { ctx } from '../../common/context'
import { HouseScope } from '../../common/decorators'
import { notFound } from '../../common/errors'
import { maskPhone } from '../../common/mask'
import { PrismaService } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { byUnitNumber, houseView, unitView } from '../admin/admin.service'
import { ReadinessService } from './readiness.service'

/** Дома глазами участника, docs/03 §5 */
@Controller('houses')
export class HousesController {
  constructor(
    private readonly db: PrismaService,
    private readonly readiness: ReadinessService,
    private readonly audit: AuditService,
  ) {}

  /** Дома, где у вызывающего есть активное членство: источник для переключателя домов */
  @Get()
  mine() {
    return this.db.run(async (tx) => {
      const memberships = await tx.houseMembership.findMany({
        where: { userId: ctx().userId ?? '', status: 'ACTIVE' },
        include: { house: true },
        orderBy: { createdAt: 'asc' },
      })
      return memberships.map((m) => ({ ...houseView(m.house), role: m.role }))
    })
  }

  @HouseScope() @Get(':houseId')
  one(@Param('houseId') houseId: string) {
    return this.db.run(async (tx) => {
      const house = await tx.house.findUnique({ where: { id: houseId } })
      if (!house) throw notFound('Дом')
      return { ...houseView(house), role: ctx().role }
    })
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Get(':houseId/readiness')
  houseReadiness(@Param('houseId') houseId: string) {
    return this.db.run((tx) => this.readiness.compute(tx, houseId))
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Get(':houseId/units')
  units() {
    // Дом подставляет расширение клиента из контекста, фильтр здесь не нужен и не пишется
    return this.db.run(async (tx) => (await tx.unit.findMany()).sort(byUnitNumber).map(unitView))
  }

  @HouseScope('CHAIRMAN') @Get(':houseId/members')
  members() {
    const houseId = ctx().houseId
    return this.db.run(async (tx) => {
      // Вложенные выборки расширение не скоупит: дом во вложенном where указан явно
      const members = await tx.houseMembership.findMany({
        where: { status: 'ACTIVE' },
        include: { user: { include: { ownerships: { where: { houseId }, include: { unit: { select: { number: true, houseId: true } } } } } } },
        orderBy: { createdAt: 'asc' },
      })
      return members.map((m) => ({
        user_id: m.userId,
        full_name: m.user.fullName,
        phone: maskPhone(m.user.phone),
        role: m.role,
        joined_via: m.joinedVia,
        joined_at: m.createdAt,
        units: m.user.ownerships
          .filter((o) => o.unit.houseId === houseId)
          .map((o) => ({ number: o.unit.number, relation: o.relation, verification: o.verificationStatus })),
      }))
    })
  }

  /** Проверка журнала, которую председатель может показать недоверчивому жильцу, docs/13 §5 */
  @HouseScope('CHAIRMAN') @Get(':houseId/audit/verify')
  verifyAudit(@Param('houseId') houseId: string) {
    return this.db.run((tx) => this.audit.verify(tx, houseId), { timeout: 60_000 })
  }
}
