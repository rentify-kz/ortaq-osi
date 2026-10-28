import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { RecurringScheduler } from '../src/modules/recurring/recurring.scheduler'
import { addMember, createApp, login, makeHouse, makeUser, owner, phoneLogin, resetDb, type TestApp } from './helpers'

let t: TestApp
let scheduler: RecurringScheduler

beforeAll(async () => {
  t = await createApp()
  scheduler = t.app.get(RecurringScheduler)
})
afterAll(async () => {
  await t.app.close()
})
beforeEach(async () => {
  await resetDb()
  t.limiter.reset()
})

async function setup() {
  const chairman = await makeUser()
  const { house } = await makeHouse({ chairman })
  const chair = await login(t, chairman)
  const w = await phoneLogin(t, '+77071230003')
  await addMember(house.id, w.body.user.id, 'WORKER')
  return { house, chairman, chair, worker: { agent: w.agent, id: w.body.user.id }, base: `/v1/houses/${house.id}` }
}

// Пятница 30 октября 2026, 07:00 по Алматы (02:00Z): до 9:00 два часа
const FRIDAY_MORNING = new Date('2026-10-30T02:00:00Z')
const day = (n: number) => new Date(FRIDAY_MORNING.getTime() + n * 86_400_000)

/** Шаблон «создан» до сценария: тест не зависит от того, какое сегодня число на самом деле */
const backdate = () => owner.recurringTaskTemplate.updateMany({ data: { createdAt: new Date('2026-10-01T00:00:00Z') } })

describe('recurring tasks', () => {
  it('validates the schedule and previews the next dates', async () => {
    const s = await setup()
    expect((await s.chair.post(`${s.base}/recurring/preview`).send({ rrule: 'FREQ=HOURLY' })).body.error.code).toBe('RRULE_INVALID')
    const preview = await s.chair.post(`${s.base}/recurring/preview`).send({ rrule: 'FREQ=WEEKLY;BYDAY=FR' })
    expect(preview.body.next).toHaveLength(5)
    expect(new Date(preview.body.next[0]).getUTCDay()).toBe(5)
    expect((await s.chair.post(`${s.base}/recurring`).send({ title: 'Уборка двора', rrule: 'каждый день' })).status).toBe(422)
    expect((await s.chair.post(`${s.base}/recurring`).send({ title: 'Уборка двора', rrule: 'FREQ=DAILY', default_assignee_id: s.chairman.id })).status).toBe(422)
  })

  it('creates the task ahead of time, once, for the default worker', async () => {
    const s = await setup()
    const tpl = await s.chair.post(`${s.base}/recurring`).send({
      title: 'Уборка двора', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', default_assignee_id: s.worker.id, lead_time_hours: 12, requires_photo: true,
    })
    expect(tpl.status).toBe(201)
    expect(tpl.body.next).toHaveLength(3)
    await backdate()

    expect(await scheduler.run(FRIDAY_MORNING)).toEqual({ created: 1, expired: 0 })
    expect(await scheduler.run(FRIDAY_MORNING)).toEqual({ created: 0, expired: 0 })
    const task = await owner.task.findFirstOrThrow({ where: { recurringTemplateId: tpl.body.id } })
    expect(task).toMatchObject({ assigneeId: s.worker.id, source: 'RECURRING', requiresPhoto: true, status: 'ASSIGNED' })
    expect(task.occurrenceAt!.toISOString()).toBe('2026-10-30T04:00:00.000Z')
    expect(task.dueAt!.toISOString()).toBe('2026-10-30T18:59:00.000Z')

    const mine = await s.worker.agent.get(`${s.base}/my-tasks`)
    expect(mine.body[0]).toMatchObject({ title: 'Уборка двора', recurring: true })
  })

  it('missed routine does not pile up and the chairman hears after three misses', async () => {
    const s = await setup()
    await s.chair.post(`${s.base}/recurring`).send({ title: 'Уборка двора', rrule: 'FREQ=DAILY', default_assignee_id: s.worker.id, lead_time_hours: 0 }).expect(201)
    await backdate()
    for (let i = 0; i <= 4; i++) await scheduler.run(new Date(day(i).getTime() + 3 * 3600_000))

    const tasks = await owner.task.findMany({ orderBy: { occurrenceAt: 'asc' } })
    expect(tasks.map((x) => x.status)).toEqual(['EXPIRED', 'EXPIRED', 'EXPIRED', 'EXPIRED', 'ASSIGNED'])
    // На экране работника — одна задача на сегодня, а не пять
    expect((await s.worker.agent.get(`${s.base}/my-tasks`)).body).toHaveLength(1)
    const alerts = await owner.notification.findMany({ where: { userId: s.chairman.id, title: 'Рутина не выполняется' } })
    expect(alerts).toHaveLength(1)
  })

  it('a completed routine task is not expired', async () => {
    const s = await setup()
    await s.chair.post(`${s.base}/recurring`).send({ title: 'Обход техпомещений', rrule: 'FREQ=DAILY', default_assignee_id: s.worker.id, lead_time_hours: 0 }).expect(201)
    await backdate()
    await scheduler.run(new Date(day(0).getTime() + 3 * 3600_000))
    const first = await owner.task.findFirstOrThrow()
    await s.worker.agent.post(`${s.base}/tasks/${first.id}/complete`).send({ note: 'Всё в порядке' }).expect(200)
    await scheduler.run(new Date(day(1).getTime() + 3 * 3600_000))
    expect((await owner.task.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('SUBMITTED')
  })

  it('switching a template off cancels its future tasks', async () => {
    const s = await setup()
    const tpl = await s.chair.post(`${s.base}/recurring`).send({ title: 'Уборка снега', rrule: 'FREQ=DAILY', default_assignee_id: s.worker.id, lead_time_hours: 48 })
    await scheduler.run(new Date())
    expect(await owner.task.count({ where: { status: 'ASSIGNED' } })).toBeGreaterThan(0)
    const off = await s.chair.patch(`${s.base}/recurring/${tpl.body.id}`).send({ is_active: false })
    expect(off.body).toMatchObject({ is_active: false, next: [] })
    expect(await owner.task.count({ where: { status: 'ASSIGNED', occurrenceAt: { gt: new Date() } } })).toBe(0)
    expect((await scheduler.run(new Date())).created).toBe(0)
  })
})
