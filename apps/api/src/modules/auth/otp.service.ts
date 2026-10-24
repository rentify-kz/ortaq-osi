import { Injectable } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { ErrorCode } from '@ortaq/shared'
import { ctx } from '../../common/context'
import { AppError, forbidden } from '../../common/errors'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService } from '../../infra/prisma.service'
import { SmsService } from '../../infra/sms.service'
import { AuditService } from '../audit/audit.service'

const TTL_MS = 5 * 60_000
const MAX_ATTEMPTS = 5

/**
 * Лимиты на отправку (docs/13 §2): каждая SMS стоит денег, а форма без лимитов —
 * способ разорить проект и спамить чужие номера.
 */
const LIMITS = [
  { key: 'phone', windowMs: 60_000, max: 1, message: 'Код уже отправлен. Новый можно запросить через минуту' },
  { key: 'phone', windowMs: 3600_000, max: 5, message: 'Слишком много кодов за час. Попробуйте позже' },
  { key: 'phone', windowMs: 24 * 3600_000, max: 10, message: 'Дневной лимит кодов исчерпан' },
  { key: 'ip', windowMs: 3600_000, max: 20, message: 'Слишком много запросов с этого адреса' },
] as const

const invalid = () => new AppError(401, ErrorCode.OTP_INVALID, 'Неверный или устаревший код')

@Injectable()
export class OtpService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
  ) {}

  /** HMAC от номера и кода: короткий код без секрета перебирается мгновенно */
  private hash(phone: string, code: string) {
    return this.crypto.hmac(`otp:${phone}:${code}`)
  }

  /** Отвечает одинаково для известных и новых номеров: регистрация по телефону открыта, базу не собрать */
  async request(phone: string): Promise<{ sent: true; resend_in: number }> {
    const ip = ctx().ip ?? 'unknown'
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await this.db.run(async (tx) => {
      for (const limit of LIMITS) {
        const since = new Date(Date.now() - limit.windowMs)
        const count = await tx.otpCode.count({
          where: limit.key === 'phone' ? { phone, createdAt: { gte: since } } : { ip, createdAt: { gte: since } },
        })
        if (count >= limit.max) throw new AppError(429, ErrorCode.RATE_LIMITED, limit.message)
      }
      // Новый код гасит прежние: действует только последний
      await tx.otpCode.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } })
      await tx.otpCode.create({ data: { phone, codeHash: this.hash(phone, code), ip, expiresAt: new Date(Date.now() + TTL_MS) } })
    })
    await this.sms.send(phone, `Ortaq: код входа ${code}. Никому его не сообщайте.`)
    return { sent: true, resend_in: 60 }
  }

  /** Проверка кода. Возвращает пользователя — существующего или только что созданного */
  async verify(phone: string, code: string): Promise<{ userId: string; isNew: boolean }> {
    const outcome = await this.db.run(async (tx) => {
      const otp = await tx.otpCode.findFirst({
        where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      })
      if (!otp) return null
      // Попытка засчитывается до сравнения: перебор не обходит лимит параллельными запросами
      const counted = await tx.otpCode.updateMany({
        where: { id: otp.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      })
      if (counted.count === 0) return null
      if (!this.crypto.equal(this.hash(phone, code), otp.codeHash)) {
        if (otp.attempts + 1 >= MAX_ATTEMPTS) await tx.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } })
        return null
      }
      await tx.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } })

      const existing = await tx.user.findUnique({ where: { phone } })
      const user = existing ?? (await tx.user.create({ data: { phone, fullName: '', status: 'ACTIVE' } }))
      return { user, isNew: !existing }
    })

    if (!outcome) {
      await this.db.run((tx) => this.audit.append(tx, { houseId: null, action: 'auth.otp_failed', entityType: 'User', entityId: null }))
      throw invalid()
    }
    const { user, isNew } = outcome
    if (user.status === 'BLOCKED') throw invalid()

    ctx().userId = user.id
    // Роли с доступом к деньгам входят только по почте с 2FA: код из SMS не второй фактор
    const managed = await this.db.run((tx) =>
      tx.houseMembership.count({ where: { userId: user.id, status: 'ACTIVE', role: { in: ['CHAIRMAN', 'ACCOUNTANT'] } } }),
    )
    if (user.isPlatformAdmin || managed > 0) {
      throw forbidden('Для правления дома вход по почте и паролю с кодом из приложения')
    }
    await this.db.run((tx) =>
      this.audit.append(tx, { houseId: null, action: isNew ? 'auth.registered' : 'auth.otp_login', entityType: 'User', entityId: user.id }),
    )
    return { userId: user.id, isNew }
  }
}
