import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'
import request from 'supertest'
import { expect } from 'vitest'
import { AppModule } from '../src/app.module'
import { configure } from '../src/bootstrap'
import { RateLimiter } from '../src/common/guards'
import { CryptoService } from '../src/infra/crypto.service'
import { MailerService } from '../src/infra/mailer.service'
import { SmsService } from '../src/infra/sms.service'
import { PushService } from '../src/infra/push.service'
import { NotificationsDispatcher } from '../src/modules/notifications/notifications.dispatcher'
import { MemoryStorageProvider } from '../src/integrations/storage/memory-storage.provider'
import { STORAGE_PROVIDER } from '../src/integrations/storage/storage.provider'
import { TotpService } from '../src/modules/auth/totp.service'
import { generateUnits } from '../src/modules/admin/units.generator'

export const PASSWORD = 'correct horse battery staple'

/** Роль-владелец: обходит RLS. Только для подготовки данных и для проверки подделки журнала */
export const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATE_DATABASE_URL })

const crypto = new CryptoService()
export const totp = new TotpService()

export type TestApp = {
  app: NestExpressApplication; mailer: MailerService; sms: SmsService; push: PushService; dispatcher: NotificationsDispatcher; limiter: RateLimiter
  storage: MemoryStorageProvider
}

export async function createApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: process.env.TEST_LOG ? ['error', 'warn'] : false })
  configure(app)
  await app.init()
  return {
    app, mailer: app.get(MailerService), sms: app.get(SmsService), push: app.get(PushService),
    dispatcher: app.get(NotificationsDispatcher), limiter: app.get(RateLimiter), storage: app.get(STORAGE_PROVIDER),
  }
}

export async function resetDb() {
  await owner.$executeRawUnsafe(
    'TRUNCATE audit_log, sessions, auth_tokens, otp_codes, consents, signatures, verifications, owner_registry_entries, registry_imports, ' +
      'announcement_reads, announcement_targets, announcements, staff_members, contractors, device_tokens, notifications, notification_preferences, ' +
      'transaction_documents, transactions, finance_accounts, ai_jobs, task_completions, tasks, recurring_task_templates, request_followers, request_events, request_stages, requests, files, ' +
      'join_requests, invites, unit_ownerships, house_memberships, units, houses, organizations, users CASCADE',
  )
}

let seq = 0
const next = () => ++seq

/** Пользователь с паролем и, при необходимости, уже подключённой 2FA */
export async function makeUser(opts: { email?: string; admin?: boolean; totp?: boolean; phone?: string; fullName?: string } = {}) {
  const secret = totp.generateSecret()
  const user = await owner.user.create({
    data: {
      email: opts.email ?? `user${next()}@test.local`,
      phone: opts.phone,
      fullName: opts.fullName ?? 'Тестовый Пользователь',
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      isPlatformAdmin: opts.admin ?? false,
      status: 'ACTIVE',
      totpSecretEncrypted: opts.totp === false ? null : crypto.encrypt(secret),
      totpEnabledAt: opts.totp === false ? null : new Date(),
    },
  })
  return { ...user, secret }
}

/** Валидный БИН с контрольным разрядом: 11 случайных цифр и подобранный двенадцатый */
export function makeBin(): string {
  for (;;) {
    const base = String(Math.floor(Math.random() * 1e11)).padStart(11, '0')
    const d = [...base].map(Number)
    let c = d.reduce((s, v, i) => s + v * (i + 1), 0) % 11
    if (c === 10) c = d.reduce((s, v, i) => s + v * ([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2][i] ?? 0), 0) % 11
    if (c !== 10) return base + c
  }
}

/** Дом с помещениями без площадей и, по желанию, председателем */
export async function makeHouse(opts: { units?: number; chairman?: { id: string } } = {}) {
  const org = await owner.organization.create({
    data: { name: `ОСИ Тест ${next()}`, bin: makeBin(), managementForm: 'OSI', legalAddress: 'г. Алматы, ул. Тестовая 1' },
  })
  const count = opts.units ?? 8
  const house = await owner.house.create({
    data: { organizationId: org.id, address: 'г. Алматы, ул. Тестовая 1', displayName: `ЖК Тест, блок ${next()}`, entranceCount: 2, unitCount: count, floorCount: 4 },
  })
  await owner.unit.createMany({
    data: generateUnits([
      { entrance: 1, from: 1, to: Math.ceil(count / 2), floors: 4 },
      { entrance: 2, from: Math.ceil(count / 2) + 1, to: count, floors: 4 },
    ]).map((u) => ({ ...u, houseId: house.id })),
  })
  if (opts.chairman) {
    await owner.houseMembership.create({ data: { houseId: house.id, userId: opts.chairman.id, role: 'CHAIRMAN', joinedVia: 'ADMIN_PROVISION' } })
  }
  return { org, house }
}

export async function addMember(houseId: string, userId: string, role: 'RESIDENT' | 'WORKER' | 'ACCOUNTANT') {
  return owner.houseMembership.create({ data: { houseId, userId, role, joinedVia: 'CHAIRMAN_ADD' } })
}

/** Полный вход: пароль, затем код. Агент дальше ходит с cookie */
export async function login(t: TestApp, user: { email: string | null; secret: string }) {
  const agent = request.agent(t.app.getHttpServer())
  const first = await agent.post('/v1/auth/password/login').send({ email: user.email, password: PASSWORD })
  expect(first.status).toBe(200)
  expect(first.body.status).toBe('2FA_REQUIRED')
  const second = await agent.post('/v1/auth/2fa/verify').send({ challenge: first.body.challenge, code: totp.generate(user.secret) })
  expect(second.status).toBe(200)
  return agent
}

export async function stepUpToken(agent: ReturnType<typeof request.agent>, secret: string): Promise<string> {
  const res = await agent.post('/v1/auth/step-up').send({ code: totp.generate(secret) })
  expect(res.status).toBe(200)
  return res.body.step_up_token as string
}

/** Вход жильца по телефону: код берётся из заглушки SMS. Агент дальше ходит с cookie */
export async function phoneLogin(t: TestApp, phone: string) {
  const agent = request.agent(t.app.getHttpServer())
  expect((await agent.post('/v1/auth/otp/request').send({ phone })).status).toBe(200)
  const code = t.sms.outbox.at(-1)?.text.match(/\d{6}/)?.[0]
  const res = await agent.post('/v1/auth/otp/verify').send({ phone, code })
  expect(res.status).toBe(200)
  return { agent, body: res.body as { is_new: boolean; user: { id: string; full_name: string } } }
}

/** Фото, как его прислал бы телефон: JPEG с EXIF (в нём у настоящего телефона — GPS) */
export async function photo(width = 640, height = 480): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 160, b: 130 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'secret-location', Make: 'TestPhone' } })
    .toBuffer()
}

/** Загрузка фото по полному пути: upload-url → «телефон» кладёт файл → finalize. Возвращает id */
export async function uploadPhoto(t: TestApp, agent: ReturnType<typeof request.agent>, houseId: string, purpose: 'REQUEST_PHOTO' | 'TASK_PHOTO' | 'FINANCE_DOCUMENT' = 'REQUEST_PHOTO') {
  const body = await photo()
  const res = await agent.post(`/v1/houses/${houseId}/files/upload-url`).send({ purpose, mime_type: 'image/jpeg', size_bytes: body.length, name: 'IMG_0001.jpg' })
  expect(res.status).toBe(201)
  t.storage.putAsClient(res.body.upload_url, body)
  const fin = await agent.post(`/v1/houses/${houseId}/files/${res.body.file_id}/finalize`)
  expect(fin.status).toBe(200)
  return res.body.file_id as string
}

/** Минимальный PDF, как его сохранил бы сканер или банк-клиент. extra — для подмешивания активного содержимого */
export function pdf(extra = ''): Buffer {
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R${extra}>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'latin1')
}

/** Загрузка PDF финансового документа по полному пути. Возвращает ответ finalize */
export async function uploadPdf(t: TestApp, agent: ReturnType<typeof request.agent>, houseId: string, body = pdf()) {
  const res = await agent.post(`/v1/houses/${houseId}/files/upload-url`).send({ purpose: 'FINANCE_DOCUMENT', mime_type: 'application/pdf', size_bytes: body.length, name: 'Акт №12.pdf' })
  expect(res.status).toBe(201)
  t.storage.putAsClient(res.body.upload_url, body)
  const fin = await agent.post(`/v1/houses/${houseId}/files/${res.body.file_id}/finalize`)
  return { id: res.body.file_id as string, finalize: fin }
}
