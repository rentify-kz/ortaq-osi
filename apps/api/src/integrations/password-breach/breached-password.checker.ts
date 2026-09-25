/** Проверка пароля по базе утёкших (docs/spec/13-security.md §2). */
export interface BreachedPasswordChecker {
  isBreached(password: string): Promise<boolean>;
}

export const BREACHED_PASSWORD_CHECKER = Symbol('BREACHED_PASSWORD_CHECKER');

/**
 * Локальный список самых частых утёкших паролей длиной от 12 символов.
 * TODO(перед продакшеном): реализация через k-anonymity API (Have I Been Pwned range) — наружу уходят 5 символов SHA-1.
 */
const COMMON = new Set([
  '123456789012',
  '1234567890123',
  'qwertyuiop123',
  'password1234',
  'password12345',
  'qwerty123456',
  '1q2w3e4r5t6y',
  'administrator',
  'iloveyou1234',
  '111111111111',
  '000000000000',
  'qwertyuiopasdfgh',
  'zaq12wsxcde3',
]);

export class LocalBreachedPasswordChecker implements BreachedPasswordChecker {
  async isBreached(password: string): Promise<boolean> {
    return COMMON.has(password.toLowerCase());
  }
}
