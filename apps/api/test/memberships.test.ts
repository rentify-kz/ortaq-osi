import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp, login, makeHouse, makeUser, owner, resetDb, stepUpToken, type TestApp } from './helpers'

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
})

async function chairmanWithHouse() {
  const chairman = await makeUser()
  const { house } = await makeHouse({ chairman })
  const agent = await login(t, chairman)
  return { chairman, house, agent }
}

describe('invite links', () => {
  it('shows the token once, stores only its hash and resolves to the house name', async () => {
    const { house, agent } = await chairmanWithHouse()
    const created = await agent.post(`/v1/houses/${house.id}/invites`).send({ type: 'PUBLIC_LINK', expires_in_days: 7 })
    expect(created.status).toBe(201)
    expect(created.body.url).toBe(`http://localhost:5174/join#${created.body.token}`)

    const list = await agent.get(`/v1/houses/${house.id}/invites`)
    expect(list.body[0]).not.toHaveProperty('token')
    expect(list.body[0]).toMatchObject({ status: 'ACTIVE', use_count: 0 })
    const stored = await owner.invite.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(Buffer.from(stored.tokenHash).toString()).not.toContain(created.body.token)

    const resolved = await http().get(`/v1/invites/resolve/${created.body.token}`)
    expect(resolved.body).toEqual({ valid: true, house_display_name: house.displayName, target_role: 'RESIDENT' })
  })

  it('reissue revokes the old link and the new one works', async () => {
    const { house, agent } = await chairmanWithHouse()
    const first = await agent.post(`/v1/houses/${house.id}/invites`).send({ type: 'PUBLIC_LINK' })
    const second = await agent.post(`/v1/houses/${house.id}/invites/${first.body.id}/reissue`)
    expect(second.status).toBe(201)
    expect((await http().get(`/v1/invites/resolve/${first.body.token}`)).body).toEqual({ valid: false })
    expect((await http().get(`/v1/invites/resolve/${second.body.token}`)).body.valid).toBe(true)
  })

  it('reveals nothing for an unknown or revoked token', async () => {
    const { house, agent } = await chairmanWithHouse()
    const created = await agent.post(`/v1/houses/${house.id}/invites`).send({ type: 'PERSONAL' })
    expect(created.body.max_uses).toBe(1)
    await agent.delete(`/v1/houses/${house.id}/invites/${created.body.id}`).expect(200)
    expect((await http().get(`/v1/invites/resolve/${created.body.token}`)).body).toEqual({ valid: false })
    expect((await http().get('/v1/invites/resolve/nonexistent-token')).body).toEqual({ valid: false })
  })
})

describe('join requests', () => {
  it('approval needs step-up and creates membership with a pending ownership', async () => {
    const { chairman, house, agent } = await chairmanWithHouse()
    const resident = await makeUser({ totp: false, phone: '+77071234532', fullName: 'Асанов Данияр' })
    const jr = await owner.joinRequest.create({
      data: { houseId: house.id, userId: resident.id, claimedUnitNumber: '3', claimedRelation: 'OWNER', comment: 'Купил квартиру в июне' },
    })

    const list = await agent.get(`/v1/houses/${house.id}/join-requests`)
    expect(list.body[0]).toMatchObject({ full_name: 'Асанов Данияр', phone: '+7 707 ••• •• 32', unit_number: '3', unit_exists: true })

    const noStepUp = await agent.post(`/v1/houses/${house.id}/join-requests/${jr.id}/approve`)
    expect(noStepUp.status).toBe(428)

    const token = await stepUpToken(agent, chairman.secret)
    const approved = await agent.post(`/v1/houses/${house.id}/join-requests/${jr.id}/approve`).set('X-Step-Up-Token', token)
    expect(approved.status).toBe(200)

    const membership = await owner.houseMembership.findFirst({ where: { houseId: house.id, userId: resident.id } })
    expect(membership).toMatchObject({ role: 'RESIDENT', status: 'ACTIVE', joinedVia: 'JOIN_REQUEST' })
    const ownership = await owner.unitOwnership.findFirst({ where: { userId: resident.id }, include: { unit: true } })
    expect(ownership).toMatchObject({ verificationStatus: 'PENDING', relation: 'OWNER' })
    expect(ownership?.unit.number).toBe('3')

    const again = await agent.post(`/v1/houses/${house.id}/join-requests/${jr.id}/approve`).set('X-Step-Up-Token', token)
    expect(again.status).toBe(409)
  })

  it('rejects with a reason and refuses a unit that does not exist', async () => {
    const { chairman, house, agent } = await chairmanWithHouse()
    const resident = await makeUser({ totp: false })
    const missing = await owner.joinRequest.create({ data: { houseId: house.id, userId: resident.id, claimedUnitNumber: '999', claimedRelation: 'TENANT' } })
    const token = await stepUpToken(agent, chairman.secret)
    const res = await agent.post(`/v1/houses/${house.id}/join-requests/${missing.id}/approve`).set('X-Step-Up-Token', token)
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('UNIT_NOT_FOUND')

    const rejected = await agent.post(`/v1/houses/${house.id}/join-requests/${missing.id}/reject`).send({ reason: 'Такой квартиры нет в доме' })
    expect(rejected.status).toBe(200)
    expect((await owner.joinRequest.findUniqueOrThrow({ where: { id: missing.id } })).rejectionReason).toBe('Такой квартиры нет в доме')
  })
})
