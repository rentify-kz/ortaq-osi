import { Injectable } from '@nestjs/common'
import { ErrorCode } from '@ortaq/shared'
import { ctx } from '../../common/context'
import { AppError, conflict, notFound } from '../../common/errors'
import { maskPhone } from '../../common/mask'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'

const identityRequired = () =>
  new AppError(422, ErrorCode.IDENTITY_REQUIRED, 'Сначала жилец должен подтвердить личность через eGov mobile')

/**
 * Ручное подтверждение собственности председателем (docs/04 §7.2): для тех, кого нет
 * в реестре или у кого расходится ФИО. Председатель знает своих жильцов, но личность
 * всё равно подтверждает только ЭЦП — без неё голос не даётся никем.
 */
@Injectable()
export class OwnershipsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  pending() {
    const houseId = ctx().houseId
    return this.db.run(async (tx) => {
      const rows = await tx.unitOwnership.findMany({
        where: { verificationStatus: 'PENDING' },
        include: {
          unit: { select: { number: true } },
          user: { select: { fullName: true, phone: true, identityVerifiedAt: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
      // Подсказка из реестра: кто там записан по этому помещению. Председатель сам вёл этот реестр
      const registry = await tx.ownerRegistryEntry.findMany({
        where: { houseId, unitNumber: { in: [...new Set(rows.map((r) => r.unit.number))] } },
        select: { unitNumber: true, fullName: true },
      })
      return rows.map((r) => ({
        id: r.id,
        user_id: r.userId,
        full_name: r.user.fullName,
        phone: maskPhone(r.user.phone),
        identity_verified: r.user.identityVerifiedAt !== null,
        unit_number: r.unit.number,
        relation: r.relation,
        note: r.verificationNote,
        registry_names: registry.filter((e) => e.unitNumber === r.unit.number).map((e) => e.fullName),
        created_at: r.createdAt,
      }))
    })
  }

  verify(id: string) {
    return this.db.run(async (tx) => {
      const o = await this.pendingOwnership(tx, id)
      if (!o.user.identityVerifiedAt) throw identityRequired()
      await tx.unitOwnership.update({
        where: { id: o.id },
        data: { verificationStatus: 'VERIFIED', verificationMethod: 'MANUAL_CHAIRMAN', verifiedAt: new Date(), verifiedBy: ctx().userId ?? null, verificationNote: null },
      })
      await this.audit.append(tx, {
        action: 'ownership.verify', entityType: 'UnitOwnership', entityId: o.id,
        before: { status: 'PENDING', note: o.verificationNote },
        after: { status: 'VERIFIED', method: 'MANUAL_CHAIRMAN', user_id: o.userId, unit: o.unit.number },
      })
      return { id: o.id, verification: 'VERIFIED' as const }
    })
  }

  reject(id: string, reason: string) {
    return this.db.run(async (tx) => {
      const o = await this.pendingOwnership(tx, id)
      await tx.unitOwnership.update({
        where: { id: o.id },
        data: { verificationStatus: 'REJECTED', verifiedAt: new Date(), verifiedBy: ctx().userId ?? null, verificationNote: reason },
      })
      await this.audit.append(tx, {
        action: 'ownership.reject', entityType: 'UnitOwnership', entityId: o.id,
        after: { status: 'REJECTED', reason, user_id: o.userId, unit: o.unit.number },
      })
      return { id: o.id, verification: 'REJECTED' as const }
    })
  }

  private async pendingOwnership(tx: Tx, id: string) {
    const o = await tx.unitOwnership.findFirst({
      where: { id },
      include: { unit: { select: { number: true } }, user: { select: { identityVerifiedAt: true } } },
    })
    if (!o) throw notFound('Собственность')
    if (o.verificationStatus !== 'PENDING') throw conflict(ErrorCode.OWNERSHIP_DECIDED, 'Решение по этой собственности уже принято')
    return o
  }
}
