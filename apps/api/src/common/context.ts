import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Контекст запроса. Из него слой данных берёт дом и пользователя для RLS,
 * а аудит — автора действия. Дом попадает сюда только после проверки членства.
 */
export type RequestContext = {
  ip?: string
  userAgent?: string
  userId?: string
  /** Как пришла аутентификация: cookie (веб) или Bearer (мобильное) */
  authVia?: 'cookie' | 'bearer'
  houseId?: string
  /** Роль в доме из пути запроса */
  role?: string
  /** Админ-панель и системные задачи: RLS не ограничивает выборку */
  bypass?: boolean
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

export function ctx(): RequestContext {
  return storage.getStore() ?? {}
}

/** Системное действие вне HTTP-запроса или до аутентификации (сид, разбор ссылки-приглашения) */
export function asSystem<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ ...ctx(), bypass: true }, fn)
}
