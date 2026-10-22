import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp, login, makeHouse, makeUser, owner, resetDb, type TestApp } from './helpers'

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

describe('audit hash chain', () => {
  it('stays valid across actions and detects a tampered entry', async () => {
    const chairman = await makeUser()
    const { house } = await makeHouse({ chairman })
    const agent = await login(t, chairman)
    for (let i = 0; i < 3; i++) {
      expect((await agent.post(`/v1/houses/${house.id}/invites`).send({ type: 'PUBLIC_LINK' })).status).toBe(201)
    }

    const valid = await agent.get(`/v1/houses/${house.id}/audit/verify`)
    expect(valid.body).toMatchObject({ valid: true, checked: 3, broken_at: null })

    // Правка задним числом ролью-владельцем: так выглядела бы попытка переписать историю
    const victim = (await owner.auditLog.findMany({ where: { houseId: house.id }, orderBy: { seq: 'asc' } }))[1]!
    await owner.auditLog.update({ where: { id: victim.id }, data: { action: 'invite.revoke' } })

    const broken = await agent.get(`/v1/houses/${house.id}/audit/verify`)
    expect(broken.body).toMatchObject({ valid: false, broken_at: victim.id })
  })

  it('denies UPDATE and DELETE on the journal to the application role', async () => {
    const chairman = await makeUser()
    const { house } = await makeHouse({ chairman })
    const agent = await login(t, chairman)
    await agent.post(`/v1/houses/${house.id}/invites`).send({ type: 'PUBLIC_LINK' })

    await expect(app.$executeRaw`UPDATE audit_log SET action = 'x'`).rejects.toThrow(/permission denied/)
    await expect(app.$executeRaw`DELETE FROM audit_log`).rejects.toThrow(/permission denied/)
  })

  it('keeps login events in the global chain, unreadable to a chairman', async () => {
    const chairman = await makeUser()
    await makeHouse({ chairman })
    await login(t, chairman)
    const global = await owner.auditLog.findMany({ where: { houseId: null, action: 'auth.login' } })
    expect(global).toHaveLength(1)
    // Без bypass роль приложения строк общей цепочки не видит
    const visible = await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${chairman.id}, true)`
      return tx.auditLog.count()
    })
    expect(visible).toBe(0)
  })
})
