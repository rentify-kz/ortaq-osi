import { z } from 'zod';

const key32 = z
  .string()
  .min(1)
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'ожидается 32 байта в base64');

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  DATABASE_ADMIN_URL: z.string().url(),
  JWT_SECRET: key32,
  IIN_ENCRYPTION_KEY: key32,
  IIN_HMAC_KEY: key32,
  TOTP_ENCRYPTION_KEY: key32,
  WEB_ORIGIN: z.string().url(),
  ADMIN_ORIGIN: z.string().url(),
  PUBLIC_WEB_URL: z.string().url(),
  MAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Ortaq <no-reply@ortaq.kz>'),
  SIGNATURE_PROVIDER: z.enum(['mock']).default('mock'),
  IDENTITY_PROVIDER: z.enum(['mock']).default('mock'),
  PROPERTY_REGISTRY_PROVIDER: z.enum(['mock']).default('mock'),
  RATE_LIMIT_ENABLED: bool.default('true'),
  COOKIE_SECURE: bool.default('true'),
  TRUST_PROXY: bool.default('false'),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true in production');
  }
  return parsed.data;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
