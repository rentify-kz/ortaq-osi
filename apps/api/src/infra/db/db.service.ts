import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { currentContext, type Tx } from './request-context.js';

const TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

/**
 * Доступ к БД. docs/spec/13-security.md §1.
 *
 * - `rw` — роль app_rw, под RLS. Скоуп дома действует только внутри транзакции,
 *   открытой через `scoped()` / интерцептор запроса: там выставляются app.current_*.
 * - `admin` — роль app_admin (BYPASSRLS). Только для /admin/*, CLI и системных задач.
 *
 * Сервисы в контексте запроса берут транзакцию через `tx`: скоуп уже выставлен,
 * фильтр по дому вручную писать не нужно, а забытый скоуп даёт ноль строк, а не чужие данные.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly rw: PrismaClient;
  readonly admin: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.rw = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
    this.admin = new PrismaClient({ datasourceUrl: config.DATABASE_ADMIN_URL });
  }

  /** Транзакция текущего запроса. Вне запроса — ошибка программиста. */
  get tx(): Tx {
    const tx = currentContext()?.tx;
    if (!tx) throw new Error('No request transaction: route is not wrapped by RequestTxInterceptor');
    return tx;
  }

  /** Открывает транзакцию app_rw со скоупом пользователя и (опционально) дома. */
  scoped<T>(scope: { userId?: string; houseId?: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.rw.$transaction(async (tx) => {
      await setScope(tx, scope);
      return fn(tx);
    }, TX_OPTIONS);
  }

  /** Транзакция app_admin. Скоуп пользователя выставляется для единообразия журналирования. */
  adminTx<T>(userId: string | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.admin.$transaction(async (tx) => {
      await setScope(tx, { userId });
      return fn(tx);
    }, TX_OPTIONS);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.rw.$disconnect(), this.admin.$disconnect()]);
  }
}

async function setScope(tx: Tx, scope: { userId?: string; houseId?: string }): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_user_id', ${scope.userId ?? ''}, true),
                              set_config('app.current_house_id', ${scope.houseId ?? ''}, true)`;
}
