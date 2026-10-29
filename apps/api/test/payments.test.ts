import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addMember, createApp, login, makeHouse, makeUser, owner, phoneLogin, resetDb, stepUpToken, type TestApp } from './helpers'

let t: TestApp
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
  t.storage.objects.clear()
})

const nowPeriod = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7)
const RECIPIENT = 'ОСИ «Тест»'

/** Чек Kaspi, сохранённый в PDF: текстовый слой, как у настоящего */
function kaspiPdf(amount: string, ref: string, recipient = RECIPIENT): Buffer {
  const lines = ['Платёж успешно совершён', `Сумма ${amount} ₸`, `Получатель ${recipient}`, `№ квитанции ${ref}`, 'Дата и время 28.10.2026 14:22']
  const text = Buffer.concat(lines.map((l) => Buffer.concat([Buffer.from('('), Buffer.from(l, 'utf8'), Buffer.from(') Tj\n')])))
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n3 0 obj<</Length 0>>stream\nBT\n', 'latin1'),
    text,
    Buffer.from('ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1'),
  ])
}

/** Фото чека: сетка цветных блоков. Структура переживает уменьшение — как у настоящего снимка */
async function receiptPhoto(seed: number, width = 360, quality = 90): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  let x = seed
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648) * 255
  const raw = Buffer.alloc(9 * 8 * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = rnd()
  return sharp(raw, { raw: { width: 9, height: 8, channels: 3 } }).resize(width, Math.round((width * 8) / 9), { kernel: 'nearest' }).jpeg({ quality }).toBuffer()
}

async function upload(agent: Agent, houseId: string, body: Buffer, mime: 'image/jpeg' | 'application/pdf') {
  const res = await agent.post(`/v1/houses/${houseId}/files/upload-url`).send({ purpose: 'PAYMENT_RECEIPT', mime_type: mime, size_bytes: body.length, name: mime === 'application/pdf' ? 'kaspi.pdf' : 'IMG.jpg' })
  expect(res.status).toBe(201)
  t.storage.putAsClient(res.body.upload_url, body)
  expect((await agent.post(`/v1/houses/${houseId}/files/${res.body.file_id}/finalize`)).status).toBe(200)
  return res.body.file_id as string
}

async function setup() {
  const chairman = await makeUser({ fullName: 'Кенжебаев Бауыржан' })
  const accountant = await makeUser()
  const { house } = await makeHouse({ chairman, units: 4 })
  await addMember(house.id, accountant.id, 'ACCOUNTANT')
  const units = await owner.unit.findMany({ where: { houseId: house.id }, orderBy: { number: 'asc' } })
  for (const u of units) await owner.unit.update({ where: { id: u.id }, data: { area: 50 } })
  const chair = await login(t, chairman)
  const acc = await login(t, accountant)
  const up = await stepUpToken(chair, chairman.secret)
  const accUp = await stepUpToken(acc, accountant.secret)
  const base = `/v1/houses/${house.id}`
  for (const type of ['CURRENT', 'SAVINGS']) {
    await chair.post(`${base}/accounts`).set('x-step-up-token', up).send({ type, bank_name: 'Halyk Bank', opening_balance: 100000, opened_on: '2026-01-01' }).expect(201)
  }
  await chair.post(`${base}/tariffs`).set('x-step-up-token', up).send({ type: 'MAINTENANCE', basis: 'PER_SQM', rate: 120, effective_from: nowPeriod() }).expect(201)
  await chair.post(`${base}/tariffs`).set('x-step-up-token', up).send({ type: 'CAPITAL_REPAIR', basis: 'PER_SQM', rate: 40, effective_from: nowPeriod() }).expect(201)
  await chair.post(`${base}/charges/generate`).set('x-step-up-token', up).send({ period: nowPeriod() }).expect(200)

  const r = await phoneLogin(t, '+77071230001')
  await addMember(house.id, r.body.user.id, 'RESIDENT')
  await owner.user.update({ where: { id: r.body.user.id }, data: { fullName: 'Асанова Айгерим' } })
  await owner.unitOwnership.create({ data: { houseId: house.id, unitId: units[0]!.id, userId: r.body.user.id, relation: 'OWNER', verificationStatus: 'VERIFIED' } })
  const charges = (await r.agent.get(`${base}/my-charges`)).body.charges as { id: string; type: string; amount: number }[]
  const maintenance = charges.find((c) => c.type === 'MAINTENANCE')!
  const capital = charges.find((c) => c.type === 'CAPITAL_REPAIR')!
  return { house, base, chair, up, acc, accUp, resident: { agent: r.agent, id: r.body.user.id }, units, maintenance, capital }
}
type S = Awaited<ReturnType<typeof setup>>

/** Сначала загрузка, потом запрос: supertest привязывает сервер в момент вызова post() */
async function pay(s: S, chargeId: string, file: Promise<string>, extra: Record<string, unknown> = {}) {
  const fileId = await file
  return s.resident.agent.post(`${s.base}/charges/${chargeId}/payments`).send({ file_id: fileId, ...extra })
}

const settings = (s: S) => s.chair.put(`${s.base}/payment-settings`).set('x-step-up-token', s.up).send({ pay_url: 'https://pay.kaspi.kz/pay/abc123', recipient_name: RECIPIENT })
const balance = async (s: S, type: string) => ((await s.chair.get(`${s.base}/accounts`)).body as { type: string; balance: number }[]).find((a) => a.type === type)!.balance

describe('payment link', () => {
  it('needs Kaspi settings from the chairman and is given only for own charges', async () => {
    const s = await setup()
    const missing = await s.resident.agent.get(`${s.base}/charges/${s.maintenance.id}/payment-link`)
    expect(missing.status).toBe(409)
    expect(missing.body.error.code).toBe('PAYMENT_SETTINGS_MISSING')

    expect((await s.chair.put(`${s.base}/payment-settings`).set('x-step-up-token', s.up).send({ pay_url: 'https://evil.example/pay', recipient_name: 'X Y' })).status).toBe(400)
    expect((await s.chair.put(`${s.base}/payment-settings`).send({ pay_url: 'https://pay.kaspi.kz/pay/abc', recipient_name: RECIPIENT })).status).toBe(428)
    await settings(s).expect(200)
    expect(await owner.auditLog.count({ where: { action: 'finance.payment_settings' } })).toBe(1)

    const link = await s.resident.agent.get(`${s.base}/charges/${s.maintenance.id}/payment-link`)
    expect(link.body).toMatchObject({ mode: 'RECEIPT', pay_url: 'https://pay.kaspi.kz/pay/abc123', recipient_name: RECIPIENT, amount: 6000 })

    const other = (await s.acc.get(`${s.base}/charges?unit_id=${s.units[1]!.id}`)).body[0]
    expect((await s.resident.agent.get(`${s.base}/charges/${other.id}/payment-link`)).status).toBe(404)
  })
})

describe('receipt payments', () => {
  it('a recognized Kaspi receipt goes to review; confirming closes the charge and posts income to the journal', async () => {
    const s = await setup()
    await settings(s)
    const file = await upload(s.resident.agent, s.house.id, kaspiPdf('6 000', 'QR8800123456'), 'application/pdf')
    const sent = await s.resident.agent.post(`${s.base}/charges/${s.maintenance.id}/payments`).send({ file_id: file })
    expect(sent.status).toBe(201)
    expect(sent.body).toMatchObject({ status: 'PENDING_REVIEW', amount: 6000, external_ref: 'QR8800123456', flags: [], receipt: { recognized: { amount: 6000, ref: 'QR8800123456' } } })
    expect(sent.body.paid_by).toBeUndefined()

    // Правление получило уведомление; чек видят плательщик и правление, но не соседи
    expect(await owner.notification.count({ where: { title: { startsWith: 'Оплата на проверку' } } })).toBe(2)
    expect((await s.acc.get(`${s.base}/files/${file}/download-url`)).status).toBe(200)
    expect((await s.resident.agent.get(`${s.base}/files/${file}/download-url`)).status).toBe(200)
    const neighbour = await phoneLogin(t, '+77071230002')
    await addMember(s.house.id, neighbour.body.user.id, 'RESIDENT')
    expect((await neighbour.agent.get(`${s.base}/files/${file}/download-url`)).status).toBe(404)
    expect((await neighbour.agent.get(`${s.base}/payments/${sent.body.id}`)).status).toBe(404)

    const queue = await s.acc.get(`${s.base}/payments`)
    expect(queue.body).toEqual([expect.objectContaining({ id: sent.body.id, paid_by: { id: s.resident.id, name: 'Асанова Айгерим' }, unit: { id: s.units[0]!.id, number: s.units[0]!.number } })])

    expect((await s.acc.post(`${s.base}/payments/${sent.body.id}/confirm`).send({})).status).toBe(428)
    const ok = await s.acc.post(`${s.base}/payments/${sent.body.id}/confirm`).set('x-step-up-token', s.accUp).send({})
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ status: 'CONFIRMED', confirmed_amount: 6000, charge: { paid_amount: 6000 } })
    expect((await s.acc.post(`${s.base}/payments/${sent.body.id}/confirm`).set('x-step-up-token', s.accUp).send({})).status).toBe(409)

    // Начисление закрыто, деньги в журнале по строке 6.1 на текущем счёте — без номера квартиры и имени
    const mine = (await s.resident.agent.get(`${s.base}/my-charges`)).body
    expect(mine.charges.find((c: { id: string }) => c.id === s.maintenance.id)).toMatchObject({ status: 'PAID', paid_amount: 6000 })
    expect(mine.due).toBe(2000)
    expect(await balance(s, 'CURRENT')).toBe(106000)
    const journal = (await neighbour.agent.get(`${s.base}/transactions`)).body
    expect(journal).toEqual([expect.objectContaining({ direction: 'IN', amount: 6000, category: expect.objectContaining({ code: '6.1' }), counterparty: null })])
    expect(journal[0].description).not.toContain(s.units[0]!.number)
    expect(JSON.stringify(journal)).not.toContain('Асанова')
    expect(await owner.notification.count({ where: { userId: s.resident.id, title: 'Оплата подтверждена' } })).toBe(1)
  })

  it('capital repair goes to the savings account; partial payments leave the rest due; credit never exceeds the charge', async () => {
    const s = await setup()
    await settings(s)
    const part = await pay(s, s.capital.id, upload(s.resident.agent, s.house.id, kaspiPdf('1 500', 'QR1000000001'), 'application/pdf'))
    expect(part.body.flags.map((f: { code: string }) => f.code)).toEqual(['AMOUNT_MISMATCH'])
    await s.chair.post(`${s.base}/payments/${part.body.id}/confirm`).set('x-step-up-token', s.up).send({ acknowledge_flags: true }).expect(200)
    expect((await s.resident.agent.get(`${s.base}/my-charges`)).body.charges.find((c: { id: string }) => c.id === s.capital.id)).toMatchObject({ status: 'PARTIALLY_PAID', paid_amount: 1500 })
    expect(await balance(s, 'SAVINGS')).toBe(101500)
    const income = (await s.chair.get(`${s.base}/transactions`)).body[0]
    expect(income).toMatchObject({ category: expect.objectContaining({ code: '6.3' }), account: expect.objectContaining({ type: 'SAVINGS' }) })

    const over = await pay(s, s.capital.id, upload(s.resident.agent, s.house.id, kaspiPdf('5 000', 'QR1000000002'), 'application/pdf'))
    const done = await s.chair.post(`${s.base}/payments/${over.body.id}/confirm`).set('x-step-up-token', s.up).send({ acknowledge_flags: true })
    expect(done.body).toMatchObject({ confirmed_amount: 500, charge: { paid_amount: 2000 } })
    expect(await balance(s, 'SAVINGS')).toBe(102000)
  })
})

describe('forgery protection', () => {
  it('the same receipt again is flagged, needs explicit acknowledgement, and can be rejected with a reason', async () => {
    const s = await setup()
    await settings(s)
    const pdf = kaspiPdf('6 000', 'QR8800123456')
    const first = await pay(s, s.maintenance.id, upload(s.resident.agent, s.house.id, pdf, 'application/pdf'))
    await s.chair.post(`${s.base}/payments/${first.body.id}/confirm`).set('x-step-up-token', s.up).send({}).expect(200)

    const again = await pay(s, s.capital.id, upload(s.resident.agent, s.house.id, pdf, 'application/pdf'))
    expect(again.body.status).toBe('FLAGGED')
    expect(again.body.flags.map((f: { code: string }) => f.code).sort()).toEqual(['AMOUNT_MISMATCH', 'DUPLICATE_FILE', 'DUPLICATE_REF'])

    const blind = await s.chair.post(`${s.base}/payments/${again.body.id}/confirm`).set('x-step-up-token', s.up).send({})
    expect(blind.status).toBe(409)
    expect(blind.body.error.code).toBe('FLAGS_NOT_ACKNOWLEDGED')
    // Даже с подтверждением флагов: номер операции банка уже зачтён — база не даст зачесть его второй раз
    const forced = await s.chair.post(`${s.base}/payments/${again.body.id}/confirm`).set('x-step-up-token', s.up).send({ acknowledge_flags: true })
    expect(forced.status).toBe(409)
    expect(forced.body.error.code).toBe('PAYMENT_STATE')
    expect(await balance(s, 'SAVINGS')).toBe(100000)

    const rejected = await s.chair.post(`${s.base}/payments/${again.body.id}/reject`).set('x-step-up-token', s.up).send({ reason: 'Это чек за взнос на управление' })
    expect(rejected.body).toMatchObject({ status: 'REJECTED', rejection_reason: 'Это чек за взнос на управление' })
    expect(await owner.notification.count({ where: { userId: s.resident.id, title: 'Оплата не подтверждена' } })).toBe(1)
  })

  it('a re-saved photo of the same receipt is caught by the perceptual hash; another photo is not', async () => {
    const s = await setup()
    await settings(s)
    const submit = async (photo: Buffer, ref: string, chargeId = s.maintenance.id) =>
      pay(s, chargeId, upload(s.resident.agent, s.house.id, photo, 'image/jpeg'), { amount: 6000, external_ref: ref })

    const first = await submit(await receiptPhoto(7), 'REF-0001')
    // Фото не распознано (заглушка читает только PDF): сумму ввёл жилец — это видно председателю
    expect(first.body.flags.map((f: { code: string }) => f.code)).toEqual(['NOT_RECOGNIZED'])

    const resaved = await submit(await receiptPhoto(7, 300, 60), 'REF-0002', s.capital.id)
    expect(resaved.body.flags.map((f: { code: string }) => f.code)).toContain('SIMILAR_IMAGE')
    const other = await submit(await receiptPhoto(99), 'REF-0003', s.capital.id)
    expect(other.body.flags.map((f: { code: string }) => f.code)).not.toContain('SIMILAR_IMAGE')
  })

  it('an unreadable photo without a typed amount asks for the amount instead of guessing', async () => {
    const s = await setup()
    const res = await pay(s, s.maintenance.id, upload(s.resident.agent, s.house.id, await receiptPhoto(3), 'image/jpeg'))
    expect(res.status).toBe(422)
    expect(res.body.error.details.fields[0].path).toBe('amount')
    expect(await owner.payment.count()).toBe(0)
  })

  it('a receipt to someone else is flagged as a recipient mismatch', async () => {
    const s = await setup()
    await settings(s)
    const res = await pay(s, s.maintenance.id, upload(s.resident.agent, s.house.id, kaspiPdf('6 000', 'QR5500000001', 'ИП Мошенников'), 'application/pdf'))
    expect(res.body.flags.map((f: { code: string }) => f.code)).toEqual(['RECIPIENT_MISMATCH'])
  })
})

describe('board-entered payments and expense receipts', () => {
  it('cash or bank transfer is entered by the board and confirmed at once', async () => {
    const s = await setup()
    const cash = await s.acc.post(`${s.base}/payments`).set('x-step-up-token', s.accUp)
      .send({ charge_id: s.maintenance.id, amount: 6000, method: 'CASH', paid_on: new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10) })
    expect(cash.status).toBe(201)
    expect(cash.body).toMatchObject({ status: 'CONFIRMED', method: 'CASH', confirmed_amount: 6000 })
    expect(await balance(s, 'CURRENT')).toBe(106000)
    expect((await s.resident.agent.post(`${s.base}/payments`).send({ charge_id: s.maintenance.id, amount: 1, method: 'CASH', paid_on: '2026-10-01' })).status).toBe(403)
  })

  it('scanning an expense receipt prefills the form and warns about a repeat', async () => {
    const s = await setup()
    const scanFile = async () => {
      const body = kaspiPdf('18 000', 'QR7700000001', 'ТОО «Хозтовары»')
      const res = await s.chair.post(`${s.base}/files/upload-url`).send({ purpose: 'FINANCE_DOCUMENT', mime_type: 'application/pdf', size_bytes: body.length, name: 'check.pdf' })
      t.storage.putAsClient(res.body.upload_url, body)
      await s.chair.post(`${s.base}/files/${res.body.file_id}/finalize`).expect(200)
      return s.chair.post(`${s.base}/receipts/scan`).send({ file_id: res.body.file_id })
    }
    const first = await scanFile()
    expect(first.body).toMatchObject({ recognized: { amount: 18000, ref: 'QR7700000001', recipient: 'ТОО «Хозтовары»' }, duplicate: false })
    expect((await scanFile()).body.duplicate).toBe(true)
  })
})
