import { Injectable, Logger } from '@nestjs/common'
import * as argon2 from 'argon2'
import { createHash } from 'node:crypto'
import { ErrorCode, PASSWORD_MIN } from '@ortaq/shared'
import { AppError } from '../../common/errors'
import { env } from '../../config/env'

/** Параметры Argon2id по рекомендации OWASP: 19 МиБ, 2 прохода */
export const ARGON: argon2.HashOptions = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 }

@Injectable()
export class PasswordService {
  private readonly log = new Logger('Password')
  /** Хеш для сверки, когда пользователя нет: ответ не должен быть быстрее, чем при неверном пароле */
  private readonly dummy = argon2.hash('ortaq-timing-equalizer', ARGON)

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON)
  }

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    if (!hash) {
      await argon2.verify(await this.dummy, password).catch(() => false)
      return false
    }
    return argon2.verify(hash, password).catch(() => false)
  }

  /** Длина плюс проверка по базе утёкших паролей. Принудительной ротации нет, docs/13 §2 */
  async assertAcceptable(password: string): Promise<void> {
    if (password.length < PASSWORD_MIN) {
      throw new AppError(400, ErrorCode.PASSWORD_WEAK, `Пароль не короче ${PASSWORD_MIN} символов`)
    }
    if (await this.isBreached(password)) {
      throw new AppError(400, ErrorCode.PASSWORD_BREACHED, 'Этот пароль есть в базах утечек. Придумайте другой')
    }
  }

  /**
   * Have I Been Pwned, k-anonymity: наружу уходят только 5 символов SHA-1.
   * Если сервис недоступен, пароль принимаем: вход не должен зависеть от стороннего сайта.
   */
  private async isBreached(password: string): Promise<boolean> {
    if (env().PASSWORD_BREACH_CHECK === 'off') return false
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(3000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.text()
      return body.split('\n').some((line) => {
        const [hashSuffix, count] = line.trim().split(':')
        return hashSuffix === suffix && Number(count) > 0
      })
    } catch (e) {
      this.log.warn(`Проверка по базе утечек недоступна: ${(e as Error).message}`)
      return false
    }
  }
}
