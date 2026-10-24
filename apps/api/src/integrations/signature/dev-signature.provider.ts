import { Injectable } from '@nestjs/common'
import { generateKeyPairSync, randomBytes, randomUUID, sign, timingSafeEqual, verify, type KeyObject } from 'node:crypto'
import { env } from '../../config/env'
import type { FetchedSignature, SignatureProvider, SignatureRequest, StartedSigning, VerifiedSignature } from './signature.provider'

const TTL_MS = 10 * 60_000
const ISSUER = 'Ortaq Dev НУЦ (тестовый)'
const CERT_DAYS = 365

type Pending = { documentHash: Buffer; description: string; expiresAt: Date; signature?: Buffer }

/** Конверт подписи заглушки: данные «сертификата» и подпись тестового УЦ над ними */
type Envelope = {
  v: 1
  document_hash: string
  signer: { iin: string; full_name: string }
  cert: { serial: string; valid_from: string; valid_to: string; issuer: string }
  signed_at: string
  sig: string
}

/**
 * Заглушка SIGEX для разработки и тестов. Повторяет контракт настоящего провайдера:
 * процедура с QR и deeplink, подпись забирает сервер, проверяет её ключом УЦ и только
 * потом верит ИИН из «сертификата». Подписывает тестовый ключ, созданный при старте,
 * поэтому подпись из одного запуска не пройдёт проверку в другом и не годится нигде, кроме dev.
 * В production не подключается: это запрещено проверкой конфигурации.
 */
@Injectable()
export class DevSignatureProvider implements SignatureProvider {
  readonly name = 'DEV_SIGEX'
  private readonly pending = new Map<string, Pending>()
  private readonly keys: { privateKey: KeyObject; publicKey: KeyObject } = generateKeyPairSync('ed25519')

  async start(request: SignatureRequest): Promise<StartedSigning> {
    const externalId = randomUUID()
    const expiresAt = new Date(Date.now() + TTL_MS)
    this.pending.set(externalId, { documentHash: Buffer.from(request.documentHash), description: request.description, expiresAt })
    const url = `${env().WEB_ORIGIN}/dev/egov#${externalId}`
    return { externalId, qrUrl: url, deeplink: url, expiresAt }
  }

  async fetch(externalId: string): Promise<FetchedSignature> {
    const p = this.pending.get(externalId)
    if (!p || p.expiresAt < new Date()) return { status: 'EXPIRED' }
    if (!p.signature) return { status: 'PENDING' }
    return { status: 'SIGNED', signature: p.signature }
  }

  async verify(signature: Uint8Array, documentHash: Uint8Array): Promise<VerifiedSignature> {
    let envelope: Envelope
    try {
      envelope = JSON.parse(Buffer.from(signature).toString('utf8')) as Envelope
    } catch {
      return { valid: false, reason: 'Подпись повреждена' }
    }
    const { sig, ...payload } = envelope
    const signedOk = typeof sig === 'string' && verify(null, Buffer.from(canonical(payload)), this.keys.publicKey, Buffer.from(sig, 'base64'))
    if (!signedOk) return { valid: false, reason: 'Подпись не прошла проверку ключом удостоверяющего центра' }

    const expected = Buffer.from(documentHash)
    const actual = Buffer.from(payload.document_hash, 'hex')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return { valid: false, reason: 'Подписан другой документ' }
    }
    const validFrom = new Date(payload.cert.valid_from)
    const validTo = new Date(payload.cert.valid_to)
    const signedAt = new Date(payload.signed_at)
    if (signedAt < validFrom || signedAt > validTo) return { valid: false, reason: 'Сертификат не действовал в момент подписания' }

    return {
      valid: true,
      signer: { iin: payload.signer.iin, fullName: payload.signer.full_name },
      cert: { serial: payload.cert.serial, validFrom, validTo, issuer: payload.cert.issuer },
      signedAt,
    }
  }

  /** Что показывает экран-заглушка eGov mobile перед подписанием */
  describe(externalId: string): { description: string; document_hash: string; expires_at: Date } | null {
    const p = this.pending.get(externalId)
    if (!p || p.expiresAt < new Date() || p.signature) return null
    return { description: p.description, document_hash: p.documentHash.toString('hex'), expires_at: p.expiresAt }
  }

  /** Подписание «в eGov mobile»: только в разработке и тестах, через dev-контроллер */
  signAs(externalId: string, signer: { iin: string; fullName: string }): boolean {
    const p = this.pending.get(externalId)
    if (!p || p.expiresAt < new Date() || p.signature) return false
    const now = new Date()
    const payload: Omit<Envelope, 'sig'> = {
      v: 1,
      document_hash: p.documentHash.toString('hex'),
      signer: { iin: signer.iin, full_name: signer.fullName.toUpperCase() },
      cert: {
        serial: randomBytes(10).toString('hex'),
        valid_from: new Date(now.getTime() - 86_400_000).toISOString(),
        valid_to: new Date(now.getTime() + CERT_DAYS * 86_400_000).toISOString(),
        issuer: ISSUER,
      },
      signed_at: now.toISOString(),
    }
    const sig = sign(null, Buffer.from(canonical(payload)), this.keys.privateKey).toString('base64')
    p.signature = Buffer.from(JSON.stringify({ ...payload, sig }))
    return true
  }
}

/** Детерминированная сериализация: порядок ключей не должен влиять на проверку подписи */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
