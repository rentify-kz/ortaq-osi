import { Injectable } from '@nestjs/common'
import type { HouseStage, ReadinessResponse } from '@ortaq/shared'
import { notFound } from '../../common/errors'
import type { Tx } from '../../infra/prisma.service'

/**
 * Состояние подключения дома (docs/04 §4 и §9). Один расчёт для админа и председателя:
 * чек-лист готовности у обоих совпадает до цифры.
 */
@Injectable()
export class ReadinessService {
  async compute(tx: Tx, houseId: string): Promise<ReadinessResponse> {
    const house = await tx.house.findUnique({ where: { id: houseId } })
    if (!house) throw notFound('Дом')

    const [unitsTotal, votingTotal, filled, chairman, residentsJoined, residentsVerified] = await Promise.all([
      tx.unit.count({ where: { houseId } }),
      tx.unit.count({ where: { houseId, isExcludedFromVoting: false } }),
      tx.unit.count({ where: { houseId, isExcludedFromVoting: false, area: { not: null } } }),
      tx.houseMembership.findFirst({
        where: { houseId, role: 'CHAIRMAN', status: 'ACTIVE' },
        include: { user: { select: { status: true, totpEnabledAt: true } } },
      }),
      tx.houseMembership.count({ where: { houseId, role: 'RESIDENT', status: 'ACTIVE' } }),
      tx.unitOwnership.count({ where: { houseId, verificationStatus: 'VERIFIED' } }),
    ])

    const chairmanActivated = Boolean(chairman && chairman.user.status === 'ACTIVE' && chairman.user.totpEnabledAt)
    const registryUploaded = house.registryUploadedAt !== null
    const missingAreas = votingTotal - filled

    const issues: string[] = []
    if (unitsTotal === 0) issues.push('Помещения не созданы')
    if (!chairman) issues.push('Председатель не назначен')
    else if (!chairmanActivated) issues.push('Председатель ещё не задал пароль и не подключил 2FA')
    if (missingAreas > 0) {
      issues.push(`Голосования недоступны: у ${missingAreas} ${plural(missingAreas, 'помещения', 'помещений', 'помещений')} не указана площадь`)
    }
    if (!registryUploaded) issues.push('Реестр собственников не загружен')

    const stage: HouseStage =
      unitsTotal === 0 ? 'CREATED'
      : !chairmanActivated ? 'UNITS_GENERATED'
      : !house.isVotingReady ? 'CHAIRMAN_ACTIVE'
      : !registryUploaded ? 'AREAS_COMPLETE'
      : 'OPERATIONAL'

    return {
      stage,
      units_generated: unitsTotal > 0,
      units_total: unitsTotal,
      areas_filled: filled,
      areas_total: votingTotal,
      is_voting_ready: house.isVotingReady,
      registry_uploaded: registryUploaded,
      chairman_assigned: Boolean(chairman),
      chairman_activated: chairmanActivated,
      residents_joined: residentsJoined,
      residents_verified: residentsVerified,
      blocking_issues: issues,
    }
  }
}

/** Согласование с числом в родительном падеже: «у 1 помещения», «у 3 помещений» */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}
