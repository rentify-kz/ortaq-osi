import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ErrorCode } from '@ortaq/shared'
import { AppError } from '../../common/errors'

/**
 * Краткоживущие подписанные токены. Назначение (typ) проверяется всегда:
 * токен второго шага входа не годится как access, а step-up — как challenge.
 */
export type TokenPurpose = 'access' | '2fa' | '2fa_setup' | 'step_up'

export const TTL = {
  access: 15 * 60,
  '2fa': 5 * 60,
  '2fa_setup': 15 * 60,
  step_up: 5 * 60,
} as const satisfies Record<TokenPurpose, number>

export type TokenClaims = { sub: string; typ: TokenPurpose; sid?: string }

@Injectable()
export class TokensService {
  constructor(private readonly jwt: JwtService) {}

  sign(purpose: TokenPurpose, sub: string, extra: { sid?: string } = {}): Promise<string> {
    return this.jwt.signAsync({ sub, typ: purpose, ...extra }, { expiresIn: TTL[purpose] })
  }

  async verify(token: string, purpose: TokenPurpose): Promise<TokenClaims> {
    let claims: TokenClaims
    try {
      claims = await this.jwt.verifyAsync<TokenClaims>(token)
    } catch {
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Сессия истекла, войдите снова')
    }
    if (claims.typ !== purpose) throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Неверный токен')
    return claims
  }
}
