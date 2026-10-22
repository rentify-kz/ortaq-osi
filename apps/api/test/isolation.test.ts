import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addMember, createApp, login, makeHouse, makeUser, owner, resetDb, stepUpToken, type TestApp } from './helpers'

/*
 * Межарендная изоляция, docs/13 §1. Председатель дома A обращается к объектам дома B
 * и получает 404 — не 403, чтобы не подтверждать существование чужого дома.
 */

let t: TestApp
const app = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

beforeAll(async () => {
  t = await createApp()
})
afterAll(async () => {
  await t.app.close()
  await app.$disconnect()
})
beforeEach(async () => {
  await resetDb()
  t.limiter.reset()
})

async function twoHouses() {
  const chairA = await makeUser()
  const chairB = await makeUser()
  const a = await makeHouse({ chairman: chairA })
  const b = await makeHouse({ chairman: chairB })
  const resident = await makeUser({ totp: false, phone: '+77071234532' })
  const inviteB = await owner.invite.create({
    data: { houseId: b.house.id, tokenHash: Buffer.alloc(32, 7), type: 'PUBLIC_LINK', targetRole: 'RESIDENT', expiresAt: new Date(Date.now() + 86400000), createdBy: chairB.id },
  })
  const requestB = await owner.joinRequest.create({
    data: { houseId: b.house.id, userId: resident.id, claimedUnitNumber: '1', claimedRelation: 'OWNER' },
  })
  return { chairA, chairB, a, b, inviteB, requestB }
}

describe('cross-house isolation through the API', () => {
  it('returns 404 for every house-B endpoint called by the chairman of house A', async () => {
    const { chairA, b } = await twoHouses()
    const agent = await login(t, chairA)
    const paths = ['', '/readiness', '/units', '/members', '/invites', '/join-requests', '/audit/verify']
    for (const path of paths) {
      const res = await agent.get(`/v1/houses/${b.house.id}${path}`)
      expect(res.status, `GET ${path}`).toBe(404)
    }
    expect((await agent.post(`/v1/houses/${b.house.id}/invites`).send({ type: 'PUBLIC_LINK' })).status).toBe(404)
  })

  it('does not reach house-B objects through house A in the path', async () => {
    const { chairA, a, inviteB, requestB } = await twoHouses()
    const agent = await login(t, chairA)
    const step = await stepUpToken(agent, chairA.secret)
    expect((await agent.delete(`/v1/houses/${a.house.id}/invites/${inviteB.id}`)).status).toBe(404)
    expect((await agent.post(`/v1/houses/${a.house.id}/invites/${inviteB.id}/reissue`)).status).toBe(404)
    expect((await agent.post(`/v1/houses/${a.house.id}/join-requests/${requestB.id}/approve`).set('X-Step-Up-Token', step)).status).toBe(404)
    expect((await agent.post(`/v1/houses/${a.house.id}/join-requests/${requestB.id}/reject`).send({ reason: 'чужая заявка' })).status).toBe(404)
    expect((await owner.joinRequest.findUniqueOrThrow({ where: { id: requestB.id } })).status).toBe('PENDING')
    expect((await owner.invite.findUniqueOrThrow({ where: { id: inviteB.id } })).revokedAt).toBeNull()
  })

  it('lists only the caller\'s houses and returns 404 for a malformed house id', async () => {
    const { chairA, a } = await twoHouses()
    const agent = await login(t, chairA)
    const mine = await agent.get('/v1/houses')
    expect(mine.body.map((h: { id: string }) => h.id)).toEqual([a.house.id])
    expect((await agent.get('/v1/houses/not-a-uuid')).status).toBe(404)
  })

  it('gives a resident of the same house 403 on chairman endpoints', async () => {
    const { a } = await twoHouses()
    const resident = await makeUser()
    await addMember(a.house.id, resident.id, 'RESIDENT')
    const agent = await login(t, resident)
    expect((await agent.get(`/v1/houses/${a.house.id}`)).status).toBe(200)
    expect((await agent.get(`/v1/houses/${a.house.id}/units`)).status).toBe(403)
  })

  it('cuts access on the next request after the membership is revoked', async () => {
    const { chairA, a } = await twoHouses()
    const agent = await login(t, chairA)
    expect((await agent.get(`/v1/houses/${a.house.id}/units`)).status).toBe(200)
    await owner.houseMembership.updateMany({ where: { houseId: a.house.id, userId: chairA.id }, data: { status: 'REVOKED' } })
    expect((await agent.get(`/v1/houses/${a.house.id}/units`)).status).toBe(404)
  })
})

describe('row level security, the database layer', () => {
  /** Запрос под ролью приложения с выставленным контекстом — как его выставляет PrismaService.run */
  function asHouse<T>(houseId: string, fn: (tx: Parameters<Parameters<typeof app.$transaction>[0]>[0]) => Promise<T>) {
    return app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_house_id', ${houseId}, true)`
      return fn(tx)
    })
  }

  it('hides other houses\' rows even from raw SQL', async () => {
    const { a, b } = await twoHouses()
    const rows = await asHouse(a.house.id, (tx) =>
      tx.$queryRaw<{ house_id: string }[]>`SELECT house_id::text FROM units`,
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.house_id === a.house.id)).toBe(true)
    const foreign = await asHouse(a.house.id, (tx) => tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM units WHERE house_id = ${b.house.id}::uuid`)
    expect(foreign[0]?.n).toBe(0n)
  })

  it('returns nothing when the context is missing', async () => {
    await twoHouses()
    const units = await app.unit.findMany()
    expect(units).toEqual([])
  })

  it('refuses to write a row into another house', async () => {
    const { a, b } = await twoHouses()
    await expect(
      asHouse(a.house.id, (tx) => tx.$executeRaw`INSERT INTO units (id, house_id, number, updated_at) VALUES (gen_random_uuid(), ${b.house.id}::uuid, '999', now())`),
    ).rejects.toThrow(/row-level security/)
  })
})
