import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CryptoService } from '../src/infra/crypto.service'
import { VotesScheduler } from '../src/modules/votes/votes.scheduler'
import { addMember, createApp, login, makeBin as makeIin, makeHouse, makeUser, owner, pdf, phoneLogin, resetDb, stepUpToken, type TestApp } from './helpers'

let t: TestApp
const crypto = new CryptoService()
const app = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
type Agent = ReturnType<typeof request.agent>
const DAY = 86_400_000
const http = () => request(t.app.getHttpServer())

beforeAll(async () => {
  t = await createApp()
})
afterAll(async () => {
  await app.$disconnect()
  await t.app.close()
})
beforeEach(async () => {
  await resetDb()
  t.limiter.reset()
})

let phoneSeq = 0
/** Собственник с подтверждённой ЭЦП личностью и подтверждённой собственностью помещения */
async function ownerOf(houseId: string, unitIds: string[], fullName: string, opts: { representative?: boolean } = {}) {
  const phone = `+7707555${String(++phoneSeq).padStart(4, '0')}`
  const r = await phoneLogin(t, phone)
  const iin = makeIin()
  await owner.user.update({ where: { id: r.body.user.id }, data: { fullName, iinHash: crypto.hashIin(iin), identityVerifiedAt: new Date() } })
  await addMember(houseId, r.body.user.id, 'RESIDENT')
  for (const unitId of unitIds) {
    await owner.unitOwnership.create({
      data: { houseId, unitId, userId: r.body.user.id, relation: 'OWNER', verificationStatus: 'VERIFIED', verificationMethod: 'EDS_REGISTRY_MATCH', verifiedAt: new Date(), isVotingRepresentative: opts.representative ?? false },
    })
  }
  return { agent: r.agent, id: r.body.user.id, iin, fullName }
}

/** Дом из 4 помещений: 120, 60, 60 и 60 м². Собственники трёх первых в приложении, четвёртый — нет */
async function setup() {
  const chairIin = makeIin()
  const chairman = await makeUser({ fullName: 'Кенжебаев Бауыржан Серикович' })
  await owner.user.update({ where: { id: chairman.id }, data: { iinHash: crypto.hashIin(chairIin), identityVerifiedAt: new Date() } })
  const { house } = await makeHouse({ chairman, units: 4 })
  const units = await owner.unit.findMany({ where: { houseId: house.id }, orderBy: { number: 'asc' } })
  const areas = [120, 60, 60, 60]
  for (const [i, u] of units.entries()) await owner.unit.update({ where: { id: u.id }, data: { area: areas[i] } })
  const chair = await login(t, chairman)
  const up = await stepUpToken(chair, chairman.secret)
  const big = await ownerOf(house.id, [units[0]!.id], 'Сейткали Айгерим Нурлановна')
  const second = await ownerOf(house.id, [units[1]!.id], 'Омаров Ерлан Болатович')
  const third = await ownerOf(house.id, [units[2]!.id], 'Ли Виктория Сергеевна')
  const tenant = await phoneLogin(t, '+77079990001')
  await addMember(house.id, tenant.body.user.id, 'RESIDENT')
  return { house, units, base: `/v1/houses/${house.id}`, chair, up, chairman: { ...chairman, iin: chairIin, fullName: 'Кенжебаев Бауыржан Серикович' }, big, second, third, tenant: tenant.agent }
}
type S = Awaited<ReturnType<typeof setup>>

const lift = {
  title: 'Замена лифта во 2 подъезде', description: 'Три коммерческих предложения в материалах', legal_basis: 'ART_44_ELECTRONIC', decision_type: 'MAJOR_EXPENSE',
  questions: [{ text: 'Утвердить замену лифта во 2 подъезде за счёт средств капитального ремонта?', type: 'YES_NO' }],
}

async function draft(s: S, body: Record<string, unknown> = {}) {
  const res = await s.chair.post(`${s.base}/votes`).set('x-step-up-token', s.up).send({ ...lift, secretary_user_id: s.second.id, ...body })
  expect(res.status).toBe(201)
  return res.body as { id: string; questions: { id: string; options: { id: string; kind: string; text: string }[] }[] }
}

/**
 * Уведомление «задним числом»: ждать пять дней в тесте нельзя, поэтому дата уведомления
 * ставится в прошлое одним переходом из черновика — так, как это сделал бы честный сервер неделю назад
 */
async function noticedWeekAgo(voteId: string, endsInMs = 2 * DAY) {
  const now = Date.now()
  await owner.vote.update({ where: { id: voteId }, data: { status: 'NOTICE_SENT', noticeSentAt: new Date(now - 7 * DAY), startsAt: new Date(now - 3600_000), endsAt: new Date(now + endsInMs) } })
}

async function active(s: S, body: Record<string, unknown> = {}) {
  const v = await draft(s, body)
  await noticedWeekAgo(v.id)
  const res = await s.chair.post(`${s.base}/votes/${v.id}/activate`).set('x-step-up-token', s.up)
  expect(res.status).toBe(200)
  return v
}

const optionOf = (v: Awaited<ReturnType<typeof draft>>, kind: string, q = 0) => v.questions[q]!.options.find((o) => o.kind === kind || o.text === kind)!.id

async function vote(s: S, voter: { agent: Agent; iin: string; fullName: string }, voteId: string, unitId: string, answers: { question_id: string; option_ids: string[] }[], signAs?: { iin: string; fullName: string }) {
  const started = await voter.agent.post(`${s.base}/votes/${voteId}/ballot/start`).send({ unit_id: unitId, answers })
  if (started.status !== 201) return started
  await http().post(`/v1/dev/egov/${started.body.external_id}/sign`).send({ iin: (signAs ?? voter).iin, full_name: (signAs ?? voter).fullName }).expect(200)
  return voter.agent.post(`${s.base}/votes/${voteId}/ballot/complete`).send({ signing_id: started.body.signing_id })
}

const closeAll = (at: number) => t.app.get(VotesScheduler).run(new Date(at))

async function uploadScan(s: S) {
  const body = pdf()
  const res = await s.chair.post(`${s.base}/files/upload-url`).send({ purpose: 'BALLOT_SCAN', mime_type: 'application/pdf', size_bytes: body.length, name: 'Бюллетень кв 4.pdf' })
  expect(res.status).toBe(201)
  t.storage.putAsClient(res.body.upload_url, body)
  expect((await s.chair.post(`${s.base}/files/${res.body.file_id}/finalize`)).status).toBe(200)
  return res.body.file_id as string
}

describe('creating a vote', () => {
  it('derives the threshold from the decision type, not from the request', async () => {
    const s = await setup()
    const res = await s.chair.post(`${s.base}/votes`).set('x-step-up-token', s.up).send({ ...lift, threshold: 'SIMPLE_MAJORITY' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ status: 'DRAFT', decision_type: 'MAJOR_EXPENSE', threshold: 'TWO_THIRDS' })
    expect(res.body.questions[0].options.map((o: { text: string }) => o.text)).toEqual(['За', 'Против', 'Воздержался'])
  })

  it('refuses to create a vote while any voting unit has no area', async () => {
    const s = await setup()
    await owner.unit.update({ where: { id: s.units[3]!.id }, data: { area: null } })
    const res = await s.chair.post(`${s.base}/votes`).set('x-step-up-token', s.up).send(lift)
    expect(res.status).toBe(422)
    expect(res.body.error).toMatchObject({ code: 'HOUSE_NOT_VOTING_READY', details: { units_without_area: 1 } })
  })

  it('adds an abstain option to choice questions and rejects duplicate options', async () => {
    const s = await setup()
    const v = await draft(s, { questions: [{ text: 'Выбрать подрядчика на замену лифта', type: 'SINGLE_CHOICE', options: ['ТОО «Лифт-Сервис»', 'ТОО «Подъём»'] }] })
    expect(v.questions[0]!.options.map((o) => o.kind)).toEqual(['CHOICE', 'CHOICE', 'ABSTAIN'])
    const dup = await s.chair.post(`${s.base}/votes`).set('x-step-up-token', s.up).send({ ...lift, questions: [{ text: 'Выбрать подрядчика', type: 'SINGLE_CHOICE', options: ['А', 'а'] }] })
    expect(dup.status).toBe(400)
  })

  it('keeps drafts from residents and lets only the chairman create', async () => {
    const s = await setup()
    const v = await draft(s)
    expect((await s.big.agent.get(`${s.base}/votes/${v.id}`)).status).toBe(404)
    expect((await s.big.agent.get(`${s.base}/votes`)).body).toEqual([])
    expect((await s.big.agent.post(`${s.base}/votes`).send(lift)).status).toBe(403)
  })

  it('requires a secretary with a verified identity who is not the chairman', async () => {
    const s = await setup()
    const self = await s.chair.post(`${s.base}/votes`).set('x-step-up-token', s.up).send({ ...lift, secretary_user_id: s.chairman.id })
    expect(self.status).toBe(422)
    const tenantId = (await owner.houseMembership.findMany({ where: { houseId: s.house.id, role: 'RESIDENT' }, include: { user: true } })).find((m) => !m.user.iinHash)!.userId
    const unverified = await s.chair.post(`${s.base}/votes`).set('x-step-up-token', s.up).send({ ...lift, secretary_user_id: tenantId })
    expect(unverified.body.error.code).toBe('IDENTITY_REQUIRED')
    const candidates = await s.chair.get(`${s.base}/votes/secretary-candidates`)
    expect(candidates.body.map((c: { user_id: string }) => c.user_id).sort()).toEqual([s.big.id, s.second.id, s.third.id].sort())
  })
})

describe('notice', () => {
  it('blocks a start date less than five calendar days after the notice', async () => {
    const s = await setup()
    const v = await draft(s)
    const res = await s.chair.post(`${s.base}/votes/${v.id}/send-notice`).set('x-step-up-token', s.up)
      .send({ starts_at: new Date(Date.now() + 4 * DAY).toISOString(), ends_at: new Date(Date.now() + 10 * DAY).toISOString() })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('NOTICE_TOO_SHORT')
  })

  it('notifies owners by push and SMS, records who was notified and freezes the agenda', async () => {
    const s = await setup()
    const v = await draft(s)
    const res = await s.chair.post(`${s.base}/votes/${v.id}/send-notice`).set('x-step-up-token', s.up)
      .send({ starts_at: new Date(Date.now() + 7 * DAY).toISOString(), ends_at: new Date(Date.now() + 14 * DAY).toISOString() })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'NOTICE_SENT', notified: 5 })
    const notices = await owner.voteNotice.findMany({ where: { voteId: v.id } })
    expect(notices.filter((n) => n.unitNumbers.length).map((n) => n.userId).sort()).toEqual([s.big.id, s.second.id, s.third.id].sort())
    const sms = await owner.notification.findMany({ where: { category: 'VOTES', userId: s.big.id } })
    expect(sms[0]!.channels).toContain('sms')

    expect((await s.chair.patch(`${s.base}/votes/${v.id}`).set('x-step-up-token', s.up).send({ title: 'Другая тема собрания' })).status).toBe(409)
    // Ни сервис, ни прямой запрос не сдвинут срок после уведомления
    await expect(owner.$executeRaw`UPDATE votes SET ends_at = ends_at + interval '1 day' WHERE id = ${v.id}::uuid`).rejects.toThrow(/cannot be changed/)
    await expect(owner.$executeRaw`UPDATE vote_questions SET text = 'Другой вопрос' WHERE vote_id = ${v.id}::uuid`).rejects.toThrow(/frozen/)
    // До даты из уведомления голосование не начнётся
    expect((await s.chair.post(`${s.base}/votes/${v.id}/activate`).set('x-step-up-token', s.up)).status).toBe(409)
  })
})

describe('electronic voting', () => {
  it('weighs signed ballots by the frozen registry and closes with a protocol', async () => {
    const s = await setup()
    const v = await active(s)
    // Площадь поправили после старта — на голосование это не влияет
    await owner.unit.update({ where: { id: s.units[0]!.id }, data: { area: 10 } })

    const cast = await vote(s, s.big, v.id, s.units[0]!.id, [{ question_id: v.questions[0]!.id, option_ids: [optionOf(v, 'FOR')] }])
    expect(cast.status).toBe(200)
    expect(cast.body).toMatchObject({ status: 'CAST', unit_number: s.units[0]!.number, area: 120, weight_percent: 40 })

    const again = await vote(s, s.big, v.id, s.units[0]!.id, [{ question_id: v.questions[0]!.id, option_ids: [optionOf(v, 'AGAINST')] }])
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_VOTED')

    expect((await vote(s, s.second, v.id, s.units[1]!.id, [{ question_id: v.questions[0]!.id, option_ids: [optionOf(v, 'FOR')] }])).status).toBe(200)

    // Пока голосование идёт — только явка
    const during = await s.chair.get(`${s.base}/votes/${v.id}/results`)
    expect(during.body).toMatchObject({ hidden: true, questions: [], turnout: { cast_units: 2, cast_area: 180, total_area: 300, percent: 60, quorum_reached: true } })
    expect((await s.chair.post(`${s.base}/votes/${v.id}/close`).set('x-step-up-token', s.up)).status).toBe(409)

    const ends = Date.parse((await s.chair.get(`${s.base}/votes/${v.id}`)).body.ends_at)
    expect(await closeAll(ends + 1000)).toMatchObject({ closed: 1 })
    const results = await s.big.agent.get(`${s.base}/votes/${v.id}/results`)
    expect(results.body).toMatchObject({ status: 'CLOSED', hidden: false })
    expect(results.body.questions[0]).toMatchObject({ adopted: true, options: [{ kind: 'FOR', area: 180, percent: 100 }, { kind: 'AGAINST', area: 0 }, { kind: 'ABSTAIN', area: 0 }] })

    const protocol = await s.chair.get(`${s.base}/votes/${v.id}/protocol`)
    expect(protocol.body).toMatchObject({ number: 1, status: 'AWAITING_SIGNATURES', content: { held: true, quorum: { percent: 60 }, notice: { units_without_owner_in_app: 4 } } })
    expect(protocol.body.content.participants).toHaveLength(2)
    expect(protocol.body.content.participants[0]).toMatchObject({ channel: 'ELECTRONIC', voter_name: 'Сейткали Айгерим Нурлановна', entered_by_chairman: false })
    // Бюллетени append-only: приложению их не изменить и не удалить
    await expect(app.$executeRaw`UPDATE ballots SET weight = 1`).rejects.toThrow(/permission denied/)
    await expect(app.$executeRaw`DELETE FROM ballots`).rejects.toThrow(/permission denied/)
    await expect(owner.$executeRaw`UPDATE protocols SET quorum_reached = false WHERE vote_id = ${v.id}::uuid`).rejects.toThrow(/cannot be changed/)
  })

  it('refuses ballots from tenants, from late owners and signed with someone else’s key', async () => {
    const s = await setup()
    const v = await active(s)
    const answer = [{ question_id: v.questions[0]!.id, option_ids: [optionOf(v, 'FOR')] }]

    const tenant = await s.tenant.post(`${s.base}/votes/${v.id}/ballot/start`).send({ unit_id: s.units[3]!.id, answers: answer })
    expect(tenant.status).toBe(422)
    expect(tenant.body.error.code).toBe('IDENTITY_REQUIRED')

    // Купил помещение после старта: в этом голосовании не участвует
    const late = await ownerOf(s.house.id, [s.units[3]!.id], 'Новиков Андрей Петрович')
    const lateRes = await vote(s, late, v.id, s.units[3]!.id, answer)
    expect(lateRes.status).toBe(403)
    expect(lateRes.body.error.code).toBe('NOT_ELIGIBLE')
    const mine = (await late.agent.get(`${s.base}/votes/${v.id}`)).body.my_units
    expect(mine[0]).toMatchObject({ can_vote: false, reason: expect.stringContaining('после начала') })

    // Чужая квартира
    expect((await vote(s, s.second, v.id, s.units[0]!.id, answer)).status).toBe(403)

    // ЭЦП другого человека
    const forged = await vote(s, s.third, v.id, s.units[2]!.id, answer, { iin: makeIin(), fullName: 'Посторонний Человек' })
    expect(forged.status).toBe(422)
    expect(forged.body.error.code).toBe('VERIFICATION_FAILED')
    expect(await owner.ballot.count({ where: { voteId: v.id } })).toBe(0)
  })

  it('validates answers: every question, one option unless multi-choice, abstain alone', async () => {
    const s = await setup()
    const v = await active(s, {
      questions: [
        { text: 'Утвердить смету ремонта кровли?', type: 'YES_NO' },
        { text: 'Какие работы включить в план?', type: 'MULTI_CHOICE', options: ['Кровля', 'Фасад', 'Подъезды'] },
      ],
    })
    const q1 = { question_id: v.questions[0]!.id, option_ids: [optionOf(v, 'FOR')] }
    const start = (answers: unknown) => s.big.agent.post(`${s.base}/votes/${v.id}/ballot/start`).send({ unit_id: s.units[0]!.id, answers })
    expect((await start([q1])).status).toBe(422)
    expect((await start([{ ...q1, option_ids: [optionOf(v, 'FOR'), optionOf(v, 'AGAINST')] }, { question_id: v.questions[1]!.id, option_ids: [optionOf(v, 'Кровля', 1)] }])).status).toBe(422)
    expect((await start([q1, { question_id: v.questions[1]!.id, option_ids: [optionOf(v, 'Кровля', 1), optionOf(v, 'ABSTAIN', 1)] }])).status).toBe(422)
    expect((await start([q1, { question_id: v.questions[1]!.id, option_ids: [optionOf(v, 'FOR')] }])).status).toBe(422)
    expect((await start([q1, { question_id: v.questions[1]!.id, option_ids: [optionOf(v, 'Кровля', 1), optionOf(v, 'Фасад', 1)] }])).status).toBe(201)
  })

  it('lets only the designated representative vote for a jointly owned unit', async () => {
    const s = await setup()
    const rep = await ownerOf(s.house.id, [s.units[3]!.id], 'Жумабаева Сауле Ерлановна', { representative: true })
    const co = await ownerOf(s.house.id, [s.units[3]!.id], 'Жумабаев Нурлан Серикович')
    const v = await active(s)
    const answer = [{ question_id: v.questions[0]!.id, option_ids: [optionOf(v, 'AGAINST')] }]
    expect((await vote(s, co, v.id, s.units[3]!.id, answer)).status).toBe(403)
    expect((await vote(s, rep, v.id, s.units[3]!.id, answer)).status).toBe(200)
  })

  it('records a failed meeting without a quorum and never lets ballots in after the end', async () => {
    const s = await setup()
    const v = await active(s)
    expect((await vote(s, s.second, v.id, s.units[1]!.id, [{ question_id: v.questions[0]!.id, option_ids: [optionOf(v, 'FOR')] }])).status).toBe(200)
    const ends = Date.parse((await s.chair.get(`${s.base}/votes/${v.id}`)).body.ends_at)
    await closeAll(ends + 1000)
    const p = await s.chair.get(`${s.base}/votes/${v.id}/protocol`)
    expect(p.body.content).toMatchObject({ held: false, quorum: { percent: 20, quorum_reached: false }, results: [{ adopted: null }] })
    const late = await s.big.agent.post(`${s.base}/votes/${v.id}/ballot/start`).send({ unit_id: s.units[0]!.id, answers: [{ question_id: v.questions[0]!.id, option_ids: [optionOf(v, 'FOR')] }] })
    expect(late.status).toBe(409)
  })

  it('adopts a two-thirds decision with abstentions counted in the denominator', async () => {
    const s = await setup()
    const v = await active(s)
    const q = v.questions[0]!.id
    await vote(s, s.big, v.id, s.units[0]!.id, [{ question_id: q, option_ids: [optionOf(v, 'FOR')] }])
    await vote(s, s.second, v.id, s.units[1]!.id, [{ question_id: q, option_ids: [optionOf(v, 'ABSTAIN')] }])
    await vote(s, s.third, v.id, s.units[2]!.id, [{ question_id: q, option_ids: [optionOf(v, 'FOR')] }])
    await closeAll(Date.now() + 3 * DAY)
    const r = await s.chair.get(`${s.base}/votes/${v.id}/results`)
    // 180 из 240 м² — 75%: больше 2/3
    expect(r.body.questions[0]).toMatchObject({ adopted: true, options: [{ percent: 75 }, { percent: 0 }, { percent: 25 }] })
  })
})

describe('protocol', () => {
  async function closed(s: S) {
    const v = await active(s)
    const q = v.questions[0]!.id
    await vote(s, s.big, v.id, s.units[0]!.id, [{ question_id: q, option_ids: [optionOf(v, 'FOR')] }])
    await vote(s, s.third, v.id, s.units[2]!.id, [{ question_id: q, option_ids: [optionOf(v, 'AGAINST')] }])
    await closeAll(Date.now() + 3 * DAY)
    return { v, protocol: (await s.chair.get(`${s.base}/votes/${v.id}/protocol`)).body as { id: string; content_hash: string } }
  }

  async function signProtocol(s: S, agent: Agent, id: string, as: { iin: string; fullName: string }) {
    const started = await agent.post(`${s.base}/protocols/${id}/sign`)
    expect(started.status).toBe(201)
    await http().post(`/v1/dev/egov/${started.body.external_id}/sign`).send({ iin: as.iin, full_name: as.fullName }).expect(200)
    return agent.post(`${s.base}/protocols/${id}/sign/complete`)
  }

  it('is signed by the chairman and the secretary, then published to residents', async () => {
    const s = await setup()
    const { v, protocol } = await closed(s)
    expect((await s.big.agent.get(`${s.base}/votes/${v.id}/protocol`)).status).toBe(404)
    // Секретарь — жилец: видит протокол, чтобы подписать
    expect((await s.second.agent.get(`${s.base}/votes/${v.id}/protocol`)).status).toBe(200)
    expect((await s.big.agent.post(`${s.base}/protocols/${protocol.id}/sign`)).status).toBe(403)

    const bySecretary = await signProtocol(s, s.second.agent, protocol.id, s.second)
    expect(bySecretary.body).toMatchObject({ status: 'AWAITING_SIGNATURES', signatures: { secretary: { name: 'Омаров Ерлан Болатович' }, chairman: null } })
    const byChairman = await signProtocol(s, s.chair, protocol.id, s.chairman)
    expect(byChairman.body).toMatchObject({ status: 'SIGNED', content_hash: protocol.content_hash })

    // Секретаря, который уже подписал, не заменить
    expect((await s.chair.patch(`${s.base}/votes/${v.id}`).set('x-step-up-token', s.up).send({ secretary_user_id: s.third.id })).status).toBe(409)

    const published = await s.chair.post(`${s.base}/protocols/${protocol.id}/publish`).set('x-step-up-token', s.up)
    expect(published.body.status).toBe('PUBLISHED')
    const seen = await s.big.agent.get(`${s.base}/votes/${v.id}/protocol`)
    // 120 «за» из 180 м² — ровно 2/3: порог взят
    expect(seen.body).toMatchObject({ status: 'PUBLISHED', content: { held: true, results: [{ adopted: true }] } })
  })

  it('rejects a protocol signature made with another person’s key', async () => {
    const s = await setup()
    const { protocol } = await closed(s)
    const res = await signProtocol(s, s.chair, protocol.id, { iin: makeIin(), fullName: 'Посторонний Человек' })
    expect(res.status).toBe(422)
  })

  it('reproduces the protocol figures from stored ballots after areas change', async () => {
    const s = await setup()
    const { v } = await closed(s)
    const stored = (await owner.protocol.findFirstOrThrow({ where: { voteId: v.id } })).results
    await owner.unit.updateMany({ where: { houseId: s.house.id }, data: { area: 1 } })
    const recount = await s.chair.get(`${s.base}/votes/${v.id}/results`)
    expect(recount.body.questions).toEqual(stored)
  })
})

describe('written survey', () => {
  it('accepts paper ballots with a scan only in a written survey and notes their share', async () => {
    const s = await setup()
    const electronic = await active(s)
    const firstScan = await uploadScan(s)
    const refused = await s.chair.post(`${s.base}/votes/${electronic.id}/paper-ballots`).set('x-step-up-token', s.up)
      .send({ unit_id: s.units[3]!.id, voter_name: 'Петров Иван Иванович', scan_file_id: firstScan, answers: [{ question_id: electronic.questions[0]!.id, option_ids: [optionOf(electronic, 'FOR')] }] })
    expect(refused.status).toBe(409)

    const survey = await active(s, { legal_basis: 'ART_43_WRITTEN_SURVEY' })
    const answer = [{ question_id: survey.questions[0]!.id, option_ids: [optionOf(survey, 'FOR')] }]
    const secondScan = await uploadScan(s)
    const paper = await s.chair.post(`${s.base}/votes/${survey.id}/paper-ballots`).set('x-step-up-token', s.up)
      .send({ unit_id: s.units[0]!.id, voter_name: 'Сейткали Айгерим Нурлановна', scan_file_id: secondScan, answers: answer })
    expect(paper.status).toBe(201)
    expect((await vote(s, s.second, survey.id, s.units[1]!.id, answer)).status).toBe(200)
    expect(await owner.auditLog.count({ where: { action: 'vote.paper_ballot' } })).toBe(1)
    await closeAll(Date.now() + 3 * DAY)
    const p = await s.chair.get(`${s.base}/votes/${survey.id}/protocol`)
    expect(p.body.content.paper).toMatchObject({ units: 1, area: 120, note: expect.stringContaining('66.67%') })
    expect(p.body.content.participants.find((x: { channel: string }) => x.channel === 'PAPER')).toMatchObject({ entered_by_chairman: true })
  })
})

describe('reminders and isolation', () => {
  it('reminds every non-voter once per stage and never the ones who voted', async () => {
    const s = await setup()
    const v = await draft(s)
    await noticedWeekAgo(v.id, 5 * DAY)
    await s.chair.post(`${s.base}/votes/${v.id}/activate`).set('x-step-up-token', s.up).expect(200)
    await vote(s, s.big, v.id, s.units[0]!.id, [{ question_id: v.questions[0]!.id, option_ids: [optionOf(v, 'FOR')] }])
    const ends = Date.parse((await s.chair.get(`${s.base}/votes/${v.id}`)).body.ends_at)
    expect(await closeAll(ends - 70 * 3600_000)).toMatchObject({ reminded: 1 })
    expect(await closeAll(ends - 69 * 3600_000)).toMatchObject({ reminded: 0 })
    const reminded = await owner.notification.findMany({ where: { payload: { path: ['key'], equals: `vote-${v.id}-3d` } } })
    expect(reminded.map((n) => n.userId).sort()).toEqual([s.second.id, s.third.id].sort())
    expect((await s.chair.post(`${s.base}/votes/${v.id}/remind`)).body.sent).toBe(2)
    expect((await s.chair.post(`${s.base}/votes/${v.id}/remind`)).status).toBe(409)
  })

  it('hides a vote of house A from the chairman of house B', async () => {
    const a = await setup()
    const v = await draft(a)
    const chairB = await makeUser()
    const { house: houseB } = await makeHouse({ chairman: chairB })
    const b = await login(t, chairB)
    expect((await b.get(`/v1/houses/${houseB.id}/votes/${v.id}`)).status).toBe(404)
    expect((await b.get(`${a.base}/votes/${v.id}`)).status).toBe(404)
  })

  it('cancels an active vote with a reason and never reveals its tally', async () => {
    const s = await setup()
    const v = await active(s, { results_visible_during: true })
    await vote(s, s.big, v.id, s.units[0]!.id, [{ question_id: v.questions[0]!.id, option_ids: [optionOf(v, 'FOR')] }])
    expect((await s.chair.post(`${s.base}/votes/${v.id}/cancel`).set('x-step-up-token', s.up).send({ reason: 'Ошибка в повестке' })).body.status).toBe('CANCELLED')
    const r = await s.big.agent.get(`${s.base}/votes/${v.id}/results`)
    expect(r.body).toMatchObject({ hidden: true, questions: [] })
  })
})
