# Ortaq

Платформа управления многоквартирным домом для ОСИ в Казахстане. Спецификация — [`docs/`](docs/README.md).

## Состав

| Путь                         | Что                                                     |
| ---------------------------- | ------------------------------------------------------- |
| `apps/api`                   | NestJS API: модульный монолит, Prisma, PostgreSQL с RLS |
| `apps/web`                   | Vite + React: кабинет председателя и админ-панель       |
| `apps/worker`, `apps/mobile` | Появятся в следующих фазах                              |
| `packages/shared`            | zod-схемы контракта API — общие для API и клиентов      |
| `packages/design-tokens`     | Токены дизайн-системы → Tailwind-тема и RN              |
| `infra/db`                   | Роли и базы PostgreSQL                                  |

## Локальный запуск

Нужны Node 22, pnpm 10 и Docker (или локальные PostgreSQL 16 + Redis).

```bash
pnpm install
docker compose up -d                 # Postgres, Redis, MinIO, Mailpit
# без Docker: pnpm db:bootstrap       # роли и базы в локальном Postgres

cp apps/api/.env.example apps/api/.env
node apps/api/scripts/gen-keys.mjs   # вставить 4 ключа в apps/api/.env
pnpm --filter "./packages/*" build
pnpm db:migrate
pnpm --filter @ortaq/api build && pnpm db:seed         # печатает учётки и TOTP-секреты

pnpm --filter @ortaq/api dev          # http://localhost:3000
pnpm --filter @ortaq/web dev          # http://localhost:5173
```

Сид создаёт админа `admin@ortaq.local`, двух председателей и два дома. Пароль и TOTP-секреты печатаются
в консоль — секрет добавляется в любое приложение-аутентификатор. Письма в local пишутся в лог API
(`MAIL_PROVIDER=mock`) или в Mailpit на http://localhost:8025 (`MAIL_PROVIDER=smtp`).

Админ для реального окружения: `pnpm --filter @ortaq/api admin:create --email ... --name "..."`.

## Проверки

```bash
pnpm lint && pnpm typecheck && pnpm test     # тесты API идут на базе ortaq_test
pnpm --filter @ortaq/api db:verify-reversible
```
