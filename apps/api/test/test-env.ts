import type { AppConfig } from '../src/config/config.js';
import { loadConfig } from '../src/config/config.js';

const key = (seed: string) => Buffer.alloc(32, seed).toString('base64');

export const TEST_DB = {
  migrator: process.env.TEST_DATABASE_MIGRATOR_URL ?? 'postgresql://migrator:migrator@localhost:5432/ortaq_test',
  rw: process.env.TEST_DATABASE_URL ?? 'postgresql://app_rw:app_rw@localhost:5432/ortaq_test',
  admin: process.env.TEST_DATABASE_ADMIN_URL ?? 'postgresql://app_admin:app_admin@localhost:5432/ortaq_test',
};

/** Фиксированные тестовые ключи. Не совпадают ни с одним реальным окружением. */
export function testConfig(overrides: Partial<Record<string, string>> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB.rw,
    DATABASE_ADMIN_URL: TEST_DB.admin,
    JWT_SECRET: key('j'),
    IIN_ENCRYPTION_KEY: key('e'),
    IIN_HMAC_KEY: key('h'),
    TOTP_ENCRYPTION_KEY: key('t'),
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5173',
    PUBLIC_WEB_URL: 'http://localhost:5173',
    RATE_LIMIT_ENABLED: 'false',
    COOKIE_SECURE: 'false',
    ...overrides,
  });
}
