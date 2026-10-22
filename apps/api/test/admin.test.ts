import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp, login, makeBin, makeUser, owner, resetDb, stepUpToken, totp, type TestApp } from './helpers'

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
  t.mailer.outbox.length = 0
})

async function adminSession() {
  const admin = await makeUser({ admin: true })
  const agent = await login(t, admin)
  const token = await stepUpToken(agent, admin.secret)
  return { admin, agent, token }
}

describe('organizations and houses', () => {
  it('validates the BIN control digit and rejects a duplicate BIN', async () => {
    const { agent, token } = await adminSession()
    const bin = makeBin()
    const bad = await agent.post('/v1/admin/organizations').set('X-Step-Up-Token', token)
      .send({ name: 'ОСИ', bin: bin.slice(0, 11) + ((Number(bin[11]) + 1) % 10), management_form: 'OSI', legal_address: 'г. Алматы, ул. Абая 1' })
    expect(bad.status).toBe(400)

    const body = { name: 'ОСИ Асыл Арман', bin, management_form: 'OSI', legal_address: 'г. Алматы, ул. Абая 150' }
    expect((await agent.post('/v1/admin/organizations').set('X-Step-Up-Token', token).send(body)).status).toBe(201)
    const dup = await agent.post('/v1/admin/organizations').set('X-Step-Up-Token', token).send(body)
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('BIN_TAKEN')
  })

  it('creates a house with generated units and reports readiness', async () => {
    const { agent, token } = await adminSession()
    const org = await agent.post('/v1/admin/organizations').set('X-Step-Up-Token', token)
      .send({ name: 'ОСИ Асыл Арман', bin: makeBin(), management_form: 'OSI', legal_address: 'г. Алматы, ул. Абая 150' })
    const house = await agent.post('/v1/admin/houses').set('X-Step-Up-Token', token).send({
      organization_id: org.body.id, address: 'г. Алматы, ул. Абая 150', display_name: 'ЖК Асыл Арман, блок 3',
      entrance_count: 4, unit_count: 128, floor_count: 9,
    })
    expect(house.status).toBe(201)

    const detail = await agent.get(`/v1/admin/houses/${house.body.id}`)
    expect(detail.body.readiness).toMatchObject({
      stage: 'UNITS_GENERATED', units_total: 128, areas_filled: 0, areas_total: 128,
      is_voting_ready: false, chairman_assigned: false,
    })
    expect(detail.body.layout).toHaveLength(4)
    expect(detail.body.layout[3]).toMatchObject({ entrance: 4, from: 97, to: 128, floors: 9 })
  })

  it('regenerates units by a custom layout and refuses an overlapping one', async () => {
    const { agent, token } = await adminSession()
    const org = await agent.post('/v1/admin/organizations').set('X-Step-Up-Token', token)
      .send({ name: 'ОСИ', bin: makeBin(), management_form: 'OSI', legal_address: 'г. Алматы, ул. Абая 1' })
    const house = await agent.post('/v1/admin/houses').set('X-Step-Up-Token', token).send({
      organization_id: org.body.id, address: 'г. Алматы, ул. Абая 1', display_name: 'ЖК Тест', entrance_count: 2, unit_count: 64, floor_count: 9,
    })
    const ok = await agent.post(`/v1/admin/houses/${house.body.id}/generate-units`).set('X-Step-Up-Token', token).send({
      strategy: 'SEQUENTIAL',
      entrances: [{ entrance: 1, from: 1, to: 30, floors: 9 }, { entrance: 2, from: 31, to: 64, floors: 9 }],
    })
    expect(ok.status).toBe(201)
    expect(ok.body.units_total).toBe(64)

    const overlap = await agent.post(`/v1/admin/houses/${house.body.id}/generate-units`).set('X-Step-Up-Token', token).send({
      strategy: 'SEQUENTIAL',
      entrances: [{ entrance: 1, from: 1, to: 33, floors: 9 }, { entrance: 2, from: 31, to: 64, floors: 9 }],
    })
    expect(overlap.status).toBe(422)
    expect(overlap.body.error.code).toBe('UNITS_RANGE_INVALID')
  })

  it('flips is_voting_ready when the last area is filled', async () => {
    const { agent, token } = await adminSession()
    const org = await agent.post('/v1/admin/organizations').set('X-Step-Up-Token', token)
      .send({ name: 'ОСИ', bin: makeBin(), management_form: 'OSI', legal_address: 'г. Алматы, ул. Абая 1' })
    const house = await agent.post('/v1/admin/houses').set('X-Step-Up-Token', token).send({
      organization_id: org.body.id, address: 'г. Алматы, ул. Абая 1', display_name: 'ЖК Тест', entrance_count: 1, unit_count: 3,
    })
    await owner.unit.updateMany({ where: { houseId: house.body.id, number: { in: ['1', '2'] } }, data: { area: 50.5 } })
    expect((await owner.house.findUniqueOrThrow({ where: { id: house.body.id } })).isVotingReady).toBe(false)
    await owner.unit.updateMany({ where: { houseId: house.body.id, number: '3' }, data: { area: 70 } })
    const after = await owner.house.findUniqueOrThrow({ where: { id: house.body.id } })
    expect(after.isVotingReady).toBe(true)
    expect(after.totalArea.toString()).toBe('171')
  })
})

describe('chairman provisioning', () => {
  it('invites a chairman by email who sets a password, enables 2FA and sees the house', async () => {
    const { agent, token } = await adminSession()
    const org = await agent.post('/v1/admin/organizations').set('X-Step-Up-Token', token)
      .send({ name: 'ОСИ', bin: makeBin(), management_form: 'OSI', legal_address: 'г. Алматы, ул. Абая 1' })
    const house = await agent.post('/v1/admin/houses').set('X-Step-Up-Token', token).send({
      organization_id: org.body.id, address: 'г. Алматы, ул. Абая 1', display_name: 'ЖК Асыл Арман, блок 3', entrance_count: 2, unit_count: 16,
    })

    const assigned = await agent.post(`/v1/admin/houses/${house.body.id}/chairman`).set('X-Step-Up-Token', token)
      .send({ email: 'Chairman@Test.local', full_name: 'Бауыржан Кенжебаев' })
    expect(assigned.status).toBe(201)
    const mail = t.mailer.outbox.at(-1)
    expect(mail?.to).toBe('chairman@test.local')
    const linkToken = mail?.text.match(/#token=([\w-]+)/)?.[1]
    expect(linkToken).toBeTruthy()

    const second = await agent.post(`/v1/admin/houses/${house.body.id}/chairman`).set('X-Step-Up-Token', token)
      .send({ email: 'other@test.local', full_name: 'Другой Человек' })
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('CHAIRMAN_EXISTS')

    const chairman = request.agent(t.app.getHttpServer())
    const weak = await chairman.post('/v1/auth/password/set').send({ token: linkToken, password: 'short' })
    expect(weak.status).toBe(400)

    const set = await chairman.post('/v1/auth/password/set').send({ token: linkToken, password: 'a long enough passphrase' })
    expect(set.body.status).toBe('2FA_SETUP_REQUIRED')
    // Ссылка одноразовая
    expect((await chairman.post('/v1/auth/password/set').send({ token: linkToken, password: 'another long passphrase' })).status).toBe(400)

    const setup = await chairman.post('/v1/auth/2fa/setup').send({ challenge: set.body.challenge })
    const enabled = await chairman.post('/v1/auth/2fa/enable').send({ challenge: set.body.challenge, code: totp.generate(setup.body.secret) })
    expect(enabled.body.status).toBe('OK')
    expect(enabled.body.user.memberships).toEqual([
      { house_id: house.body.id, house_display_name: 'ЖК Асыл Арман, блок 3', role: 'CHAIRMAN' },
    ])

    const readiness = await chairman.get(`/v1/houses/${house.body.id}/readiness`)
    expect(readiness.body).toMatchObject({ stage: 'CHAIRMAN_ACTIVE', chairman_activated: true })
  })
})
