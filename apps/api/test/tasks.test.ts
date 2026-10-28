import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addMember, createApp, login, makeHouse, makeUser, owner, phoneLogin, resetDb, uploadPhoto, type TestApp } from './helpers'

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

async function setup() {
  const chairman = await makeUser({ fullName: 'Кенжебаев Бауыржан' })
  const { house } = await makeHouse({ chairman })
  const chair = await login(t, chairman)
  const r = await phoneLogin(t, '+77071230001')
  await addMember(house.id, r.body.user.id, 'RESIDENT')
  const w = await phoneLogin(t, '+77071230003')
  await owner.user.update({ where: { id: w.body.user.id }, data: { fullName: 'Петров Сергей' } })
  await addMember(house.id, w.body.user.id, 'WORKER')
  await owner.staffMember.create({ data: { houseId: house.id, userId: w.body.user.id, fullName: 'Петров Сергей', position: 'Сантехник', specializations: ['PLUMBER'] } })
  const base = `/v1/houses/${house.id}`
  return { house, chairman, chair, resident: { agent: r.agent, id: r.body.user.id }, worker: { agent: w.agent, id: w.body.user.id }, base }
}

async function requestWithTask(s: Awaited<ReturnType<typeof setup>>, requiresPhoto = true) {
  const photo = await uploadPhoto(t, s.resident.agent, s.house.id)
  const req = await s.resident.agent.post(`${s.base}/requests`).send({ description: 'Течёт труба в подвале, вода на полу', category: 'PLUMBING', location_type: 'BASEMENT', location_entrance: 2, photo_file_ids: [photo] })
  await s.chair.post(`${s.base}/requests/${req.body.id}/accept`).expect(200)
  const plan = await s.chair.post(`${s.base}/requests/${req.body.id}/ai/suggest`)
  const withStages = await s.chair.post(`${s.base}/requests/${req.body.id}/stages`).send({ titles: plan.body.steps.slice(0, 3).map((x: { title: string }) => x.title) })
  const stage = withStages.body.stages[1]
  const task = await s.chair.post(`${s.base}/tasks`).send({ title: 'Заменить участок трубы', request_id: req.body.id, stage_id: stage.id, assignee_id: s.worker.id, priority: 'HIGH', requires_photo: requiresPhoto })
  expect(task.status).toBe(201)
  return { requestId: req.body.id as string, residentPhoto: photo, stageId: stage.id as string, taskId: task.body.id as string }
}

describe('from report to result', () => {
  it('worker fixes it, chairman approves, resident sees the photo only then', async () => {
    const s = await setup()
    const { requestId, residentPhoto, stageId, taskId } = await requestWithTask(s)

    // Работник получил push и видит задачу с фото от жильца
    expect(await owner.notification.findFirst({ where: { userId: s.worker.id, title: 'Новая задача' } })).not.toBeNull()
    const mine = await s.worker.agent.get(`${s.base}/my-tasks`)
    expect(mine.body).toHaveLength(1)
    expect(mine.body[0]).toMatchObject({ status: 'ASSIGNED', requires_photo: true, request: { number: 1, location_label: 'Подвал, 2 подъезд', photo_file_ids: [residentPhoto] } })
    expect((await s.worker.agent.get(`${s.base}/files/${residentPhoto}/download-url`)).status).toBe(200)

    const started = await s.worker.agent.post(`${s.base}/tasks/${taskId}/start`)
    expect(started.body.status).toBe('IN_PROGRESS')
    expect((await owner.requestStage.findUniqueOrThrow({ where: { id: stageId } })).status).toBe('IN_PROGRESS')
    expect((await owner.request.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('IN_PROGRESS')

    expect((await s.worker.agent.post(`${s.base}/tasks/${taskId}/complete`).send({ note: 'Готово' })).body.error.code).toBe('PHOTO_REQUIRED')
    const workPhoto = await uploadPhoto(t, s.worker.agent, s.house.id, 'TASK_PHOTO')
    const done = await s.worker.agent.post(`${s.base}/tasks/${taskId}/complete`).send({ note: 'Заменил 1,5 метра, поставил хомуты', photo_file_ids: [workPhoto] })
    expect(done.body).toMatchObject({ status: 'SUBMITTED', last_completion: { note: 'Заменил 1,5 метра, поставил хомуты', photo_file_ids: [workPhoto] } })
    expect(await owner.notification.findFirst({ where: { userId: s.chairman.id, title: 'Работа ждёт подтверждения' } })).not.toBeNull()

    // До подтверждения жилец фото работы не видит
    expect((await s.resident.agent.get(`${s.base}/requests/${requestId}`)).body.work_photo_file_ids).toEqual([])
    expect((await s.resident.agent.get(`${s.base}/files/${workPhoto}/download-url`)).status).toBe(404)

    const approved = await s.chair.post(`${s.base}/tasks/${taskId}/approve`).send({ visible_to_residents: true, include_in_report: true })
    expect(approved.body.status).toBe('APPROVED')
    expect((await owner.requestStage.findUniqueOrThrow({ where: { id: stageId } })).status).toBe('DONE')

    const seen = await s.resident.agent.get(`${s.base}/requests/${requestId}`)
    expect(seen.body.work_photo_file_ids).toEqual([workPhoto])
    expect(seen.body.progress).toMatchObject({ done: 1, total: 3 })
    expect((await s.resident.agent.get(`${s.base}/files/${workPhoto}/download-url`)).status).toBe(200)
    const history = (await s.resident.agent.get(`${s.base}/requests/${requestId}/activity`)).body.map((e: { type: string }) => e.type)
    expect(history).toEqual(['CREATED', 'ACCEPTED', 'STAGES_ADDED', 'TASK_ASSIGNED', 'WORK_APPROVED'])
    expect(await owner.notification.findFirst({ where: { userId: s.resident.id, title: 'Заявка №1: работа выполнена' } })).not.toBeNull()
  })

  it('photos the chairman keeps private stay private', async () => {
    const s = await setup()
    const { requestId, taskId } = await requestWithTask(s)
    const workPhoto = await uploadPhoto(t, s.worker.agent, s.house.id, 'TASK_PHOTO')
    await s.worker.agent.post(`${s.base}/tasks/${taskId}/complete`).send({ photo_file_ids: [workPhoto] }).expect(200)
    await s.chair.post(`${s.base}/tasks/${taskId}/approve`).send({ visible_to_residents: false }).expect(200)
    expect((await s.resident.agent.get(`${s.base}/requests/${requestId}`)).body.work_photo_file_ids).toEqual([])
    expect((await s.resident.agent.get(`${s.base}/files/${workPhoto}/download-url`)).status).toBe(404)
  })

  it('sending back needs a reason, keeps the photos and returns the task to work', async () => {
    const s = await setup()
    const { taskId } = await requestWithTask(s)
    const p1 = await uploadPhoto(t, s.worker.agent, s.house.id, 'TASK_PHOTO')
    await s.worker.agent.post(`${s.base}/tasks/${taskId}/complete`).send({ photo_file_ids: [p1] }).expect(200)
    expect((await s.chair.post(`${s.base}/tasks/${taskId}/reject`).send({})).status).toBe(400)
    const back = await s.chair.post(`${s.base}/tasks/${taskId}/reject`).send({ reason: 'Не видно места стыка, переснимите' })
    expect(back.body).toMatchObject({ status: 'IN_PROGRESS', last_completion: { rejection_reason: 'Не видно места стыка, переснимите', photo_file_ids: [p1] } })
    expect((await owner.notification.findFirstOrThrow({ where: { userId: s.worker.id, title: 'Работу вернули на доработку' } })).priority).toBe('HIGH')

    const p2 = await uploadPhoto(t, s.worker.agent, s.house.id, 'TASK_PHOTO')
    expect((await s.worker.agent.post(`${s.base}/tasks/${taskId}/complete`).send({ photo_file_ids: [p2] })).body.status).toBe('SUBMITTED')
  })
})

describe('offline completion', () => {
  it('a repeated submission from the queue creates one report, and time is taken from the phone', async () => {
    const s = await setup()
    const { taskId } = await requestWithTask(s, false)
    const body = { note: 'Сделано в подвале без связи', client_key: 'device-1-task-abc', completed_at: '2026-10-20T08:15:00.000Z' }
    expect((await s.worker.agent.post(`${s.base}/tasks/${taskId}/complete`).send(body)).status).toBe(200)
    expect((await s.worker.agent.post(`${s.base}/tasks/${taskId}/complete`).send(body)).status).toBe(200)
    const completions = await owner.taskCompletion.findMany({ where: { taskId } })
    expect(completions).toHaveLength(1)
    expect(completions[0]!.completedAt.toISOString()).toBe('2026-10-20T08:15:00.000Z')
  })

  it('work done on a task cancelled meanwhile is still recorded', async () => {
    const s = await setup()
    const { taskId } = await requestWithTask(s, false)
    await s.chair.patch(`${s.base}/tasks/${taskId}`).send({ status: 'CANCELLED' }).expect(200)
    const res = await s.worker.agent.post(`${s.base}/tasks/${taskId}/complete`).send({ note: 'Уже сделал', client_key: 'device-1-task-xyz' })
    expect(res.body.status).toBe('SUBMITTED')
  })
})

describe('assignment and isolation', () => {
  it('assigns only workers of this house or active contractors', async () => {
    const s = await setup()
    const other = await makeHouse()
    const stranger = await phoneLogin(t, '+77071230099')
    await addMember(other.house.id, stranger.body.user.id, 'WORKER')
    const post = (body: object) => s.chair.post(`${s.base}/tasks`).send({ title: 'Покрасить скамейки', ...body })
    expect((await post({ assignee_id: s.resident.id })).status).toBe(422)
    expect((await post({ assignee_id: stranger.body.user.id })).status).toBe(422)
    const contractor = await owner.contractor.create({ data: { houseId: s.house.id, name: 'ТОО Лифт' } })
    expect((await post({ assignee_id: s.worker.id, contractor_id: contractor.id })).status).toBe(400)
    expect((await post({ contractor_id: contractor.id })).status).toBe(201)
  })

  it('shows workload so the chairman does not overload one worker', async () => {
    const s = await setup()
    await requestWithTask(s)
    const res = await s.chair.get(`${s.base}/tasks/assignees`)
    expect(res.body.workers).toEqual([{ id: s.worker.id, name: 'Петров Сергей', position: 'Сантехник', specializations: ['PLUMBER'], active_tasks: 1 }])
  })

  it('another worker cannot see or touch the task, and a worker cannot rename stages', async () => {
    const s = await setup()
    const { requestId, stageId, taskId } = await requestWithTask(s, false)
    const other = await phoneLogin(t, '+77071230004')
    await addMember(s.house.id, other.body.user.id, 'WORKER')
    expect((await other.agent.get(`${s.base}/tasks/${taskId}`)).status).toBe(404)
    expect((await other.agent.post(`${s.base}/tasks/${taskId}/start`)).status).toBe(404)
    expect((await other.agent.post(`${s.base}/tasks/${taskId}/complete`).send({})).status).toBe(403)
    expect((await other.agent.get(`${s.base}/requests/${requestId}`)).status).toBe(404)

    expect((await s.worker.agent.patch(`${s.base}/requests/${requestId}/stages/${stageId}`).send({ title: 'Другое' })).status).toBe(403)
    expect((await s.worker.agent.patch(`${s.base}/requests/${requestId}/stages/${stageId}`).send({ status: 'IN_PROGRESS' })).status).toBe(200)
    expect((await s.resident.agent.patch(`${s.base}/requests/${requestId}/stages/${stageId}`).send({ status: 'DONE' })).status).toBe(403)
  })

  it('a contractor’s job is closed by the chairman from the act', async () => {
    const s = await setup()
    const contractor = await owner.contractor.create({ data: { houseId: s.house.id, name: 'ТОО «Лифт Сервис»' } })
    const task = await s.chair.post(`${s.base}/tasks`).send({ title: 'Ремонт лифта', contractor_id: contractor.id, requires_photo: false })
    const done = await s.chair.post(`${s.base}/tasks/${task.body.id}/complete`).send({ note: 'Акт № 14 от подрядчика' })
    expect(done.body.status).toBe('SUBMITTED')
    expect((await s.chair.post(`${s.base}/tasks/${task.body.id}/approve`).send({})).body.status).toBe('APPROVED')
  })
})
