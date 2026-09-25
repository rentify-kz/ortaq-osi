import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

/**
 * Криптография приложения. ИИН — AES-256-GCM + HMAC-SHA256 (docs/spec/14-compliance-privacy.md §3).
 * Формат шифротекста: iv(12) | tag(16) | ciphertext.
 */
@Injectable()
export class CryptoService {
  private readonly iinKey: Buffer;
  private readonly iinHmacKey: Buffer;
  private readonly totpKey: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.iinKey = Buffer.from(config.IIN_ENCRYPTION_KEY, 'base64');
    this.iinHmacKey = Buffer.from(config.IIN_HMAC_KEY, 'base64');
    this.totpKey = Buffer.from(config.TOTP_ENCRYPTION_KEY, 'base64');
  }

  encryptIin(iin: string): Bytes {
    return encrypt(this.iinKey, iin);
  }

  decryptIin(data: Uint8Array): string {
    return decrypt(this.iinKey, data);
  }

  hashIin(iin: string): Bytes {
    return bytes(createHmac('sha256', this.iinHmacKey).update(iin).digest());
  }

  encryptTotpSecret(secret: string): Bytes {
    return encrypt(this.totpKey, secret);
  }

  decryptTotpSecret(data: Uint8Array): string {
    return decrypt(this.totpKey, data);
  }

  /** Случайный токен 128+ бит для ссылок и refresh-токенов. В БД хранится только sha256. */
  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  sha256(value: string | Uint8Array): Bytes {
    return bytes(createHash('sha256').update(value).digest());
  }

  safeEqual(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

/** Prisma ожидает Uint8Array<ArrayBuffer>; Buffer из пула Node может ссылаться на общий буфер. */
export type Bytes = Uint8Array<ArrayBuffer>;
function bytes(buf: Buffer): Bytes {
  return new Uint8Array(buf);
}

function encrypt(key: Buffer, plaintext: string): Bytes {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return bytes(Buffer.concat([iv, cipher.getAuthTag(), ct]));
}

function decrypt(key: Buffer, data: Uint8Array): string {
  const buf = Buffer.from(data);
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
