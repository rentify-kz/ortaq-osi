import { Inject, Injectable } from '@nestjs/common'
import type { Protocol, Vote } from '@prisma/client'
import { ErrorCode, type BallotSigningView, type ProtocolContent, type ProtocolParticipant, type ProtocolView } from '@ortaq/shared'
import { createHash } from 'node:crypto'
import { canonical } from '../../common/canonical'
import { asSystem, ctx } from '../../common/context'
import { AppError, conflict, forbidden, notFound } from '../../common/errors'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { SIGNATURE_PROVIDER, type SignatureProvider } from '../../integrations/signature/signature.provider'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from '../notifications/notifications.service'
import { isBoardRole } from '../requests/visibility'
import { titleCaseName } from '../verification/names'
import { loadAgenda } from './agenda'
import { snapshotHash } from './snapshot'
import { tally, type SnapshotEntry } from './tally'

type SignRole = 'CHAIRMAN' | 'SECRETARY'
type Pending = Partial<Record<SignRole, { external_id: string; user_id: string }>>

/** Протокол хранится не менее 5 лет (docs/09 §7) */
const RETENTION_YEARS = 5
const state = (message: string) => conflict(ErrorCode.PROTOCOL_STATE, message)

/**
 * Протокол собрания (docs/09 §7). Формируется в той же транзакции, что закрывает голосование,
 * из снимка реестра и бюллетеней, и больше не меняется — это держит триггер в базе. Подписывают
 * ЭЦП председатель и секретарь, затем председатель публикует его жильцам.
 */
@Injectable()
export class ProtocolsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
    @Inject(SIGNATURE_PROVIDER) private readonly signer: SignatureProvider,
  ) {}

  async create(tx: Tx, vote: Vote): Promise<string> {
    const snap = await tx.voteRegistrySnapshot.findFirstOrThrow({ where: { voteId: vote.id } })
    const entries = snap.entries as SnapshotEntry[]
    // Снимок не правится (у приложения нет UPDATE), но протокол проверяет это сам: подпись должна покрывать честные веса
    if (!snapshotHash(entries).equals(Buffer.from(snap.entriesHash))) throw new Error(`Снимок реестра голосования ${vote.id} не совпадает со своим хешем`)
    const agenda = await loadAgenda(tx, vote.id)
    const ballots = await tx.ballot.findMany({ where: { voteId: vote.id }, include: { answers: { select: { optionId: true } } }, orderBy: { castAt: 'asc' } })
    const t = tally({ entries, threshold: vote.threshold, questions: agenda, ballots: ballots.map((b) => ({ unitId: b.unitId, channel: b.channel, optionIds: b.answers.map((a) => a.optionId) })) })

    const house = await tx.house.update({ where: { id: vote.houseId }, data: { protocolSeq: { increment: 1 } }, select: { protocolSeq: true, address: true, displayName: true } })
    const sigIds = ballots.map((b) => b.signatureId).filter((x): x is string => !!x)
    const serials = new Map((await asSystem(() => this.db.run((s) => s.signature.findMany({ where: { id: { in: sigIds } }, select: { id: true, certSerial: true } })))).map((s) => [s.id, s.certSerial]))
    const numberOf = new Map(entries.map((e) => [e.unit_id, e]))
    const participants: ProtocolParticipant[] = ballots.map((b) => ({
      unit_number: numberOf.get(b.unitId)?.number ?? '', area: Number(b.area), channel: b.channel, voter_name: titleCaseName(b.voterName),
      cast_at: b.castAt.toISOString(), cert_serial: b.signatureId ? serials.get(b.signatureId) ?? null : null, entered_by_chairman: b.enteredBy !== null,
    }))
    const notices = await tx.voteNotice.findMany({ where: { voteId: vote.id }, select: { unitNumbers: true } })
    const notifiedUnits = new Set(notices.flatMap((n) => n.unitNumbers))
    const materials = await tx.file.findMany({ where: { parentType: 'VOTE', parentId: vote.id, status: 'READY' }, select: { id: true, mimeType: true }, orderBy: { createdAt: 'asc' } })

    const content: ProtocolContent = {
      number: house.protocolSeq,
      house: { address: house.address, display_name: house.displayName },
      vote: { id: vote.id, title: vote.title, description: vote.description, legal_basis: vote.legalBasis, decision_type: vote.decisionType, threshold: vote.threshold },
      dates: { notice_sent_at: vote.noticeSentAt!.toISOString(), starts_at: vote.startsAt!.toISOString(), ends_at: vote.endsAt!.toISOString(), closed_at: vote.closedAt!.toISOString() },
      quorum: t.turnout,
      held: t.turnout.quorum_reached,
      agenda: agenda.map((q) => ({ order: q.order, text: q.text })),
      results: t.questions,
      paper: t.paper,
      participants,
      notice: { notified_users: notices.length, notified_owner_units: notifiedUnits.size, units_without_owner_in_app: entries.filter((e) => !notifiedUnits.has(e.number)).length },
      materials: materials.map((m) => ({ file_id: m.id, mime_type: m.mimeType })),
      snapshot: { total_area: Number(snap.totalArea), total_units: snap.totalUnits, entries_hash: Buffer.from(snap.entriesHash).toString('hex') },
    }
    const retention = new Date(vote.closedAt!)
    retention.setUTCFullYear(retention.getUTCFullYear() + RETENTION_YEARS)
    const protocol = await tx.protocol.create({
      data: {
        houseId: vote.houseId, voteId: vote.id, number: house.protocolSeq, content, contentHash: this.hash(content), quorumReached: t.turnout.quorum_reached,
        quorumPercent: t.turnout.percent, results: t.questions, retentionUntil: retention,
      },
    })
    await this.audit.append(tx, {
      action: 'vote.protocol_create', entityType: 'Protocol', entityId: protocol.id,
      after: { number: protocol.number, quorum_percent: t.turnout.percent, held: t.turnout.quorum_reached, ballots: ballots.length, paper: t.paper.units },
    })
    return protocol.id
  }

  async byVote(voteId: string): Promise<ProtocolView> {
    const p = await this.db.run((tx) => tx.protocol.findFirst({ where: { voteId } }))
    if (!p) throw notFound('Протокол')
    return this.view(p)
  }

  async detail(id: string): Promise<ProtocolView> {
    const p = await this.db.run((tx) => tx.protocol.findFirst({ where: { id } }))
    if (!p) throw notFound('Протокол')
    return this.view(p)
  }

  /** Жильцам протокол существует только опубликованным; секретарю — с момента, когда его надо подписать */
  private async view(p: Protocol): Promise<ProtocolView> {
    const vote = await this.db.run((tx) => tx.vote.findFirstOrThrow({ where: { id: p.voteId }, select: { secretaryUserId: true } }))
    const userId = ctx().userId ?? ''
    if (p.status !== 'PUBLISHED' && !isBoardRole(ctx().role) && vote.secretaryUserId !== userId) throw notFound('Протокол')
    const ids = [p.chairmanSignatureId, p.secretarySignatureId, vote.secretaryUserId].filter((x): x is string => !!x)
    const [sigs, secretary] = await asSystem(() => this.db.run(async (tx) => [
      await tx.signature.findMany({ where: { id: { in: ids } }, select: { id: true, signerFullName: true, createdAt: true } }),
      vote.secretaryUserId ? await tx.user.findUnique({ where: { id: vote.secretaryUserId }, select: { id: true, fullName: true } }) : null,
    ] as const))
    const sig = (sid: string | null) => {
      const s = sigs.find((x) => x.id === sid)
      return s ? { name: titleCaseName(s.signerFullName), signed_at: s.createdAt.toISOString() } : null
    }
    return {
      id: p.id, vote_id: p.voteId, number: p.number, status: p.status, content: p.content as ProtocolContent, content_hash: Buffer.from(p.contentHash).toString('hex'),
      signatures: { chairman: sig(p.chairmanSignatureId), secretary: sig(p.secretarySignatureId) },
      secretary: secretary ? { user_id: secretary.id, name: secretary.fullName } : null,
      published_at: p.publishedAt?.toISOString() ?? null, retention_until: p.retentionUntil.toISOString().slice(0, 10),
    }
  }

  /** Подписание своей ролью: в eGov уходит хеш содержимого протокола */
  async startSigning(id: string): Promise<BallotSigningView> {
    const userId = ctx().userId ?? ''
    const { p, role } = await this.db.run(async (tx) => {
      const p = await tx.protocol.findFirst({ where: { id } })
      if (!p) throw notFound('Протокол')
      return { p, role: await this.roleOf(tx, p) }
    })
    if (p.status !== 'AWAITING_SIGNATURES') throw state('Протокол уже подписан')
    if (this.signatureOf(p, role)) throw state(role === 'CHAIRMAN' ? 'Председатель уже подписал протокол' : 'Секретарь уже подписал протокол')
    const user = await asSystem(() => this.db.run((tx) => tx.user.findUniqueOrThrow({ where: { id: userId }, select: { iinHash: true } })))
    if (!user.iinHash) throw new AppError(422, ErrorCode.IDENTITY_REQUIRED, 'Сначала подтвердите личность через eGov mobile: протокол подписывается вашей ЭЦП')

    const started = await this.signer.start({ documentHash: new Uint8Array(p.contentHash), description: `Протокол №${p.number} общего собрания собственников` })
    await this.db.run(async (tx) => {
      await tx.$queryRaw`SELECT id FROM protocols WHERE id = ${id}::uuid FOR UPDATE`
      const fresh = await tx.protocol.findFirstOrThrow({ where: { id } })
      const pending: Pending = { ...(fresh.pendingSigning as Pending), [role]: { external_id: started.externalId, user_id: userId } }
      await tx.protocol.update({ where: { id }, data: { pendingSigning: pending } })
      await this.audit.append(tx, { action: 'vote.protocol_sign_start', entityType: 'Protocol', entityId: id, after: { role } })
    })
    return { signing_id: id, external_id: started.externalId, qr_url: started.qrUrl, deeplink: started.deeplink, expires_at: started.expiresAt.toISOString() }
  }

  /** «Я подписал»: сервер сам забирает подпись, проверяет её и сверяет ИИН подписанта с пользователем */
  async completeSigning(id: string): Promise<ProtocolView | { status: 'PENDING' }> {
    const userId = ctx().userId ?? ''
    const houseId = ctx().houseId ?? ''
    const { p, role } = await this.db.run(async (tx) => {
      const p = await tx.protocol.findFirst({ where: { id } })
      if (!p) throw notFound('Протокол')
      return { p, role: await this.roleOf(tx, p) }
    })
    const pending = (p.pendingSigning as Pending)[role]
    if (!pending || pending.user_id !== userId) throw state('Подписание не начато — начните заново')
    const fetched = await this.signer.fetch(pending.external_id)
    if (fetched.status === 'PENDING') return { status: 'PENDING' }
    if (fetched.status === 'EXPIRED') throw state('Время на подписание истекло. Начните заново')
    const checked = await this.signer.verify(fetched.signature, new Uint8Array(p.contentHash))
    if (!checked.valid) throw new AppError(422, ErrorCode.VERIFICATION_FAILED, `Подпись не прошла проверку: ${checked.reason}`)
    const iinHash = this.crypto.hashIin(checked.signer.iin)
    const user = await asSystem(() => this.db.run((tx) => tx.user.findUniqueOrThrow({ where: { id: userId }, select: { iinHash: true } })))
    if (!user.iinHash || !this.crypto.equal(user.iinHash, iinHash)) throw new AppError(422, ErrorCode.VERIFICATION_FAILED, 'Протокол подписан ЭЦП другого человека')

    const now = new Date()
    const sig = await asSystem(() => this.db.run((tx) => tx.signature.create({
      data: {
        userId, provider: this.signer.name, externalId: pending.external_id, purpose: 'PROTOCOL', documentHash: p.contentHash, signatureData: Buffer.from(fetched.signature),
        signerIinHash: iinHash, signerFullName: checked.signer.fullName, certSerial: checked.cert.serial, certValidFrom: checked.cert.validFrom,
        certValidTo: checked.cert.validTo, verifiedAt: now, verificationResult: { valid: true, issuer: checked.cert.issuer, signed_at: checked.signedAt.toISOString() },
      },
    })))
    const complete = await this.db.run(async (tx) => {
      await tx.$queryRaw`SELECT id FROM protocols WHERE id = ${id}::uuid FOR UPDATE`
      const fresh = await tx.protocol.findFirstOrThrow({ where: { id } })
      // Роль проверяется снова: секретаря могли сменить, пока шло подписание
      if (fresh.status !== 'AWAITING_SIGNATURES' || this.signatureOf(fresh, role) || (await this.roleOf(tx, fresh)) !== role) throw state('Протокол уже подписан этой ролью')
      const next = { chairman: role === 'CHAIRMAN' ? sig.id : fresh.chairmanSignatureId, secretary: role === 'SECRETARY' ? sig.id : fresh.secretarySignatureId }
      const done = !!next.chairman && !!next.secretary
      const rest: Pending = { ...(fresh.pendingSigning as Pending) }
      delete rest[role]
      await tx.protocol.update({
        where: { id },
        data: { chairmanSignatureId: next.chairman, secretarySignatureId: next.secretary, pendingSigning: rest, ...(done && { status: 'SIGNED', signedAt: now }) },
      })
      await this.audit.append(tx, { action: 'vote.protocol_sign', entityType: 'Protocol', entityId: id, after: { role, signature: sig.id, complete: done } })
      return done
    })
    if (complete) {
      const chairmen = await this.db.run((tx) => tx.houseMembership.findMany({ where: { role: 'CHAIRMAN', status: 'ACTIVE' }, select: { userId: true } }))
      await this.notifications.notify({
        userIds: chairmen.map((c) => c.userId), houseId, category: 'VOTES', priority: 'HIGH',
        title: `Протокол №${p.number} подписан`, body: 'Председатель и секретарь подписали протокол. Опубликуйте его жильцам', payload: { type: 'protocol', id, vote_id: p.voteId },
      })
    }
    return this.detail(id)
  }

  /** Публикация: итоги и протокол видит каждый член дома, каждому — уведомление */
  async publish(id: string): Promise<ProtocolView> {
    const houseId = ctx().houseId ?? ''
    const p = await this.db.run(async (tx) => {
      await tx.$queryRaw`SELECT id FROM protocols WHERE id = ${id}::uuid FOR UPDATE`
      const p = await tx.protocol.findFirst({ where: { id } })
      if (!p) throw notFound('Протокол')
      if (p.status !== 'SIGNED') throw state(p.status === 'PUBLISHED' ? 'Протокол уже опубликован' : 'Опубликовать можно только подписанный протокол')
      await tx.protocol.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: ctx().userId } })
      await this.audit.append(tx, { action: 'vote.protocol_publish', entityType: 'Protocol', entityId: id, after: { number: p.number } })
      return p
    })
    const members = await this.db.run((tx) => tx.houseMembership.findMany({ where: { status: 'ACTIVE' }, select: { userId: true } }))
    const c = p.content as ProtocolContent
    await this.notifications.notify({
      userIds: members.map((m) => m.userId), houseId, category: 'VOTES', priority: 'NORMAL',
      title: `Итоги голосования: ${c.vote.title}`,
      body: c.held ? `Протокол №${p.number} подписан и опубликован. Кворум ${c.quorum.percent}%` : `Собрание не состоялось: кворум ${c.quorum.percent}%, нужно больше 50%`,
      payload: { type: 'protocol', id, vote_id: p.voteId },
    })
    return this.detail(id)
  }

  /** Председатель подписывает своей ролью; секретарь — тот, кто назначен в голосовании сейчас */
  private async roleOf(tx: Tx, p: Protocol): Promise<SignRole> {
    if (ctx().role === 'CHAIRMAN') return 'CHAIRMAN'
    const vote = await tx.vote.findFirstOrThrow({ where: { id: p.voteId }, select: { secretaryUserId: true } })
    if (vote.secretaryUserId && vote.secretaryUserId === ctx().userId) return 'SECRETARY'
    throw forbidden('Протокол подписывают председатель и секретарь собрания')
  }

  private signatureOf(p: Protocol, role: SignRole): string | null {
    return role === 'CHAIRMAN' ? p.chairmanSignatureId : p.secretarySignatureId
  }

  private hash(content: ProtocolContent): Buffer<ArrayBuffer> {
    return createHash('sha256').update(canonical(content)).digest()
  }
}
