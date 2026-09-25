// Генерирует локальные секреты для .env. Только для local; в staging/prod ключи — в Lockbox.
import { randomBytes } from 'node:crypto';
for (const name of ['JWT_SECRET', 'IIN_ENCRYPTION_KEY', 'IIN_HMAC_KEY', 'TOTP_ENCRYPTION_KEY']) {
  console.log(`${name}=${randomBytes(32).toString('base64')}`);
}
