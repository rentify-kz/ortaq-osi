import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ErrorCode } from '@ortaq/shared';
import { AppError } from '../../common/errors/app-error.js';
import {
  BREACHED_PASSWORD_CHECKER,
  type BreachedPasswordChecker,
} from '../../integrations/password-breach/breached-password.checker.js';

/** Параметры Argon2id по рекомендации OWASP: 19 MiB, 2 итерации. */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  /** Хеш-пустышка: вход с несуществующей почтой тратит то же время, что и с существующей. */
  private readonly dummyHash: Promise<string> = argon2.hash('ortaq-timing-equalizer', ARGON2_OPTIONS);

  constructor(@Inject(BREACHED_PASSWORD_CHECKER) private readonly breached: BreachedPasswordChecker) {}

  async hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    if (!hash) {
      await argon2.verify(await this.dummyHash, password);
      return false;
    }
    return argon2.verify(hash, password);
  }

  /** Минимум 12 символов, не из базы утёкших. Без требований к составу и принудительной ротации. */
  async assertAcceptable(password: string, context: { email?: string | null }): Promise<void> {
    if (password.length < 12) throw AppError.unprocessable(ErrorCode.WEAK_PASSWORD, 'Минимум 12 символов');
    const local = context.email?.split('@')[0]?.toLowerCase();
    if (local && local.length >= 4 && password.toLowerCase().includes(local)) {
      throw AppError.unprocessable(ErrorCode.WEAK_PASSWORD, 'Пароль не должен содержать почту');
    }
    if (await this.breached.isBreached(password)) {
      throw AppError.unprocessable(
        ErrorCode.BREACHED_PASSWORD,
        'Этот пароль встречается в утечках, выберите другой',
      );
    }
  }
}
