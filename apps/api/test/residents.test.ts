import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp, login, makeHouse, makeUser, owner, phoneLogin, resetDb, type TestApp } from './helpers'

let t: TestApp
const http = () => request(t.app.getHttpServer())

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
})

const lastCode = () => t.sms.outbox.at(-1)?.text.match(/\d{6}/)?.[0] ?? ''

async function houseWithInvite(opts: { type?: 'PUBLIC_LINK' | 'PERSONAL'; target_role?: 'RESIDENT' | 'WORKER' } = {}) {
  const chairman = await makeUser()
  const { house } = await makeHouse({ chairman })
  const agent = await login(t, chairman)
  const invite = await agent.post(`/v1/houses/${house.id}/invites`).send({ type: opts.type ?? 'PUBLIC_LINK', target_role: opts.target_role })
  expect(invite.status).toBe(201)
  return { chairman, house, chairmanAgent: agent, token: invite.body.token as string, inviteId: invite.body.id as string }
}

describe('phone sign-in', () => {
  it('registers a new number, then signs the same person in again', async () => {
    const first = await phoneLogin(t, '8 707 123 45 32')
    expect(first.body.is_new).toBe(true)
    expect(t.sms.outbox.at(-1)?.phone).toBe('+77071234532')

    const user = await owner.user.findUniqueOrThrow({ where: { phone: '+77071234532' } })
    expect(user.fullName).toBe('')
    const codes = await owner.otpCode.findMany()
    expect(codes).toHaveLength(1)
    expect(Buffer.from(codes[0]!.codeHash).toString()).not.toMatch(/^\d{6}$/)

    await owner.otpCode.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } })
    const second = await phoneLogin(t, '+7 707 123 45 32')
    expect(second.body.is_new).toBe(false)
    expect(second.body.user.id).toBe(user.id)
    expect(await owner.user.count()).toBe(1)
  })

  it('asks a new user for a name and keeps it', async () => {
    const { agent } = await phoneLogin(t, '+77011112233')
    expect((await agent.patch('/v1/me').send({ full_name: 'Аб' })).status).toBe(400)
    const res = await agent.patch('/v1/me').send({ full_name: '  Ким Виктория  ' })
    expect(res.status).toBe(200)
    expect(res.body.full_name).toBe('Ким Виктория')
    expect(await owner.auditLog.count({ where: { action: 'user.profile_update' } })).toBe(1)
  })

  it('rejects a wrong code and burns it after five attempts', async () => {
    const phone = '+77021234567'
    await http().post('/v1/auth/otp/request').send({ phone }).expect(200)
    const code = lastCode()
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) {
      const res = await http().post('/v1/auth/otp/verify').send({ phone, code: wrong })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('OTP_INVALID')
      t.limiter.reset()
    }
    // Верный код уже не помогает: после пяти промахов он погашен
    expect((await http().post('/v1/auth/otp/verify').send({ phone, code })).status).toBe(401)
    expect(await owner.user.count()).toBe(0)
  })

  it('a new code cancels the previous one', async () => {
    const phone = '+77051234567'
    await http().post('/v1/auth/otp/request').send({ phone }).expect(200)
    const old = lastCode()
    await owner.otpCode.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } })
    await http().post('/v1/auth/otp/request').send({ phone }).expect(200)
    const fresh = lastCode()
    if (old !== fresh) expect((await http().post('/v1/auth/otp/verify').send({ phone, code: old })).status).toBe(401)
    expect((await http().post('/v1/auth/otp/verify').send({ phone, code: fresh })).status).toBe(200)
  })

  it('refuses an expired code', async () => {
    const phone = '+77761234567'
    await http().post('/v1/auth/otp/request').send({ phone }).expect(200)
    await owner.otpCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await http().post('/v1/auth/otp/verify').send({ phone, code: lastCode() })).status).toBe(401)
  })

  it('limits resends per number: one a minute', async () => {
    const phone = '+77471234567'
    await http().post('/v1/auth/otp/request').send({ phone }).expect(200)
    const again = await http().post('/v1/auth/otp/request').send({ phone })
    expect(again.status).toBe(429)
    expect(again.body.error.code).toBe('RATE_LIMITED')
    expect(t.sms.outbox).toHaveLength(1)
  })

  it('limits codes per number per hour', async () => {
    const phone = '+77781234567'
    await owner.otpCode.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        phone, codeHash: new Uint8Array(32), ip: '10.0.0.1',
        createdAt: new Date(Date.now() - (i + 2) * 60_000), expiresAt: new Date(), consumedAt: new Date(),
      })),
    })
    expect((await http().post('/v1/auth/otp/request').send({ phone })).status).toBe(429)
  })

  it('rejects landlines and malformed numbers before sending anything', async () => {
    expect((await http().post('/v1/auth/otp/request').send({ phone: '+7 727 123 45 67' })).status).toBe(400)
    expect((await http().post('/v1/auth/otp/request').send({ phone: '123' })).status).toBe(400)
    expect(t.sms.outbox).toHaveLength(0)
  })

  it('board members must use email and 2FA, not an SMS code', async () => {
    const chairman = await makeUser({ phone: '+77071230000' })
    await makeHouse({ chairman })
    const phone = '+77071230000'
    await http().post('/v1/auth/otp/request').send({ phone }).expect(200)
    const res = await http().post('/v1/auth/otp/verify').send({ phone, code: lastCode() })
    expect(res.status).toBe(403)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('mobile clients get tokens in the body', async () => {
    const phone = '+77001234567'
    await http().post('/v1/auth/otp/request').send({ phone }).expect(200)
    const res = await http().post('/v1/auth/otp/verify').set('X-Client', 'mobile').send({ phone, code: lastCode() })
    expect(res.status).toBe(200)
    expect(res.body.access_token).toEqual(expect.any(String))
    const me = await http().get('/v1/me').set('Authorization', `Bearer ${res.body.access_token}`)
    expect(me.status).toBe(200)
  })
})

describe('joining a house by invite', () => {
  it('lists unit numbers for the picker and nothing else', async () => {
    const { token } = await houseWithInvite()
    const { agent } = await phoneLogin(t, '+77071234532')
    const res = await agent.get(`/v1/invites/${token}/units`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(8)
    expect(res.body[0]).toEqual({ number: '1', entrance: 1 })
    expect(res.body.map((u: { number: string }) => u.number).slice(0, 3)).toEqual(['1', '2', '3'])
  })

  it('needs a signed-in user', async () => {
    const { token } = await houseWithInvite()
    expect((await http().get(`/v1/invites/${token}/units`)).status).toBe(401)
    expect((await http().post(`/v1/invites/${token}/accept`).send({ accept_terms: true })).status).toBe(401)
  })

  it('creates membership, a pending ownership and consents', async () => {
    const { house, token, inviteId } = await houseWithInvite()
    const { agent, body } = await phoneLogin(t, '+77071234532')
    const res = await agent.post(`/v1/invites/${token}/accept`).send({ unit_number: '3', relation: 'OWNER', accept_terms: true })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ house_id: house.id, house_display_name: house.displayName, role: 'RESIDENT' })

    const membership = await owner.houseMembership.findFirstOrThrow({ where: { houseId: house.id, userId: body.user.id } })
    expect(membership).toMatchObject({ role: 'RESIDENT', status: 'ACTIVE', joinedVia: 'INVITE_LINK' })
    const ownership = await owner.unitOwnership.findFirstOrThrow({ where: { userId: body.user.id }, include: { unit: true } })
    expect(ownership).toMatchObject({ relation: 'OWNER', verificationStatus: 'PENDING' })
    expect(ownership.unit.number).toBe('3')
    const consents = await owner.consent.findMany({ where: { userId: body.user.id } })
    expect(consents.map((c) => c.kind).sort()).toEqual(['NOTIFICATIONS', 'TERMS'])
    expect((await owner.invite.findUniqueOrThrow({ where: { id: inviteId } })).useCount).toBe(1)

    // Свой дом виден сразу, но голосовать до подтверждения личности нельзя
    const place = await agent.get(`/v1/houses/${house.id}/me`)
    expect(place.status).toBe(200)
    expect(place.body).toEqual({
      role: 'RESIDENT', identity_verified: false,
      units: [{ number: '3', entrance: 1, floor: expect.any(Number), relation: 'OWNER', verification: 'PENDING', can_vote: false }],
    })
    expect((await agent.get('/v1/houses')).body).toHaveLength(1)
  })

  it('skips the notifications consent when declined', async () => {
    const { token } = await houseWithInvite()
    const { agent, body } = await phoneLogin(t, '+77071234532')
    await agent.post(`/v1/invites/${token}/accept`).send({ unit_number: '1', relation: 'TENANT', accept_terms: true, notifications: false }).expect(200)
    const consents = await owner.consent.findMany({ where: { userId: body.user.id } })
    expect(consents.map((c) => c.kind)).toEqual(['TERMS'])
  })

  it('requires terms, a unit and a unit that exists', async () => {
    const { token } = await houseWithInvite()
    const { agent } = await phoneLogin(t, '+77071234532')
    expect((await agent.post(`/v1/invites/${token}/accept`).send({ unit_number: '1', relation: 'OWNER' })).status).toBe(400)
    expect((await agent.post(`/v1/invites/${token}/accept`).send({ accept_terms: true })).status).toBe(422)
    const missing = await agent.post(`/v1/invites/${token}/accept`).send({ unit_number: '999', relation: 'OWNER', accept_terms: true })
    expect(missing.status).toBe(422)
    expect(missing.body.error.code).toBe('UNIT_NOT_FOUND')
    expect(await owner.houseMembership.count({ where: { role: 'RESIDENT' } })).toBe(0)
  })

  it('a personal invite works once', async () => {
    const { token } = await houseWithInvite({ type: 'PERSONAL' })
    const a = await phoneLogin(t, '+77071234532')
    await a.agent.post(`/v1/invites/${token}/accept`).send({ unit_number: '1', relation: 'OWNER', accept_terms: true }).expect(200)
    const b = await phoneLogin(t, '+77071234533')
    const res = await b.agent.post(`/v1/invites/${token}/accept`).send({ unit_number: '2', relation: 'OWNER', accept_terms: true })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVITE_INVALID')
  })

  it('refuses a second join to the same house', async () => {
    const { token } = await houseWithInvite()
    const { agent } = await phoneLogin(t, '+77071234532')
    await agent.post(`/v1/invites/${token}/accept`).send({ unit_number: '1', relation: 'OWNER', accept_terms: true }).expect(200)
    const again = await agent.post(`/v1/invites/${token}/accept`).send({ unit_number: '2', relation: 'OWNER', accept_terms: true })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_MEMBER')
  })

  it('a revoked invite stops working', async () => {
    const { house, token, inviteId, chairmanAgent } = await houseWithInvite()
    await chairmanAgent.delete(`/v1/houses/${house.id}/invites/${inviteId}`).expect(200)
    const { agent } = await phoneLogin(t, '+77071234532')
    expect((await agent.get(`/v1/invites/${token}/units`)).body.error.code).toBe('INVITE_INVALID')
  })

  it('a worker invite gives the worker role without a unit', async () => {
    const { house, token } = await houseWithInvite({ type: 'PERSONAL', target_role: 'WORKER' })
    const { agent, body } = await phoneLogin(t, '+77071234532')
    const res = await agent.post(`/v1/invites/${token}/accept`).send({ accept_terms: true })
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('WORKER')
    expect(await owner.unitOwnership.count({ where: { userId: body.user.id } })).toBe(0)
    expect((await agent.get(`/v1/houses/${house.id}/me`)).body.units).toEqual([])
  })
})

describe('joining without an invite', () => {
  it('finds a house by address and sends one request to the chairman', async () => {
    const { house, chairmanAgent } = await houseWithInvite()
    const { agent } = await phoneLogin(t, '+77071234532')

    expect((await agent.get('/v1/house-search?q=ab')).status).toBe(400)
    const found = await agent.get('/v1/house-search').query({ q: 'тестовая' })
    expect(found.status).toBe(200)
    expect(found.body).toEqual([{ id: house.id, display_name: house.displayName, address: house.address }])

    const body = { house_id: house.id, unit_number: '5', relation: 'OWNER', comment: 'Купил в сентябре' }
    const created = await agent.post('/v1/join-requests').send(body)
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('PENDING')

    const dup = await agent.post('/v1/join-requests').send(body)
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('JOIN_REQUEST_EXISTS')

    const list = await chairmanAgent.get(`/v1/houses/${house.id}/join-requests`)
    expect(list.body).toHaveLength(1)
    expect(list.body[0]).toMatchObject({ unit_number: '5', phone: '+7 707 ••• •• 32' })
  })

  it('a member cannot request the same house again', async () => {
    const { house, token } = await houseWithInvite()
    const { agent } = await phoneLogin(t, '+77071234532')
    await agent.post(`/v1/invites/${token}/accept`).send({ unit_number: '1', relation: 'OWNER', accept_terms: true }).expect(200)
    const res = await agent.post('/v1/join-requests').send({ house_id: house.id, unit_number: '1', relation: 'OWNER' })
    expect(res.body.error.code).toBe('ALREADY_MEMBER')
  })

  it('a non-member does not see the house itself', async () => {
    const { house } = await houseWithInvite()
    const { agent } = await phoneLogin(t, '+77071234532')
    expect((await agent.get(`/v1/houses/${house.id}/me`)).status).toBe(404)
  })
})
