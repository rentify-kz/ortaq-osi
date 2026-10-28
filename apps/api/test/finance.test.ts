import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addMember, createApp, login, makeHouse, makeUser, owner, pdf, phoneLogin, resetDb, stepUpToken, uploadPdf, uploadPhoto, type TestApp } from './helpers'

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

const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)
let keySeq = 0
const key = () => `tx-key-${Date.now()}-${++keySeq}`

async function setup() {
  const chairman = await makeUser({ fullName: 'Кенжебаев Бауыржан' })
  const accountant = await makeUser({ fullName: 'Ахметова Гульнар' })
  const { house } = await makeHouse({ chairman })
  await addMember(house.id, accountant.id, 'ACCOUNTANT')
  const chair = await login(t, chairman)
  const acc = await login(t, accountant)
  const r = await phoneLogin(t, '+77071230001')
  await addMember(house.id, r.body.user.id, 'RESIDENT')
  const chairUp = await stepUpToken(chair, chairman.secret)
  const accUp = await stepUpToken(acc, accountant.secret)
  const base = `/v1/houses/${house.id}`
  const elevator = await owner.contractor.create({ data: { houseId: house.id, name: 'ТОО «Лифт-Сервис»', specializations: ['ELEVATOR'] } })
  return { house, base, chair, chairUp, acc, accUp, resident: r.agent, elevator }
}

type S = Awaited<ReturnType<typeof setup>>

async function accounts(s: S) {
  const current = await s.chair.post(`${s.base}/accounts`).set('x-step-up-token', s.chairUp)
    .send({ type: 'CURRENT', bank_name: 'Halyk Bank', account_number: 'KZ12 6010 0000 0000 1234', opening_balance: 500000, opened_on: '2026-01-01' })
  expect(current.status).toBe(201)
  const savings = await s.chair.post(`${s.base}/accounts`).set('x-step-up-token', s.chairUp)
    .send({ type: 'SAVINGS', bank_name: 'Halyk Bank', opening_balance: 1200000, opened_on: '2026-01-01' })
  expect(savings.status).toBe(201)
  return { current: current.body.id as string, savings: savings.body.id as string }
}

const balanceOf = async (s: S, type: 'CURRENT' | 'SAVINGS') =>
  ((await s.chair.get(`${s.base}/accounts`)).body as { type: string; balance: number }[]).find((a) => a.type === type)?.balance

describe('chart of accounts', () => {
  it('follows the official form: rows in form order, postable leaves, rules per row', async () => {
    const s = await setup()
    const res = await s.resident.get('/v1/budget-categories')
    expect(res.status).toBe(200)
    const codes = (res.body as { code: string }[]).map((c) => c.code)
    expect(codes.slice(0, 7)).toEqual(['1', '2', '3', '4', '5', '6', '6.1'])
    expect(codes.indexOf('7.2.1.10')).toBe(codes.indexOf('7.2.1.9') + 1)
    const byCode = Object.fromEntries((res.body as { code: string }[]).map((c) => [c.code, c]))
    expect(byCode['6.3']).toMatchObject({ section: 'INCOME', is_leaf: true, allowed_accounts: ['SAVINGS'] })
    expect(byCode['7.2.1']).toMatchObject({ is_leaf: false, in_form: true })
    expect(byCode['7.2.1.10']).toMatchObject({ short_name: 'Обслуживание лифтов', requires_contractor: true, in_form: false, required_documents: ['WORK_ACT'] })
    expect(byCode['7.6.1']).toMatchObject({ requires_assembly_decision: true, required_documents: ['PROTOCOL', 'WORK_ACT'] })
  })
})

describe('accounts', () => {
  it('chairman opens both accounts with step-up; number is masked; one account per type', async () => {
    const s = await setup()
    const noStepUp = await s.chair.post(`${s.base}/accounts`).send({ type: 'CURRENT', bank_name: 'Halyk Bank', opened_on: '2026-01-01' })
    expect(noStepUp.status).toBe(428)
    await accounts(s)
    const list = await s.chair.get(`${s.base}/accounts`)
    expect(list.body).toEqual([
      expect.objectContaining({ type: 'CURRENT', bank_name: 'Halyk Bank', account_number_masked: '•••• 1234', opening_balance: 500000, balance: 500000 }),
      expect.objectContaining({ type: 'SAVINGS', account_number_masked: null, balance: 1200000 }),
    ])
    const dup = await s.chair.post(`${s.base}/accounts`).set('x-step-up-token', s.chairUp).send({ type: 'SAVINGS', bank_name: 'Kaspi', opened_on: '2026-01-01' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('ACCOUNT_EXISTS')

    expect((await s.acc.get(`${s.base}/accounts`)).status).toBe(200)
    expect((await s.acc.post(`${s.base}/accounts`).set('x-step-up-token', s.accUp).send({ type: 'CURRENT', bank_name: 'X', opened_on: '2026-01-01' })).status).toBe(403)
    expect((await s.resident.get(`${s.base}/accounts`)).status).toBe(403)
  })

  it('opening balance freezes after the first posted transaction', async () => {
    const s = await setup()
    const a = await accounts(s)
    expect((await s.chair.patch(`${s.base}/accounts/${a.current}`).set('x-step-up-token', s.chairUp).send({ opening_balance: 510000 })).body.balance).toBe(510000)
    await s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.chairUp)
      .send({ idempotency_key: key(), account_id: a.current, category_code: '6.1', amount: 1000, occurred_on: today(), description: 'Взносы за месяц', confirm: true })
      .expect(201)
    const frozen = await s.chair.patch(`${s.base}/accounts/${a.current}`).set('x-step-up-token', s.chairUp).send({ opening_balance: 1 })
    expect(frozen.status).toBe(409)
    expect((await s.chair.patch(`${s.base}/accounts/${a.current}`).set('x-step-up-token', s.chairUp).send({ bank_name: 'Jusan Bank' })).status).toBe(200)
  })
})

describe('transactions', () => {
  it('accountant drafts, chairman posts, documents close the gaps, resident sees the same numbers', async () => {
    const s = await setup()
    const a = await accounts(s)
    const body = { idempotency_key: key(), account_id: a.current, category_code: '7.2.1.10', amount: 85000.5, occurred_on: today(), description: 'Обслуживание лифтов за месяц' }

    // Для 7.2.1 получатель обязателен: его наименование печатается в отчёте
    const noContractor = await s.acc.post(`${s.base}/transactions`).set('x-step-up-token', s.accUp).send(body)
    expect(noContractor.status).toBe(422)
    expect(noContractor.body.error.code).toBe('CONTRACTOR_REQUIRED')

    // Бухгалтер не проводит сам
    const selfPost = await s.acc.post(`${s.base}/transactions`).set('x-step-up-token', s.accUp).send({ ...body, idempotency_key: key(), contractor_id: s.elevator.id, confirm: true })
    expect(selfPost.status).toBe(403)

    const draft = await s.acc.post(`${s.base}/transactions`).set('x-step-up-token', s.accUp).send({ ...body, idempotency_key: key(), contractor_id: s.elevator.id })
    expect(draft.status).toBe(201)
    expect(draft.body).toMatchObject({
      number: 1, status: 'DRAFT', direction: 'OUT', amount: 85000.5, period: today().slice(0, 7),
      category: { code: '7.2.1.10', short_name: 'Обслуживание лифтов' }, contractor: { name: 'ТОО «Лифт-Сервис»' },
      missing_documents: ['RECEIPT', 'WORK_ACT'], created_by: { name: 'Ахметова Гульнар' },
    })
    expect(await balanceOf(s, 'CURRENT')).toBe(500000)
    expect((await s.chair.get(`${s.base}/accounts`)).body[0].pending_drafts).toBe(1)

    // Черновик жильцу не виден
    expect((await s.resident.get(`${s.base}/transactions`)).body).toEqual([])
    expect((await s.resident.get(`${s.base}/transactions/${draft.body.id}`)).status).toBe(404)

    // Черновик правится; проведение — только председателем и со step-up
    // Председатель открыл черновик, бухгалтер после этого поменял сумму: подтвердить старую версию нельзя
    const seenByChair = draft.body.revision
    const edited = await s.acc.patch(`${s.base}/transactions/${draft.body.id}`).set('x-step-up-token', s.accUp).send({ amount: 85000 })
    expect(edited.body.amount).toBe(85000)
    expect(edited.body.revision).not.toBe(seenByChair)
    const stale = await s.chair.post(`${s.base}/transactions/${draft.body.id}/confirm`).set('x-step-up-token', s.chairUp).send({ revision: seenByChair })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('TRANSACTION_STATE')
    expect((await s.acc.post(`${s.base}/transactions/${draft.body.id}/confirm`).set('x-step-up-token', s.accUp).send({ revision: edited.body.revision })).status).toBe(403)
    expect((await s.chair.post(`${s.base}/transactions/${draft.body.id}/confirm`).send({ revision: edited.body.revision })).status).toBe(428)
    const posted = await s.chair.post(`${s.base}/transactions/${draft.body.id}/confirm`).set('x-step-up-token', s.chairUp).send({ revision: edited.body.revision })
    expect(posted.status).toBe(200)
    expect(posted.body.status).toBe('CONFIRMED')
    expect(await balanceOf(s, 'CURRENT')).toBe(415000)

    // Проведённая не меняется
    const late = await s.acc.patch(`${s.base}/transactions/${draft.body.id}`).set('x-step-up-token', s.accUp).send({ amount: 1 })
    expect(late.status).toBe(409)
    expect(late.body.error.code).toBe('TRANSACTION_STATE')

    // Документы — после проведения: чек фото и акт PDF
    const receipt = await uploadPhoto(t, s.acc, s.house.id, 'FINANCE_DOCUMENT')
    const act = await uploadPdf(t, s.acc, s.house.id)
    expect(act.finalize.status).toBe(200)
    expect(act.finalize.body.mime_type).toBe('application/pdf')
    await s.acc.post(`${s.base}/transactions/${draft.body.id}/documents`).send({ file_id: receipt, kind: 'RECEIPT' }).expect(201)
    const full = await s.acc.post(`${s.base}/transactions/${draft.body.id}/documents`).send({ file_id: act.id, kind: 'WORK_ACT' })
    expect(full.body.missing_documents).toEqual([])
    expect(full.body.documents.map((d: { kind: string }) => d.kind)).toEqual(['RECEIPT', 'WORK_ACT'])

    // Жилец видит ту же операцию и может открыть акт — без того, кто её вносил
    const seen = await s.resident.get(`${s.base}/transactions`)
    expect(seen.body).toHaveLength(1)
    expect(seen.body[0]).toMatchObject({ amount: 85000, category: { code: '7.2.1.10' }, contractor: { name: 'ТОО «Лифт-Сервис»' } })
    expect(seen.body[0].created_by).toBeUndefined()
    expect((await s.resident.get(`${s.base}/files/${act.id}/download-url`)).status).toBe(200)

    // Изъятие документа проведённой операции — председателем, со step-up и причиной; жилец его больше не видит
    const docId = full.body.documents[1].id
    const removeUrl = `${s.base}/transactions/${draft.body.id}/documents/${docId}/remove`
    expect((await s.chair.post(removeUrl).send({ reason: 'Не тот акт' })).status).toBe(428)
    expect((await s.acc.post(removeUrl).set('x-step-up-token', s.accUp).send({ reason: 'Не тот акт' })).status).toBe(403)
    expect((await s.chair.post(removeUrl).set('x-step-up-token', s.chairUp).send({})).status).toBe(422)
    const removed = await s.chair.post(removeUrl).set('x-step-up-token', s.chairUp).send({ reason: 'Приложен акт за другой месяц' })
    expect(removed.body.missing_documents).toEqual(['WORK_ACT'])
    expect((await s.resident.get(`${s.base}/files/${act.id}/download-url`)).status).toBe(404)
    expect(await owner.transactionDocument.count({ where: { id: docId, removedAt: { not: null } } })).toBe(1)
  })

  it('a mistake is voided with a reason and replaced by a linked correction', async () => {
    const s = await setup()
    const a = await accounts(s)
    const wrong = await s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.chairUp)
      .send({ idempotency_key: key(), account_id: a.current, category_code: '7.5', amount: 18000, occurred_on: today(), description: 'Лопаты и мётлы', confirm: true })
    expect(await balanceOf(s, 'CURRENT')).toBe(482000)

    expect((await s.acc.post(`${s.base}/transactions/${wrong.body.id}/void`).set('x-step-up-token', s.accUp).send({ reason: 'Сумма с ошибкой' })).status).toBe(403)
    const voided = await s.chair.post(`${s.base}/transactions/${wrong.body.id}/void`).set('x-step-up-token', s.chairUp).send({ reason: 'Сумма с ошибкой: по чеку 8 000' })
    expect(voided.body).toMatchObject({ status: 'VOIDED', void_reason: 'Сумма с ошибкой: по чеку 8 000', missing_documents: [] })
    expect(await balanceOf(s, 'CURRENT')).toBe(500000)

    const fixed = await s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.chairUp)
      .send({ idempotency_key: key(), account_id: a.current, category_code: '7.5', amount: 8000, occurred_on: today(), description: 'Лопаты и мётлы', confirm: true, corrects_id: wrong.body.id })
    expect(fixed.body.corrects).toEqual({ id: wrong.body.id, number: 1 })
    expect((await s.resident.get(`${s.base}/transactions/${wrong.body.id}`)).body).toMatchObject({ status: 'VOIDED', corrected_by: { id: fixed.body.id, number: 2 } })
    expect(await balanceOf(s, 'CURRENT')).toBe(492000)

    const twice = await s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.chairUp)
      .send({ idempotency_key: key(), account_id: a.current, category_code: '7.5', amount: 8000, occurred_on: today(), description: 'Ещё раз', corrects_id: wrong.body.id })
    expect(twice.status).toBe(409)

    // Аннулирование — в журнале аудита
    expect(await owner.auditLog.count({ where: { action: 'finance.transaction_void', entityId: wrong.body.id } })).toBe(1)
  })

  it('accountant may discard own draft, not a posted one', async () => {
    const s = await setup()
    const a = await accounts(s)
    const d = await s.acc.post(`${s.base}/transactions`).set('x-step-up-token', s.accUp)
      .send({ idempotency_key: key(), account_id: a.current, category_code: '7.1.6', amount: 3500, occurred_on: today(), description: 'Канцтовары' })
    const discarded = await s.acc.post(`${s.base}/transactions/${d.body.id}/void`).set('x-step-up-token', s.accUp).send({ reason: 'Внесла дважды' })
    expect(discarded.body.status).toBe('VOIDED')
    // Снятый черновик председатель не проверял — жильцу его не показываем
    expect((await s.resident.get(`${s.base}/transactions`)).body).toEqual([])
    expect((await s.resident.get(`${s.base}/transactions/${d.body.id}`)).status).toBe(404)
  })

  it('a retried request posts once; the same key with another body is a conflict', async () => {
    const s = await setup()
    const a = await accounts(s)
    const body = { idempotency_key: key(), account_id: a.current, category_code: '6.1', amount: 15000, occurred_on: today(), description: 'Взносы на управление', confirm: true }
    const [one, two] = await Promise.all([
      s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.chairUp).send(body),
      s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.chairUp).send(body),
    ])
    expect([one.status, two.status]).toEqual([201, 201])
    expect(one.body.id).toBe(two.body.id)
    expect(await owner.transaction.count({ where: { houseId: s.house.id } })).toBe(1)
    expect(await balanceOf(s, 'CURRENT')).toBe(515000)

    const other = await s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.chairUp).send({ ...body, amount: 15001 })
    expect(other.status).toBe(409)
    expect(other.body.error.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('enforces the form and the law: leaf rows, savings only for capital repair, dates within the account', async () => {
    const s = await setup()
    const a = await accounts(s)
    const post = (b: Record<string, unknown>) => s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.chairUp)
      .send({ idempotency_key: key(), amount: 1000, occurred_on: today(), description: 'Проверка правил', confirm: true, ...b })

    const parent = await post({ account_id: a.current, category_code: '7.2' })
    expect(parent.body.error.code).toBe('CATEGORY_INVALID')
    expect((await post({ account_id: a.current, category_code: '1' })).body.error.code).toBe('CATEGORY_INVALID')
    expect((await post({ account_id: a.current, category_code: '9.9' })).body.error.code).toBe('CATEGORY_INVALID')

    // Взносы на капремонт — только на сберегательный; со сберегательного — только капремонт
    expect((await post({ account_id: a.current, category_code: '6.3' })).body.error.code).toBe('ACCOUNT_MISMATCH')
    expect((await post({ account_id: a.savings, category_code: '7.5' })).body.error.code).toBe('ACCOUNT_MISMATCH')
    expect((await post({ account_id: a.savings, category_code: '6.3' })).status).toBe(201)
    const capital = await post({ account_id: a.savings, category_code: '7.6.1', amount: 200000, description: 'Ремонт кровли над 2 подъездом' })
    expect(capital.status).toBe(201)
    expect(capital.body.missing_documents).toEqual(['RECEIPT', 'PROTOCOL', 'WORK_ACT'])
    expect(await balanceOf(s, 'SAVINGS')).toBe(1001000)

    const future = await post({ account_id: a.current, category_code: '6.1', occurred_on: '2099-01-01' })
    expect(future.status).toBe(422)
    expect(future.body.error.details.fields[0].path).toBe('occurred_on')
    expect((await post({ account_id: a.current, category_code: '6.1', occurred_on: '2025-12-31' })).status).toBe(422)
    expect((await post({ account_id: a.current, category_code: '6.1', period: '2099-01' })).status).toBe(422)

    // Отчётный месяц может отличаться от даты операции
    const lateBill = await post({ account_id: a.current, category_code: '7.4', occurred_on: today(), period: '2026-01' })
    expect(lateBill.body.period).toBe('2026-01')
  })

  it('the database itself refuses to rewrite or delete a posted transaction', async () => {
    const s = await setup()
    const a = await accounts(s)
    const posted = await s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.chairUp)
      .send({ idempotency_key: key(), account_id: a.current, category_code: '6.4', amount: 40000, occurred_on: today(), description: 'Аренда подвала', confirm: true })

    // Даже владелец базы не перепишет сумму: триггер
    await expect(owner.$executeRaw`UPDATE transactions SET amount = 1 WHERE id = ${posted.body.id}::uuid`).rejects.toThrow(/cannot be changed/)
    await expect(owner.$executeRaw`UPDATE transactions SET status = 'DRAFT' WHERE id = ${posted.body.id}::uuid`).rejects.toThrow(/cannot be changed/)

    // Роль приложения не удаляет вовсе
    const app = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
    try {
      await expect(app.$executeRaw`DELETE FROM transactions WHERE id = ${posted.body.id}::uuid`).rejects.toThrow(/permission denied/)
      await expect(app.$executeRaw`UPDATE budget_categories SET name_ru = 'x' WHERE code = '6.1'`).rejects.toThrow(/permission denied/)
    } finally {
      await app.$disconnect()
    }
    expect(await owner.transaction.count({ where: { id: posted.body.id, amount: 40000 } })).toBe(1)
  })

  it('keeps houses apart: another chairman sees nothing and cannot post to a foreign account', async () => {
    const s = await setup()
    const a = await accounts(s)
    const posted = await s.chair.post(`${s.base}/transactions`).set('x-step-up-token', s.chairUp)
      .send({ idempotency_key: key(), account_id: a.current, category_code: '6.1', amount: 1000, occurred_on: today(), description: 'Взносы', confirm: true })

    const otherChair = await makeUser()
    const { house: other } = await makeHouse({ chairman: otherChair })
    const agent = await login(t, otherChair)
    const up = await stepUpToken(agent, otherChair.secret)
    expect((await agent.get(`${s.base}/transactions`)).status).toBe(404)
    expect((await agent.get(`/v1/houses/${other.id}/transactions/${posted.body.id}`)).status).toBe(404)
    const foreign = await agent.post(`/v1/houses/${other.id}/transactions`).set('x-step-up-token', up)
      .send({ idempotency_key: key(), account_id: a.current, category_code: '6.1', amount: 1000, occurred_on: today(), description: 'Чужой счёт', confirm: true })
    expect(foreign.status).toBe(404)
  })
})

describe('finance documents', () => {
  it('rejects a PDF with active content and accepts PDF only for finance documents', async () => {
    const s = await setup()
    const bad = await uploadPdf(t, s.acc, s.house.id, pdf('/OpenAction<</S/JavaScript/JS(app.alert(1))>>'))
    expect(bad.finalize.status).toBe(422)
    // Имя, записанное через #xx, — то же активное содержимое
    expect((await uploadPdf(t, s.acc, s.house.id, pdf('/AA<</O<</S/J#61vaScript>>>>'))).finalize.status).toBe(422)
    // Обычный стартовый масштаб — не действие
    expect((await uploadPdf(t, s.acc, s.house.id, pdf('/OpenAction[3 0 R/FitH null]'))).finalize.status).toBe(200)

    // Жилец финансовые документы не загружает — и PDF к заявке не протащит
    const resident = await s.resident.post(`${s.base}/files/upload-url`).send({ purpose: 'FINANCE_DOCUMENT', mime_type: 'application/pdf', size_bytes: 100, name: 'x.pdf' })
    expect(resident.status).toBe(403)
    const finance = await uploadPhoto(t, s.acc, s.house.id, 'FINANCE_DOCUMENT')
    const asRequestPhoto = await s.acc.post(`${s.base}/requests`).send({ description: 'Течёт кран в подвале', category: 'PLUMBING', location_type: 'BASEMENT', photo_file_ids: [finance] })
    expect(asRequestPhoto.status).toBe(422)
    expect(bad.finalize.body.error.code).toBe('FILE_REJECTED')
    expect(await owner.file.findUnique({ where: { id: bad.id } })).toMatchObject({ status: 'REJECTED' })

    const asPhoto = await s.resident.post(`${s.base}/files/upload-url`).send({ purpose: 'REQUEST_PHOTO', mime_type: 'application/pdf', size_bytes: 100, name: 'x.pdf' })
    expect(asPhoto.status).toBe(400)
  })
})
