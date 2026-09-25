import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SessionClient } from '@prisma/client';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { ACCESS_TTL_SEC, TokenService } from '../../common/auth/token.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { DbService } from '../../infra/db/db.service.js';
import { AuditService } from '../audit/audit.service.js';

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
/** Параллельное обновление из двух вкладок — не кража: в этом окне повтор не отзывает семью. */
const REUSE_GRACE_MS = 10_000;

export interface IssuedSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

/**
 * Refresh-токены с ротацией и обнаружением повторного использования (docs/spec/13-security.md §2).
 * Таблица session глобальная (без RLS), доступ только через этот сервис.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger('SessionService');

  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async create(input: {
    userId: string;
    client: SessionClient;
    isPlatformAdmin: boolean;
    ip?: string;
    deviceInfo?: string;
    familyId?: string;
  }): Promise<IssuedSession> {
    const refreshToken = this.crypto.randomToken();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const session = await this.db.rw.session.create({
      data: {
        user_id: input.userId,
        family_id: input.familyId ?? randomUUID(),
        token_hash: this.crypto.sha256(refreshToken),
        client: input.client,
        ip: input.ip ?? null,
        device_info: input.deviceInfo?.slice(0, 500) ?? null,
        expires_at: refreshExpiresAt,
      },
      select: { id: true },
    });
    return this.issue(session.id, input.userId, input.client, input.isPlatformAdmin, refreshToken, refreshExpiresAt);
  }

  async rotate(refreshToken: string, meta: { ip?: string; deviceInfo?: string }): Promise<IssuedSession> {
    const session = await this.db.rw.session.findUnique({
      where: { token_hash: this.crypto.sha256(refreshToken) },
      include: { user: { select: { status: true, is_platform_admin: true } } },
    });
    if (!session) throw AppError.unauthenticated();

    if (session.revoked_at) {
      const isRace = session.replaced_by_id && Date.now() - session.revoked_at.getTime() < REUSE_GRACE_MS;
      if (!isRace) {
        await this.revokeFamily(session.family_id);
        this.logger.warn(`refresh token reuse detected, family ${session.family_id} revoked`);
        await this.audit.record({
          action: 'auth.refresh.reuse_detected',
          entity_type: 'session',
          entity_id: session.id,
          house_id: null,
          actor_id: session.user_id,
        });
      }
      throw AppError.unauthenticated();
    }
    if (session.expires_at < new Date() || session.user.status !== 'ACTIVE') throw AppError.unauthenticated();

    const next = await this.create({
      userId: session.user_id,
      client: session.client,
      isPlatformAdmin: session.user.is_platform_admin,
      familyId: session.family_id,
      ip: meta.ip,
      deviceInfo: meta.deviceInfo,
    });
    // Условное обновление: из двух одновременных ротаций одного токена проходит только одна.
    const { count } = await this.db.rw.session.updateMany({
      where: { id: session.id, revoked_at: null },
      data: { revoked_at: new Date(), replaced_by_id: next.sessionId },
    });
    if (count === 0) {
      await this.db.rw.session.update({ where: { id: next.sessionId }, data: { revoked_at: new Date() } });
      throw AppError.unauthenticated();
    }
    return next;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db.rw.session.updateMany({ where: { id: sessionId, revoked_at: null }, data: { revoked_at: new Date() } });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db.rw.session.updateMany({ where: { family_id: familyId, revoked_at: null }, data: { revoked_at: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.rw.session.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: new Date() } });
  }

  private async issue(
    sessionId: string,
    userId: string,
    client: SessionClient,
    isPlatformAdmin: boolean,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<IssuedSession> {
    const accessToken = await this.tokens.signAccess({ sub: userId, sid: sessionId, cli: client, adm: isPlatformAdmin });
    return {
      sessionId,
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + ACCESS_TTL_SEC * 1000),
      refreshExpiresAt,
    };
  }
}
