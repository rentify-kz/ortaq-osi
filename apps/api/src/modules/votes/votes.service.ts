import { Injectable } from '@nestjs/common'
import type { Prisma, Vote } from '@prisma/client'
import {
  DECISION_THRESHOLD, ErrorCode, NOTICE_DAYS, cancelVoteBody, createVoteBody, sendNoticeBody, updateVoteBody,
  type CancelVoteBody, type CreateVoteBody, type MyVoteUnit, type SendNoticeBody, type UpdateVoteBody, type VoteListItem, type VoteResults, type VoteView,
} from '@ortaq/shared'
import { asSystem, ctx } from '../../common/context'
import { AppError, conflict, notFound, unprocessable } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { FilesService, fileView } from '../files/files.service'
import { NotificationsService } from '../notifications/notifications.service'
import { isBoardRole } from '../requests/visibility'
import { loadAgenda, writeAgenda } from './agenda'
import { ProtocolsService } from './protocols.service'
import { buildSnapshot, unitsWithoutArea } from './snapshot'
import { tally, weightOf, type SnapshotEntry } from './tally'

const DAY = 86_400_000
export const LATE_OWNER = 'Собственность подтверждена после начала голосования: в нём голосует прежний состав собственников'
export const REPRESENTATIVE = 'За помещение голосует назначенный представитель собственников'
const REMIND_GAP_MS = DAY
export const state = (message: string) => conflict(ErrorCode.VOTE_STATE, message)

const dateRu = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Almaty' })

/**
 * Голосования (docs/09, docs/06 §6.6). Черновик → уведомление (не позднее чем за 5 дней) →
 * старт по дате со снимком реестра → закрытие по сроку с протоколом. Повестку и сроки после
 * уведомления не меняет ни сервис, ни приложение в обход него: это держит триггер в базе.
 */
@Injectable()
export class VotesService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly protocols: ProtocolsService,
  ) {}

  async create(input: CreateVoteBody): Promise<VoteView> {
    const body = createVoteBody.parse(input)
    const userId = ctx().userId ?? ''
    const id = await this.db.run(async (tx) => {
      await this.assertVotingReady(tx)
      if (body.secretary_user_id) await this.assertSecretary(tx, body.secretary_user_id)
      const vote = await tx.vote.create({
        data: {
          title: body.title, description: body.description || null, legalBasis: body.legal_basis, decisionType: body.decision_type,
          threshold: DECISION_THRESHOLD[body.decision_type], resultsVisibleDuring: body.results_visible_during,
          secretaryUserId: body.secretary_user_id ?? null, createdBy: userId,
        } as Prisma.VoteUncheckedCreateInput,
      })
      await writeAgenda(tx, vote.id, body.questions, false)
      await this.files.attach(tx, body.material_file_ids, 'VOTE', vote.id, userId, 'VOTE_MATERIAL')
      await this.audit.append(tx, {
        action: 'vote.create', entityType: 'Vote', entityId: vote.id,
        after: { title: vote.title, decision_type: vote.decisionType, threshold: vote.threshold, legal_basis: vote.legalBasis, questions: body.questions.length },
      })
      return vote.id
    })
    return this.detail(id)
  }

  /** Черновик меняется целиком; после уведомления — только секретарь и новые материалы до старта */
  async update(id: string, input: UpdateVoteBody): Promise<VoteView> {
    const body = updateVoteBody.parse(input)
    const userId = ctx().userId ?? ''
    await this.db.run(async (tx) => {
      const vote = await this.lock(tx, id)
      const agendaKeys = ['title', 'description', 'legal_basis', 'decision_type', 'results_visible_during', 'questions'] as const
      if (vote.status !== 'DRAFT' && agendaKeys.some((k) => body[k] !== undefined)) {
        throw state('Повестка, правила подсчёта и сроки фиксируются уведомлением. Чтобы изменить их, отмените голосование и проведите новое')
      }
      if (body.material_file_ids?.length && !['DRAFT', 'NOTICE_SENT'].includes(vote.status)) throw state('Материалы добавляются до начала голосования')
      if (body.secretary_user_id !== undefined) await this.assertSecretaryChangeable(tx, vote, body.secretary_user_id)

      await tx.vote.update({
        where: { id },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description || null }),
          ...(body.legal_basis !== undefined && { legalBasis: body.legal_basis }),
          ...(body.decision_type !== undefined && { decisionType: body.decision_type, threshold: DECISION_THRESHOLD[body.decision_type] }),
          ...(body.results_visible_during !== undefined && { resultsVisibleDuring: body.results_visible_during }),
          ...(body.secretary_user_id !== undefined && { secretaryUserId: body.secretary_user_id }),
        },
      })
      if (body.questions) await writeAgenda(tx, id, body.questions, true)
      if (body.material_file_ids) await this.files.attach(tx, body.material_file_ids, 'VOTE', id, userId, 'VOTE_MATERIAL')
      await this.audit.append(tx, { action: 'vote.update', entityType: 'Vote', entityId: id, after: { fields: Object.keys(body) } })
    })
    return this.detail(id)
  }

  /**
   * Рассылка уведомления: фиксирует повестку и сроки. Начало — не раньше чем через 5 календарных
   * дней (docs/09 §4). Проверка здесь и CHECK в базе: ограничение поля в интерфейсе обходится запросом.
   */
  async sendNotice(id: string, input: SendNoticeBody): Promise<VoteView> {
    const body = sendNoticeBody.parse(input)
    const houseId = ctx().houseId ?? ''
    const now = new Date()
    const startsAt = new Date(body.starts_at)
    const endsAt = new Date(body.ends_at)
    const minStart = new Date(now.getTime() + NOTICE_DAYS * DAY)
    if (startsAt < minStart) {
      throw unprocessable(ErrorCode.NOTICE_TOO_SHORT, `Закон требует уведомить не позднее чем за ${NOTICE_DAYS} календарных дней. Начало — не раньше ${dateRu(minStart)}`, {
        min_starts_at: minStart.toISOString(), fields: [{ path: 'starts_at', message: `Не раньше ${dateRu(minStart)}` }],
      })
    }
    const { vote, recipients } = await this.db.run(async (tx) => {
      const vote = await this.lock(tx, id)
      if (vote.status !== 'DRAFT') throw state('Уведомление уже разослано')
      await this.assertVotingReady(tx)
      await tx.vote.update({ where: { id }, data: { status: 'NOTICE_SENT', noticeSentAt: now, startsAt, endsAt } })
      const recipients = await this.noticeRecipients(tx)
      await tx.voteNotice.createMany({ data: recipients.map((r) => ({ voteId: id, userId: r.userId, unitNumbers: r.units, notifiedAt: now }) as Prisma.VoteNoticeCreateManyInput) })
      await this.audit.append(tx, {
        action: 'vote.send_notice', entityType: 'Vote', entityId: id,
        after: { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), notified: recipients.length, owners: recipients.filter((r) => r.units.length).length },
      })
      return { vote, recipients }
    })
    const body2 = `Голосование с ${dateRu(startsAt)} по ${dateRu(endsAt)}. Повестка и материалы — в приложении`
    const owners = recipients.filter((r) => r.units.length).map((r) => r.userId)
    const others = recipients.filter((r) => !r.units.length).map((r) => r.userId)
    // Собственнику — юридически значимое извещение: push и SMS. Остальным — в ленту
    await this.notifications.notify({ userIds: owners, houseId, category: 'VOTES', priority: 'CRITICAL', title: `Собрание собственников: ${vote.title}`, body: body2, payload: { type: 'vote', id } })
    await this.notifications.notify({ userIds: others, houseId, category: 'VOTES', priority: 'NORMAL', title: `Собрание собственников: ${vote.title}`, body: body2, payload: { type: 'vote', id } })
    return this.detail(id)
  }

  /**
   * Старт по дате начала: снимок реестра замораживает площади и круг голосующих. Вызывают
   * планировщик и председатель (если планировщик ещё не дошёл); раньше даты из уведомления — нельзя.
   */
  async activate(id: string, now = new Date()): Promise<VoteView> {
    const houseId = ctx().houseId ?? ''
    const vote = await this.db.run(async (tx) => {
      const vote = await this.lock(tx, id)
      if (vote.status !== 'NOTICE_SENT') throw state(vote.status === 'ACTIVE' ? 'Голосование уже идёт' : 'Сначала разошлите уведомление')
      if (vote.startsAt!.getTime() - vote.noticeSentAt!.getTime() < NOTICE_DAYS * DAY) {
        throw unprocessable(ErrorCode.NOTICE_TOO_SHORT, `С уведомления прошло меньше ${NOTICE_DAYS} календарных дней`)
      }
      if (now < vote.startsAt!) throw state(`Голосование начнётся ${dateRu(vote.startsAt!)}, как сказано в уведомлении`)
      if (now >= vote.endsAt!) throw state('Срок голосования из уведомления уже прошёл. Отмените его и проведите новое')
      const snap = await buildSnapshot(tx)
      if (snap.withoutArea > 0) {
        throw new AppError(422, ErrorCode.HOUSE_NOT_VOTING_READY, `Нельзя начать: у ${snap.withoutArea} помещений не указана площадь`, { units_without_area: snap.withoutArea })
      }
      await tx.voteRegistrySnapshot.create({
        data: { houseId: vote.houseId, voteId: id, totalArea: snap.totalArea, totalUnits: snap.totalUnits, entries: snap.entries, entriesHash: snap.entriesHash },
      })
      await tx.vote.update({ where: { id }, data: { status: 'ACTIVE', activatedAt: now } })
      await this.audit.append(tx, {
        action: 'vote.activate', entityType: 'Vote', entityId: id,
        after: { total_area: snap.totalArea, total_units: snap.totalUnits, voters: snap.entries.filter((e) => e.voters.length).length, snapshot_hash: snap.entriesHash.toString('hex'), by: ctx().userId ? 'user' : 'schedule' },
      })
      return { ...vote, voters: snap.entries.flatMap((e) => e.voters) }
    })
    const members = await this.activeMembers()
    const voters = new Set(vote.voters)
    await this.notifications.notify({
      userIds: members.filter((m) => voters.has(m)), houseId, category: 'VOTES', priority: 'CRITICAL',
      title: `Голосование началось: ${vote.title}`, body: `Проголосуйте до ${dateRu(vote.endsAt!)}. Бюллетень подписывается ЭЦП в eGov mobile`, payload: { type: 'vote', id },
    })
    await this.notifications.notify({
      userIds: members.filter((m) => !voters.has(m)), houseId, category: 'VOTES', priority: 'LOW',
      title: `Голосование началось: ${vote.title}`, body: `Голосуют собственники помещений до ${dateRu(vote.endsAt!)}`, payload: { type: 'vote', id },
    })
    return this.detail(id)
  }

  /** Отмена с причиной. Поданные бюллетени остаются в базе, итоги отменённого голосования не раскрываются */
  async cancel(id: string, input: CancelVoteBody): Promise<VoteView> {
    const { reason } = cancelVoteBody.parse(input)
    const houseId = ctx().houseId ?? ''
    const vote = await this.db.run(async (tx) => {
      const vote = await this.lock(tx, id)
      if (!['DRAFT', 'NOTICE_SENT', 'ACTIVE'].includes(vote.status)) throw state('Голосование уже завершено')
      await tx.vote.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: ctx().userId, cancelReason: reason } })
      const ballots = await tx.ballot.count({ where: { voteId: id } })
      await this.audit.append(tx, { action: 'vote.cancel', entityType: 'Vote', entityId: id, after: { from: vote.status, reason, ballots } })
      return vote
    })
    if (vote.status !== 'DRAFT') {
      const notified = await this.db.run((tx) => tx.voteNotice.findMany({ where: { voteId: id }, select: { userId: true } }))
      await this.notifications.notify({
        userIds: notified.map((n) => n.userId), houseId, category: 'VOTES', priority: 'HIGH',
        title: `Голосование отменено: ${vote.title}`, body: `Причина: ${reason}`, payload: { type: 'vote', id },
      })
    }
    return this.detail(id)
  }

  /**
   * Закрытие по сроку: подсчёт по снимку и протокол. Раньше срока закрыть нельзя, после — уже
   * ничего не подать: «дособрать» голоса значило бы разрушить юридическую силу протокола.
   */
  async close(id: string, now = new Date()): Promise<VoteView> {
    const houseId = ctx().houseId ?? ''
    const { vote, protocolId } = await this.db.run(async (tx) => {
      const vote = await this.lock(tx, id)
      if (vote.status !== 'ACTIVE') throw state(vote.status === 'CLOSED' ? 'Голосование уже закрыто' : 'Голосование не идёт')
      if (now < vote.endsAt!) throw state(`Голосование закроется автоматически ${dateRu(vote.endsAt!)}. Раньше срока закрыть нельзя`)
      await tx.vote.update({ where: { id }, data: { status: 'CLOSED', closedAt: now } })
      const protocolId = await this.protocols.create(tx, { ...vote, status: 'CLOSED', closedAt: now })
      await this.audit.append(tx, { action: 'vote.close', entityType: 'Vote', entityId: id, after: { protocol: protocolId, by: ctx().userId ? 'user' : 'schedule' } })
      return { vote, protocolId }
    })
    const signers = await this.db.run((tx) => tx.houseMembership.findMany({ where: { role: 'CHAIRMAN', status: 'ACTIVE' }, select: { userId: true } }))
    await this.notifications.notify({
      userIds: [...signers.map((s) => s.userId), ...(vote.secretaryUserId ? [vote.secretaryUserId] : [])], houseId, category: 'VOTES', priority: 'HIGH',
      title: `Голосование закрыто: ${vote.title}`, body: 'Протокол сформирован. Подпишите его ЭЦП, чтобы опубликовать итоги', payload: { type: 'protocol', id: protocolId, vote_id: id },
    })
    return this.detail(id)
  }

  /** Напоминание всем непроголосовавшим сразу: адресовать вручную нельзя (docs/09 §8). Не чаще раза в сутки */
  async remind(id: string, auto?: { key: string; title: string }): Promise<{ sent: number }> {
    const houseId = ctx().houseId ?? ''
    const now = new Date()
    const { vote, pending } = await this.db.run(async (tx) => {
      const vote = await this.lock(tx, id)
      if (vote.status !== 'ACTIVE') throw state('Напоминать можно только во время голосования')
      if (!auto && vote.remindedAt && now.getTime() - vote.remindedAt.getTime() < REMIND_GAP_MS) throw state('Напоминание уже отправлялось за последние сутки')
      const pending = await this.nonVoters(tx, id)
      if (!auto) {
        await tx.vote.update({ where: { id }, data: { remindedAt: now } })
        await this.audit.append(tx, { action: 'vote.remind', entityType: 'Vote', entityId: id, after: { recipients: pending.length } })
      }
      return { vote, pending }
    })
    const sent = await this.notifications.notify({
      userIds: pending, houseId, category: 'VOTES', priority: 'HIGH',
      title: auto?.title ?? `Вы ещё не проголосовали: ${vote.title}`, body: `Голосование идёт до ${dateRu(vote.endsAt!)}. Ваш голос нужен для кворума`,
      payload: { type: 'vote', id, ...(auto && { key: auto.key }) },
    })
    return { sent }
  }

  /** Собственники из снимка, за чьё помещение ещё нет бюллетеня, и только активные члены дома */
  private async nonVoters(tx: Tx, voteId: string): Promise<string[]> {
    const snap = await tx.voteRegistrySnapshot.findFirst({ where: { voteId } })
    if (!snap) return []
    const cast = new Set((await tx.ballot.findMany({ where: { voteId }, select: { unitId: true } })).map((b) => b.unitId))
    const users = new Set((snap.entries as SnapshotEntry[]).filter((e) => !cast.has(e.unit_id)).flatMap((e) => e.voters))
    const active = await tx.houseMembership.findMany({ where: { userId: { in: [...users] }, status: 'ACTIVE' }, select: { userId: true } })
    return active.map((m) => m.userId)
  }

  async list(): Promise<VoteListItem[]> {
    const userId = ctx().userId ?? ''
    const board = isBoardRole(ctx().role)
    return this.db.run(async (tx) => {
      const votes = await tx.vote.findMany({
        where: board ? {} : { status: { not: 'DRAFT' } }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { snapshot: true, protocol: { select: { id: true, number: true, status: true } } },
      })
      const ids = votes.map((v) => v.id)
      const ballots = await tx.ballot.findMany({ where: { voteId: { in: ids } }, select: { voteId: true, unitId: true } })
      return votes.map((v) => {
        const entries = (v.snapshot?.entries ?? []) as SnapshotEntry[]
        const cast = new Set(ballots.filter((b) => b.voteId === v.id).map((b) => b.unitId))
        const t = v.snapshot ? tally({ entries, threshold: v.threshold, questions: [], ballots: [...cast].map((unitId) => ({ unitId, channel: 'ELECTRONIC' as const, optionIds: [] })) }) : null
        return {
          id: v.id, title: v.title, status: v.status, decision_type: v.decisionType, threshold: v.threshold, legal_basis: v.legalBasis,
          starts_at: v.startsAt?.toISOString() ?? null, ends_at: v.endsAt?.toISOString() ?? null, turnout_percent: t?.turnout.percent ?? null,
          awaiting_my_ballot: v.status === 'ACTIVE' && entries.some((e) => e.voters.includes(userId) && !cast.has(e.unit_id)),
          protocol: v.protocol && (board || v.protocol.status === 'PUBLISHED' || v.secretaryUserId === userId) ? v.protocol : null,
        }
      })
    })
  }

  async detail(id: string): Promise<VoteView> {
    const userId = ctx().userId ?? ''
    const board = isBoardRole(ctx().role)
    return this.db.run(async (tx) => {
      const v = await tx.vote.findFirst({ where: { id }, include: { snapshot: true, protocol: { select: { id: true, number: true, status: true } } } })
      // Черновик — рабочий материал правления: жильцу его не существует
      if (!v || (v.status === 'DRAFT' && !board)) throw notFound('Голосование')
      const agenda = await loadAgenda(tx, id)
      const materials = await tx.file.findMany({ where: { parentType: 'VOTE', parentId: id, status: 'READY' }, orderBy: { createdAt: 'asc' } })
      const ballots = await tx.ballot.findMany({ where: { voteId: id }, select: { unitId: true, castAt: true, channel: true } })
      const entries = (v.snapshot?.entries ?? []) as SnapshotEntry[]
      const turnout = v.snapshot ? tally({ entries, threshold: v.threshold, questions: [], ballots: ballots.map((b) => ({ unitId: b.unitId, channel: b.channel, optionIds: [] })) }).turnout : null
      const secretary = v.secretaryUserId
        ? await asSystem(() => this.db.run((t) => t.user.findUnique({ where: { id: v.secretaryUserId! }, select: { id: true, fullName: true } })))
        : null
      return {
        id: v.id, title: v.title, description: v.description, status: v.status, decision_type: v.decisionType, threshold: v.threshold,
        legal_basis: v.legalBasis, quorum_basis: v.quorumBasis, results_visible_during: v.resultsVisibleDuring,
        notice_sent_at: v.noticeSentAt?.toISOString() ?? null, starts_at: v.startsAt?.toISOString() ?? null, ends_at: v.endsAt?.toISOString() ?? null,
        activated_at: v.activatedAt?.toISOString() ?? null, closed_at: v.closedAt?.toISOString() ?? null,
        cancelled_at: v.cancelledAt?.toISOString() ?? null, cancel_reason: v.cancelReason,
        secretary: secretary ? { user_id: secretary.id, name: secretary.fullName } : null,
        questions: agenda.map((q) => ({ id: q.id, order: q.order, text: q.text, type: q.type, options: q.options.map((o) => ({ id: o.id, order: o.order, text: o.text, kind: o.kind })) })),
        materials: materials.map(fileView),
        turnout,
        my_units: await this.myUnits(tx, v, entries, ballots, userId),
        notified: board ? await tx.voteNotice.count({ where: { voteId: id } }) : null,
        protocol: v.protocol && (board || v.protocol.status === 'PUBLISHED' || v.secretaryUserId === userId) ? v.protocol : null,
      }
    })
  }

  /**
   * Помещения вызывающего. До старта — по текущей собственности, после — только по снимку:
   * купивший квартиру во время голосования в нём не участвует (docs/09 §6).
   */
  private async myUnits(tx: Tx, v: Vote, entries: SnapshotEntry[], ballots: { unitId: string; castAt: Date; channel: 'ELECTRONIC' | 'PAPER' }[], userId: string): Promise<MyVoteUnit[]> {
    // Планировщик действует без пользователя: своих помещений у него нет
    if (!userId) return []
    const owned = await tx.unitOwnership.findMany({
      where: { userId, relation: 'OWNER', verificationStatus: 'VERIFIED' }, include: { unit: { select: { id: true, number: true, area: true, isExcludedFromVoting: true } } },
    })
    const ids = new Set([...owned.map((o) => o.unitId), ...entries.filter((e) => e.voters.includes(userId)).map((e) => e.unit_id)])
    const totalArea = entries.length ? entries.reduce((s, e) => s + e.area, 0) : Number((await tx.house.findFirstOrThrow({ where: { id: v.houseId }, select: { totalArea: true } })).totalArea)
    const result: MyVoteUnit[] = []
    for (const unitId of ids) {
      const entry = entries.find((e) => e.unit_id === unitId)
      const unit = owned.find((o) => o.unitId === unitId)?.unit
      if (!entry && unit?.isExcludedFromVoting) continue
      const area = entry?.area ?? Number(unit?.area ?? 0)
      const ballot = ballots.find((b) => b.unitId === unitId)
      let reason: string | null = null
      if (ballot) reason = null
      else if (v.status === 'DRAFT' || v.status === 'NOTICE_SENT') reason = 'Голосование ещё не началось'
      else if (v.status !== 'ACTIVE') reason = 'Голосование завершено'
      else if (!entry || !entry.voters.length) reason = LATE_OWNER
      else if (!entry.voters.includes(userId)) reason = REPRESENTATIVE
      result.push({
        unit_id: unitId, number: entry?.number ?? unit?.number ?? '', area, weight_percent: Math.round(weightOf(area, totalArea) * 1_000_000) / 10_000,
        can_vote: !ballot && reason === null, reason, ballot: ballot ? { cast_at: ballot.castAt.toISOString(), channel: ballot.channel } : null,
      })
    }
    return result.sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }))
  }

  /** До закрытия — только явка и кворум, если голосование не открытое: ход голосования влияет на ещё не проголосовавших */
  async results(id: string): Promise<VoteResults> {
    const board = isBoardRole(ctx().role)
    return this.db.run(async (tx) => {
      const v = await tx.vote.findFirst({ where: { id }, include: { snapshot: true } })
      if (!v || (v.status === 'DRAFT' && !board)) throw notFound('Голосование')
      if (!v.snapshot) throw state('Голосование ещё не началось')
      const hidden = v.status === 'CANCELLED' || (v.status === 'ACTIVE' && !v.resultsVisibleDuring)
      const agenda = await loadAgenda(tx, id)
      const ballots = await tx.ballot.findMany({ where: { voteId: id }, include: { answers: { select: { optionId: true } } } })
      const t = tally({
        entries: v.snapshot.entries as SnapshotEntry[], threshold: v.threshold, questions: agenda,
        ballots: ballots.map((b) => ({ unitId: b.unitId, channel: b.channel, optionIds: hidden ? [] : b.answers.map((a) => a.optionId) })),
      })
      return {
        status: v.status, threshold: v.threshold, turnout: t.turnout, hidden,
        questions: hidden ? [] : t.questions, paper: { units: t.paper.units, area: t.paper.area, percent_of_cast: t.paper.percent_of_cast },
      }
    })
  }

  /** Кандидаты в секретари: член дома с подтверждённой личностью — протокол подписывается его ЭЦП */
  async secretaryCandidates(): Promise<{ user_id: string; name: string; role: string }[]> {
    const me = ctx().userId ?? ''
    const members = await this.db.run((tx) => tx.houseMembership.findMany({ where: { status: 'ACTIVE', userId: { not: me } }, select: { userId: true, role: true } }))
    const users = await asSystem(() => this.db.run((tx) => tx.user.findMany({ where: { id: { in: members.map((m) => m.userId) }, iinHash: { not: null } }, select: { id: true, fullName: true } })))
    return users.map((u) => ({ user_id: u.id, name: u.fullName, role: members.find((m) => m.userId === u.id)!.role })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  private async lock(tx: Tx, id: string): Promise<Vote> {
    await tx.$queryRaw`SELECT id FROM votes WHERE id = ${id}::uuid FOR UPDATE`
    const vote = await tx.vote.findFirst({ where: { id } })
    if (!vote) throw notFound('Голосование')
    return vote
  }

  private async assertVotingReady(tx: Tx): Promise<void> {
    const missing = await unitsWithoutArea(tx)
    if (missing > 0) throw new AppError(422, ErrorCode.HOUSE_NOT_VOTING_READY, `Нельзя создать голосование: у ${missing} помещений не указана площадь`, { units_without_area: missing })
    if ((await tx.unit.count({ where: { isExcludedFromVoting: false } })) === 0) throw new AppError(422, ErrorCode.HOUSE_NOT_VOTING_READY, 'В доме нет голосующих помещений')
  }

  private async assertSecretary(tx: Tx, userId: string): Promise<void> {
    if (userId === ctx().userId) throw unprocessable(ErrorCode.VALIDATION, 'Секретарь — другой человек: протокол подписывают двое', { fields: [{ path: 'secretary_user_id', message: 'Выберите другого члена дома' }] })
    const member = await tx.houseMembership.findFirst({ where: { userId, status: 'ACTIVE' } })
    const user = member ? await asSystem(() => this.db.run((t) => t.user.findUnique({ where: { id: userId }, select: { iinHash: true } }))) : null
    if (!member || !user) throw unprocessable(ErrorCode.VALIDATION, 'Секретарь должен быть членом дома', { fields: [{ path: 'secretary_user_id', message: 'Не член дома' }] })
    if (!user.iinHash) throw unprocessable(ErrorCode.IDENTITY_REQUIRED, 'Секретарь подписывает протокол ЭЦП: его личность должна быть подтверждена', { fields: [{ path: 'secretary_user_id', message: 'Личность не подтверждена' }] })
  }

  /** Секретаря можно сменить, пока он не подписал протокол */
  private async assertSecretaryChangeable(tx: Tx, vote: Vote, next: string | null): Promise<void> {
    if (vote.status === 'CANCELLED') throw state('Голосование отменено')
    const protocol = await tx.protocol.findFirst({ where: { voteId: vote.id } })
    if (protocol?.secretarySignatureId) throw conflict(ErrorCode.PROTOCOL_STATE, 'Секретарь уже подписал протокол')
    if (next) await this.assertSecretary(tx, next)
    else if (vote.status === 'CLOSED') throw state('Протокол подписывают председатель и секретарь: секретарь нужен')
  }

  /** Все активные члены дома и помещения, собственником которых каждый подтверждён — для списка уведомлённых */
  private async noticeRecipients(tx: Tx): Promise<{ userId: string; units: string[] }[]> {
    const members = await tx.houseMembership.findMany({ where: { status: 'ACTIVE' }, select: { userId: true } })
    const owned = await tx.unitOwnership.findMany({
      where: { relation: 'OWNER', verificationStatus: 'VERIFIED', unit: { isExcludedFromVoting: false } }, select: { userId: true, unit: { select: { number: true } } },
    })
    return [...new Set(members.map((m) => m.userId))].map((userId) => ({ userId, units: owned.filter((o) => o.userId === userId).map((o) => o.unit.number) }))
  }

  private async activeMembers(): Promise<string[]> {
    return (await this.db.run((tx) => tx.houseMembership.findMany({ where: { status: 'ACTIVE' }, select: { userId: true } }))).map((m) => m.userId)
  }
}
