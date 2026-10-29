import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CryptoService } from '../src/infra/crypto.service'
import { ReportsScheduler } from '../src/modules/finance/reports.scheduler'
import { addMember, createApp, login, makeBin as makeIin, makeHouse, makeUser, owner, phoneLogin, resetDb, stepUpToken, type TestApp } from './helpers'

let t: TestApp
const crypto = new CryptoService()
type Agent = ReturnType<typeof request.agent>

beforeAll(async () => {
  t = await createApp()
})
afterAll(async () => {
  await t.app.close()
})
beforeEach(async () => {
  await resetDb()
  t.limiter.reset()
})

const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)
const P = () => today().slice(0, 7)

/** Член правления с подтверждённой личностью: ИИН в базе — только хешем */
async function boardMember(fullName: string) {
  const iin = makeIin()
  const user = await makeUser({ fullName })
  await owner.user.update({ where: { id: user.id }, data: { iinHash: crypto.hashIin(iin), identityVerifiedAt: new Date() } })
  return { ...user, iin, fullName }
}

async function setup(withAccountant = true) {
  const chairman = await boardMember('Кенжебаев Бауыржан Серикович')
  const { house } = await makeHouse({ chairman, units: 4 })
  const accountant = await boardMember('Ахметова Гульнар Маратовна')
  if (withAccountant) await addMember(house.id, accountant.id, 'ACCOUNTANT')
  const units = await owner.unit.findMany({ where: { houseId: house.id }, orderBy: { number: 'asc' } })
  for (const u of units) await owner.unit.update({ where: { id: u.id }, data: { area: 50 } })
  const chair = await login(t, chairman)
  const up = await stepUpToken(chair, chairman.secret)
  const acc = withAccountant ? await login(t, accountant) : null
  const accUp = acc ? await stepUpToken(acc, accountant.secret) : ''
  const base = `/v1/houses/${house.id}`
  const current = (await chair.post(`${base}/accounts`).set('x-step-up-token', up).send({ type: 'CURRENT', bank_name: 'Halyk Bank', opening_balance: 100000, opened_on: '2026-01-01' })).body.id
  await chair.post(`${base}/tariffs`).set('x-step-up-token', up).send({ type: 'MAINTENANCE', basis: 'PER_SQM', rate: 120, effective_from: P() }).expect(201)
  await chair.post(`${base}/charges/generate`).set('x-step-up-token', up).send({ period: P() }).expect(200)
  const charge = (await chair.get(`${base}/charges?unit_id=${units[0]!.id}`)).body[0]
  await chair.post(`${base}/payments`).set('x-step-up-token', up).send({ charge_id: charge.id, amount: 6000, method: 'BANK_TRANSFER', paid_on: today() }).expect(201)
  const elevator = await owner.contractor.create({ data: { houseId: house.id, name: 'ТОО «Лифт-Сервис»' } })
  const lift = await chair.post(`${base}/transactions`).set('x-step-up-token', up)
    .send({ idempotency_key: 'report-lift-1', account_id: current, category_code: '7.2.1.10', amount: 85000, occurred_on: today(), description: 'Обслуживание лифтов', contractor_id: elevator.id, confirm: true })
  await chair.post(`${base}/transactions`).set('x-step-up-token', up)
    .send({ idempotency_key: 'report-tools-1', account_id: current, category_code: '7.5', amount: 18000, occurred_on: today(), description: 'Инвентарь', confirm: true })
    .expect(201)

  // Подтверждённая работа с фото — в фотоотчёт
  const task = await owner.task.create({ data: { houseId: house.id, title: 'Замена лампы в подъезде', createdBy: chairman.id, status: 'APPROVED', source: 'MANUAL' } })
  await owner.taskCompletion.create({ data: { houseId: house.id, taskId: task.id, completedBy: chairman.id, approvedBy: chairman.id, approvedAt: new Date(), includeInReport: true, visibleToResidents: true } })

  const r = await phoneLogin(t, '+77071230001')
  await addMember(house.id, r.body.user.id, 'RESIDENT')
  return { house, base, chair, up, acc: acc!, accUp, chairman, accountant, current, resident: r.agent, residentId: r.body.user.id, liftId: lift.body.id as string }
}
type S = Awaited<ReturnType<typeof setup>>

const http = () => request(t.app.getHttpServer())
const generate = (s: S) => s.chair.post(`${s.base}/reports/generate`).set('x-step-up-token', s.up).send({ period: P() })

async function sign(agent: Agent, token: string, base: string, id: string, as: { iin: string; fullName: string }) {
  const started = await agent.post(`${base}/reports/${id}/sign`).set('x-step-up-token', token)
  expect(started.status).toBe(201)
  await http().post(`/v1/dev/egov/${started.body.external_id}/sign`).send({ iin: as.iin, full_name: as.fullName }).expect(200)
  return agent.post(`${base}/reports/${id}/sign/complete`)
}

describe('monthly report', () => {
  it('fills the official form from the journal, lists what is missing and matches the dashboard', async () => {
    const s = await setup()
    const res = await generate(s)
    expect(res.status).toBe(200)
    const row = (code: string) => res.body.rows.find((r: { code: string }) => r.code === code)
    expect(row('1')).toMatchObject({ amount: 3000, label: expect.stringContaining('Остаток на текущем счете'), level: 0 })
    expect(row('3').amount).toBe(18000)
    expect(row('6').amount).toBe(6000)
    expect(row('6.1')).toMatchObject({ amount: 6000, level: 1 })
    expect(row('7').amount).toBe(103000)
    expect(row('7.2.1')).toMatchObject({ amount: 85000, lines: [{ payee: 'ТОО «Лифт-Сервис»', amount: 85000, service: expect.stringContaining('обслуживание лифтов') }] })
    expect(row('7.5').amount).toBe(18000)
    expect(res.body.rows.map((r: { code: string }) => r.code).slice(0, 7)).toEqual(['1', '2', '3', '4', '5', '6', '6.1'])
    expect(res.body.header).toMatchObject({ management_form: 'Объединение собственников имущества', period_from: `${P()}-01`, banks: { CURRENT: 'Halyk Bank', SAVINGS: null } })
    expect(res.body.legal_source).toContain('№380')
    expect(res.body.work).toEqual([expect.objectContaining({ title: 'Замена лампы в подъезде' })])
    expect(res.body.issues.filter((i: { kind: string }) => i.kind === 'MISSING_DOCUMENTS').map((i: { transaction: { missing: string[] } }) => i.transaction.missing))
      .toEqual([['RECEIPT', 'WORK_ACT'], ['RECEIPT']])
    expect(res.body.due_date).toBe(new Date(Date.UTC(Number(P().slice(0, 4)), Number(P().slice(5)), 20)).toISOString().slice(0, 10))

    // Дашборд и отчёт сходятся до тиына
    const overview = (await s.resident.get(`${s.base}/finance/overview`)).body
    expect(overview.income_total).toBe(row('6').amount)
    expect(overview.expense_total).toBe(row('7').amount)
    expect(overview.accounts[0].balance).toBe(row('1').amount)

    // Черновик жильцу не виден
    expect((await s.resident.get(`${s.base}/reports`)).body).toEqual([])
    expect((await s.resident.get(`${s.base}/reports/${res.body.id}`)).status).toBe(404)
  })

  it('both signatures by the right people, then the month is closed and the report is published to everyone', async () => {
    const s = await setup()
    const id = (await generate(s)).body.id

    // Подписать чужой ЭЦП нельзя
    const wrong = await sign(s.chair, s.up, s.base, id, { iin: makeIin(), fullName: 'Посторонний Человек' })
    expect(wrong.status).toBe(422)
    expect(wrong.body.error.code).toBe('VERIFICATION_FAILED')

    const pending = await s.chair.post(`${s.base}/reports/${id}/sign`).set('x-step-up-token', s.up)
    expect((await s.chair.post(`${s.base}/reports/${id}/sign/complete`)).body).toEqual({ status: 'PENDING' })
    await http().post(`/v1/dev/egov/${pending.body.external_id}/sign`).send({ iin: s.chairman.iin, full_name: s.chairman.fullName }).expect(200)
    const chairSigned = await s.chair.post(`${s.base}/reports/${id}/sign/complete`)
    expect(chairSigned.body).toMatchObject({ status: 'DRAFT', signatures: { chairman: { name: s.chairman.fullName }, accountant: null, accountant_required: true } })

    // Первая подпись закрывает месяц: ни новых операций, ни аннулирования, ни пересборки
    const late = await s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.up)
      .send({ idempotency_key: 'report-late-1', account_id: s.current, category_code: '7.5', amount: 100, occurred_on: today(), description: 'Поздняя покупка', confirm: true })
    expect(late.status).toBe(409)
    expect(late.body.error.code).toBe('PERIOD_CLOSED')
    expect((await s.chair.post(`${s.base}/transactions/${s.liftId}/void`).set('x-step-up-token', s.up).send({ reason: 'Попытка задним числом' })).body.error.code).toBe('PERIOD_CLOSED')
    expect((await generate(s)).body.error.code).toBe('REPORT_STATE')
    // Начисления закрытого месяца тоже не меняются
    expect((await s.chair.post(`${s.base}/charges/generate`).set('x-step-up-token', s.up).send({ period: P() })).body.error.code).toBe('PERIOD_CLOSED')

    expect((await s.chair.post(`${s.base}/reports/${id}/publish`).set('x-step-up-token', s.up)).status).toBe(409)
    const accSigned = await sign(s.acc, s.accUp, s.base, id, s.accountant)
    expect(accSigned.body).toMatchObject({ status: 'SIGNED', signatures: { accountant: { name: s.accountant.fullName } } })
    expect(await owner.signature.count({ where: { purpose: 'REPORT' } })).toBe(2)

    expect((await s.acc.post(`${s.base}/reports/${id}/publish`).set('x-step-up-token', s.accUp)).status).toBe(403)
    const published = await s.chair.post(`${s.base}/reports/${id}/publish`).set('x-step-up-token', s.up)
    expect(published.body.status).toBe('PUBLISHED')

    const seen = await s.resident.get(`${s.base}/reports/${id}`)
    expect(seen.status).toBe(200)
    expect(seen.body).toMatchObject({ status: 'PUBLISHED', issues: [], signatures: { chairman: { name: s.chairman.fullName }, accountant: { name: s.accountant.fullName } } })
    expect((await s.resident.get(`${s.base}/reports`)).body).toHaveLength(1)
    expect(await owner.notification.count({ where: { userId: s.residentId, category: 'REPORTS' } })).toBe(1)
  })

  it('signing picks up operations posted after the draft was generated', async () => {
    const s = await setup(false)
    const id = (await generate(s)).body.id
    await s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.up)
      .send({ idempotency_key: 'report-after-draft', account_id: s.current, category_code: '7.4', amount: 2500, occurred_on: today(), description: 'Электроэнергия МОП', confirm: true })
      .expect(201)
    const done = await sign(s.chair, s.up, s.base, id, s.chairman)
    expect(done.body.status).toBe('SIGNED')
    expect(done.body.rows.find((r: { code: string }) => r.code === '7.4').amount).toBe(2500)
  })

  it('without an accountant the chairman signs alone; signing needs a verified identity', async () => {
    const s = await setup(false)
    await owner.user.update({ where: { id: s.chairman.id }, data: { iinHash: null } })
    const id = (await generate(s)).body.id
    const noIdentity = await s.chair.post(`${s.base}/reports/${id}/sign`).set('x-step-up-token', s.up)
    expect(noIdentity.status).toBe(422)
    expect(noIdentity.body.error.code).toBe('IDENTITY_REQUIRED')

    await owner.user.update({ where: { id: s.chairman.id }, data: { iinHash: crypto.hashIin(s.chairman.iin) } })
    const done = await sign(s.chair, s.up, s.base, id, s.chairman)
    expect(done.body).toMatchObject({ status: 'SIGNED', signatures: { accountant: null, accountant_required: false } })
  })

  it('the schedule drafts last month on the 15th and reminds the board on the 18th and 19th, once each', async () => {
    const s = await setup()
    const scheduler = t.app.get(ReportsScheduler)
    const [y, m] = P().split('-').map(Number)
    const at = (day: number) => new Date(Date.UTC(y!, m!, day, 6))

    expect(await scheduler.run(at(14))).toEqual({ drafted: 0, reminded: 0 })
    expect((await scheduler.run(at(15))).drafted).toBe(1)
    expect((await scheduler.run(at(15))).drafted).toBe(0)
    const report = await owner.report.findFirstOrThrow({ where: { houseId: s.house.id, period: P() } })
    expect(report.generatedBy).toBeNull()
    expect(await owner.notification.count({ where: { title: { startsWith: 'Черновик отчёта' } } })).toBe(2)

    expect((await scheduler.run(at(18))).reminded).toBe(1)
    expect((await scheduler.run(at(18))).reminded).toBe(0)
    expect((await scheduler.run(at(19))).reminded).toBe(1)
  })
})
