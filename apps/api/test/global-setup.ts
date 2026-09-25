import { execFileSync } from 'node:child_process';
import { TEST_DB } from './test-env.js';

/** Чистая схема ortaq_test и все миграции — тесты идут на тех же RLS и триггерах, что и прод. */
export default function setup(): void {
  const psql = (sql: string) =>
    execFileSync('psql', [TEST_DB.migrator, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdio: 'inherit' });
  psql('DROP SCHEMA IF EXISTS public CASCADE');
  psql('CREATE SCHEMA public');
  psql('GRANT USAGE ON SCHEMA public TO app_rw, app_admin');
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_MIGRATOR_URL: TEST_DB.migrator },
  });
}
