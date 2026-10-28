import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import { env } from '../config/env'
import { ctx } from '../common/context'

/**
 * Изоляция домов, слои 2 и 3 (docs/13 §1).
 *
 * Слой 2 — расширение клиента: в запросы к доменным моделям дом из контекста
 * подставляется автоматически, разработчик не пишет фильтр руками и не может его забыть.
 * Слой 3 — RLS: каждая транзакция выставляет app.current_house_id и app.current_user_id,
 * и база сама отсекает чужие строки, даже если запрос обошёл расширение.
 *
 * Запрос вне run() идёт без настроек RLS, и политики не вернут ни одной доменной строки:
 * забытый контекст даёт пустой ответ, а не чужие данные.
 */

/** Модели с колонкой house_id */
const HOUSE_SCOPED = new Set<string>([
  'Unit', 'HouseMembership', 'UnitOwnership', 'Invite', 'JoinRequest',
  'OwnerRegistryEntry', 'RegistryImport', 'Announcement', 'AnnouncementTarget', 'AnnouncementRead', 'StaffMember', 'Contractor',
  'File', 'Request', 'RequestStage', 'RequestEvent', 'RequestFollower', 'Task', 'TaskCompletion', 'RecurringTaskTemplate',
])

const WHERE_OPERATIONS = new Set<string>([
  'findFirst', 'findFirstOrThrow', 'findMany', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany',
])

type Row = Record<string, unknown>

function withHouse(data: Row, houseId: string): Row {
  if (data.houseId !== undefined && data.houseId !== houseId) {
    // Попытка записать в чужой дом — ошибка программы, а не пользователя
    throw new Error(`Запись в дом ${String(data.houseId)} из контекста дома ${houseId}`)
  }
  return { ...data, houseId }
}

const houseScope = Prisma.defineExtension({
  name: 'house-scope',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        const c = ctx()
        if (!HOUSE_SCOPED.has(model) || c.bypass || !c.houseId) return query(args)
        const houseId = c.houseId
        const a = args as Row
        if (operation === 'create') a.data = withHouse(a.data as Row, houseId)
        else if (operation === 'createMany' || operation === 'createManyAndReturn') {
          a.data = Array.isArray(a.data) ? a.data.map((d: Row) => withHouse(d, houseId)) : withHouse(a.data as Row, houseId)
        } else if (operation === 'upsert') {
          a.where = { ...(a.where as Row), houseId }
          a.create = withHouse(a.create as Row, houseId)
        } else if (WHERE_OPERATIONS.has(operation)) {
          a.where = { ...((a.where as Row | undefined) ?? {}), houseId }
        }
        return query(a)
      },
    },
  },
})

function createClient() {
  return new PrismaClient({ datasourceUrl: env().DATABASE_URL }).$extends(houseScope)
}

export type Db = ReturnType<typeof createClient>
/** Клиент внутри транзакции run(): все обращения сервисов к БД идут через него */
export type Tx = Omit<Db, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: Db = createClient()

  /**
   * Транзакция с контекстом RLS из текущего запроса.
   * set_config(..., true) действует до конца транзакции и не протекает в пул соединений.
   */
  run<T>(fn: (tx: Tx) => Promise<T>, options?: { timeout?: number }): Promise<T> {
    const c = ctx()
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT
          set_config('app.current_house_id', ${c.houseId ?? ''}, true),
          set_config('app.current_user_id', ${c.userId ?? ''}, true),
          set_config('app.bypass_rls', ${c.bypass ? 'on' : 'off'}, true)`
        return fn(tx)
      },
      { timeout: options?.timeout ?? 10_000 },
    )
  }

  async onModuleDestroy() {
    await this.client.$disconnect()
  }
}
