import { Injectable } from '@nestjs/common';
import type { SessionClient } from '@prisma/client';
import { ErrorCode, type PasswordLoginResponse, type TotpSetupResponse } from '@ortaq/shared';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { STEP_UP_TTL_SEC, TokenService } from '../../common/auth/token.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { DbService } from '../../infra/db/db.service.js';
import type { Actor } from '../../infra/db/request-context.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from './password.service.js';
import { type IssuedSession, SessionService } from './session.service.js';
import { TotpService } from './totp.service.js';

interface ClientMeta {
  client: SessionClient;
  ip?: string;
  deviceInfo?: string;
}

const INVALID_CREDENTIALS = () =>
  new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Неверная почта или пароль');
const INVALID_TOTP = () => new AppError(401, ErrorCode.INVALID_TOTP, 'Неверный или уже использованный код');
const INVALID_TOKEN = () => new AppError(401, ErrorCode.INVALID_TOKEN, 'Ссылка недействительна или устарела');

/**
 * Вход для ролей с почтой: пароль → обязательный TOTP → сессия (docs/spec/13-security.md §2).
 * Методы работают без транзакции запроса: запись о неудачной попытке не должна откатываться вместе с ошибкой.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async passwordLogin(email: string, password: string, meta: ClientMeta): Promise<PasswordLoginResponse> {
    const user = await this.db.rw.user.findUnique({
      where: { email },
      select: { id: true, password_hash: true, status: true, totp_enabled_at: true },
    });
    const ok = await this.passwords.verify(user?.password_hash, password);
    if (!user || !ok || user.status === 'BLOCKED') {
      await this.audit.record({ action: 'auth.login.failed', entity_type: 'user', entity_id: user?.id, house_id: null, actor_id: user?.id ?? null });
      throw INVALID_CREDENTIALS();
    }
    const purpose = user.totp_enabled_at ? 'VERIFY' : 'SETUP';
    return {
      next: purpose === 'VERIFY' ? 'TOTP_VERIFY' : 'TOTP_SETUP',
      challenge_token: await this.tokens.signChallenge({ sub: user.id, purpose, cli: meta.client }),
    };
  }

  /** Установка пароля по ссылке из письма. Дальше — всегда второй фактор. */
  async setPassword(token: string, password: string, meta: ClientMeta): Promise<PasswordLoginResponse> {
    const record = await this.db.rw.actionToken.findUnique({
      where: { token_hash: this.crypto.sha256(token) },
      include: { user: { select: { id: true, email: true, status: true, totp_enabled_at: true } } },
    });
    if (!record || record.used_at || record.expires_at < new Date() || record.user.status === 'BLOCKED') {
      throw INVALID_TOKEN();
    }
    await this.passwords.assertAcceptable(password, { email: record.user.email });
    const hash = await this.passwords.hash(password);

    const used = await this.db.rw.$transaction(async (tx) => {
      const { count } = await tx.actionToken.updateMany({
        where: { id: record.id, used_at: null },
        data: { used_at: new Date() },
      });
      if (count === 0) return false;
      await tx.user.update({
        where: { id: record.user.id },
        data: { password_hash: hash, password_changed_at: new Date() },
      });
      return true;
    });
    if (!used) throw INVALID_TOKEN();

    await this.sessions.revokeAllForUser(record.user.id);
    await this.audit.record({ action: 'auth.password.set', entity_type: 'user', entity_id: record.user.id, house_id: null, actor_id: record.user.id });

    const purpose = record.user.totp_enabled_at ? 'VERIFY' : 'SETUP';
    return {
      next: purpose === 'VERIFY' ? 'TOTP_VERIFY' : 'TOTP_SETUP',
      challenge_token: await this.tokens.signChallenge({ sub: record.user.id, purpose, cli: meta.client }),
    };
  }

  /**
   * Первичная настройка TOTP по challenge-токену. Смена устройства в активной сессии не поддерживается:
   * потерянный второй фактор восстанавливается только через админа платформы (04 §3.1).
   */
  async setupTotp(challengeToken: string): Promise<TotpSetupResponse> {
    const challenge = await this.tokens.verifyChallenge(challengeToken);
    if (!challenge || challenge.purpose !== 'SETUP') throw INVALID_TOKEN();
    const user = await this.db.rw.user.findUnique({
      where: { id: challenge.sub },
      select: { id: true, email: true, totp_enabled_at: true },
    });
    if (!user || user.totp_enabled_at) throw INVALID_TOKEN();

    const secret = this.totp.generateSecret();
    await this.db.rw.user.update({
      where: { id: user.id },
      data: { totp_secret_encrypted: this.crypto.encryptTotpSecret(secret), totp_last_step: null },
    });
    return { secret, otpauth_url: this.totp.otpauthUrl(user.email ?? user.id, secret) };
  }

  async verifyTotp(challengeToken: string, code: string, meta: Omit<ClientMeta, 'client'>): Promise<IssuedSession & { client: SessionClient }> {
    const challenge = await this.tokens.verifyChallenge(challengeToken);
    if (!challenge) throw INVALID_TOKEN();
    const user = await this.db.rw.user.findUnique({
      where: { id: challenge.sub },
      select: { id: true, status: true, is_platform_admin: true, totp_secret_encrypted: true, totp_enabled_at: true, totp_last_step: true },
    });
    if (!user || user.status === 'BLOCKED' || !user.totp_secret_encrypted) throw INVALID_TOKEN();
    if (challenge.purpose === 'VERIFY' && !user.totp_enabled_at) throw INVALID_TOKEN();

    const step = this.totp.verify(code, this.crypto.decryptTotpSecret(user.totp_secret_encrypted), user.totp_last_step);
    if (step === null) {
      await this.audit.record({ action: 'auth.totp.failed', entity_type: 'user', entity_id: user.id, house_id: null, actor_id: user.id });
      throw INVALID_TOTP();
    }

    // Условие по шагу исключает повторное использование кода параллельным запросом.
    const { count } = await this.db.rw.user.updateMany({
      where: { id: user.id, OR: [{ totp_last_step: null }, { totp_last_step: { lt: step } }] },
      data: {
        totp_last_step: step,
        last_login_at: new Date(),
        ...(challenge.purpose === 'SETUP' ? { totp_enabled_at: new Date(), status: 'ACTIVE' as const } : {}),
      },
    });
    if (count === 0) throw INVALID_TOTP();

    if (challenge.purpose === 'SETUP') {
      await this.audit.record({ action: 'auth.totp.enabled', entity_type: 'user', entity_id: user.id, house_id: null, actor_id: user.id });
    }
    const session = await this.sessions.create({
      userId: user.id,
      client: challenge.cli,
      isPlatformAdmin: user.is_platform_admin,
      ip: meta.ip,
      deviceInfo: meta.deviceInfo,
    });
    await this.audit.record({ action: 'auth.login.success', entity_type: 'session', entity_id: session.sessionId, house_id: null, actor_id: user.id });
    return { ...session, client: challenge.cli };
  }

  /** Step-up для ролей с почтой — TOTP. Для телефонных ролей (фаза 1) — OTP. */
  async stepUp(actor: Actor, code: string): Promise<{ token: string; expiresAt: Date }> {
    const user = await this.db.rw.user.findUnique({
      where: { id: actor.userId },
      select: { totp_secret_encrypted: true, totp_enabled_at: true, totp_last_step: true },
    });
    if (!user?.totp_enabled_at || !user.totp_secret_encrypted) throw INVALID_TOTP();
    const step = this.totp.verify(code, this.crypto.decryptTotpSecret(user.totp_secret_encrypted), user.totp_last_step);
    const { count } =
      step === null
        ? { count: 0 }
        : await this.db.rw.user.updateMany({
            where: { id: actor.userId, OR: [{ totp_last_step: null }, { totp_last_step: { lt: step } }] },
            data: { totp_last_step: step },
          });
    if (count === 0) {
      await this.audit.record({ action: 'auth.step_up.failed', entity_type: 'session', entity_id: actor.sessionId, house_id: null });
      throw INVALID_TOTP();
    }
    await this.audit.record({ action: 'auth.step_up', entity_type: 'session', entity_id: actor.sessionId, house_id: null });
    return {
      token: await this.tokens.signStepUp({ sub: actor.userId, sid: actor.sessionId }),
      expiresAt: new Date(Date.now() + STEP_UP_TTL_SEC * 1000),
    };
  }

  async logout(actor: Actor): Promise<void> {
    await this.sessions.revoke(actor.sessionId);
    await this.audit.record({ action: 'auth.logout', entity_type: 'session', entity_id: actor.sessionId, house_id: null });
  }
}
