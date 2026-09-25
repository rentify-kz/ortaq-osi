import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { DbService } from '../../infra/db/db.service.js';
import { currentContext, type Tx } from '../../infra/db/request-context.js';

export interface AuditEntry {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  /** По умолчанию — дом из скоупа запроса. Явно `null` — действие вне дома. */
  house_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Для действий до аутентификации (неудачный вход): кто пытался. */
  actor_id?: string | null;
}

/** Поля с ПДн и секретами в журнал не попадают (docs/spec/02-data-model.md §12). */
const REDACT = /password|iin|totp|secret|token|phone|email|full_name|bank_details/i;

/**
 * Журнал аудита. Запись идёт в транзакции запроса — атомарно с изменением.
 * Хеш-цепочку, seq и время выставляет триггер БД; приложение не может ни читать, ни менять журнал.
 */
@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    const ctx = currentContext();
    const houseId = entry.house_id === undefined ? (ctx?.house?.houseId ?? null) : entry.house_id;
    const data: Prisma.AuditLogCreateManyInput = {
      id: uuidv7(),
      house_id: houseId,
      actor_id: entry.actor_id !== undefined ? entry.actor_id : (ctx?.actor?.userId ?? null),
      actor_role: ctx?.actor?.isPlatformAdmin ? 'PLATFORM_ADMIN' : (ctx?.house?.role ?? null),
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ip: ctx?.ip ?? null,
      user_agent: ctx?.userAgent ?? null,
    };

    // createMany = INSERT без RETURNING: у app_rw нет права читать журнал, только дописывать.
    const client = tx ?? ctx?.tx;
    if (client) {
      await client.auditLog.createMany({ data: [data] });
      return;
    }
    await this.db.scoped({ userId: ctx?.actor?.userId, houseId: houseId ?? undefined }, (t) =>
      t.auditLog.createMany({ data: [data] }),
    );
  }
}

function toJson(v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!v) return Prisma.DbNull;
  return redact(v) as Prisma.InputJsonValue;
}

function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (v && typeof v === 'object') {
    if (v instanceof Uint8Array) return '[bytes]';
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = REDACT.test(k) ? '[redacted]' : redact(val);
    return out;
  }
  return v;
}
