import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { ctx } from '../../common/context'
import { bytes } from '../../infra/crypto.service'
import type { Tx } from '../../infra/prisma.service'

export type AuditEntry = {
  action: string
  entityType: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  /** По умолчанию дом из контекста запроса; null — общая цепочка (вход, действия админа вне дома) */
  houseId?: string | null
}

/** Поля, которые не попадают в журнал ни в каком виде */
const SECRET_KEY = /password|totp|secret|token|iin|hash/i

/** Плоские JSON-значения с сортированными ключами: то, что хешируем, совпадает с тем, что хранится */
export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return null
  if (Array.isArray(value)) return value.map(toPlain)
  if (typeof value === 'object') {
    // Prisma Decimal и подобные отдают строку через toJSON
    const json = (value as { toJSON?: () => unknown }).toJSON
    if (typeof json === 'function' && value.constructor !== Object) return toPlain(json.call(value))
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      if (SECRET_KEY.test(key)) continue
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = toPlain(v)
    }
    return out
  }
  return value
}

type HashInput = {
  houseId: string | null
  prevHash: Buffer | null
  actorId: string | null
  actorRole: string | null
  action: string
  entityType: string
  entityId: string | null
  before: unknown
  after: unknown
  ip: string | null
  userAgent: string | null
  createdAt: Date
}

export function auditHash(r: HashInput): Buffer {
  const payload = JSON.stringify([
    r.houseId ?? 'global',
    r.prevHash ? r.prevHash.toString('hex') : null,
    r.actorId, r.actorRole, r.action, r.entityType, r.entityId,
    toPlain(r.before), toPlain(r.after),
    r.ip, r.userAgent, r.createdAt.toISOString(),
  ])
  return createHash('sha256').update(payload).digest()
}

export type ChainCheck = { valid: boolean; checked: number; broken_at: string | null }

/**
 * Журнал аудита с хеш-цепочкой (docs/13 §5). Запись идёт в той же транзакции, что и действие:
 * действие без записи в журнал не происходит.
 */
@Injectable()
export class AuditService {
  async append(tx: Tx, entry: AuditEntry): Promise<void> {
    const c = ctx()
    const houseId = entry.houseId === undefined ? (c.houseId ?? null) : entry.houseId
    // Последовательная запись в одну цепочку: две параллельные записи не получат один prev_hash
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`audit:${houseId ?? 'global'}`}, 0))`
    const head = await tx.$queryRaw<{ hash: Buffer | null }[]>`SELECT audit_chain_head(${houseId}::uuid) AS hash`
    const record: HashInput = {
      houseId,
      prevHash: head[0]?.hash ? Buffer.from(head[0].hash) : null,
      actorId: c.userId ?? null,
      actorRole: c.role ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: toPlain(entry.before),
      after: toPlain(entry.after),
      ip: c.ip ?? null,
      userAgent: c.userAgent ?? null,
      createdAt: new Date(),
    }
    // Сырой INSERT без RETURNING: Prisma create читает строку обратно, а читать общую цепочку
    // RLS позволяет только админу. Писать в журнал может каждый, читать — не каждый.
    const json = (v: unknown) => (v === null ? null : JSON.stringify(v))
    await tx.$executeRaw`
      INSERT INTO audit_log (id, house_id, actor_id, actor_role, action, entity_type, entity_id,
                             before, after, ip, user_agent, created_at, prev_hash, hash)
      VALUES (${uuidv7()}::uuid, ${record.houseId}::uuid, ${record.actorId}::uuid, ${record.actorRole},
              ${record.action}, ${record.entityType}, ${record.entityId},
              ${json(record.before)}::jsonb, ${json(record.after)}::jsonb, ${record.ip}, ${record.userAgent},
              ${record.createdAt}, ${record.prevHash ? bytes(record.prevHash) : null}, ${bytes(auditHash(record))})`
  }

  /** Пересчёт цепочки дома (или общей при null). Правка любой записи ломает все хеши после неё */
  async verify(tx: Tx, houseId: string | null): Promise<ChainCheck> {
    const rows = await tx.auditLog.findMany({ where: { houseId }, orderBy: { seq: 'asc' } })
    let prev: Buffer | null = null
    for (const row of rows) {
      const storedPrev = row.prevHash ? Buffer.from(row.prevHash) : null
      const expected = auditHash({ ...row, prevHash: prev })
      const linked = storedPrev === null ? prev === null : prev !== null && storedPrev.equals(prev)
      if (!linked || !expected.equals(Buffer.from(row.hash))) {
        return { valid: false, checked: rows.length, broken_at: row.id }
      }
      prev = Buffer.from(row.hash)
    }
    return { valid: true, checked: rows.length, broken_at: null }
  }
}
