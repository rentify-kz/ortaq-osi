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
- Интеграции — только через интерфейсы: `SignatureProvider`, `PaymentProvider`, `AiProvider`, `PushProvider`.
- Токены в вебе — httpOnly cookie. `localStorage` для токенов запрещён.
- Все строки UI — через i18n (`ru`, `kk`).
- Миграции — expand/contract, обратимые.
