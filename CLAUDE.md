# Ortaq — платформа управления ОСИ (Казахстан)

Спецификация: `docs/spec/` (индекс — `docs/README.md`). Открытые вопросы и решения: `docs/ANALYSIS.md`. Перед работой над модулем читать соответствующий файл спецификации.

## Стек

pnpm workspaces + Turborepo. `apps/api` — NestJS (модульный монолит), `apps/worker` — BullMQ, `apps/web` — Vite + React + Tailwind, `apps/mobile` — Expo Router. `packages/shared` — zod-схемы контракта API, единые для всех клиентов. PostgreSQL 16 + pgvector через Prisma, Redis, S3-совместимое хранилище. Прод — Yandex Cloud `kz1`.

## Инварианты (нарушение = блокер ревью)

- `house_id` для проверки доступа — только из пути + активное `HouseMembership`. Никогда из тела запроса.
- Чужой дом или нет доступа к объекту → `404`, не `403`.
- Каждый эндпоинт в скоупе `house` имеет интеграционный тест изоляции «дом A → объект дома B = 404».
- Деньги — `numeric(14,2)` / `Decimal`, никогда `float`/`number` в расчётах.
- ID — UUIDv7. Время — `timestamptz` UTC, отображение `Asia/Almaty`. Период — строка `YYYY-MM`.
- `AuditLog`, `Ballot`, транзакции — append-only. Финансы не удаляются, только `VOIDED`.
- ИИН хранится только как `iin_encrypted` (AES-256-GCM) + `iin_hash` (HMAC-SHA256). В логах и ИИ — никогда.
- В ИИ-провайдер уходит только обезличенный текст. Система работает при выключенном ИИ.
- Интеграции — только через интерфейсы: `SignatureProvider`, `IdentityProvider`, `PropertyRegistryProvider` (все три — Smart Bridge), `PaymentProvider`, `AiProvider`, `PushProvider`. На этапе разработки — mock-реализации; реальная включается конфигурацией.
- Результат подписи и верификации сервер получает у провайдера сам; утверждениям клиента не доверяем. ИИН из сертификата ЭЦП = ИИН из Digital ID.
- Токены в вебе — httpOnly cookie. `localStorage` для токенов запрещён.
- Все строки UI — через i18n (`ru`, `kk`).
- Миграции — expand/contract, обратимые.

## Рабочий процесс

- Работа идёт по фазам из `docs/spec/15-roadmap.md`. **В конце каждой фазы — чек-лист для пользователя: что проверить руками, прежде чем идти дальше.** Статус фаз — в `docs/ANALYSIS.md`.
- Новый эндпоинт в скоупе дома: `@HouseScoped(...)`, путь с `:houseId`, данные через `db.tx` (RLS уже выставлен), путь добавить в `apps/api/test/isolation.e2e.test.ts`.
- Изменение данных пишет `AuditService.record(...)` в той же транзакции. Опасные действия — `@StepUp()`.
- Контракт запросов/ответов — zod-схемы в `packages/shared`; после правки `pnpm --filter @ortaq/shared build`.
- Проверки перед коммитом: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`. Тесты API идут на реальной БД `ortaq_test` (роли из `infra/db/bootstrap.sql`).
- Изменили спецификацию поведения — правим `docs/spec/` в том же коммите.
