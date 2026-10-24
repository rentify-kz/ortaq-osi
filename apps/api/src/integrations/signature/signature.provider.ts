/**
 * Подписание документов ЭЦП через внешнего провайдера (docs/01 §7). Бизнес-логика
 * знает только этот интерфейс: SIGEX, прямой eGov QR или заглушка разработки
 * подключаются конфигурацией.
 */
export const SIGNATURE_PROVIDER = Symbol('SignatureProvider')

export type SignatureRequest = {
  /** SHA-256 документа: провайдеру уходит хеш, а не содержимое (docs/14 §2) */
  documentHash: Uint8Array
  /** Короткое описание для экрана подписания в eGov mobile */
  description: string
}

export type StartedSigning = {
  externalId: string
  qrUrl: string
  deeplink: string
  expiresAt: Date
}

export type FetchedSignature = { status: 'PENDING' } | { status: 'EXPIRED' } | { status: 'SIGNED'; signature: Uint8Array }

/** Результат проверки подписи сервером. Данные подписанта берутся только из сертификата */
export type VerifiedSignature =
  | {
      valid: true
      signer: { iin: string; fullName: string }
      cert: { serial: string; validFrom: Date; validTo: Date; issuer: string }
      signedAt: Date
    }
  | { valid: false; reason: string }

export interface SignatureProvider {
  readonly name: string
  start(request: SignatureRequest): Promise<StartedSigning>
  /** Сервер сам забирает подпись: клиент сообщает только «я закончил» */
  fetch(externalId: string): Promise<FetchedSignature>
  verify(signature: Uint8Array, documentHash: Uint8Array): Promise<VerifiedSignature>
}
