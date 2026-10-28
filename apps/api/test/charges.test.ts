import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ChargesScheduler } from '../src/modules/finance/charges.scheduler'
import { addMember, createApp, login, makeHouse, makeUser, owner, phoneLogin, resetDb, stepUpToken, uploadPdf, type TestApp } from './helpers'

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
  t.storage.objects.clear()
})

const nowPeriod = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7)
function shift(p: string, months: number) {
  const [y, m] = p.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1 + months, 1)).toISOString().slice(0, 7)
}

async function setup() {
  const chairman = await makeUser()
  const accountant = await makeUser()
  const { house } = await makeHouse({ chairman, units: 8 })
  await addMember(house.id, accountant.id, 'ACCOUNTANT')
  // Площади у шести квартир из восьми; две ещё не заполнены — им тариф за м² не начислит
  const units = await owner.unit.findMany({ where: { houseId: house.id }, orderBy: { number: 'asc' } })
  for (const [i, u] of units.entries()) if (i < 6) await owner.unit.update({ where: { id: u.id }, data: { area: 50 + i * 10 } })
  const parking = await owner.unit.create({ data: { houseId: house.id, number: 'P-1', type: 'PARKING' } })
  const chair = await login(t, chairman)
  const acc = await login(t, accountant)
  const up = await stepUpToken(chair, chairman.secret)
  const r = await phoneLogin(t, '+77071230001')
  await addMember(house.id, r.body.user.id, 'RESIDENT')
  // Жилец владеет квартирой №1 (50 м²) и парковочным местом, собственность подтверждена
  await owner.unitOwnership.createMany({
    data: [units[0]!, parking].map((u) => ({ houseId: house.id, unitId: u.id, userId: r.body.user.id, relation: 'OWNER' as const, verificationStatus: 'VERIFIED' as const })),
  })
  const base = `/v1/houses/${house.id}`
  return { house, base, chair, acc, up, resident: { agent: r.agent, id: r.body.user.id }, units, parking }
}
type S = Awaited<ReturnType<typeof setup>>

async function tariffs(s: S) {
  const p = nowPeriod()
  for (const body of [
    { type: 'MAINTENANCE', basis: 'PER_SQM', rate: 120, effective_from: p, decision_note: 'Протокол №2 от 01.09.2026' },
    { type: 'CAPITAL_REPAIR', basis: 'PER_SQM', rate: 40.5, effective_from: p },
    { type: 'PARKING', basis: 'FIXED', rate: 3000, effective_from: p },
  ]) {
    const res = await s.chair.post(`${s.base}/tariffs`).set('x-step-up-token', s.up).send(body)
    expect(res.status).toBe(201)
  }
}

describe('tariffs', () => {
  it('chairman sets tariffs from this month on; a new one closes the previous; no backdating', async () => {
    const s = await setup()
    expect((await s.chair.post(`${s.base}/tariffs`).send({ type: 'MAINTENANCE', basis: 'PER_SQM', rate: 120, effective_from: nowPeriod() })).status).toBe(428)
    expect((await s.acc.post(`${s.base}/tariffs`).send({ type: 'MAINTENANCE', basis: 'PER_SQM', rate: 120, effective_from: nowPeriod() })).status).toBe(403)
    await tariffs(s)
    const back = await s.chair.post(`${s.base}/tariffs`).set('x-step-up-token', s.up).send({ type: 'MAINTENANCE', basis: 'PER_SQM', rate: 100, effective_from: shift(nowPeriod(), -1) })
    expect(back.status).toBe(422)

    const next = shift(nowPeriod(), 1)
    await s.chair.post(`${s.base}/tariffs`).set('x-step-up-token', s.up).send({ type: 'MAINTENANCE', basis: 'PER_SQM', rate: 135, effective_from: next }).expect(201)
    const list = (await s.acc.get(`${s.base}/tariffs`)).body as { type: string; rate: number; effective_from: string; effective_to: string | null; unit_types: string[] }[]
    const maintenance = list.filter((x) => x.type === 'MAINTENANCE')
    expect(maintenance).toEqual([
      expect.objectContaining({ rate: 135, effective_from: next, effective_to: null }),
      expect.objectContaining({ rate: 120, effective_from: nowPeriod(), effective_to: next, unit_types: ['APARTMENT', 'COMMERCIAL'] }),
    ])
    expect(list.find((x) => x.type === 'PARKING')?.unit_types).toEqual(['PARKING', 'STORAGE'])
  })
})

describe('monthly charges', () => {
  it('charges by area and fixed rate, skips units without area, and is safe to run twice', async () => {
    const s = await setup()
    await tariffs(s)
    const p = nowPeriod()
    const run = await s.chair.post(`${s.base}/charges/generate`).set('x-step-up-token', s.up).send({ period: p })
    expect(run.status).toBe(200)
    // 6 квартир × (взнос + капремонт) + парковка
    expect(run.body).toMatchObject({ created: 13, units_charged: 7, units_skipped: 2 })
    expect(run.body.skipped_units.map((u: { number: string }) => u.number)).toEqual([s.units[6]!.number, s.units[7]!.number])

    const again = await s.chair.post(`${s.base}/charges/generate`).set('x-step-up-token', s.up).send({ period: p })
    expect(again.body.created).toBe(0)
    expect(await owner.charge.count({ where: { houseId: s.house.id } })).toBe(13)

    const first = (await s.acc.get(`${s.base}/charges?period=${p}&unit_id=${s.units[0]!.id}`)).body
    expect(first).toEqual([
      expect.objectContaining({ type: 'MAINTENANCE', amount: 6000, basis: { kind: 'PER_SQM', rate: 120, area: 50 }, status: 'PENDING' }),
      expect.objectContaining({ type: 'CAPITAL_REPAIR', amount: 2025, basis: { kind: 'PER_SQM', rate: 40.5, area: 50 } }),
    ])

    // Жилец видит свои начисления и одно уведомление на все свои помещения
    const mine = await s.resident.agent.get(`${s.base}/my-charges`)
    expect(mine.body.charges).toHaveLength(3)
    expect(mine.body.due).toBe(11025)
    const notes = await owner.notification.findMany({ where: { userId: s.resident.id, category: 'PAYMENTS' } })
    expect(notes).toHaveLength(1)
    expect(notes[0]!.body.replace(/\s/g, ' ')).toContain('11 025')

    // Неподтверждённая собственность — начислений не видно
    const stranger = await phoneLogin(t, '+77071230009')
    await addMember(s.house.id, stranger.body.user.id, 'RESIDENT')
    await owner.unitOwnership.create({ data: { houseId: s.house.id, unitId: s.units[1]!.id, userId: stranger.body.user.id, relation: 'OWNER' } })
    expect((await stranger.agent.get(`${s.base}/my-charges`)).body).toMatchObject({ charges: [], due: 0 })
    expect((await s.resident.agent.get(`${s.base}/charges`)).status).toBe(403)
  })

  it('only the current or previous month, and only with tariffs', async () => {
    const s = await setup()
    const noTariffs = await s.chair.post(`${s.base}/charges/generate`).set('x-step-up-token', s.up).send({ period: nowPeriod() })
    expect(noTariffs.status).toBe(422)
    await tariffs(s)
    expect((await s.chair.post(`${s.base}/charges/generate`).set('x-step-up-token', s.up).send({ period: shift(nowPeriod(), 1) })).status).toBe(422)
    expect((await s.chair.post(`${s.base}/charges/generate`).set('x-step-up-token', s.up).send({ period: shift(nowPeriod(), -3) })).status).toBe(422)
  })

  it('the schedule charges each house once a month and turns unpaid charges overdue after the due date', async () => {
    const s = await setup()
    await tariffs(s)
    const scheduler = t.app.get(ChargesScheduler)
    expect((await scheduler.run()).houses).toBe(1)
    expect((await scheduler.run()).houses).toBe(0)
    expect(await owner.chargeRun.count({ where: { houseId: s.house.id, period: nowPeriod() } })).toBe(1)
    expect((await owner.auditLog.findFirst({ where: { action: 'finance.charges_generate' } }))?.actorId).toBeNull()

    // Через месяц: этот месяц просрочен, следующий начислен
    const later = new Date(Date.now() + 35 * 86_400_000)
    const result = await scheduler.run(later)
    expect(result.overdue).toBe(13)
    const mine = (await s.resident.agent.get(`${s.base}/my-charges`)).body
    expect(mine.overdue).toBe(11025)
    expect(mine.charges.filter((c: { status: string }) => c.status === 'OVERDUE')).toHaveLength(3)
  })

  it('a charge is corrected or cancelled only while nothing is paid, with a reason', async () => {
    const s = await setup()
    await tariffs(s)
    await s.chair.post(`${s.base}/charges/generate`).set('x-step-up-token', s.up).send({ period: nowPeriod() })
    const [a, b, c] = (await s.chair.get(`${s.base}/charges?unit_id=${s.units[0]!.id}`)).body.concat((await s.chair.get(`${s.base}/charges?unit_id=${s.parking.id}`)).body)

    const fixed = await s.chair.patch(`${s.base}/charges/${a.id}`).set('x-step-up-token', s.up).send({ amount: 5400, reason: 'Площадь по техпаспорту 45 м²' })
    expect(fixed.body.amount).toBe(5400)
    expect((await s.acc.patch(`${s.base}/charges/${a.id}`).send({ amount: 1, reason: 'Попытка бухгалтера' })).status).toBe(403)

    const cancelled = await s.chair.post(`${s.base}/charges/${b.id}/cancel`).set('x-step-up-token', s.up).send({ reason: 'Освобождён решением собрания' })
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancel_reason: 'Освобождён решением собрания' })
    expect((await s.chair.post(`${s.base}/charges/${b.id}/cancel`).set('x-step-up-token', s.up).send({ reason: 'Ещё раз отменить' })).status).toBe(409)

    await owner.charge.update({ where: { id: c.id }, data: { paidAmount: 1000, status: 'PARTIALLY_PAID' } })
    expect((await s.chair.patch(`${s.base}/charges/${c.id}`).set('x-step-up-token', s.up).send({ amount: 2000, reason: 'Другая сумма' })).status).toBe(409)

    const mine = (await s.resident.agent.get(`${s.base}/my-charges`)).body
    expect(mine.charges).toHaveLength(2)
    expect(mine.due).toBe(5400 + 2000)
    expect(await owner.auditLog.count({ where: { action: { in: ['finance.charge_update', 'finance.charge_cancel'] } } })).toBe(2)
  })
})

describe('targeted collections', () => {
  it('a collection by assembly decision charges every matching unit; the protocol is open to residents', async () => {
    const s = await setup()
    const protocol = await uploadPdf(t, s.chair, s.house.id)
    const res = await s.chair.post(`${s.base}/charge-collections`).set('x-step-up-token', s.up).send({
      type: 'TARGETED', title: 'Замена домофона', basis: 'FIXED', rate: 5000, unit_types: ['APARTMENT'],
      period: nowPeriod(), due_date: `${shift(nowPeriod(), 1)}-15`, decision_note: 'Протокол №4 от 20.10.2026', protocol_file_id: protocol.id,
    })
    expect(res.status).toBe(201)
    expect(res.body.created).toBe(8)
    const mine = (await s.resident.agent.get(`${s.base}/my-charges`)).body
    expect(mine.charges).toEqual([expect.objectContaining({ type: 'TARGETED', title: 'Замена домофона', amount: 5000 })])
    expect((await s.resident.agent.get(`${s.base}/files/${protocol.id}/download-url`)).status).toBe(200)

    const noDecision = await s.chair.post(`${s.base}/charge-collections`).set('x-step-up-token', s.up).send({
      type: 'TARGETED', title: 'Без решения', basis: 'FIXED', rate: 1000, unit_types: ['APARTMENT'], period: nowPeriod(), due_date: `${nowPeriod()}-28`,
    })
    expect(noDecision.status).toBe(400)
  })
})
