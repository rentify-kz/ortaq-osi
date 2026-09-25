import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { HouseRole } from '@prisma/client';
import { ErrorCode } from '@ortaq/shared';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { DbService } from '../../infra/db/db.service.js';
import type { Actor } from '../../infra/db/request-context.js';
import { AppError } from '../errors/app-error.js';
import { ACCESS_COOKIE, CSRF_HEADER, CSRF_VALUE } from './cookies.js';
import { type AuthedRequest, META } from './decorators.js';
import { TokenService } from './token.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const STEP_UP_HEADER = 'x-step-up-token';

/**
 * Единая проверка доступа в фиксированном порядке:
 * аутентификация → сессия жива → CSRF → админка → скоуп дома → step-up.
 * docs/spec/13-security.md §1–2, docs/spec/03-api-contract.md §1.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly db: DbService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const meta = <T>(key: string) =>
      this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);

    const isPublic = meta<boolean>(META.public) === true;
    const adminOnly = meta<boolean>(META.adminOnly) === true;

    const actor = await this.authenticate(req, adminOnly);
    if (!actor) {
      if (isPublic) return true;
      throw AppError.unauthenticated();
    }
    req.actor = actor;

    if (actor.via === 'cookie' && !SAFE_METHODS.has(req.method) && req.header(CSRF_HEADER) !== CSRF_VALUE) {
      throw new AppError(403, ErrorCode.CSRF_HEADER_MISSING, 'Отсутствует заголовок защиты от CSRF');
    }

    if (adminOnly && !actor.isPlatformAdmin) throw AppError.forbidden();

    const roles = meta<HouseRole[] | undefined>(META.houseRoles);
    if (roles) await this.resolveHouse(req, actor, roles);

    if (meta<boolean>(META.stepUp) === true) await this.checkStepUp(req, actor);
    return true;
  }

  private async authenticate(req: AuthedRequest, adminOnly: boolean): Promise<Actor | null> {
    const bearer = req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    const cookie = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];

    // Админка принимает только cookie-сессию веб-клиента: мобильный токен туда не проходит.
    if (adminOnly && bearer) throw AppError.unauthenticated('Админ-панель доступна только из веба');

    const token = bearer ?? cookie;
    if (!token) return null;
    const claims = await this.tokens.verifyAccess(token);
    if (!claims) return null;
    if (adminOnly && claims.cli !== 'WEB')
      throw AppError.unauthenticated('Админ-панель доступна только из веба');

    // Сессия проверяется на каждый запрос: выход, отзыв и блокировка действуют сразу, а не через 15 минут.
    const session = await this.db.rw.session.findUnique({
      where: { id: claims.sid },
      select: {
        revoked_at: true,
        expires_at: true,
        user_id: true,
        user: { select: { status: true, is_platform_admin: true } },
      },
    });
    if (!session || session.user_id !== claims.sub || session.revoked_at || session.expires_at < new Date())
      return null;
    if (session.user.status !== 'ACTIVE') return null;

    return {
      userId: claims.sub,
      sessionId: claims.sid,
      client: claims.cli,
      isPlatformAdmin: session.user.is_platform_admin,
      via: bearer ? 'bearer' : 'cookie',
    };
  }

  private async resolveHouse(req: AuthedRequest, actor: Actor, roles: HouseRole[]): Promise<void> {
    const param: unknown = req.params.houseId;
    if (param === undefined) throw new Error('@HouseScoped route must have :houseId param');
    if (typeof param !== 'string' || !UUID_RE.test(param)) throw AppError.notFound();
    const houseId = param;

    const membership = await this.db.scoped({ userId: actor.userId }, (tx) =>
      tx.houseMembership.findFirst({
        where: { user_id: actor.userId, house_id: houseId, status: 'ACTIVE' },
        select: { role: true },
      }),
    );
    if (!membership) throw AppError.notFound();
    if (roles.length > 0 && !roles.includes(membership.role)) throw AppError.forbidden();
    req.house = { houseId, role: membership.role };
  }

  private async checkStepUp(req: AuthedRequest, actor: Actor): Promise<void> {
    const token = req.header(STEP_UP_HEADER);
    const claims = token ? await this.tokens.verifyStepUp(token) : null;
    if (!claims || claims.sub !== actor.userId || claims.sid !== actor.sessionId) {
      throw new AppError(428, ErrorCode.STEP_UP_REQUIRED, 'Подтвердите действие');
    }
  }
}
