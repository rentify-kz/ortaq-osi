import { Inject, Injectable } from '@nestjs/common';
import { type AssignChairmanRequest, ErrorCode } from '@ortaq/shared';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { DbService } from '../../infra/db/db.service.js';
import { MAIL_PROVIDER, type MailProvider } from '../../integrations/mail/mail.provider.js';
import { AuditService } from '../audit/audit.service.js';

const PASSWORD_SET_TTL_MS = 72 * 60 * 60_000;

/** Выдача доступа председателю (docs/spec/04-flows-admin-onboarding.md §3). */
@Injectable()
export class ChairmanService {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async assign(houseId: string, input: AssignChairmanRequest, actorId: string): Promise<{ user_id: string; invite_sent: boolean }> {
    const tx = this.db.tx;
    const house = await tx.house.findUnique({ where: { id: houseId }, select: { id: true, display_name: true } });
    if (!house) throw AppError.notFound();

    const current = await tx.houseMembership.findFirst({ where: { house_id: houseId, role: 'CHAIRMAN', status: 'ACTIVE' } });
    if (current) {
      throw AppError.conflict(ErrorCode.CHAIRMAN_ALREADY_ASSIGNED, 'У дома уже есть председатель. Сначала отзовите его доступ');
    }

    const user =
      (await tx.user.findUnique({ where: { email: input.email }, select: { id: true, status: true, password_hash: true } })) ??
      (await tx.user.create({
        data: { email: input.email, full_name: input.full_name, status: 'PENDING' },
        select: { id: true, status: true, password_hash: true },
      }));
    if (user.status === 'BLOCKED') throw AppError.unprocessable(ErrorCode.CONFLICT, 'Учётная запись заблокирована');

    // У пользователя может быть другая роль в этом доме (например, жилец) — председательство её заменяет.
    await tx.houseMembership.updateMany({
      where: { house_id: houseId, user_id: user.id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revoked_at: new Date() },
    });
    const membership = await tx.houseMembership.create({
      data: { house_id: houseId, user_id: user.id, role: 'CHAIRMAN', joined_via: 'ADMIN_PROVISION', created_by: actorId },
    });
    await this.audit.record({
      action: 'membership.chairman.assign',
      entity_type: 'house_membership',
      entity_id: membership.id,
      house_id: houseId,
      after: { user_id: user.id, role: 'CHAIRMAN' },
    });

    const needsPassword = !user.password_hash;
    if (needsPassword) {
      await this.sendPasswordSetLink(user.id, input.email, house.display_name);
    } else {
      await this.mail.send({
        to: input.email,
        subject: `Вы назначены председателем: ${house.display_name}`,
        text: `Вам выдан доступ председателя к дому «${house.display_name}». Войдите в Ortaq: ${this.config.PUBLIC_WEB_URL}/login`,
      });
    }
    return { user_id: user.id, invite_sent: needsPassword };
  }

  /** Повторная отправка ссылки установки пароля. Старые ссылки аннулируются. */
  async resendInvite(houseId: string): Promise<void> {
    const tx = this.db.tx;
    const m = await tx.houseMembership.findFirst({
      where: { house_id: houseId, role: 'CHAIRMAN', status: 'ACTIVE' },
      select: { user: { select: { id: true, email: true, password_hash: true } }, house: { select: { display_name: true } } },
    });
    if (!m?.user.email) throw AppError.notFound('Председатель не назначен');
    if (m.user.password_hash) throw AppError.conflict(ErrorCode.CONFLICT, 'Председатель уже установил пароль');
    await this.sendPasswordSetLink(m.user.id, m.user.email, m.house.display_name);
    await this.audit.record({ action: 'membership.chairman.resend_invite', entity_type: 'user', entity_id: m.user.id, house_id: houseId });
  }

  /** Отзыв председателя (переизбрание). Сессии не трогаем: у человека могут быть другие дома. */
  async revoke(houseId: string): Promise<void> {
    const tx = this.db.tx;
    const m = await tx.houseMembership.findFirst({ where: { house_id: houseId, role: 'CHAIRMAN', status: 'ACTIVE' } });
    if (!m) throw AppError.notFound('Председатель не назначен');
    await tx.houseMembership.update({ where: { id: m.id }, data: { status: 'REVOKED', revoked_at: new Date() } });
    await this.audit.record({
      action: 'membership.chairman.revoke',
      entity_type: 'house_membership',
      entity_id: m.id,
      house_id: houseId,
      before: { user_id: m.user_id, status: 'ACTIVE' },
      after: { status: 'REVOKED' },
    });
  }

  // TODO(фаза 1): письма — через очередь notifications после коммита (outbox), а не внутри транзакции.
  private async sendPasswordSetLink(userId: string, email: string, houseName: string): Promise<void> {
    const tx = this.db.tx;
    const token = this.crypto.randomToken();
    await tx.actionToken.updateMany({
      where: { user_id: userId, purpose: 'PASSWORD_SET', used_at: null },
      data: { used_at: new Date() },
    });
    await tx.actionToken.create({
      data: {
        user_id: userId,
        purpose: 'PASSWORD_SET',
        token_hash: this.crypto.sha256(token),
        expires_at: new Date(Date.now() + PASSWORD_SET_TTL_MS),
      },
    });
    const link = `${this.config.PUBLIC_WEB_URL}/set-password?token=${token}`;
    await this.mail.send({
      to: email,
      subject: 'Доступ председателя в Ortaq',
      text:
        `Вам выдан доступ председателя к дому «${houseName}».\n\n` +
        `Задайте пароль по ссылке (действует 72 часа):\n${link}\n\n` +
        `После этого нужно будет подключить приложение-аутентификатор (Google Authenticator и аналоги).`,
    });
  }
}
