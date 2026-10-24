import { Injectable } from '@nestjs/common'
import type { VerificationOutcome } from '@ortaq/shared'
import type { Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { namesMatch } from './names'

export type UnitResult = { house_id: string; unit_number: string; outcome: VerificationOutcome }

/**
 * Сверка подтверждённой личности с реестром собственников (docs/04 §7.2). Совпали ИИН,
 * помещение и ФИО — собственность подтверждена сразу. Всё остальное не отказ, а очередь
 * председателю: реестр устаревает, квартиры продают, фамилии меняют.
 *
 * Вызывается после подписи ЭЦП и после загрузки нового реестра: жилец, подтвердивший
 * личность раньше, чем председатель загрузил файл, не должен проходить всё заново.
 * Работает в системном контексте: дом в каждом запросе указан явно.
 */
@Injectable()
export class RegistryMatcher {
  constructor(private readonly audit: AuditService) {}

  async matchAll(tx: Tx, userId: string, iinHash: Uint8Array<ArrayBuffer>, certName: string): Promise<UnitResult[]> {
    const memberships = await tx.houseMembership.findMany({ where: { userId, status: 'ACTIVE', role: 'RESIDENT' }, select: { houseId: true } })
    const results: UnitResult[] = []
    for (const { houseId } of memberships) results.push(...(await this.matchHouse(tx, houseId, userId, iinHash, certName)))
    return results
  }

  async matchHouse(tx: Tx, houseId: string, userId: string, iinHash: Uint8Array<ArrayBuffer>, certName: string): Promise<UnitResult[]> {
    const results: UnitResult[] = []
    const entries = await tx.ownerRegistryEntry.findMany({ where: { houseId, iinHash } })
    const ownerships = await tx.unitOwnership.findMany({ where: { houseId, userId }, include: { unit: { select: { number: true } } } })
    const handled = new Set<string>()

    for (const entry of entries) {
      const unit = await tx.unit.findFirst({ where: { houseId, number: entry.unitNumber }, select: { id: true, number: true } })
      if (!unit || handled.has(unit.id)) continue
      handled.add(unit.id)
      const existing = ownerships.find((o) => o.unitId === unit.id)
      if (existing?.verificationStatus === 'VERIFIED') {
        results.push({ house_id: houseId, unit_number: unit.number, outcome: 'MATCHED' })
        continue
      }
      // Отказ председателя реестр не отменяет: он мог знать о продаже квартиры
      if (existing?.verificationStatus === 'REJECTED') continue

      const nameOk = namesMatch(certName, entry.fullName)
      const data = nameOk
        ? { relation: 'OWNER' as const, verificationStatus: 'VERIFIED' as const, verificationMethod: 'EDS_REGISTRY_MATCH' as const, verifiedAt: new Date(), verificationNote: null }
        : { relation: 'OWNER' as const, verificationStatus: 'PENDING' as const, verificationNote: `ФИО в ЭЦП не совпадает с реестром (в реестре: ${entry.fullName})` }
      const ownership = existing
        ? await tx.unitOwnership.update({ where: { id: existing.id }, data })
        : await tx.unitOwnership.create({ data: { houseId, unitId: unit.id, userId, ...data } })

      results.push({ house_id: houseId, unit_number: unit.number, outcome: !nameOk ? 'NAME_MISMATCH' : existing ? 'MATCHED' : 'MOVED' })
      if (nameOk) {
        await this.audit.append(tx, {
          houseId, action: 'ownership.verify', entityType: 'UnitOwnership', entityId: ownership.id,
          after: { user_id: userId, unit: unit.number, method: 'EDS_REGISTRY_MATCH' },
        })
      }
    }

    for (const o of ownerships) {
      if (handled.has(o.unitId) || o.verificationStatus !== 'PENDING') continue
      const tenant = o.relation === 'TENANT'
      const note = tenant ? 'Наниматель: проживание подтверждает председатель' : 'Нет в реестре собственников'
      await tx.unitOwnership.update({ where: { id: o.id }, data: { verificationNote: note } })
      results.push({ house_id: houseId, unit_number: o.unit.number, outcome: tenant ? 'TENANT' : 'NOT_IN_REGISTRY' })
    }
    return results
  }
}
