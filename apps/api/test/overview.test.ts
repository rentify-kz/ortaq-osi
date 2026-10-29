import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ChargesScheduler } from '../src/modules/finance/charges.scheduler'
import { addMember, createApp, login, makeHouse, makeUser, owner, phoneLogin, resetDb, stepUpToken, type TestApp } from './helpers'

let t: TestApp

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
const nowPeriod = () => today().slice(0, 7)

async function setup() {
  const chairman = await makeUser()
  const { house } = await makeHouse({ chairman, units: 4 })
  const units = await owner.unit.findMany({ where: { houseId: house.id }, orderBy: { number: 'asc' } })
  for (const u of units) await owner.unit.update({ where: { id: u.id }, data: { area: 50 } })
  const chair = await login(t, chairman)
  const up = await stepUpToken(chair, chairman.secret)
  const base = `/v1/houses/${house.id}`
  const current = await chair.post(`${base}/accounts`).set('x-step-up-token', up).send({ type: 'CURRENT', bank_name: 'Halyk Bank', opening_balance: 100000, opened_on: '2026-01-01' })
  await chair.post(`${base}/tariffs`).set('x-step-up-token', up).send({ type: 'MAINTENANCE', basis: 'PER_SQM', rate: 120, effective_from: nowPeriod() }).expect(201)
  await chair.post(`${base}/charges/generate`).set('x-step-up-token', up).send({ period: nowPeriod() }).expect(200)

  const r = await phoneLogin(t, '+77071230001')
  const n = await phoneLogin(t, '+77071230002')
  for (const [u, unit] of [[r, units[0]!], [n, units[1]!]] as const) {
    await addMember(house.id, u.body.user.id, 'RESIDENT')
    await owner.unitOwnership.create({ data: { houseId: house.id, unitId: unit.id, userId: u.body.user.id, relation: 'OWNER', verificationStatus: 'VERIFIED' } })
  }
  await owner.user.update({ where: { id: n.body.user.id }, data: { fullName: 'Нурланов Ерлан' } })
  return { house, base, chair, up, units, accountId: current.body.id as string, resident: r.agent, neighbour: { agent: n.agent, id: n.body.user.id } }
}

describe('finance overview', () => {
  it('residents and the board see the same numbers; the board also sees its queue', async () => {
    const s = await setup()
    const charge = (await s.chair.get(`${s.base}/charges?unit_id=${s.units[0]!.id}`)).body[0]
    await s.chair.post(`${s.base}/payments`).set('x-step-up-token', s.up).send({ charge_id: charge.id, amount: 6000, method: 'BANK_TRANSFER', paid_on: today() }).expect(201)
    await s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.up)
      .send({ idempotency_key: 'overview-expense-1', account_id: s.accountId, category_code: '7.5', amount: 18000, occurred_on: today(), description: 'Лопаты и мётлы', confirm: true })
      .expect(201)

    const seen = (await s.resident.get(`${s.base}/finance/overview`)).body
    expect(seen).toMatchObject({
      period: nowPeriod(), income_total: 6000, expense_total: 18000, collection_rate: 25,
      accounts: [{ type: 'CURRENT', bank_name: 'Halyk Bank', balance: 88000 }],
      income_by_category: [{ code: '6.1', name: 'Взносы на управление', amount: 6000, transaction_count: 1 }],
      expense_by_category: [{ code: '7.5', name: 'Хозяйственные расходы', amount: 18000, transaction_count: 1 }],
    })
    expect(seen.board).toBeUndefined()
    expect(seen.months).toHaveLength(6)
    expect(seen.months.at(-1)).toEqual({ period: nowPeriod(), income: 6000, expense: 18000 })

    const board = (await s.chair.get(`${s.base}/finance/overview`)).body
    const { board: queue, ...same } = board
    const { board: _none, ...residentView } = seen
    expect(same).toEqual(residentView)
    expect(queue).toEqual({ drafts: 0, missing_documents: 1, payments_to_review: 0, debt_total: 0 })
  })
})

describe('debtors', () => {
  it('lists overdue units by name only to the board, audits each view, and grades the debt', async () => {
    const s = await setup()
    // Через месяц текущее начисление просрочено у всех, кто не заплатил
    await t.app.get(ChargesScheduler).run(new Date(Date.now() + 35 * 86_400_000))
    // У третьей квартиры долг копился полгода — основание для досудебной работы
    for (const p of ['2026-01', '2026-02', '2026-03', '2026-04']) {
      await owner.charge.create({
        data: { houseId: s.house.id, unitId: s.units[2]!.id, period: p, type: 'MAINTENANCE', title: 'Взнос', amount: 6000, calculationBasis: { kind: 'FIXED', rate: 6000 }, dueDate: new Date(`${p}-28`), status: 'OVERDUE' },
      })
    }

    expect((await s.resident.get(`${s.base}/debtors`)).status).toBe(403)
    const list = (await s.chair.get(`${s.base}/debtors`)).body
    expect(list[0]).toMatchObject({ unit: { number: s.units[2]!.number }, debt: 30000, months: 5, oldest_period: '2026-01', level: 'PRETRIAL' })
    expect(list.find((d: { unit: { id: string } }) => d.unit.id === s.units[1]!.id)).toMatchObject({ debt: 6000, months: 1, level: 'REMIND', owners: [{ id: s.neighbour.id, name: 'Нурланов Ерлан' }], last_reminded_at: null })
    expect(list).toHaveLength(4)
    expect(await owner.auditLog.count({ where: { action: 'finance.debtors_view' } })).toBe(1)

    // Жильцу — только процент собираемости
    expect((await s.resident.get(`${s.base}/finance/overview`)).body.collection_rate).toBe(0)

    const sent = await s.chair.post(`${s.base}/debtors/remind`).send({ unit_ids: [s.units[1]!.id] })
    expect(sent.body).toEqual({ sent: 1, skipped: 0 })
    const note = await owner.notification.findFirst({ where: { userId: s.neighbour.id, title: 'Напоминание об оплате' } })
    expect(note?.body.replace(/\s/g, ' ')).toContain('6 000 ₸ за 1 мес.')
    // Повтор сразу — не отправляется: напоминание, а не давление
    expect((await s.chair.post(`${s.base}/debtors/remind`).send({ unit_ids: [s.units[1]!.id] })).body).toEqual({ sent: 0, skipped: 1 })
    expect((await s.chair.get(`${s.base}/debtors`)).body.find((d: { unit: { id: string } }) => d.unit.id === s.units[1]!.id).last_reminded_at).not.toBeNull()
  })
})
