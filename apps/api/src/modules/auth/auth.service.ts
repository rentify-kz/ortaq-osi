import { Injectable } from '@nestjs/common'
import { ErrorCode, type LoginResult, type MeResponse, type TwoFactorSetupResponse } from '@ortaq/shared'
import { ctx } from '../../common/context'
import { AppError, unauthenticated } from '../../common/errors'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { PasswordService } from './password.service'
import { SessionsService, type IssuedTokens } from './sessions.service'
import { TokensService } from './tokens.service'
import { TotpService } from './totp.service'

/** Роли с доступом к деньгам дома: для них 2FA обязательна, docs/13 §2 */
const TWO_FACTOR_ROLES = ['CHAIRMAN', 'ACCOUNTANT'] as const

export type AuthOutcome = { result: LoginResult; tokens?: IssuedTokens }

const invalidCredentials = () => new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Неверная почта или пароль')
const invalidCode = () => new AppError(401, ErrorCode.INVALID_CODE, 'Неверный код. Проверьте время на телефоне')

@Injectable()
export class AuthService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly tokens: TokensService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  /** Шаг 1: почта и пароль. Дальше — второй фактор или его настройка, сессию сразу не выдаём */
  async passwordLogin(email: string, password: string): Promise<AuthOutcome> {
    const user = await this.db.run((tx) => tx.user.findUnique({ where: { email } }))
    const ok = await this.passwords.verify(user?.passwordHash, password)
    if (!user || !ok || user.status === 'BLOCKED') {
      await this.db.run((tx) =>
        this.audit.append(tx, { houseId: null, action: 'auth.login_failed', entityType: 'User', entityId: user?.id ?? null }),
      )
      throw invalidCredentials()
    }
    ctx().userId = user.id
    return this.nextStep(user.id, user.totpEnabledAt, user.isPlatformAdmin)
  }

  /** Установка пароля по ссылке из письма. Токен одноразовый, живёт 72 часа */
  async setPassword(token: string, password: string): Promise<AuthOutcome> {
    await this.passwords.assertAcceptable(password)
    const passwordHash = await this.passwords.hash(password)
    const tokenHash = this.crypto.sha256(token)
    const user = await this.db.run(async (tx) => {
      const t = await tx.authToken.findUnique({ where: { tokenHash } })
      if (!t || t.consumedAt || t.expiresAt < new Date()) {
        throw new AppError(400, ErrorCode.TOKEN_INVALID, 'Ссылка устарела или уже использована. Попросите новую')
      }
      // Условное погашение: одну ссылку нельзя использовать дважды даже параллельно
      const consumed = await tx.authToken.updateMany({ where: { id: t.id, consumedAt: null }, data: { consumedAt: new Date() } })
      if (consumed.count === 0) throw new AppError(400, ErrorCode.TOKEN_INVALID, 'Ссылка уже использована')
      ctx().userId = t.userId
      const u = await tx.user.update({ where: { id: t.userId }, data: { passwordHash } })
      await this.audit.append(tx, { houseId: null, action: 'auth.password_set', entityType: 'User', entityId: u.id })
      return u
    })
    return this.nextStep(user.id, user.totpEnabledAt, user.isPlatformAdmin)
  }

  /** Новый секрет TOTP. Сохраняется зашифрованным, но включается только после ввода верного кода */
  async setupTwoFactor(challenge: string): Promise<TwoFactorSetupResponse> {
    const { sub } = await this.tokens.verify(challenge, '2fa_setup')
    const secret = this.totp.generateSecret()
    const user = await this.db.run(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({ where: { id: sub } })
      if (current.totpEnabledAt) throw new AppError(409, ErrorCode.CONFLICT, '2FA уже подключена')
      return tx.user.update({ where: { id: sub }, data: { totpSecretEncrypted: this.crypto.encrypt(secret) } })
    })
    return this.totp.enrollment(user.email ?? user.fullName, secret)
  }

  async enableTwoFactor(challenge: string, code: string): Promise<AuthOutcome> {
    const { sub } = await this.tokens.verify(challenge, '2fa_setup')
    ctx().userId = sub
    await this.db.run(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: sub } })
      if (user.totpEnabledAt) throw new AppError(409, ErrorCode.CONFLICT, '2FA уже подключена')
      if (!user.totpSecretEncrypted || !this.totp.check(code, this.crypto.decrypt(user.totpSecretEncrypted))) throw invalidCode()
      await tx.user.update({ where: { id: sub }, data: { totpEnabledAt: new Date(), status: 'ACTIVE' } })
      await this.audit.append(tx, { houseId: null, action: 'auth.2fa_enabled', entityType: 'User', entityId: sub })
    })
    return this.completeLogin(sub)
  }

  async verifyTwoFactor(challenge: string, code: string): Promise<AuthOutcome> {
    const { sub } = await this.tokens.verify(challenge, '2fa')
    ctx().userId = sub
    await this.assertTotp(sub, code)
    return this.completeLogin(sub)
  }

  /** Повторное подтверждение перед опасным действием: токен на 5 минут */
  async stepUp(code: string): Promise<{ step_up_token: string; expires_in: number }> {
    const userId = ctx().userId
    if (!userId) throw unauthenticated()
    await this.assertTotp(userId, code)
    await this.db.run((tx) => this.audit.append(tx, { houseId: null, action: 'auth.step_up', entityType: 'User', entityId: userId }))
    return { step_up_token: await this.tokens.sign('step_up', userId), expires_in: 300 }
  }

  async me(userId: string): Promise<MeResponse> {
    return this.db.run(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user || user.status === 'BLOCKED') throw unauthenticated()
      const memberships = await tx.houseMembership.findMany({
        where: { userId, status: 'ACTIVE' },
        include: { house: { select: { displayName: true } } },
        orderBy: { createdAt: 'asc' },
      })
      return {
        id: user.id,
        email: user.email,
        phone: user.phone,
        full_name: user.fullName,
        is_platform_admin: user.isPlatformAdmin,
        memberships: memberships.map((m) => ({ house_id: m.houseId, house_display_name: m.house.displayName, role: m.role })),
      }
    })
  }

  private async nextStep(userId: string, totpEnabledAt: Date | null, isPlatformAdmin: boolean): Promise<AuthOutcome> {
    if (totpEnabledAt) return { result: { status: '2FA_REQUIRED', challenge: await this.tokens.sign('2fa', userId) } }
    if (await this.requiresTwoFactor(userId, isPlatformAdmin)) {
      return { result: { status: '2FA_SETUP_REQUIRED', challenge: await this.tokens.sign('2fa_setup', userId) } }
    }
    return this.completeLogin(userId)
  }

  private async assertTotp(userId: string, code: string): Promise<void> {
    const user = await this.db.run((tx) => tx.user.findUnique({ where: { id: userId } }))
    if (!user?.totpSecretEncrypted || !user.totpEnabledAt) throw invalidCode()
    if (!this.totp.check(code, this.crypto.decrypt(user.totpSecretEncrypted))) {
      await this.db.run((tx) => this.audit.append(tx, { houseId: null, action: 'auth.2fa_failed', entityType: 'User', entityId: userId }))
      throw invalidCode()
    }
  }

  private async completeLogin(userId: string): Promise<AuthOutcome> {
    ctx().userId = userId
    await this.db.run(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
      await this.audit.append(tx, { houseId: null, action: 'auth.login', entityType: 'User', entityId: userId })
    })
    const tokens = await this.sessions.issue(userId)
    return { result: { status: 'OK', user: await this.me(userId) }, tokens }
  }

  private async requiresTwoFactor(userId: string, isPlatformAdmin: boolean): Promise<boolean> {
    if (isPlatformAdmin) return true
    const count = await this.db.run((tx) =>
      tx.houseMembership.count({ where: { userId, status: 'ACTIVE', role: { in: [...TWO_FACTOR_ROLES] } } }),
    )
    return count > 0
  }
}
