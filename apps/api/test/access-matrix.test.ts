import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, createApp, login, makeHouse, makeUser, owner, phoneLogin, resetDb, type TestApp } from './helpers'

/**
 * Матрица доступа (docs/13 §3): каждый эндпоинт дома против каждой роли. Чужой дом
 * неотличим от несуществующего (404), недостаточная роль — 403, нужная роль проходит
 * проверки доступа (дальше может быть 400 за пустое тело или 428 за step-up — это не доступ).
 */
type Role = 'CHAIRMAN' | 'ACCOUNTANT' | 'WORKER' | 'RESIDENT'
const ALL: Role[] = ['CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT']
const BOARD: Role[] = ['CHAIRMAN', 'ACCOUNTANT']
const CHAIR: Role[] = ['CHAIRMAN']

let t: TestApp
let houseId = ''
let unitId = ''
let staffId = ''
let contractorId = ''
let announcementId = ''
const agents = {} as Record<Role | 'OUTSIDER', ReturnType<typeof request.agent>>

beforeAll(async () => {
  t = await createApp()
  await resetDb()
  const chairman = await makeUser()
  const accountant = await makeUser()
  const { house } = await makeHouse({ chairman })
  houseId = house.id
  await addMember(house.id, accountant.id, 'ACCOUNTANT')
  unitId = (await owner.unit.findFirstOrThrow({ where: { houseId } })).id
  staffId = (await owner.staffMember.create({ data: { houseId, fullName: 'Петров Иван', position: 'Дворник' } })).id
  contractorId = (await owner.contractor.create({ data: { houseId, name: 'ТОО Лифт' } })).id
  announcementId = (await owner.announcement.create({ data: { houseId, authorId: chairman.id, title: 'Тест', body: 'Текст', audience: 'ALL' } })).id

  agents.CHAIRMAN = await login(t, chairman)
  agents.ACCOUNTANT = await login(t, accountant)
  const worker = await phoneLogin(t, '+77071230001')
  await addMember(houseId, worker.body.user.id, 'WORKER')
  agents.WORKER = worker.agent
  const resident = await phoneLogin(t, '+77071230002')
  await addMember(houseId, resident.body.user.id, 'RESIDENT')
  agents.RESIDENT = resident.agent
  agents.OUTSIDER = (await phoneLogin(t, '+77071230003')).agent
})
afterAll(async () => {
  await t.app.close()
})

const endpoints: [method: 'get' | 'post' | 'patch' | 'delete', path: () => string, allowed: Role[]][] = [
  ['get', () => `/houses/${houseId}`, ALL],
  ['get', () => `/houses/${houseId}/me`, ALL],
  ['get', () => `/houses/${houseId}/readiness`, BOARD],
  ['get', () => `/houses/${houseId}/units`, BOARD],
  ['patch', () => `/houses/${houseId}/units/${unitId}`, CHAIR],
  ['post', () => `/houses/${houseId}/units/bulk-areas`, CHAIR],
  ['get', () => `/houses/${houseId}/members`, CHAIR],
  ['post', () => `/houses/${houseId}/members`, CHAIR],
  ['delete', () => `/houses/${houseId}/members/${crypto.randomUUID()}`, CHAIR],
  ['get', () => `/houses/${houseId}/invites`, CHAIR],
  ['post', () => `/houses/${houseId}/invites`, CHAIR],
  ['get', () => `/houses/${houseId}/join-requests`, CHAIR],
  ['get', () => `/houses/${houseId}/ownerships/pending`, CHAIR],
  ['get', () => `/houses/${houseId}/registry`, CHAIR],
  ['post', () => `/houses/${houseId}/registry/imports`, CHAIR],
  ['get', () => `/houses/${houseId}/audit/verify`, CHAIR],
  ['get', () => `/houses/${houseId}/staff`, ALL],
  ['post', () => `/houses/${houseId}/staff`, CHAIR],
  ['patch', () => `/houses/${houseId}/staff/${staffId}`, CHAIR],
  ['get', () => `/houses/${houseId}/contractors`, ALL],
  ['post', () => `/houses/${houseId}/contractors`, CHAIR],
  ['patch', () => `/houses/${houseId}/contractors/${contractorId}`, CHAIR],
  ['get', () => `/houses/${houseId}/announcements`, ALL],
  ['post', () => `/houses/${houseId}/announcements`, CHAIR],
  ['patch', () => `/houses/${houseId}/announcements/${announcementId}`, CHAIR],
  ['get', () => `/houses/${houseId}/announcements/${announcementId}/stats`, CHAIR],
]

describe('access matrix', () => {
  it.each(endpoints)('%s %s', async (method, path, allowed) => {
    const url = `/v1${path()}`
    for (const role of ALL) {
      t.limiter.reset()
      const res = await agents[role][method](url).send({})
      if (allowed.includes(role)) expect([401, 403, 404], `${role} should pass ${method} ${url}`).not.toContain(res.status)
      else expect(res.status, `${role} must be refused ${method} ${url}`).toBe(403)
    }
    expect((await agents.OUTSIDER[method](url).send({})).status).toBe(404)
    expect((await request(t.app.getHttpServer())[method](url).send({})).status).toBe(401)
  })
})
