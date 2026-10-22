import { Injectable } from '@nestjs/common'
import type { CookieOptions, Response } from 'express'
import { v7 as uuidv7 } from 'uuid'
import { ErrorCode } from '@ortaq/shared'
import { ctx } from '../../common/context'
import { AppError } from '../../common/errors'
import { env } from '../../config/env'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { TTL, TokensService } from './tokens.service'

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000

export const ACCESS_COOKIE = 'ortaq_at'
export const REFRESH_COOKIE = 'ortaq_rt'
/** Refresh-cookie уходит только на эндпоинты аутентификации, а не с каждым запросом */
const REFRESH_PATH = '/v1/auth'

export type IssuedTokens = { access_token: string; refresh_token: string }

/**
 * Сессии: access JWT на 15 минут и ротируемый refresh-токен (docs/13 §2).
 * Повторное предъявление уже использованного refresh-токена означает, что его украли:
 * вся семья сессий отзывается, и обоим — владельцу и вору — придётся войти заново.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  async issue(userId: string, familyId: string = uuidv7()): Promise<IssuedTokens> {
    const refresh = this.crypto.token(32)
    const c = ctx()
    const session = await this.db.run((tx) =>
      tx.session.create({
        data: {
          userId,
          familyId,
          tokenHash: this.crypto.sha256(refresh),
          ip: c.ip ?? null,
          deviceInfo: c.userAgent?.slice(0, 300) ?? null,
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
      }),
    )
    return { access_token: await this.tokens.sign('access', userId, { sid: session.id }), refresh_token: refresh }
  }

  async rotate(refresh: string | undefined): Promise<{ userId: string; tokens: IssuedTokens }> {
    const invalid = new AppError(401, ErrorCode.TOKEN_INVALID, 'Сессия истекла, войдите снова')
    if (!refresh) throw invalid
    const tokenHash = this.crypto.sha256(refresh)

    const outcome = await this.db.run(async (tx) => {
      const s = await tx.session.findUnique({ where: { tokenHash } })
      // Отозванный токен просто недействителен: семья уже закрыта выходом или прошлой кражей
      if (!s || s.revokedAt) return { kind: 'invalid' as const }
      // Уже обменянный, но не отозванный токен предъявлен снова — это и есть признак кражи
      if (s.rotatedAt) {
        await tx.session.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date() } })
        ctx().userId = s.userId
        await this.audit.append(tx, { houseId: null, action: 'session.reuse_detected', entityType: 'Session', entityId: s.familyId })
        return { kind: 'reuse' as const }
      }
      if (s.expiresAt < new Date()) return { kind: 'invalid' as const }
      // Условное обновление: из двух одновременных ротаций выигрывает одна
      const claimed = await tx.session.updateMany({ where: { id: s.id, rotatedAt: null }, data: { rotatedAt: new Date() } })
      if (claimed.count === 0) return { kind: 'invalid' as const }
      return { kind: 'ok' as const, userId: s.userId, familyId: s.familyId }
    })

    if (outcome.kind !== 'ok') throw invalid
    return { userId: outcome.userId, tokens: await this.issue(outcome.userId, outcome.familyId) }
  }

  async revokeBySid(sid: string | undefined): Promise<void> {
    if (!sid) return
    await this.db.run(async (tx) => {
      const s = await tx.session.findUnique({ where: { id: sid } })
      if (s) await tx.session.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date() } })
    })
  }

  /** Веб получает токены в httpOnly cookie: из JS их не прочитать, XSS их не украдёт */
  setCookies(res: Response, t: IssuedTokens) {
    res.cookie(ACCESS_COOKIE, t.access_token, { ...cookieBase(), path: '/', maxAge: TTL.access * 1000 })
    res.cookie(REFRESH_COOKIE, t.refresh_token, { ...cookieBase(), path: REFRESH_PATH, maxAge: REFRESH_TTL_MS })
  }

  clearCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { ...cookieBase(), path: '/' })
    res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: REFRESH_PATH })
  }
}

function cookieBase(): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: env().NODE_ENV === 'production' }
}
