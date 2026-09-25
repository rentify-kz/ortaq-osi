import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../config/config.js';
import { CryptoService } from '../common/crypto/crypto.service.js';

/** Контекст CLI без Nest: роль app_admin, те же ключи шифрования, что у API. */
export function cliContext() {
  const config = loadConfig();
  const db = new PrismaClient({ datasourceUrl: config.DATABASE_ADMIN_URL });
  return { config, db, crypto: new CryptoService(config) };
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
