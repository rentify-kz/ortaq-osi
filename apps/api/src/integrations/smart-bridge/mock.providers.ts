import { createHash, createHmac, randomUUID } from 'node:crypto';
import type {
  IdentityProvider,
  PropertyRecord,
  PropertyRegistryProvider,
  SignatureProvider,
  SignatureVerification,
  SigningOperation,
  SigningResult,
  VerifiedIdentity,
} from './types.js';

/**
 * Заглушки Smart Bridge. Поведение детерминировано и задаётся данными — так же, как в сид-данных:
 * - Digital ID: код вида `mock:<ИИН>:<ФИО>` возвращает эту личность;
 * - ГБД РН: регистрируется через `register()` (сид и тесты);
 * - подписание: «подписывает» любым ИИН, указанным при `approve()`, подпись — HMAC над документом.
 * В production эти классы не подключаются (см. integrations.module.ts).
 */
export class MockIdentityProvider implements IdentityProvider {
  async authorizationUrl({ state, redirectUri }: { state: string; redirectUri: string }): Promise<string> {
    return `${redirectUri}?mock_digital_id=1&state=${encodeURIComponent(state)}`;
  }

  async exchangeCode({ code }: { code: string }): Promise<VerifiedIdentity> {
    const m = /^mock:(\d{12}):(.+)$/.exec(code);
    if (!m) throw new Error('MockIdentityProvider: code must be mock:<iin>:<full name>');
    return { iin: m[1]!, fullName: m[2]!, verifiedAt: new Date() };
  }
}

export class MockPropertyRegistryProvider implements PropertyRegistryProvider {
  private readonly records = new Map<string, PropertyRecord[]>();

  register(iin: string, record: PropertyRecord): void {
    this.records.set(iin, [...(this.records.get(iin) ?? []), record]);
  }

  async findByOwnerIin({ iin }: { iin: string }): Promise<PropertyRecord[]> {
    return this.records.get(iin) ?? [];
  }
}

const MOCK_SIGNING_KEY = 'ortaq-mock-signature';

export class MockSignatureProvider implements SignatureProvider {
  private readonly ops = new Map<string, { document: Uint8Array; signer?: { iin?: string; bin?: string; fullName: string }; rejected?: boolean }>();

  async startSigning({ document }: { document: Uint8Array }): Promise<SigningOperation> {
    const operationId = randomUUID();
    this.ops.set(operationId, { document });
    return {
      operationId,
      qrUrl: `mock://egov-qr/${operationId}`,
      deeplink: `mock-egovmobile://sign/${operationId}`,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    };
  }

  /** Имитирует подписание пользователем в eGov mobile. */
  approve(operationId: string, signer: { iin?: string; bin?: string; fullName: string }): void {
    const op = this.ops.get(operationId);
    if (!op) throw new Error('unknown operation');
    op.signer = signer;
  }

  reject(operationId: string): void {
    const op = this.ops.get(operationId);
    if (op) op.rejected = true;
  }

  async fetchResult(operationId: string): Promise<SigningResult> {
    const op = this.ops.get(operationId);
    if (!op) return { status: 'EXPIRED' };
    if (op.rejected) return { status: 'REJECTED' };
    if (!op.signer) return { status: 'PENDING' };
    const payload = JSON.stringify({ signer: op.signer, hash: sha256hex(op.document) });
    const mac = createHmac('sha256', MOCK_SIGNING_KEY).update(payload).digest('hex');
    return { status: 'SIGNED', cms: Buffer.from(JSON.stringify({ payload, mac })) };
  }

  async verify({ cms, document }: { cms: Uint8Array; document: Uint8Array }): Promise<SignatureVerification> {
    try {
      const { payload, mac } = JSON.parse(Buffer.from(cms).toString('utf8')) as { payload: string; mac: string };
      if (createHmac('sha256', MOCK_SIGNING_KEY).update(payload).digest('hex') !== mac) {
        return { valid: false, reason: 'bad signature' };
      }
      const { signer, hash } = JSON.parse(payload) as { signer: { iin?: string; bin?: string; fullName: string }; hash: string };
      if (hash !== sha256hex(document)) return { valid: false, reason: 'document mismatch' };
      const now = new Date();
      return {
        valid: true,
        signedAt: now,
        signer: {
          ...signer,
          certSerial: `MOCK-${hash.slice(0, 16)}`,
          certValidFrom: new Date(now.getTime() - 86_400_000),
          certValidTo: new Date(now.getTime() + 365 * 86_400_000),
        },
      };
    } catch {
      return { valid: false, reason: 'malformed' };
    }
  }
}

function sha256hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
