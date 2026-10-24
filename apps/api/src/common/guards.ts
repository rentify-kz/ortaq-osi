import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { ErrorCode, type HouseRole } from '@ortaq/shared'
import { PrismaService } from '../infra/prisma.service'
import { ACCESS_COOKIE } from '../modules/auth/sessions.service'
import { TokensService } from '../modules/auth/tokens.service'
import { ctx } from './context'
import { ADMIN, HOUSE_ROLES, PUBLIC, RATE, STEP_UP, type RateClass } from './decorators'
import { AppError, forbidden, notFound, unauthenticated } from './errors'

/*
 * Глобальные гарды. Порядок регистрации в AppModule = порядок проверки:
 * лимит → аутентификация → админ-панель → скоуп дома → step-up.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function meta<T>(reflector: Reflector, key: string, context: ExecutionContext): T | undefined {
  return reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()])
}

/* ───────── лимиты запросов, docs/03 §1 ───────── */

const LIMITS: Record<RateClass, { limit: number; windowMs: number }> = {
  auth: { limit: 5, windowMs: 15 * 60_000 },
  write: { limit: 60, windowMs: 60_000 },
  read: { limit: 300, windowMs: 60_000 },
}

/**
 * Фиксированное окно в памяти процесса. Для нескольких инстансов API хранилище
 * переезжает в Redis вместе с очередями (фаза 1); интерфейс гарда не меняется.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()

  take(key: string, cls: RateClass): boolean {
    const { limit, windowMs } = LIMITS[cls]
    const now = Date.now()
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }
    entry.count += 1
    return entry.count <= limit
  }

  reset() {
    this.hits.clear()
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly limiter: RateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    const cls = meta<RateClass>(this.reflector, RATE, context) ?? (req.method === 'GET' ? 'read' : 'write')
    // Для входа ключ — IP плюс идентификатор: перебор паролей одного человека и перебор людей с одного IP
    const body = (req.body ?? {}) as Record<string, unknown>
    const identifier = typeof body.email === 'string' ? body.email : typeof body.phone === 'string' ? body.phone : (ctx().userId ?? '')
    const who = cls === 'auth' ? `${req.ip}|${identifier}` : (ctx().userId ?? req.ip ?? 'anon')
    const key = `${cls}:${req.route?.path ?? req.path}:${who}`
    if (!this.limiter.take(key, cls)) throw new AppError(429, ErrorCode.RATE_LIMITED, 'Слишком много попыток. Подождите немного')
    return true
  }
}

/* ───────── аутентификация ───────── */

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tokens: TokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (meta<boolean>(this.reflector, PUBLIC, context)) return true
    const req = context.switchToHttp().getRequest<Request>()
    const cookie = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE]
    const bearer = req.header('authorization')?.match(/^Bearer (.+)$/)?.[1]
    const token = cookie ?? bearer
    if (!token) throw unauthenticated()
    const claims = await this.tokens.verify(token, 'access')
    const c = ctx()
    c.userId = claims.sub
    c.authVia = cookie ? 'cookie' : 'bearer'
    return true
  }
}

/* ───────── админ-панель: только веб и только PLATFORM_ADMIN ───────── */

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!meta<boolean>(this.reflector, ADMIN, context)) return true
    const c = ctx()
    // Мобильный клиент ходит с Bearer: админ-панель для него закрыта полностью, docs/03 §1
    if (c.authVia !== 'cookie') throw forbidden('Админ-панель доступна только в веб-версии')
    const user = await this.db.run((tx) => tx.user.findUnique({ where: { id: c.userId ?? '' }, select: { isPlatformAdmin: true, status: true } }))
    if (!user?.isPlatformAdmin || user.status === 'BLOCKED') throw forbidden()
    c.bypass = true
    c.role = 'PLATFORM_ADMIN'
    return true
  }
}

/* ───────── скоуп дома ───────── */

@Injectable()
export class HouseGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = meta<HouseRole[]>(this.reflector, HOUSE_ROLES, context)
    if (!roles) return true
    const req = context.switchToHttp().getRequest<Request>()
    const raw = req.params.houseId
    const houseId = typeof raw === 'string' ? raw : undefined
    // Дом только из пути и только после проверки членства. Не тот формат или нет членства — 404
    if (!houseId || !UUID.test(houseId)) throw notFound('Дом')
    const c = ctx()
    const membership = await this.db.run((tx) =>
      tx.houseMembership.findFirst({ where: { houseId, userId: c.userId ?? '', status: 'ACTIVE' }, select: { role: true } }),
    )
    if (!membership) throw notFound('Дом')
    if (roles.length > 0 && !roles.includes(membership.role)) throw forbidden()
    c.houseId = houseId
    c.role = membership.role
    return true
  }
}

/* ───────── step-up ───────── */

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tokens: TokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!meta<boolean>(this.reflector, STEP_UP, context)) return true
    const req = context.switchToHttp().getRequest<Request>()
    const header = req.header('x-step-up-token')
    const required = new AppError(428, ErrorCode.STEP_UP_REQUIRED, 'Подтвердите действие кодом из приложения')
    if (!header) throw required
    const claims = await this.tokens.verify(header, 'step_up').catch(() => null)
    if (!claims || claims.sub !== ctx().userId) throw required
    return true
  }
}
