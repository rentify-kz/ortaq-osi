import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { NotificationsService } from '../src/modules/notifications/notifications.service'
import { addMember, createApp, login, makeHouse, makeUser, owner, phoneLogin, resetDb, type TestApp } from './helpers'

let t: TestApp
type Agent = Awaited<ReturnType<typeof login>>

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
  t.push.outbox.length = 0
})

/** Дом на 8 квартир: подъезд 1 — кв. 1–4, подъезд 2 — кв. 5–8. Два жильца, работник, председатель */
async function house() {
  const chairman = await makeUser()
  const { house } = await makeHouse({ chairman, units: 8 })
  const chair = await login(t, chairman)
  const resident = async (phone: string, unit: string) => {
    const r = await phoneLogin(t, phone)
    await addMember(house.id, r.body.user.id, 'RESIDENT')
    const u = await owner.unit.findFirstOrThrow({ where: { houseId: house.id, number: unit } })
    await owner.unitOwnership.create({ data: { houseId: house.id, unitId: u.id, userId: r.body.user.id, relation: 'OWNER' } })
    return { agent: r.agent, id: r.body.user.id }
  }
  const first = await resident('+77071230001', '2')
  const second = await resident('+77071230002', '6')
  const w = await phoneLogin(t, '+77071230003')
  await addMember(house.id, w.body.user.id, 'WORKER')
  return { house, chairman, chair, first, second, worker: { agent: w.agent, id: w.body.user.id } }
}

const titles = async (agent: Agent, houseId: string) =>
  ((await agent.get(`/v1/houses/${houseId}/announcements`)).body as { title: string }[]).map((a) => a.title).sort()

describe('announcements', () => {
  it('each audience reaches exactly its people', async () => {
    const h = await house()
    const post = (body: object) => h.chair.post(`/v1/houses/${h.house.id}/announcements`).send({ body: 'Текст объявления', ...body })

    expect((await post({ title: 'Всем жильцам', audience: 'ALL' })).body.recipients).toBe(3)
    expect((await post({ title: 'Персоналу', audience: 'STAFF' })).body.recipients).toBe(1)
    expect((await post({ title: 'Первому подъезду', audience: 'ENTRANCE', entrances: [1] })).body.recipients).toBe(1)
    expect((await post({ title: 'Лично второму', audience: 'SPECIFIC_USERS', user_ids: [h.second.id] })).body.recipients).toBe(1)

    expect(await titles(h.first.agent, h.house.id)).toEqual(['Всем жильцам', 'Первому подъезду'])
    expect(await titles(h.second.agent, h.house.id)).toEqual(['Всем жильцам', 'Лично второму'])
    expect(await titles(h.worker.agent, h.house.id)).toEqual(['Всем жильцам', 'Персоналу'])
    expect(await titles(h.chair, h.house.id)).toHaveLength(4)
  })

  it('validates audiences against the house', async () => {
    const h = await house()
    const post = (body: object) => h.chair.post(`/v1/houses/${h.house.id}/announcements`).send({ title: 'Объявление', body: 'Текст', ...body })
    expect((await post({ audience: 'ENTRANCE' })).status).toBe(400)
    expect((await post({ audience: 'ENTRANCE', entrances: [5] })).status).toBe(422)
    expect((await post({ audience: 'SPECIFIC_USERS', user_ids: [crypto.randomUUID()] })).status).toBe(422)
    expect((await h.first.agent.post(`/v1/houses/${h.house.id}/announcements`).send({ title: 'Взлом', body: 'x', audience: 'ALL' })).status).toBe(403)
  })

  it('queues push for recipients, not the author, and the dispatcher delivers it', async () => {
    const h = await house()
    await h.first.agent.post('/v1/me/devices').send({ token: 'device-token-first-0001', platform: 'android' }).expect(201)
    const res = await h.chair.post(`/v1/houses/${h.house.id}/announcements`).send({ title: 'Отключение воды', body: 'Завтра с 10:00 до 14:00', audience: 'ALL' })

    const queued = await owner.notification.findMany({ where: { category: 'ANNOUNCEMENTS' } })
    expect(queued.map((n) => n.userId).sort()).toEqual([h.first.id, h.second.id, h.worker.id].sort())
    expect(queued.every((n) => n.priority === 'NORMAL' && n.channels.includes('push'))).toBe(true)

    // Ночью NORMAL ждёт утра; время отправки проверяем напрямую, чтобы тест не зависел от часов
    await owner.notification.updateMany({ data: { scheduledFor: new Date(Date.now() - 1000) } })
    expect(await t.dispatcher.dispatchDue()).toBe(3)
    expect(t.push.outbox).toEqual([{
      tokens: ['device-token-first-0001'],
      message: { title: 'Отключение воды', body: 'Завтра с 10:00 до 14:00', data: { notification_id: expect.any(String), category: 'ANNOUNCEMENTS' } },
    }])
    expect(await t.dispatcher.dispatchDue()).toBe(0)

    const feed = await h.first.agent.get('/v1/me/notifications')
    expect(feed.body.unread_count).toBe(1)
    expect(feed.body.items[0]).toMatchObject({ title: 'Отключение воды', payload: { announcement_id: res.body.id } })
  })

  it('without push the announcement only lands in the feed', async () => {
    const h = await house()
    await h.chair.post(`/v1/houses/${h.house.id}/announcements`).send({ title: 'Итоги субботника', body: 'Спасибо всем', audience: 'ALL', push: false })
    const queued = await owner.notification.findMany()
    expect(queued.every((n) => n.channels.length === 0 && n.sentAt !== null)).toBe(true)
    expect(await t.dispatcher.dispatchDue(new Date(Date.now() + 86_400_000))).toBe(0)
  })

  it('tracks reads by entrance and reminds only those who have not read', async () => {
    const h = await house()
    const a = await h.chair.post(`/v1/houses/${h.house.id}/announcements`).send({ title: 'Собрание', body: 'В субботу', audience: 'ALL' })
    const id = a.body.id as string
    await h.first.agent.post(`/v1/houses/${h.house.id}/announcements/${id}/read`).expect(200)
    await h.first.agent.post(`/v1/houses/${h.house.id}/announcements/${id}/read`).expect(200)

    const stats = await h.chair.get(`/v1/houses/${h.house.id}/announcements/${id}/stats`)
    expect(stats.body).toEqual({
      recipients: 3, read: 1, percent: 33,
      by_entrance: [{ entrance: 1, recipients: 1, read: 1 }, { entrance: 2, recipients: 1, read: 0 }, { entrance: null, recipients: 1, read: 0 }],
    })
    expect((await h.first.agent.get(`/v1/houses/${h.house.id}/announcements`)).body[0].is_read).toBe(true)


    await owner.notification.deleteMany()
    expect((await h.chair.post(`/v1/houses/${h.house.id}/announcements/${id}/remind`)).body).toEqual({ reminded: 2 })
    expect((await owner.notification.findMany()).map((n) => n.userId).sort()).toEqual([h.second.id, h.worker.id].sort())
    expect((await h.chair.post(`/v1/houses/${h.house.id}/announcements/${id}/remind`)).status).toBe(429)
  })

  it('pins, expires and deletes', async () => {
    const h = await house()
    const post = (body: object) => h.chair.post(`/v1/houses/${h.house.id}/announcements`).send({ body: 'Текст', audience: 'ALL', ...body })
    await post({ title: 'Обычное' })
    const pinned = await post({ title: 'Закреплённое', pinned: true })
    const old = await post({ title: 'Устаревшее', expires_at: new Date(Date.now() - 60_000).toISOString() })

    const feed = await h.first.agent.get(`/v1/houses/${h.house.id}/announcements`)
    expect(feed.body.map((a: { title: string }) => a.title)).toEqual(['Закреплённое', 'Обычное'])

    await h.chair.patch(`/v1/houses/${h.house.id}/announcements/${pinned.body.id}`).send({ pinned: false, title: 'Уже не закреплённое' }).expect(200)
    await h.chair.delete(`/v1/houses/${h.house.id}/announcements/${old.body.id}`).expect(200)
    expect(await titles(h.chair, h.house.id)).toEqual(['Обычное', 'Уже не закреплённое'])
    expect((await h.chair.get(`/v1/houses/${h.house.id}/announcements/${old.body.id}/stats`)).status).toBe(404)
  })
})

describe('notifications', () => {
  it('votes cannot be muted, other categories can', async () => {
    const r = await phoneLogin(t, '+77071230001')
    expect((await r.agent.patch('/v1/me/notification-settings').send({ push: { VOTES: false } })).status).toBe(400)
    const res = await r.agent.patch('/v1/me/notification-settings').send({ push: { ANNOUNCEMENTS: false } })
    expect(res.body.push).toMatchObject({ VOTES: true, ANNOUNCEMENTS: false, REQUESTS: true })
    expect(res.body.locked).toEqual(['VOTES'])

    const svc = t.app.get(NotificationsService)
    await svc.notify({ userIds: [r.body.user.id], houseId: null, category: 'ANNOUNCEMENTS', priority: 'NORMAL', title: 'Тихо', body: 'Только в ленте' })
    await svc.notify({ userIds: [r.body.user.id], houseId: null, category: 'VOTES', priority: 'NORMAL', title: 'Голосование', body: 'Началось' })
    const rows = await owner.notification.findMany({ orderBy: { createdAt: 'asc' } })
    expect(rows.map((n) => [n.category, n.channels])).toEqual([['ANNOUNCEMENTS', []], ['VOTES', ['push']]])
  })

  it('declining notifications at sign-up mutes everything except votes', async () => {
    const chairman = await makeUser()
    const { house } = await makeHouse({ chairman })
    const invite = await (await login(t, chairman)).post(`/v1/houses/${house.id}/invites`).send({ type: 'PUBLIC_LINK' })
    const r = await phoneLogin(t, '+77071230001')
    await r.agent.post(`/v1/invites/${invite.body.token}/accept`).send({ unit_number: '1', relation: 'OWNER', accept_terms: true, notifications: false }).expect(200)
    const settings = await r.agent.get('/v1/me/notification-settings')
    expect(settings.body.push).toEqual({ VOTES: true, REQUESTS: false, ANNOUNCEMENTS: false, PAYMENTS: false, REPORTS: false, MEMBERSHIP: false, SUMMARY: false })
  })

  it('critical notifications also go by SMS', async () => {
    const r = await phoneLogin(t, '+77071230001')
    t.sms.outbox.length = 0
    await t.app.get(NotificationsService).notify({ userIds: [r.body.user.id], houseId: null, category: 'VOTES', priority: 'CRITICAL', title: 'Старт голосования', body: 'Капремонт кровли' })
    expect(await t.dispatcher.dispatchDue()).toBe(1)
    expect(t.sms.outbox).toEqual([{ phone: '+77071230001', text: 'Ortaq: Старт голосования. Капремонт кровли' }])
  })

  it('read marks are personal', async () => {
    const a = await phoneLogin(t, '+77071230001')
    const b = await phoneLogin(t, '+77071230002')
    await t.app.get(NotificationsService).notify({ userIds: [a.body.user.id], houseId: null, category: 'MEMBERSHIP', priority: 'LOW', title: 'Привет', body: 'Текст' })
    const id = (await a.agent.get('/v1/me/notifications')).body.items[0].id as string
    expect((await b.agent.post(`/v1/notifications/${id}/read`)).status).toBe(404)
    expect((await b.agent.get('/v1/me/notifications')).body.items).toEqual([])
    await a.agent.post(`/v1/notifications/${id}/read`).expect(200)
    expect((await a.agent.get('/v1/me/notifications')).body.unread_count).toBe(0)
  })

  it('a device token moves to its new owner and can be removed', async () => {
    const a = await phoneLogin(t, '+77071230001')
    const b = await phoneLogin(t, '+77071230002')
    const first = await a.agent.post('/v1/me/devices').send({ token: 'shared-phone-token-0001', platform: 'ios' })
    const second = await b.agent.post('/v1/me/devices').send({ token: 'shared-phone-token-0001', platform: 'ios' })
    expect(second.body.id).toBe(first.body.id)
    expect((await owner.deviceToken.findUniqueOrThrow({ where: { id: first.body.id } })).userId).toBe(b.body.user.id)

    expect((await a.agent.delete(`/v1/me/devices/${first.body.id}`)).status).toBe(404)
    await b.agent.delete(`/v1/me/devices/${first.body.id}`).expect(200)
    expect(await owner.deviceToken.count()).toBe(0)
  })

  it('a new join request notifies the chairman', async () => {
    const chairman = await makeUser()
    const { house } = await makeHouse({ chairman })
    const r = await phoneLogin(t, '+77071230001')
    await r.agent.post('/v1/join-requests').send({ house_id: house.id, unit_number: '3', relation: 'OWNER' }).expect(201)
    const n = await owner.notification.findFirstOrThrow({ where: { userId: chairman.id } })
    expect(n).toMatchObject({ category: 'MEMBERSHIP', title: 'Новая заявка на вступление' })
  })
})
