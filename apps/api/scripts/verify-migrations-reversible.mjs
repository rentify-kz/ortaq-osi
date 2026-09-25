// Проверка обратимости: для последней миграции применяет down.sql, затем снова up.
// docs/spec/01-architecture.md §8: «Миграции проверяются на обратимость».
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_MIGRATOR_URL;
if (!url) throw new Error('DATABASE_MIGRATOR_URL is required');

const dir = join(root, 'prisma', 'migrations');
const migrations = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const last = migrations.at(-1);
if (!last) throw new Error('no migrations');
const down = join(dir, last, 'down.sql');
if (!existsSync(down)) throw new Error(`${last}: down.sql отсутствует — миграция необратима`);

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, env: process.env });
const psql = (args) => run('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', ...args]);

run('npx', ['prisma', 'migrate', 'deploy']);
psql(['-f', down]);
psql(['-c', `DELETE FROM "_prisma_migrations" WHERE migration_name = '${last}'`]);
run('npx', ['prisma', 'migrate', 'deploy']);
console.log(`OK: ${last} откатывается и применяется повторно`);
