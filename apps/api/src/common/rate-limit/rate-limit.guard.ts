import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@ortaq/shared';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { AppError } from '../errors/app-error.js';
import { type AuthedRequest, META, type RateClass } from '../auth/decorators.js';

/** Классы лимитов — docs/spec/03-api-contract.md §1. */
const LIMITS: Record<RateClass, { max: number; windowMs: number }> = {
  auth: { max: 5, windowMs: 15 * 60_000 },
  write: { max: 60, windowMs: 60_000 },
  read: { max: 300, windowMs: 60_000 },
  ai: { max: 20, windowMs: 60 * 60_000 },
  upload: { max: 30, windowMs: 60 * 60_000 },
};

/**
 * Лимиты с фиксированным окном в памяти процесса.
 * TODO(фаза 1): вынести счётчики в Redis — при нескольких инстансах API лимит сейчас умножается на их число.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.config.RATE_LIMIT_ENABLED) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const cls =
      this.reflector.getAllAndOverride<RateClass | undefined>(META.rateClass, [ctx.getHandler(), ctx.getClass()]) ??
      (req.method === 'GET' ? 'read' : 'write');

    const key = `${cls}:${this.subject(req, cls)}`;
    const { max, windowMs } = LIMITS[cls];
    const now = Date.now();
    if (this.buckets.size > 50_000) this.purge(now);

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      ctx.switchToHttp().getResponse().setHeader('Retry-After', String(retryAfterSec));
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'Слишком много запросов', { retry_after_sec: retryAfterSec });
    }
    return true;
  }

  /** auth — IP + идентификатор из тела; остальное — пользователь по токену сессии или IP. */
  private subject(req: AuthedRequest, cls: RateClass): string {
    const ip = req.ip ?? 'unknown';
    if (cls === 'auth') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const id = typeof body.email === 'string' ? body.email.toLowerCase() : typeof body.phone === 'string' ? body.phone : '';
      return `${ip}|${req.path}|${id}`;
    }
    // Гард идёт до аутентификации, поэтому ключ — сам токен (cookie или Bearer), а не user_id.
    const auth = req.header('authorization') ?? (req.cookies as Record<string, string> | undefined)?.ortaq_at;
    return auth ? `t:${auth.slice(-24)}` : `ip:${ip}`;
  }

  private purge(now: number): void {
    for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
  }
}
