import { afterAll, beforeAll, expect, it } from 'vitest';
import { type TestApp, createTestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ RATE_LIMIT_ENABLED: 'true' });
});
afterAll(() => t.close());

it('limits login attempts to 5 per 15 minutes per IP and email', async () => {
  const body = { email: 'bruteforce@test.local', password: 'wrong-password-1' };
  for (let i = 0; i < 5; i++) await t.http.post('/v1/auth/password/login').send(body).expect(401);
  const res = await t.http.post('/v1/auth/password/login').send(body).expect(429);
  expect(res.body.error.code).toBe('RATE_LIMITED');
  expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
});
