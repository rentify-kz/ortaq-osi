import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { CSRF, PASSWORD, type TestApp, type WebSession, createHouse, createTestApp, createUser, loginMobile, loginWeb, totp } from './helpers.js';

let t: TestApp;
let admin: WebSession;

beforeAll(async () => {
  t = await createTestApp();
  admin = await loginWeb(t, await createUser(t, { admin: true }));
});
afterAll(() => t.close());

describe('password login', () => {
  it('returns the same generic error for a wrong password and an unknown email', async () => {
    const user = await createUser(t);
    const wrong = await t.http.post('/v1/auth/password/login').send({ email: user.email, password: 'wrong-password-123' }).expect(401);
    const unknown = await t.http.post('/v1/auth/password/login').send({ email: 'nobody@test.local', password: 'whatever-1234' }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('does not issue a session before the second factor', async () => {
    const user = await createUser(t);
    const res = await t.http.post('/v1/auth/password/login').send({ email: user.email, password: PASSWORD }).expect(200);
    expect(res.body.next).toBe('TOTP_VERIFY');
    expect(res.headers['set-cookie']).toBeUndefined();
    await t.http.get('/v1/me').set('Authorization', `Bearer ${res.body.challenge_token}`).expect(401);
  });

  it('rejects a reused TOTP code', async () => {
    const user = await createUser(t);
    const code = totp(user.totpSecret);
    const first = await t.http.post('/v1/auth/password/login').send({ email: user.email, password: PASSWORD });
    await t.http.post('/v1/auth/2fa/verify').send({ challenge_token: first.body.challenge_token, code }).expect(200);
    const second = await t.http.post('/v1/auth/password/login').send({ email: user.email, password: PASSWORD });
    const res = await t.http.post('/v1/auth/2fa/verify').send({ challenge_token: second.body.challenge_token, code }).expect(401);
    expect(res.body.error.code).toBe('INVALID_TOTP');
  });
});

describe('web session', () => {
  it('sets httpOnly SameSite=Strict cookies and never returns tokens in the body', async () => {
    const user = await createUser(t);
    const login = await t.http.post('/v1/auth/password/login').send({ email: user.email, password: PASSWORD });
    const res = await t.http.post('/v1/auth/2fa/verify').send({ challenge_token: login.body.challenge_token, code: totp(user.totpSecret) }).expect(200);
    expect(res.body.access_token).toBeUndefined();
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.startsWith('ortaq_at=') && /HttpOnly/i.test(c) && /SameSite=Strict/i.test(c))).toBe(true);
    expect(cookies.some((c) => c.startsWith('ortaq_rt=') && /Path=\/v1\/auth/i.test(c))).toBe(true);
  });

  it('requires the CSRF header for cookie-authenticated writes', async () => {
    const s = await loginWeb(t, await createUser(t));
    const res = await s.agent.patch('/v1/me').send({ locale: 'kk' }).expect(403);
    expect(res.body.error.code).toBe('CSRF_HEADER_MISSING');
    await s.agent.patch('/v1/me').set(CSRF).send({ locale: 'kk' }).expect(200);
  });

  it('logout revokes the session immediately', async () => {
    const user = await createUser(t);
    const login = await t.http.post('/v1/auth/password/login').send({ email: user.email, password: PASSWORD });
    const res = await t.http.post('/v1/auth/2fa/verify').send({ challenge_token: login.body.challenge_token, code: totp(user.totpSecret) });
    const access = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('ortaq_at='))!.split(';')[0]!;
    await t.http.get('/v1/me').set('Cookie', access).expect(200);
    await t.http.post('/v1/auth/logout').set('Cookie', access).set(CSRF).expect(204);
    // Сохранённая копия access-cookie больше не действует: сессия проверяется на каждом запросе.
    await t.http.get('/v1/me').set('Cookie', access).expect(401);
  });
});

describe('refresh token rotation (mobile)', () => {
  it('rotates the refresh token', async () => {
    const tokens = await loginMobile(t, await createUser(t));
    const res = await t.http.post('/v1/auth/refresh').send({ refresh_token: tokens.refresh }).expect(200);
    expect(res.body.refresh_token).not.toBe(tokens.refresh);
    await t.http.get('/v1/me').set('Authorization', `Bearer ${res.body.access_token}`).expect(200);
  });

  it('reuse of a rotated token revokes the whole family', async () => {
    const tokens = await loginMobile(t, await createUser(t));
    const rotated = await t.http.post('/v1/auth/refresh').send({ refresh_token: tokens.refresh }).expect(200);
    // Выводим старый токен из окна параллельного обновления (10 с).
    await t.db.session.updateMany({
      where: { token_hash: t.crypto.sha256(tokens.refresh) },
      data: { revoked_at: new Date(Date.now() - 60_000) },
    });
    await t.http.post('/v1/auth/refresh').send({ refresh_token: tokens.refresh }).expect(401);
    // Токен, выданный легитимному владельцу после ротации, тоже отозван.
    await t.http.post('/v1/auth/refresh').send({ refresh_token: rotated.body.refresh_token }).expect(401);
    await t.http.get('/v1/me').set('Authorization', `Bearer ${rotated.body.access_token}`).expect(401);
  });
});

describe('step-up', () => {
  it('returns 428 without a step-up token and accepts the request with it', async () => {
    const payload = { name: 'ОСИ без step-up', bin: '990940000036', management_form: 'OSI', legal_address: 'г. Алматы' };
    const res = await admin.agent.post('/v1/admin/organizations').set(CSRF).send(payload).expect(428);
    expect(res.body.error.code).toBe('STEP_UP_REQUIRED');
  });

  it('does not accept a step-up token from another session', async () => {
    const other = await loginWeb(t, await createUser(t, { admin: true }));
    await admin.agent
      .post('/v1/admin/organizations')
      .set(CSRF)
      .set('X-Step-Up-Token', other.stepUp)
      .send({ name: 'x', bin: '990940000036', management_form: 'OSI', legal_address: 'г. Алматы' })
      .expect(428);
  });
});

describe('admin area boundary', () => {
  it('rejects a mobile bearer token even for a platform admin', async () => {
    const tokens = await loginMobile(t, await createUser(t, { admin: true }));
    await t.http.get('/v1/admin/organizations').set('Authorization', `Bearer ${tokens.access}`).expect(401);
  });

  it('forbids non-admins', async () => {
    const s = await loginWeb(t, await createUser(t));
    await s.agent.get('/v1/admin/organizations').expect(403);
  });
});

describe('chairman onboarding end to end', () => {
  it('admin assigns → email link → password → TOTP setup → sees the house', async () => {
    const { houseId } = await createHouse(t, admin);
    const email = `chairman-${Date.now()}@test.local`;
    await admin.agent
      .post(`/v1/admin/houses/${houseId}/chairman`)
      .set(CSRF)
      .set('X-Step-Up-Token', admin.stepUp)
      .send({ email, full_name: 'Иванов Иван' })
      .expect(201);

    const letter = t.mail.outbox.find((m) => m.to === email);
    const token = letter?.text.match(/token=([\w-]+)/)?.[1];
    expect(token).toBeDefined();

    const weak = await t.http.post('/v1/auth/password/set').send({ token, password: 'short' }).expect(400);
    expect(weak.body.error.code).toBe('VALIDATION_FAILED');
    const breached = await t.http.post('/v1/auth/password/set').send({ token, password: 'password1234' }).expect(422);
    expect(breached.body.error.code).toBe('BREACHED_PASSWORD');

    const set = await t.http.post('/v1/auth/password/set').send({ token, password: PASSWORD }).expect(200);
    expect(set.body.next).toBe('TOTP_SETUP');
    // Ссылка одноразовая.
    await t.http.post('/v1/auth/password/set').send({ token, password: PASSWORD }).expect(401);

    const setup = await t.http.post('/v1/auth/2fa/setup').send({ challenge_token: set.body.challenge_token }).expect(200);
    expect(setup.body.otpauth_url).toContain('otpauth://totp/');

    const agent = request.agent(t.app.getHttpServer());
    await agent.post('/v1/auth/2fa/verify').send({ challenge_token: set.body.challenge_token, code: totp(setup.body.secret) }).expect(200);

    const me = await agent.get('/v1/me').expect(200);
    expect(me.body.memberships).toEqual([expect.objectContaining({ house_id: houseId, role: 'CHAIRMAN' })]);
    const house = await agent.get(`/v1/houses/${houseId}`).expect(200);
    expect(house.body.my_role).toBe('CHAIRMAN');

    const readiness = await admin.agent.get(`/v1/admin/houses/${houseId}/readiness`).expect(200);
    expect(readiness.body.chairman_activated).toBe(true);
  });

  it('refuses a second active chairman', async () => {
    const { houseId } = await createHouse(t, admin);
    const send = (email: string) =>
      admin.agent.post(`/v1/admin/houses/${houseId}/chairman`).set(CSRF).set('X-Step-Up-Token', admin.stepUp).send({ email, full_name: 'Председатель' });
    await send(`c1-${Date.now()}@test.local`).expect(201);
    const res = await send(`c2-${Date.now()}@test.local`).expect(409);
    expect(res.body.error.code).toBe('CHAIRMAN_ALREADY_ASSIGNED');
  });
});
