import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp, login, makeBin, makeHouse, makeUser, owner, PASSWORD, resetDb, stepUpToken, totp, type TestApp } from './helpers'

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

/** Значение cookie из ответа */
function cookie(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined
  return raw?.find((c) => c.startsWith(`${name}=`))?.split(';')[0]?.slice(name.length + 1)
}

describe('password login', () => {
  it('requires 2FA setup for an admin without TOTP and enables it with a valid code', async () => {
    const admin = await makeUser({ admin: true, totp: false })
    const agent = request.agent(t.app.getHttpServer())

    const first = await agent.post('/v1/auth/password/login').send({ email: admin.email, password: PASSWORD })
    expect(first.body.status).toBe('2FA_SETUP_REQUIRED')

    const setup = await agent.post('/v1/auth/2fa/setup').send({ challenge: first.body.challenge })
    expect(setup.status).toBe(200)
    expect(setup.body.qr_data_url).toMatch(/^data:image\/png;base64,/)

    const wrong = await agent.post('/v1/auth/2fa/enable').send({ challenge: first.body.challenge, code: '000000' })
    expect(wrong.status).toBe(401)
    expect(wrong.body.error.code).toBe('INVALID_CODE')

    const ok = await agent.post('/v1/auth/2fa/enable').send({ challenge: first.body.challenge, code: totp.generate(setup.body.secret) })
    expect(ok.status).toBe(200)
    expect(ok.body.status).toBe('OK')

    const me = await agent.get('/v1/me')
    expect(me.status).toBe(200)
    expect(me.body).toMatchObject({ email: admin.email, is_platform_admin: true })
  })

  it('answers the same 401 for a wrong password and an unknown email', async () => {
    const user = await makeUser()
    const wrong = await http().post('/v1/auth/password/login').send({ email: user.email, password: 'wrong password 123' })
    const unknown = await http().post('/v1/auth/password/login').send({ email: 'nobody@test.local', password: 'wrong password 123' })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
  })

  it('does not accept a 2FA challenge as an access token', async () => {
    const user = await makeUser()
    const first = await http().post('/v1/auth/password/login').send({ email: user.email, password: PASSWORD })
    const me = await http().get('/v1/me').set('Authorization', `Bearer ${first.body.challenge}`)
    expect(me.status).toBe(401)
  })

  it('rate-limits repeated login attempts for one email', async () => {
    const user = await makeUser()
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      statuses.push((await http().post('/v1/auth/password/login').send({ email: user.email, password: 'wrong password 123' })).status)
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statuses[5]).toBe(429)
  })
})

describe('refresh token rotation', () => {
  it('rotates the refresh token and revokes the whole family when an old one is reused', async () => {
    const user = await makeUser()
    const first = await http().post('/v1/auth/password/login').send({ email: user.email, password: PASSWORD })
    const logged = await http().post('/v1/auth/2fa/verify').send({ challenge: first.body.challenge, code: totp.generate(user.secret) })
    const original = cookie(logged, 'ortaq_rt')
    expect(original).toBeTruthy()

    const rotated = await http().post('/v1/auth/refresh').set('Cookie', `ortaq_rt=${original}`)
    expect(rotated.status).toBe(200)
    const fresh = cookie(rotated, 'ortaq_rt')
    expect(fresh).toBeTruthy()
    expect(fresh).not.toBe(original)

    // Старый токен предъявлен повторно: считаем его украденным
    const reuse = await http().post('/v1/auth/refresh').set('Cookie', `ortaq_rt=${original}`)
    expect(reuse.status).toBe(401)
    // Вместе с ним отозван и свежий токен той же семьи
    const afterReuse = await http().post('/v1/auth/refresh').set('Cookie', `ortaq_rt=${fresh}`)
    expect(afterReuse.status).toBe(401)

    const audit = await owner.auditLog.findMany({ where: { action: 'session.reuse_detected' } })
    expect(audit).toHaveLength(1)
  })

  it('returns tokens in the body for the mobile client', async () => {
    const user = await makeUser()
    const first = await http().post('/v1/auth/password/login').set('X-Client', 'mobile').send({ email: user.email, password: PASSWORD })
    const res = await http().post('/v1/auth/2fa/verify').set('X-Client', 'mobile').send({ challenge: first.body.challenge, code: totp.generate(user.secret) })
    expect(res.body.access_token).toBeTruthy()
    expect(res.body.refresh_token).toBeTruthy()
    expect(res.headers['set-cookie']).toBeUndefined()

    const me = await http().get('/v1/me').set('Authorization', `Bearer ${res.body.access_token}`)
    expect(me.status).toBe(200)
  })

  it('logout revokes the session family', async () => {
    const user = await makeUser()
    const first = await http().post('/v1/auth/password/login').send({ email: user.email, password: PASSWORD })
    const logged = await http().post('/v1/auth/2fa/verify').send({ challenge: first.body.challenge, code: totp.generate(user.secret) })
    const at = cookie(logged, 'ortaq_at')
    const rt = cookie(logged, 'ortaq_rt')
    await http().post('/v1/auth/logout').set('Cookie', `ortaq_at=${at}`).expect(204)
    const refresh = await http().post('/v1/auth/refresh').set('Cookie', `ortaq_rt=${rt}`)
    expect(refresh.status).toBe(401)
  })
})

describe('step-up and admin access', () => {
  it('asks for step-up with 428 and accepts the action with a fresh token', async () => {
    const admin = await makeUser({ admin: true })
    const agent = await login(t, admin)
    const body = { name: 'ОСИ Ромашка', bin: makeBin(), management_form: 'OSI', legal_address: 'г. Алматы, ул. Абая 1' }

    const without = await agent.post('/v1/admin/organizations').send(body)
    expect(without.status).toBe(428)
    expect(without.body.error.code).toBe('STEP_UP_REQUIRED')

    const token = await stepUpToken(agent, admin.secret)
    const withToken = await agent.post('/v1/admin/organizations').set('X-Step-Up-Token', token).send(body)
    expect(withToken.status).toBe(201)
  })

  it('rejects a step-up token issued to another user', async () => {
    const admin = await makeUser({ admin: true })
    const other = await makeUser({ admin: true })
    const agent = await login(t, admin)
    const otherAgent = await login(t, other)
    const foreign = await stepUpToken(otherAgent, other.secret)
    const res = await agent
      .post('/v1/admin/organizations')
      .set('X-Step-Up-Token', foreign)
      .send({ name: 'ОСИ Ромашка', bin: makeBin(), management_form: 'OSI', legal_address: 'г. Алматы, ул. Абая 1' })
    expect(res.status).toBe(428)
  })

  it('closes the admin panel to the mobile client and to non-admins', async () => {
    const admin = await makeUser({ admin: true })
    const first = await http().post('/v1/auth/password/login').set('X-Client', 'mobile').send({ email: admin.email, password: PASSWORD })
    const mobile = await http().post('/v1/auth/2fa/verify').set('X-Client', 'mobile').send({ challenge: first.body.challenge, code: totp.generate(admin.secret) })
    const viaBearer = await http().get('/v1/admin/houses').set('Authorization', `Bearer ${mobile.body.access_token}`)
    expect(viaBearer.status).toBe(403)

    const chairman = await makeUser()
    await makeHouse({ chairman })
    const agent = await login(t, chairman)
    expect((await agent.get('/v1/admin/houses')).status).toBe(403)
  })
})
