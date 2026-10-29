import { Inject, Injectable } from '@nestjs/common'
import { Prisma, type Vote } from '@prisma/client'
import {
  ErrorCode, ballotCompleteBody, ballotStartBody, paperBallotBody,
  type BallotCompleteBody, type BallotSigningView, type BallotStartBody, type PaperBallotBody,
} from '@ortaq/shared'
import { createHash } from 'node:crypto'
import { canonical } from '../../common/canonical'
import { asSystem, ctx } from '../../common/context'
import { AppError, conflict, notFound, unprocessable } from '../../common/errors'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { SIGNATURE_PROVIDER, type SignatureProvider } from '../../integrations/signature/signature.provider'
import { AuditService } from '../audit/audit.service'
import { FilesService } from '../files/files.service'
import { NotificationsService } from '../notifications/notifications.service'
import { loadAgenda, validateAnswers, type AgendaQuestion } from './agenda'
import type { SnapshotEntry } from './tally'
import { LATE_OWNER, REPRESENTATIVE, state } from './votes.service'

type Answers = BallotStartBody['answers']
export type CastView = { status: 'CAST'; unit_number: string; cast_at: string; area: number; weight_percent: number }

const SIGNING_WINDOW_MS = 10 * 60_000
const MAX_PENDING_SIGNINGS = 5
const notEligible = (message: string) => new AppError(403, ErrorCode.NOT_ELIGIBLE, message)
const alreadyVoted = () => conflict(ErrorCode.ALREADY_VOTED, 'За это помещение бюллетень уже подан. Изменить голос нельзя: бюллетень подписан ЭЦП')

/**
 * Бюллетени (docs/09 §5, §9). Электронный — в два шага: сервер формирует документ и начинает
 * подписание, после подписи сам забирает её у провайдера, проверяет и сверяет ИИН. Вес — только
 * из снимка реестра. Таблица бюллетеней append-only; второй бюллетень помещения не даст вставить уникальный ключ.
 */
@Injectable()
export class BallotsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    @Inject(SIGNATURE_PROVIDER) private readonly signer: SignatureProvider,
  ) {}

  async start(voteId: string, input: BallotStartBody): Promise<BallotSigningView> {
    const body = ballotStartBody.parse(input)
    const userId = ctx().userId ?? ''
    const user = await asSystem(() => this.db.run((tx) => tx.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true, iinHash: true } })))
    if (!user.iinHash) throw new AppError(422, ErrorCode.IDENTITY_REQUIRED, 'Голосовать можно после подтверждения личности через eGov mobile')
    const prepared = await this.db.run(async (tx) => {
      const { vote, entry, agenda } = await this.eligible(tx, voteId, body.unit_id, body.answers, userId)
      // Каждое начало — обращение к провайдеру подписи: не больше пяти незавершённых за 10 минут
      const recent = await tx.ballotSigning.count({ where: { voteId, unitId: body.unit_id, userId, completedAt: null, createdAt: { gt: new Date(Date.now() - SIGNING_WINDOW_MS) } } })
      if (recent >= MAX_PENDING_SIGNINGS) throw new AppError(429, ErrorCode.RATE_LIMITED, 'Слишком много начатых подписаний. Завершите начатое или подождите 10 минут')
      return { vote, entry, document: await this.document(tx, vote, entry, agenda, body.answers, user.fullName, 'ELECTRONIC') }
    })
    const documentHash = this.hash(prepared.document)
    const started = await this.signer.start({ documentHash: new Uint8Array(documentHash), description: `Бюллетень: ${prepared.vote.title}, помещение №${prepared.entry.number}` })
    const signing = await this.db.run((tx) => tx.ballotSigning.create({
      data: {
        houseId: prepared.vote.houseId, voteId, unitId: body.unit_id, userId, provider: this.signer.name, externalId: started.externalId, document: prepared.document,
        documentHash, answers: body.answers, expiresAt: started.expiresAt,
      },
    }))
    return { signing_id: signing.id, external_id: started.externalId, qr_url: started.qrUrl, deeplink: started.deeplink, expires_at: started.expiresAt.toISOString() }
  }

  /** «Я подписал». Клиент не сообщает ничего о подписи — только какую процедуру проверить */
  async complete(voteId: string, input: BallotCompleteBody, meta: { ip?: string; userAgent?: string }): Promise<CastView | { status: 'PENDING' }> {
    const { signing_id } = ballotCompleteBody.parse(input)
    const userId = ctx().userId ?? ''
    const signing = await this.db.run((tx) => tx.ballotSigning.findFirst({ where: { id: signing_id, voteId, userId } }))
    if (!signing) throw notFound('Подписание бюллетеня')
    if (signing.completedAt) throw alreadyVoted()
    if (signing.expiresAt < new Date()) throw state('Время на подписание истекло. Подпишите бюллетень заново')
    const fetched = await this.signer.fetch(signing.externalId)
    if (fetched.status === 'PENDING') return { status: 'PENDING' }
    if (fetched.status === 'EXPIRED') throw state('Время на подписание истекло. Подпишите бюллетень заново')
    const documentHash = new Uint8Array(signing.documentHash)
    const checked = await this.signer.verify(fetched.signature, documentHash)
    if (!checked.valid) throw new AppError(422, ErrorCode.VERIFICATION_FAILED, `Подпись не прошла проверку: ${checked.reason}`)
    // Подпись доказывает, кто подписал; что это собственник помещения — сверка ИИН с подтверждённой личностью
    const iinHash = this.crypto.hashIin(checked.signer.iin)
    const user = await asSystem(() => this.db.run((tx) => tx.user.findUniqueOrThrow({ where: { id: userId }, select: { iinHash: true } })))
    if (!user.iinHash || !this.crypto.equal(user.iinHash, iinHash)) throw new AppError(422, ErrorCode.VERIFICATION_FAILED, 'Бюллетень подписан ЭЦП другого человека')
    if (!this.hash(signing.document).equals(Buffer.from(documentHash))) throw new Error(`Документ бюллетеня ${signing.id} не совпадает со своим хешем`)

    const now = new Date()
    const sig = await asSystem(() => this.db.run((tx) => tx.signature.upsert({
      where: { provider_externalId: { provider: signing.provider, externalId: signing.externalId } },
      update: {},
      create: {
        userId, provider: signing.provider, externalId: signing.externalId, purpose: 'BALLOT', documentHash, signatureData: Buffer.from(fetched.signature),
        signerIinHash: iinHash, signerFullName: checked.signer.fullName, certSerial: checked.cert.serial, certValidFrom: checked.cert.validFrom,
        certValidTo: checked.cert.validTo, verifiedAt: now, verificationResult: { valid: true, issuer: checked.cert.issuer, signed_at: checked.signedAt.toISOString() },
      },
    })))
    // Подпись по этой процедуре могла уже существовать: принимаем только подпись именно этого бюллетеня
    if (sig.purpose !== 'BALLOT' || !Buffer.from(sig.documentHash).equals(Buffer.from(documentHash))) throw new AppError(422, ErrorCode.VERIFICATION_FAILED, 'Подпись относится к другому документу')
    return this.db.run(async (tx) => {
      // Повторная проверка под блокировкой: голосование могли закрыть или отменить, пока шло подписание
      await tx.$queryRaw`SELECT id FROM votes WHERE id = ${voteId}::uuid FOR SHARE`
      const { entry } = await this.eligible(tx, voteId, signing.unitId, signing.answers as Answers, userId)
      const ballot = await this.insert(tx, {
        houseId: signing.houseId, voteId, unitId: signing.unitId, userId, voterName: checked.signer.fullName, channel: 'ELECTRONIC', area: entry.area, weight: entry.weight,
        document: signing.document as Prisma.InputJsonValue, documentHash, signatureId: sig.id, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null,
      }, signing.answers as Answers)
      await tx.ballotSigning.update({ where: { id: signing.id }, data: { completedAt: now } })
      // В аудите — факт подачи, а не выбор: кто как голосовал, видно в бюллетене, а не в журнале действий
      await this.audit.append(tx, { action: 'vote.ballot_cast', entityType: 'Ballot', entityId: ballot.id, after: { vote: voteId, unit: entry.number, channel: 'ELECTRONIC', signature: sig.id } })
      return { status: 'CAST' as const, unit_number: entry.number, cast_at: ballot.castAt.toISOString(), area: entry.area, weight_percent: Math.round(entry.weight * 1_000_000) / 10_000 }
    })
  }

  /**
   * Бумажный бюллетень письменного опроса (ст. 43): вносит председатель, обязателен скан.
   * Это точка возможного злоупотребления, поэтому каждый такой бюллетень в аудите, с отметкой
   * в протоколе и долей бумажных голосов в итогах (docs/09 §9).
   */
  async paper(voteId: string, input: PaperBallotBody): Promise<CastView> {
    const body = paperBallotBody.parse(input)
    const chairmanId = ctx().userId ?? ''
    const chairman = await asSystem(() => this.db.run((tx) => tx.user.findUniqueOrThrow({ where: { id: chairmanId }, select: { fullName: true } })))
    let paperFor: { title: string; number: string; voters: string[] } | null = null
    const cast = await this.db.run(async (tx) => {
      await tx.$queryRaw`SELECT id FROM votes WHERE id = ${voteId}::uuid FOR SHARE`
      const { vote, entry, agenda } = await this.eligible(tx, voteId, body.unit_id, body.answers)
      if (vote.legalBasis !== 'ART_43_WRITTEN_SURVEY') throw state('Бумажные бюллетени принимаются только в письменном опросе (ст. 43)')
      const scan = await tx.file.findFirst({ where: { id: body.scan_file_id, uploadedBy: chairmanId, status: 'READY', parentId: null, purpose: 'BALLOT_SCAN' } })
      if (!scan) throw unprocessable(ErrorCode.VALIDATION, 'Скан бюллетеня не загружен или уже приложен к другому', { fields: [{ path: 'scan_file_id', message: 'Загрузите скан' }] })
      // Один и тот же скан, загруженный дважды, — один бюллетень, а не два
      if (scan.contentHash) {
        const reused = await tx.file.count({ where: { parentType: 'BALLOT', contentHash: scan.contentHash, parentId: { in: (await tx.ballot.findMany({ where: { voteId }, select: { id: true } })).map((b) => b.id) } } })
        if (reused) throw unprocessable(ErrorCode.VALIDATION, 'Этот скан уже приложен к другому бюллетеню', { fields: [{ path: 'scan_file_id', message: 'Скан уже использован' }] })
      }
      // Собственник в приложении сейчас подписывает свой бюллетень — бумажный за него не принимается
      const signing = await tx.ballotSigning.count({ where: { voteId, unitId: body.unit_id, completedAt: null, expiresAt: { gt: new Date() } } })
      if (signing) throw state('Собственник помещения сейчас подписывает электронный бюллетень')
      const document = { ...(await this.document(tx, vote, entry, agenda, body.answers, body.voter_name, 'PAPER')), entered_by: chairman.fullName, scan: { file_id: scan.id, sha256: scan.contentHash ? Buffer.from(scan.contentHash).toString('hex') : null } }
      const ballot = await this.insert(tx, {
        houseId: vote.houseId, voteId, unitId: body.unit_id, userId: entry.voters.length === 1 ? entry.voters[0]! : null, voterName: body.voter_name, channel: 'PAPER', area: entry.area, weight: entry.weight,
        document, documentHash: this.hash(document), scanFileId: scan.id, enteredBy: chairmanId,
      }, body.answers)
      await this.files.attach(tx, [scan.id], 'BALLOT', ballot.id, chairmanId, 'BALLOT_SCAN')
      paperFor = { title: vote.title, number: entry.number, voters: entry.voters }
      await this.audit.append(tx, { action: 'vote.paper_ballot', entityType: 'Ballot', entityId: ballot.id, after: { vote: voteId, unit: entry.number, voter_name: body.voter_name, scan: scan.id } })
      return { status: 'CAST' as const, unit_number: entry.number, cast_at: ballot.castAt.toISOString(), area: entry.area, weight_percent: Math.round(entry.weight * 1_000_000) / 10_000 }
    })
    // Собственник в приложении узнаёт, что за его помещение внесён бумажный голос: подлог не пройдёт незаметно
    if (paperFor) {
      const p: { title: string; number: string; voters: string[] } = paperFor
      await this.notifications.notify({
        userIds: p.voters, houseId: ctx().houseId ?? '', category: 'VOTES', priority: 'HIGH',
        title: `Внесён бумажный бюллетень за помещение №${p.number}`,
        body: `Голосование «${p.title}». Если вы его не заполняли, сообщите в ОСИ и проверьте протокол`, payload: { type: 'vote', id: voteId },
      })
    }
    return cast
  }

  /**
   * Голосование идёт, помещение есть в снимке, бюллетеня за него нет, ответы корректны.
   * Право голоса проверяется раньше, чем «уже голосовали»: иначе любой член дома узнал бы, кто проголосовал
   */
  private async eligible(tx: Tx, voteId: string, unitId: string, answers: Answers, voter?: string): Promise<{ vote: Vote; entry: SnapshotEntry; agenda: AgendaQuestion[] }> {
    const vote = await tx.vote.findFirst({ where: { id: voteId }, include: { snapshot: true } })
    if (!vote || vote.status === 'DRAFT') throw notFound('Голосование')
    const now = new Date()
    if (vote.status !== 'ACTIVE' || !vote.snapshot || now >= vote.endsAt!) throw state(vote.status === 'NOTICE_SENT' ? 'Голосование ещё не началось' : 'Голосование завершено: бюллетени больше не принимаются')
    const entry = (vote.snapshot.entries as SnapshotEntry[]).find((e) => e.unit_id === unitId)
    if (!entry) throw notEligible('Помещения нет в реестре голосования')
    if (voter !== undefined && !entry.voters.includes(voter)) throw notEligible(await this.whyNot(tx, entry, voter))
    if (await tx.ballot.count({ where: { voteId, unitId } })) throw alreadyVoted()
    const agenda = await loadAgenda(tx, voteId)
    const problem = validateAnswers(agenda, answers)
    if (problem) throw unprocessable(ErrorCode.VALIDATION, problem, { fields: [{ path: 'answers', message: problem }] })
    return { vote, entry, agenda }
  }

  /** Документ бюллетеня — то, что подписывается: повестка с выбранными вариантами словами, а не id */
  private async document(tx: Tx, vote: Vote, entry: SnapshotEntry, agenda: AgendaQuestion[], answers: Answers, voterName: string, channel: 'ELECTRONIC' | 'PAPER') {
    const house = await tx.house.findFirstOrThrow({ where: { id: vote.houseId }, select: { address: true } })
    return {
      kind: 'BALLOT', channel, vote: { id: vote.id, title: vote.title, legal_basis: vote.legalBasis, starts_at: vote.startsAt!.toISOString(), ends_at: vote.endsAt!.toISOString() },
      house: house.address, unit: { id: entry.unit_id, number: entry.number, area: entry.area, weight: entry.weight }, voter: voterName,
      answers: agenda.map((q) => {
        const ids = answers.find((a) => a.question_id === q.id)!.option_ids
        return { order: q.order, question: q.text, chosen: q.options.filter((o) => ids.includes(o.id)).map((o) => o.text) }
      }),
      prepared_at: new Date().toISOString(),
    }
  }

  private async insert(tx: Tx, data: Prisma.BallotUncheckedCreateInput, answers: Answers) {
    try {
      const ballot = await tx.ballot.create({ data })
      await tx.ballotAnswer.createMany({
        data: answers.flatMap((a) => a.option_ids.map((optionId) => ({ ballotId: ballot.id, questionId: a.question_id, optionId }) as Prisma.BallotAnswerCreateManyInput)),
      })
      return ballot
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw alreadyVoted()
      throw e
    }
  }

  /** Собственник сейчас, но не в снимке — купил после старта; в снимке есть другие — голосует представитель */
  private async whyNot(tx: Tx, entry: SnapshotEntry, userId: string): Promise<string> {
    const owns = await tx.unitOwnership.count({ where: { unitId: entry.unit_id, userId, relation: 'OWNER', verificationStatus: 'VERIFIED' } })
    if (!owns) return 'Голосовать за помещение может только его собственник'
    return entry.voters.length ? REPRESENTATIVE : LATE_OWNER
  }

  private hash(document: unknown): Buffer<ArrayBuffer> {
    return createHash('sha256').update(canonical(document)).digest()
  }
}
