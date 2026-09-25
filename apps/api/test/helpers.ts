import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { CryptoService } from '../src/common/crypto/crypto.service.js';
import type { AppConfig } from '../src/config/config.js';
import { MAIL_PROVIDER } from '../src/integrations/mail/mail.provider.js';
import type { MockMailProvider } from '../src/integrations/mail/mock-mail.provider.js';
import { TEST_DB, testConfig } from './test-env.js';

export const PASSWORD = 'correct-horse-battery-staple';
export const CSRF = { 'X-Requested-With': 'ortaq-web' };

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  config: AppConfig;
  mail: MockMailProvider;
  /** Прямой доступ к БД ролью app_admin — для подготовки данных и проверок. */
  db: PrismaClient;
  crypto: CryptoService;
  close(): Promise<void>;
}

export async function createTestApp(overrides: Partial<Record<string, string>> = {}): Promise<TestApp> {
  const config = testConfig(overrides);
  const app = await createApp(config);
  await app.init();
  const db = new PrismaClient({ datasourceUrl: TEST_DB.admin });
  return {
    app,
    http: request(app.getHttpServer()),
    config,
    mail: app.get(MAIL_PROVIDER),
    db,
    crypto: new CryptoService(config),
    async close() {
      await db.$disconnect();
      await app.close();
    },
  };
}

let seq = 0;
export function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${process.pid}-${Date.now().toString(36)}-${seq}`;
}

/** Случайный корректный БИН (12 цифр с контрольным разрядом). */
export function randomBin(): string {
  for (;;) {
    const d = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10));
    let c = d.reduce((a, x, i) => a + (i + 1) * x, 0) % 11;
    if (c === 10) {
      c = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2].reduce((a, w, i) => a + w * d[i]!, 0) % 11;
      if (c === 10) continue;
    }
    return d.join('') + String(c);
  }
}

/** Код TOTP для шага со смещением: логин и step-up в одном окне 30 с не могут использовать один код. */
export function totp(secret: string, stepOffset = 0): string {
  return authenticator.clone({ epoch: Date.now() + stepOffset * 30_000 }).generate(secret);
}

export interface UserFixture {
  id: string;
  email: string;
  totpSecret: string;
}

/** Активный пользователь с паролем и TOTP, созданный напрямую в БД. */
export async function createUser(
  t: TestApp,
  opts: { admin?: boolean; name?: string } = {},
): Promise<UserFixture> {
  const email = `${unique(opts.admin ? 'admin' : 'user')}@test.local`;
  const totpSecret = authenticator.generateSecret(20);
  const user = await t.db.user.create({
    data: {
      email,
      full_name: opts.name ?? 'Тестовый Пользователь',
      is_platform_admin: opts.admin ?? false,
      password_hash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      totp_secret_encrypted: t.crypto.encryptTotpSecret(totpSecret),
      totp_enabled_at: new Date(),
      status: 'ACTIVE',
    },
  });
  return { id: user.id, email, totpSecret };
}

export interface WebSession {
  agent: ReturnType<typeof request.agent>;
  user: UserFixture;
  /** Step-up токен (живёт 5 минут). */
  stepUp: string;
}

/** Полный вход веб-клиентом: пароль → TOTP → cookie; затем step-up кодом следующего шага. */
export async function loginWeb(t: TestApp, user: UserFixture): Promise<WebSession> {
  const agent = request.agent(t.app.getHttpServer());
  const login = await agent
    .post('/v1/auth/password/login')
    .send({ email: user.email, password: PASSWORD })
    .expect(200);
  await agent
    .post('/v1/auth/2fa/verify')
    .send({ challenge_token: login.body.challenge_token, code: totp(user.totpSecret) })
    .expect(200);
  const su = await agent
    .post('/v1/auth/step-up')
    .set(CSRF)
    .send({ method: 'TOTP', code: totp(user.totpSecret, 1) })
    .expect(200);
  return { agent, user, stepUp: su.body.step_up_token as string };
}

/** Вход мобильным клиентом: токены в теле ответа. */
export async function loginMobile(
  t: TestApp,
  user: UserFixture,
): Promise<{ access: string; refresh: string }> {
  const login = await t.http
    .post('/v1/auth/password/login')
    .set('X-Client', 'mobile')
    .send({ email: user.email, password: PASSWORD })
    .expect(200);
  const res = await t.http
    .post('/v1/auth/2fa/verify')
    .send({ challenge_token: login.body.challenge_token, code: totp(user.totpSecret) })
    .expect(200);
  return { access: res.body.access_token, refresh: res.body.refresh_token };
}

export interface HouseFixture {
  orgId: string;
  houseId: string;
}

/** Организация и дом через админ-API (генерация помещений включена). */
export async function createHouse(t: TestApp, admin: WebSession, units = 12): Promise<HouseFixture> {
  const org = await admin.agent
    .post('/v1/admin/organizations')
    .set(CSRF)
    .set('X-Step-Up-Token', admin.stepUp)
    .send({
      name: unique('ОСИ'),
      bin: randomBin(),
      management_form: 'OSI',
      legal_address: 'г. Алматы, ул. Тестовая 1',
    })
    .expect(201);
  const house = await admin.agent
    .post('/v1/admin/houses')
    .set(CSRF)
    .set('X-Step-Up-Token', admin.stepUp)
    .send({
      organization_id: org.body.id,
      address: 'г. Алматы, ул. Тестовая 1',
      display_name: unique('Дом'),
      entrance_count: 2,
      unit_count: units,
      floor_count: 3,
    })
    .expect(201);
  return { orgId: org.body.id, houseId: house.body.id };
}

/** Председатель дома, заведённый напрямую (быстрее полного онбординга; сам онбординг — в auth.e2e). */
export async function createChairman(t: TestApp, houseId: string): Promise<UserFixture> {
  const user = await createUser(t, { name: 'Председатель' });
  await t.db.houseMembership.create({
    data: { house_id: houseId, user_id: user.id, role: 'CHAIRMAN', joined_via: 'ADMIN_PROVISION' },
  });
  return user;
}
