import { createHash } from 'node:crypto'
import { canonical } from '../../common/canonical'
import type { Tx } from '../../infra/prisma.service'
import { weightOf, type SnapshotEntry } from './tally'

export type BuiltSnapshot = { entries: SnapshotEntry[]; totalArea: number; totalUnits: number; entriesHash: Buffer<ArrayBuffer>; withoutArea: number }

/** Сколько голосующих помещений без площади: пока есть хоть одно, голосование юридически ничтожно (docs/09 §2) */
export async function unitsWithoutArea(tx: Tx): Promise<number> {
  return tx.unit.count({ where: { isExcludedFromVoting: false, area: null } })
}

/**
 * Реестр на момент старта (docs/09 §6). Голосует подтверждённый собственник; при долевой
 * собственности — назначенный представитель, а если его нет — любой из собственников,
 * первый поданный бюллетень закрывает помещение. Порядок по id делает хеш воспроизводимым.
 */
export async function buildSnapshot(tx: Tx): Promise<BuiltSnapshot> {
  const units = await tx.unit.findMany({ where: { isExcludedFromVoting: false }, select: { id: true, number: true, area: true }, orderBy: { id: 'asc' } })
  const owners = await tx.unitOwnership.findMany({
    where: { relation: 'OWNER', verificationStatus: 'VERIFIED' }, select: { unitId: true, userId: true, isVotingRepresentative: true }, orderBy: { userId: 'asc' },
  })
  const withoutArea = units.filter((u) => u.area === null).length
  const totalArea = units.reduce((s, u) => s + Math.round(Number(u.area ?? 0) * 100), 0) / 100
  const entries: SnapshotEntry[] = units.map((u) => {
    const mine = owners.filter((o) => o.unitId === u.id)
    const rep = mine.find((o) => o.isVotingRepresentative)
    const area = Number(u.area ?? 0)
    return { unit_id: u.id, number: u.number, area, weight: weightOf(area, totalArea), voters: rep ? [rep.userId] : mine.map((o) => o.userId) }
  })
  return { entries, totalArea, totalUnits: units.length, entriesHash: snapshotHash(entries), withoutArea }
}

/** Хеш снимка: подсчёт и протокол проверяют, что веса не менялись с момента старта */
export function snapshotHash(entries: SnapshotEntry[]): Buffer<ArrayBuffer> {
  return createHash('sha256').update(canonical(entries)).digest()
}
