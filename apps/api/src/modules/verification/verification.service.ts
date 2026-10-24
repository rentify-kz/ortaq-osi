import { Inject, Injectable } from '@nestjs/common'
import { Prisma, type Verification } from '@prisma/client'
import {
  ErrorCode, isValidIinBin, PERSONAL_DATA_VERSION,
  type StartVerificationBody, type VerificationStatusResponse,
} from '@ortaq/shared'
import { randomUUID } from 'node:crypto'
import { asSystem, ctx } from '../../common/context'
import { AppError, conflict, notFound, unauthenticated } from '../../common/errors'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService } from '../../infra/prisma.service'
import { SIGNATURE_PROVIDER, type SignatureProvider } from '../../integrations/signature/signature.provider'
import { AuditService } from '../audit/audit.service'
import { maskIin, titleCaseName } from './names'
import { RegistryMatcher } from './registry-matcher'

type Signer = { iin: string; fullName: string }

const notSigned = () => conflict(ErrorCode.VERIFICATION_NOT_SIGNED, 'Подпись ещё не получена. Подпишите документ в eGov mobile и нажмите «Готово»')
const failed = (message: string) => new AppError(422, ErrorCode.VERIFICATION_FAILED, message)

/**
 * Подтверждение личности через ЭЦП (docs/04 §7). Ссылка определила дом, подпись определяет
 * человека: ИИН и ФИО берутся из сертификата, который сервер проверил сам. Подписанный
 * документ — это и есть согласие на обработку персональных данных (docs/14 §5).
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly matcher: RegistryMatcher,
    @Inject(SIGNATURE_PROVIDER) private readonly provider: SignatureProvider,
  ) {}

  async start(body: StartVerificationBody) {
    const userId = this.userId()
    const user = await asSystem(() =>
      this.db.run(async (tx) => {
        if (body.house_id) {
          const member = await tx.houseMembership.count({ where: { houseId: body.house_id, userId, status: 'ACTIVE' } })
          if (!member) throw notFound('Дом')
        }
        return tx.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true, phone: true } })
      }),
    )
    const document = consentDocument(user.fullName, user.phone)
    const documentHash = this.crypto.sha256(document)
    const started = await this.provider.start({ documentHash, description: 'Ortaq: согласие на обработку персональных данных' })

    const verification = await this.db.run(async (tx) => {
      const v = await tx.verification.create({
        data: {
          userId, houseId: body.house_id ?? null, provider: this.provider.name, externalId: started.externalId,
          document, documentHash, expiresAt: started.expiresAt,
        },
      })
      await this.audit.append(tx, { houseId: null, action: 'verification.start', entityType: 'Verification', entityId: v.id })
      return v
    })
    return { verification_id: verification.id, qr_url: started.qrUrl, deeplink: started.deeplink, expires_at: started.expiresAt, document }
  }

  async status(id: string): Promise<VerificationStatusResponse> {
    const v = await this.own(id)
    if (v.state === 'PENDING' && v.expiresAt < new Date()) return view(await this.markExpired(v))
    return view(v)
  }

  /** Клиент сообщает только «я закончил». Подпись забирает и проверяет сервер */
  async complete(id: string): Promise<VerificationStatusResponse> {
    const v = await this.own(id)
    if (v.state === 'SIGNED') return view(v)
    if (v.state !== 'PENDING') throw failed('Процедура уже завершена. Начните подтверждение заново')
    if (v.expiresAt < new Date()) {
      await this.markExpired(v)
      throw failed('Время на подписание истекло. Начните подтверждение заново')
    }

    const fetched = await this.provider.fetch(v.externalId)
    if (fetched.status === 'PENDING') throw notSigned()
    if (fetched.status === 'EXPIRED') {
      await this.markExpired(v)
      throw failed('Время на подписание истекло. Начните подтверждение заново')
    }

    const checked = await this.provider.verify(fetched.signature, v.documentHash)
    if (!checked.valid) return this.fail(v, checked.reason)
    if (!isValidIinBin(checked.signer.iin)) return this.fail(v, 'В сертификате нет корректного ИИН')

    const iinHash = this.crypto.hashIin(checked.signer.iin)
    const clash = await asSystem(() =>
      this.db.run(async (tx) => {
        const self = await tx.user.findUniqueOrThrow({ where: { id: v.userId }, select: { iinHash: true } })
        if (self.iinHash && !this.crypto.equal(self.iinHash, iinHash)) return 'Документ подписан ЭЦП другого человека'
        const holder = await tx.user.findUnique({ where: { iinHash }, select: { id: true } })
        if (holder && holder.id !== v.userId) return 'Этот ИИН уже подтверждён в другой учётной записи. Войдите в неё или обратитесь в поддержку'
        return null
      }),
    )
    if (clash) return this.fail(v, clash)

    try {
      return await this.apply(v, fetched.signature, iinHash, checked.signer, checked)
    } catch (e) {
      // Гонка двух учёток за один ИИН: уникальный индекс пропустит только одну
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.fail(v, 'Этот ИИН уже подтверждён в другой учётной записи')
      }
      throw e
    }
  }

  private apply(v: Verification, signature: Uint8Array, iinHash: Uint8Array<ArrayBuffer>, signer: Signer, checked: Extract<Awaited<ReturnType<SignatureProvider['verify']>>, { valid: true }>) {
    return asSystem(() =>
      this.db.run(async (tx) => {
        // Повторный «Готово» из двух вкладок: завершает только первый
        const claimed = await tx.verification.updateMany({ where: { id: v.id, state: 'PENDING' }, data: { state: 'SIGNED' } })
        if (claimed.count === 0) return view(await tx.verification.findUniqueOrThrow({ where: { id: v.id } }))

        const now = new Date()
        const sig = await tx.signature.create({
          data: {
            userId: v.userId, provider: v.provider, externalId: v.externalId, purpose: 'IDENTITY_VERIFICATION',
            documentHash: v.documentHash, signatureData: Buffer.from(signature), signerIinHash: iinHash, signerFullName: signer.fullName,
            certSerial: checked.cert.serial, certValidFrom: checked.cert.validFrom, certValidTo: checked.cert.validTo,
            verifiedAt: now, verificationResult: { valid: true, issuer: checked.cert.issuer, signed_at: checked.signedAt.toISOString() },
          },
        })
        const fullName = titleCaseName(signer.fullName)
        await tx.user.update({
          where: { id: v.userId },
          data: { iinEncrypted: this.crypto.encrypt(signer.iin), iinHash, identityVerifiedAt: now, fullName },
        })
        await tx.consent.create({ data: { userId: v.userId, kind: 'PERSONAL_DATA', version: PERSONAL_DATA_VERSION, signatureId: sig.id } })

        const units = await this.matcher.matchAll(tx, v.userId, iinHash, signer.fullName)
        const result = { full_name: fullName, iin_masked: maskIin(signer.iin), units }
        const done = await tx.verification.update({ where: { id: v.id }, data: { signatureId: sig.id, result, completedAt: now } })
        await this.audit.append(tx, {
          houseId: null, action: 'verification.complete', entityType: 'Verification', entityId: v.id,
          after: { signature_id: sig.id, units },
        })
        return view(done)
      }),
    )
  }

  private userId(): string {
    const id = ctx().userId
    if (!id) throw unauthenticated()
    return id
  }

  /** Чужая процедура неотличима от несуществующей: RLS отдаёт только свои */
  private async own(id: string): Promise<Verification> {
    const userId = this.userId()
    const v = await this.db.run((tx) => tx.verification.findFirst({ where: { id, userId } }))
    if (!v) throw notFound('Процедура подтверждения')
    return v
  }

  private markExpired(v: Verification) {
    return this.db.run((tx) => tx.verification.update({ where: { id: v.id }, data: { state: 'EXPIRED', completedAt: new Date() } }))
  }

  private async fail(v: Verification, reason: string): Promise<never> {
    await this.db.run(async (tx) => {
      await tx.verification.update({ where: { id: v.id }, data: { state: 'FAILED', result: { error: reason }, completedAt: new Date() } })
      await this.audit.append(tx, { houseId: null, action: 'verification.fail', entityType: 'Verification', entityId: v.id, after: { reason } })
    })
    throw failed(reason)
  }
}

function view(v: Verification): VerificationStatusResponse {
  return { id: v.id, state: v.state, expires_at: v.expiresAt.toISOString(), result: (v.result as VerificationStatusResponse['result']) ?? null }
}

/**
 * Текст согласия, который жилец подписывает ЭЦП. Идентификатор процедуры внутри делает хеш
 * уникальным: подпись одной процедуры нельзя предъявить в другой.
 */
function consentDocument(fullName: string, phone: string | null): string {
  return [
    'Согласие на сбор и обработку персональных данных',
    '',
    `Я, ${fullName || 'пользователь сервиса Ortaq'}${phone ? `, телефон ${phone}` : ''}, даю согласие сервису Ortaq на сбор и обработку`,
    'моих фамилии, имени, отчества, ИИН и номера телефона в целях идентификации собственника помещения',
    'и участия в электронном голосовании (ст. 44 Закона РК «О жилищных отношениях»), в соответствии',
    'с Законом РК «О персональных данных и их защите». Данные хранятся на территории Республики Казахстан.',
    'Согласие действует до его отзыва в настоящем сервисе.',
    '',
    `Версия текста: ${PERSONAL_DATA_VERSION}`,
    `Дата: ${new Date().toISOString()}`,
    `Идентификатор процедуры: ${randomUUID()}`,
  ].join('\n')
}
