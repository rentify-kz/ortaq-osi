import { execSync } from 'node:child_process'

/**
 * Перед прогоном — все миграции на тестовой БД (RLS, триггеры, права). Только deploy, без reset:
 * данные между тестами чистит resetDb() в helpers.ts
 */
export default function setup() {
  process.loadEnvFile('.env.test')
  if (!process.env.MIGRATE_DATABASE_URL?.endsWith('/ortaq_test')) {
    throw new Error('Тесты запускаются только на базе ortaq_test')
  }
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'pipe' })
}
