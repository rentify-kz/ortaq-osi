import { Injectable } from '@nestjs/common'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env'

/** Prisma хранит Bytes как Uint8Array на собственном ArrayBuffer: копия вместо среза пула Buffer */
export const bytes = (b: Buffer): Uint8Array<ArrayBuffer> => new Uint8Array(b)

/** Версия формата шифротекста: при ротации ключа старые записи узнаются по первому байту */
const FORMAT_V1 = 0x01

/**
 * Криптография приложения. Ключи из окружения (в продакшене — из секрет-хранилища).
 * AES-256-GCM для того, что нужно расшифровать (TOTP-секреты, ИИН),
 * HMAC — для того, что нужно только сравнивать (ИИН из реестра).
 */
@Injectable()
export class CryptoService {
  private readonly key = Buffer.from(env().ENCRYPTION_KEY, 'base64')
  private readonly hmacKey = Buffer.from(env().HMAC_KEY, 'base64')

  encrypt(plain: string): Uint8Array<ArrayBuffer> {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return bytes(Buffer.concat([Buffer.from([FORMAT_V1]), iv, cipher.getAuthTag(), body]))
  }

  decrypt(blob: Uint8Array): string {
    const buf = Buffer.from(blob)
    if (buf[0] !== FORMAT_V1) throw new Error('Неизвестный формат шифротекста')
    const iv = buf.subarray(1, 13)
    const tag = buf.subarray(13, 29)
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(buf.subarray(29)), decipher.final()]).toString('utf8')
  }

  hmac(value: string): Uint8Array<ArrayBuffer> {
    return bytes(createHmac('sha256', this.hmacKey).update(value).digest())
  }

  /** Хеш ИИН для сверки с реестром без расшифровки (docs/14 §3). Одна функция для реестра и ЭЦП */
  hashIin(iin: string): Uint8Array<ArrayBuffer> {
    return this.hmac(`iin:${iin}`)
  }

  /** Для высокоэнтропийных токенов (ссылки, refresh) хватает SHA-256 без соли */
  sha256(value: string): Uint8Array<ArrayBuffer> {
    return bytes(createHash('sha256').update(value).digest())
  }

  /** Хеш содержимого файла: поиск повторных загрузок того же фото или чека */
  sha256Bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    return bytes(createHash('sha256').update(value).digest())
  }

  /** 16 байт = 128 бит случайности для ссылок-приглашений, 32 — для refresh и токенов из писем */
  token(bytes = 32): string {
    return randomBytes(bytes).toString('base64url')
  }

  equal(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
