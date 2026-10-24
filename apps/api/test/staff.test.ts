import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
  t.sms.outbox.length = 0
  t.mailer.outbox.length = 0
})

async function chairmanWithHouse() {
  const chairman = await makeUser()
  const { house } = await makeHouse({ chairman })
  const agent = await login(t, chairman)
  return { chairman, house, agent, token: await stepUpToken(agent, chairman.secret) }
}

async function residentOf(houseId: string, phone = '+77071234532') {
  const r = await phoneLogin(t, phone)
  await addMember(houseId, r.body.user.id, 'RESIDENT')
  return r
}

describe('house roles', () => {
  it('the chairman adds an accountant who must set a password and 2FA', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    const body = { role: 'ACCOUNTANT', email: 'Buh@Test.local', full_name: 'Нурланова Айжан' }
    expect((await agent.post(`/v1/houses/${house.id}/members`).send(body)).status).toBe(428)

    const res = await agent.post(`/v1/houses/${house.id}/members`).set('X-Step-Up-Token', token).send(body)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ role: 'ACCOUNTANT', invitation_sent: true })
    const mail = t.mailer.outbox.at(-1)!
    expect(mail.to).toBe('buh@test.local')
    expect(mail.text).toMatch(/set-password#token=/)

    const members = await agent.get(`/v1/houses/${house.id}/members`)
    expect(members.body.map((m: { role: string }) => m.role).sort()).toEqual(['ACCOUNTANT', 'CHAIRMAN'])

    const dup = await agent.post(`/v1/houses/${house.id}/members`).set('X-Step-Up-Token', token).send(body)
    expect(dup.body.error.code).toBe('ALREADY_MEMBER')
  })

  it('only accountants can be added directly', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    const res = await agent.post(`/v1/houses/${house.id}/members`).set('X-Step-Up-Token', token).send({ role: 'CHAIRMAN', email: 'x@test.local', full_name: 'Икс Игрек' })
    expect(res.status).toBe(400)
  })

  it('revoking a resident ends access at once and closes their vote', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    const resident = await residentOf(house.id)
    const unit = await owner.unit.findFirstOrThrow({ where: { houseId: house.id } })
    await owner.unitOwnership.create({ data: { houseId: house.id, unitId: unit.id, userId: resident.body.user.id, relation: 'OWNER', verificationStatus: 'VERIFIED' } })
    expect((await resident.agent.get(`/v1/houses/${house.id}`)).status).toBe(200)

    const res = await agent.delete(`/v1/houses/${house.id}/members/${resident.body.user.id}`).set('X-Step-Up-Token', token)
    expect(res.status).toBe(200)
    expect((await resident.agent.get(`/v1/houses/${house.id}`)).status).toBe(404)
    expect((await resident.agent.get('/v1/houses')).body).toEqual([])
    const ownership = await owner.unitOwnership.findFirstOrThrow({ where: { userId: resident.body.user.id } })
    expect(ownership).toMatchObject({ verificationStatus: 'REJECTED', verificationNote: 'Членство в доме отозвано' })
    expect(await owner.auditLog.count({ where: { action: 'member.revoke' } })).toBe(1)
  })

  it('protects the chairman and refuses to revoke yourself', async () => {
    const { chairman, house, agent, token } = await chairmanWithHouse()
    const self = await agent.delete(`/v1/houses/${house.id}/members/${chairman.id}`).set('X-Step-Up-Token', token)
    expect(self.body.error.code).toBe('MEMBER_PROTECTED')
    const unknown = await agent.delete(`/v1/houses/${house.id}/members/${crypto.randomUUID()}`).set('X-Step-Up-Token', token)
    expect(unknown.status).toBe(404)
  })

  it('cannot revoke a member of another house', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    const { house: other } = await makeHouse()
    const stranger = await residentOf(other.id)
    const res = await agent.delete(`/v1/houses/${house.id}/members/${stranger.body.user.id}`).set('X-Step-Up-Token', token)
    expect(res.status).toBe(404)
    expect((await owner.houseMembership.findFirstOrThrow({ where: { userId: stranger.body.user.id } })).status).toBe('ACTIVE')
  })
})

describe('staff and contractors', () => {
  it('residents see only visible staff and only public fields', async () => {
    const { house, agent } = await chairmanWithHouse()
    const created = await agent.post(`/v1/houses/${house.id}/staff`).send({
      full_name: 'Петров Иван', position: 'Сантехник', specializations: ['PLUMBER'], phone_public: '8 (727) 123-45-67', work_schedule: 'Пн–Пт 9:00–18:00',
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ phone_public: '+77271234567', visible_to_residents: true, is_active: true })
    await agent.post(`/v1/houses/${house.id}/staff`).send({ full_name: 'Скрытый Сотрудник', position: 'Бухгалтер-аутсорс', visible_to_residents: false }).expect(201)

    const resident = await residentOf(house.id)
    const seen = await resident.agent.get(`/v1/houses/${house.id}/staff`)
    expect(seen.body).toEqual([{
      id: created.body.id, full_name: 'Петров Иван', position: 'Сантехник', specializations: ['PLUMBER'],
      phone_public: '+77271234567', work_schedule: 'Пн–Пт 9:00–18:00',
    }])
    expect((await agent.get(`/v1/houses/${house.id}/staff`)).body).toHaveLength(2)

    // Уволенный пропадает из справочника жильцов, но остаётся у председателя
    await agent.patch(`/v1/houses/${house.id}/staff/${created.body.id}`).send({ is_active: false }).expect(200)
    expect((await resident.agent.get(`/v1/houses/${house.id}/staff`)).body).toEqual([])
    expect((await resident.agent.post(`/v1/houses/${house.id}/staff`).send({ full_name: 'Взлом Взломов', position: 'Хакер' })).status).toBe(403)
  })

  it('links a staff record only to a worker of this house', async () => {
    const { house, agent } = await chairmanWithHouse()
    const staff = await agent.post(`/v1/houses/${house.id}/staff`).send({ full_name: 'Петров Иван', position: 'Дворник' })
    const resident = await residentOf(house.id)
    const bad = await agent.patch(`/v1/houses/${house.id}/staff/${staff.body.id}`).send({ user_id: resident.body.user.id })
    expect(bad.status).toBe(422)

    const worker = await phoneLogin(t, '+77071234599')
    await addMember(house.id, worker.body.user.id, 'WORKER')
    const ok = await agent.patch(`/v1/houses/${house.id}/staff/${staff.body.id}`).send({ user_id: worker.body.user.id })
    expect(ok.body.user_id).toBe(worker.body.user.id)
  })

  it('validates and shows contractors', async () => {
    const { house, agent } = await chairmanWithHouse()
    const bad = await agent.post(`/v1/houses/${house.id}/contractors`).send({ name: 'ТОО Лифт', contract_from: '2026-12-01', contract_to: '2026-01-01' })
    expect(bad.status).toBe(400)
    expect((await agent.post(`/v1/houses/${house.id}/contractors`).send({ name: 'ТОО Лифт', bin: '123456789012' })).status).toBe(400)

    const created = await agent.post(`/v1/houses/${house.id}/contractors`).send({
      name: 'ТОО «Лифт Сервис»', specializations: ['ELEVATOR'], contact_person: 'Ахметов Б.', phone: '+7 701 555 44 33',
      email: 'Info@Lift.kz', contract_from: '2026-01-01', contract_to: '2026-12-31',
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ phone: '+77015554433', email: 'info@lift.kz', contract_from: '2026-01-01', contract_to: '2026-12-31' })

    const tooEarly = await agent.patch(`/v1/houses/${house.id}/contractors/${created.body.id}`).send({ contract_to: '2025-06-01' })
    expect(tooEarly.status).toBe(422)

    const resident = await residentOf(house.id)
    const seen = await resident.agent.get(`/v1/houses/${house.id}/contractors`)
    expect(seen.body[0]).not.toHaveProperty('visible_to_residents')
    expect(seen.body[0].name).toBe('ТОО «Лифт Сервис»')
  })

  it("another house's staff record is unreachable", async () => {
    const { house, agent } = await chairmanWithHouse()
    const other = await chairmanWithHouse()
    const staff = await other.agent.post(`/v1/houses/${other.house.id}/staff`).send({ full_name: 'Чужой Сотрудник', position: 'Электрик' })
    expect((await agent.patch(`/v1/houses/${house.id}/staff/${staff.body.id}`).send({ position: 'Взломщик' })).status).toBe(404)
    expect((await owner.staffMember.findUniqueOrThrow({ where: { id: staff.body.id } })).position).toBe('Электрик')
  })
})
