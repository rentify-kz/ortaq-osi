import { Injectable } from '@nestjs/common'
import { bulkAreasBody, ErrorCode, updateUnitBody, type BulkAreasBody, type UpdateUnitBody } from '@ortaq/shared'
import { ctx } from '../../common/context'
import { notFound, unprocessable } from '../../common/errors'
import { PrismaService } from '../../infra/prisma.service'
import { unitView } from '../admin/admin.service'
import { AuditService } from '../audit/audit.service'
import { ReadinessService } from './readiness.service'

/**
 * Правка помещений председателем. Площадь — основа веса голоса, поэтому каждая правка
 * идёт в журнал с прежним значением, а пересчёт общей площади и готовности к голосованиям
 * делает триггер в базе, а не этот код.
 */
@Injectable()
export class UnitsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly readiness: ReadinessService,
  ) {}

  update(unitId: string, input: UpdateUnitBody) {
    const body = updateUnitBody.parse(input)
    return this.db.run(async (tx) => {
      const unit = await tx.unit.findFirst({ where: { id: unitId } })
      if (!unit) throw notFound('Помещение')
      const updated = await tx.unit.update({
        where: { id: unit.id },
        data: {
          ...(body.area !== undefined && { area: body.area }),
          ...(body.type !== undefined && { type: body.type }),
          ...(body.rooms !== undefined && { rooms: body.rooms }),
          ...(body.is_excluded_from_voting !== undefined && { isExcludedFromVoting: body.is_excluded_from_voting }),
        },
      })
      await this.audit.append(tx, {
        action: 'unit.update', entityType: 'Unit', entityId: unit.id,
        before: { area: unit.area?.toString() ?? null, type: unit.type, rooms: unit.rooms, excluded: unit.isExcludedFromVoting },
        after: body,
      })
      return unitView(updated)
    })
  }

  /** Массовый ввод площадей (docs/04 §4.1, путь 2): одна транзакция — или все, или ни одной */
  bulkAreas(input: BulkAreasBody) {
    const { areas } = bulkAreasBody.parse(input)
    const ids = new Set(areas.map((a) => a.unit_id))
    if (ids.size !== areas.length) throw unprocessable(ErrorCode.VALIDATION, 'Одно помещение указано дважды')
    return this.db.run(
      async (tx) => {
        const units = await tx.unit.findMany({ where: { id: { in: [...ids] } }, select: { id: true, number: true, area: true } })
        if (units.length !== ids.size) throw unprocessable(ErrorCode.UNIT_NOT_FOUND, 'Часть помещений не найдена в этом доме')
        const current = new Map(units.map((u) => [u.id, u]))
        const changes: { unit: string; before: string | null; after: string }[] = []
        for (const { unit_id, area } of areas) {
          const unit = current.get(unit_id)!
          if (unit.area !== null && Number(unit.area) === Number(area)) continue
          await tx.unit.update({ where: { id: unit_id }, data: { area } })
          changes.push({ unit: unit.number, before: unit.area?.toString() ?? null, after: area })
        }
        if (changes.length > 0) {
          await this.audit.append(tx, { action: 'unit.bulk_areas', entityType: 'House', entityId: ctx().houseId ?? null, after: { changes } })
        }
        return { updated: changes.length, readiness: await this.readiness.compute(tx, ctx().houseId ?? '') }
      },
      { timeout: 60_000 },
    )
  }
}
