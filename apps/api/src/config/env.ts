import { z } from 'zod'

/**
 * Конфигурация из окружения, проверяется при старте: без обязательного секрета
 * приложение не запускается, а не падает позже на первом запросе.
 */
const base64Key = (bytes: number) =>
  z.string().refine((v) => Buffer.from(v, 'base64').length === bytes, `ровно ${bytes} байта в base64`)

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
  WEB_ORIGIN: z.url(),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: base64Key(32),
  HMAC_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length >= 32, 'не короче 32 байт в base64'),
  SMTP_URL: z.string().min(1),
  MAIL_FROM: z.string().min(3),
  PASSWORD_BREACH_CHECK: z.enum(['hibp', 'off']).default('hibp'),
  /** dev — заглушка SIGEX с тестовым сертификатом. В production подпись должна быть настоящей */
  SIGNATURE_PROVIDER: z.enum(['dev', 'sigex']).default('dev'),
}).refine((e) => !(e.NODE_ENV === 'production' && e.SIGNATURE_PROVIDER === 'dev'), {
  path: ['SIGNATURE_PROVIDER'],
  message: 'заглушка подписи запрещена в production',
})

export type Env = z.infer<typeof schema>

let cached: Env | undefined

export function env(): Env {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Некорректная конфигурация окружения: ${fields}`)
  }
  cached = parsed.data
  return cached
}
