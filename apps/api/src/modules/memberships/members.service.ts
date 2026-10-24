import { Injectable } from '@nestjs/common'
import { ErrorCode, type AddMemberBody } from '@ortaq/shared'
import { ctx } from '../../common/context'
import { AppError, conflict, notFound } from '../../common/errors'
import { env } from '../../config/env'
import { CryptoService } from '../../infra/crypto.service'
import { MailerService } from '../../infra/mailer.service'
import { PrismaService } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'

const SET_PASSWORD_TTL_MS = 72 * 3600_000

const protectedMember = (message: string) => new AppError(422, ErrorCode.MEMBER_PROTECTED, message)

/**
 * Роли в доме глазами председателя (docs/06 §6.12). Бухгалтер добавляется по почте и входит
 * с паролем и 2FA, как председатель. Председателя меняет только админ платформы (docs/04 §10).
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
  ) {}

  async addAccountant(body: AddMemberBody) {
    const houseId = ctx().houseId ?? ''
    const token = this.crypto.token(32)
    const result = await this.db.run(async (tx) => {
      const house = await tx.house.findUniqueOrThrow({ where: { id: houseId }, select: { displayName: true } })
      let user = await tx.user.findUnique({ where: { email: body.email } })
      if (user?.isPlatformAdmin) throw protectedMember('Администратор платформы не может быть участником дома')
      user ??= await tx.user.create({ data: { email: body.email, fullName: body.full_name, status: 'PENDING' } })

      const current = await tx.houseMembership.findFirst({ where: { userId: user.id, status: { not: 'REVOKED' } } })
      if (current) throw conflict(ErrorCode.ALREADY_MEMBER, 'Этот человек уже состоит в доме. Одна роль на дом: сначала отзовите текущую')

      const membership = await tx.houseMembership.create({ data: { houseId, userId: user.id, role: 'ACCOUNTANT', status: 'ACTIVE', joinedVia: 'CHAIRMAN_ADD' } })
      const needsPassword = !user.passwordHash
      if (needsPassword) {
        await tx.authToken.create({
          data: { userId: user.id, tokenHash: this.crypto.sha256(token), purpose: 'SET_PASSWORD', expiresAt: new Date(Date.now() + SET_PASSWORD_TTL_MS) },
        })
      }
      await this.audit.append(tx, {
        action: 'member.add', entityType: 'HouseMembership', entityId: membership.id,
        after: { user_id: user.id, role: 'ACCOUNTANT' },
      })
      return { user, house, needsPassword }
    })

    const web = env().WEB_ORIGIN
    const greeting = `Здравствуйте, ${result.user.fullName}.\n\nВас добавили бухгалтером ОСИ в Ortaq: ${result.house.displayName}.\n`
    await this.mailer.send({
      to: body.email,
      subject: `Доступ бухгалтера: ${result.house.displayName}`,
      text: result.needsPassword
        ? `${greeting}Задайте пароль по ссылке, она действует 72 часа:\n${web}/set-password#token=${token}\n\n` +
          'После пароля понадобится подключить приложение-аутентификатор: без второго фактора доступ к финансам дома не открывается.'
        : `${greeting}Войдите как обычно: ${web}/login`,
    })
    return { user_id: result.user.id, role: 'ACCOUNTANT' as const, invitation_sent: true }
  }

  /**
   * Отзыв доступа (продал квартиру, сменился бухгалтер). История заявок и платежей остаётся,
   * доступ к дому прекращается со следующего запроса: членство проверяется на каждом.
   */
  revoke(userId: string) {
    return this.db.run(async (tx) => {
      if (userId === ctx().userId) throw protectedMember('Нельзя отозвать собственный доступ')
      const m = await tx.houseMembership.findFirst({ where: { userId, status: 'ACTIVE' } })
      if (!m) throw notFound('Участник')
      if (m.role === 'CHAIRMAN') throw protectedMember('Председателя меняет администратор платформы')

      const now = new Date()
      await tx.houseMembership.update({ where: { id: m.id }, data: { status: 'REVOKED', revokedAt: now } })
      // Собственность без членства не должна давать голос; запись остаётся для истории
      const ownerships = await tx.unitOwnership.updateMany({
        where: { userId, verificationStatus: { not: 'REJECTED' } },
        data: { verificationStatus: 'REJECTED', verificationNote: 'Членство в доме отозвано' },
      })
      await tx.staffMember.updateMany({ where: { userId }, data: { userId: null } })
      await this.audit.append(tx, {
        action: 'member.revoke', entityType: 'HouseMembership', entityId: m.id,
        before: { user_id: userId, role: m.role }, after: { status: 'REVOKED', ownerships_closed: ownerships.count },
      })
      return { revoked: true }
    })
  }
}
