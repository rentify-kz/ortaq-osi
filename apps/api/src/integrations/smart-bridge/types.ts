/**
 * Государственные сервисы через Smart Bridge (docs/spec/01-architecture.md §10, 04 §7, 09 §5).
 * Бизнес-логика знает только эти интерфейсы. Реальные реализации появятся после регистрации ИС в Smart Bridge;
 * до этого — детерминированные заглушки.
 */

// ---------- Digital ID: личность ----------
export interface IdentityProvider {
  /** Адрес перехода в Digital ID. `state` — одноразовый, связывает возврат с процедурой верификации. */
  authorizationUrl(input: { state: string; redirectUri: string }): Promise<string>;
  /** Сервер сам обменивает код на подтверждённые данные. Клиенту результат не доверяется. */
  exchangeCode(input: { code: string; redirectUri: string }): Promise<VerifiedIdentity>;
}

export interface VerifiedIdentity {
  iin: string;
  fullName: string;
  verifiedAt: Date;
}

// ---------- ГБД «Регистр недвижимости»: собственность ----------
export interface PropertyRegistryProvider {
  /** Объекты недвижимости субъекта. Вызывается только после согласия субъекта. */
  findByOwnerIin(input: { iin: string; consentGivenAt: Date }): Promise<PropertyRecord[]>;
}

export interface PropertyRecord {
  cadastralNumber: string;
  address: string;
  addressRka?: string;
  buildingCadastralNumber?: string;
  unitNumber?: string;
  area?: string;
  /** Доля в праве, 0 < share ≤ 1. */
  share: string;
}

// ---------- Подписание в eGov mobile ----------
export type SignaturePurpose = 'BALLOT' | 'PROTOCOL' | 'REPORT' | 'CONTRACT';

export interface SignatureProvider {
  startSigning(input: {
    document: Uint8Array;
    documentName: string;
    purpose: SignaturePurpose;
  }): Promise<SigningOperation>;
  /** Сервер сам забирает подпись по идентификатору операции. */
  fetchResult(operationId: string): Promise<SigningResult>;
  /** Серверная проверка CMS-подписи против ожидаемого документа. */
  verify(input: { cms: Uint8Array; document: Uint8Array }): Promise<SignatureVerification>;
}

export interface SigningOperation {
  operationId: string;
  qrUrl: string;
  deeplink: string;
  expiresAt: Date;
}

export type SigningResult =
  | { status: 'PENDING' | 'REJECTED' | 'EXPIRED' }
  | { status: 'SIGNED'; cms: Uint8Array };

export interface SignatureVerification {
  valid: boolean;
  reason?: string;
  signer?: {
    iin?: string;
    bin?: string;
    fullName: string;
    certSerial: string;
    certValidFrom: Date;
    certValidTo: Date;
  };
  signedAt?: Date;
}

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');
export const PROPERTY_REGISTRY_PROVIDER = Symbol('PROPERTY_REGISTRY_PROVIDER');
export const SIGNATURE_PROVIDER = Symbol('SIGNATURE_PROVIDER');
