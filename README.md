# Ortaq

A management platform for condominium owners' associations (ОСИ) in Kazakhstan: a web workspace for the chairman and accountant, and a mobile app for residents and staff.

- **Residents** see where the building's money goes, pay through Kaspi, submit requests with photos, and vote on owners' meetings with an ЭЦП signature.
- **Chairmen** get request triage, tasks with photo reports, a ledger built on the official chart of accounts, a monthly report in the government form, and legally valid voting with an auto-generated protocol.

Product and design documentation is in [`docs/`](docs/) and [`DESIGN-BRIEF.md`](DESIGN-BRIEF.md) (in Russian).

## Status

Phases 0–4 of the [roadmap](docs/15-roadmap.md) are implemented: platform admin, onboarding, requests and tasks, finances and reporting, voting. Phase 5 (AI layer) is not started. External providers — SIGEX/eGov signing, SMS, push, OCR, Kaspi — run as development stand-ins with the same interfaces as the real integrations.

## Repository layout

| Folder | Contents |
|---|---|
| `apps/api` | NestJS + Prisma API, PostgreSQL with row-level security; integration tests in `test/` |
| `apps/web` | Web workspace: platform admin, chairman, accountant (Vite + React) |
| `apps/mobile` | Resident and staff app (Expo / React Native; the web build is for development) |
| `packages/shared` | zod schemas, enums and types shared by api, web and mobile |
| `apps/prototype` | Clickable prototype of all screens, a separate npm project |
| `infra/` | Local Postgres roles and S3 (SeaweedFS) config |
| `docs/` | Specification: data model, API contract, flows, security, roadmap |

## Requirements

- Node.js 22 or newer
- Docker with Docker Compose
- corepack (ships with Node; it fetches the pinned pnpm version)

Local services use non-standard ports so they don't clash with other projects:

| Service | Port |
|---|---|
| PostgreSQL 16 | 5442 |
| Mailpit (dev mail and SMS inbox) | 8035 (web UI), 1035 (SMTP) |
| SeaweedFS (S3-compatible storage) | 8343 |
| API | 3000 |
| Web workspace | 5174 |
| Mobile app (web build) | 8081 |

## Installation

```bash
# 1. Dependencies
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install

# 2. Postgres, Mailpit and S3 storage
docker compose up -d --wait

# 3. Shared package (rebuild after every change to packages/shared)
corepack pnpm --filter @ortaq/shared build
```

The Postgres container creates two roles on first start: `ortaq` owns the schema and runs migrations; `ortaq_app` is the application role without `BYPASSRLS`, so row-level security applies to every query. It also creates the `ortaq_test` database for tests.

## Configuration

```bash
cp apps/api/.env.example apps/api/.env
```

Then fill in the secrets in `apps/api/.env`:

| Variable | What to put |
|---|---|
| `JWT_SECRET` | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — exactly 32 bytes; encrypts TOTP secrets and ИИН |
| `HMAC_KEY` | `openssl rand -base64 32` — hashes ИИН and tokens |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | The first platform admin, created by the seed (password at least 12 characters) |
| `PASSWORD_BREACH_CHECK` | `hibp` checks passwords against known breaches; `off` for offline work |
| `SIGNATURE_PROVIDER` | `dev` — the eGov signing stand-in. Only for development |

Database, mail and storage defaults already match `docker-compose.yml`.

For tests, create `apps/api/.env.test` as a copy of `.env` with `ortaq_test` instead of `ortaq` at the end of both database URLs and `NODE_ENV=test`.

The mobile app reads `EXPO_PUBLIC_API_URL` (default `http://localhost:3000/v1`). On a physical phone, set it to your computer's LAN address, for example `http://192.168.1.20:3000/v1`.

## Database

```bash
# Apply migrations (schema, RLS policies, triggers, reference data)
corepack pnpm --filter @ortaq/api db:deploy

# First platform admin
corepack pnpm --filter @ortaq/api db:seed

# Optional: demo house «ЖК Асыл Арман, блок 3» with chairman chairman@ortaq.local
corepack pnpm --filter @ortaq/api db:seed -- --demo
```

The demo chairman has the same password as the admin. Two-factor authentication is set up on the first sign-in with any authenticator app.

## Running

Each in its own terminal:

```bash
corepack pnpm --filter @ortaq/api dev       # API on http://localhost:3000
corepack pnpm --filter @ortaq/web dev       # web workspace on http://localhost:5174
corepack pnpm --filter @ortaq/mobile web    # resident app in the browser on http://localhost:8081
```

For the mobile app on a phone, run `corepack pnpm --filter @ortaq/mobile start` and open it in Expo Go.

### Signing in during development

- **Admin and chairman** sign in on the web with email, password and an authenticator code. Emails to chairmen (invitations, password setup) arrive in Mailpit at http://localhost:8035.
- **Residents** sign in on mobile by phone number. The SMS stand-in delivers the 6-digit code to Mailpit as an email titled «SMS для +7…».
- **ЭЦП signing** (identity, ballots, reports, protocols) opens the dev eGov page `/dev/egov` instead of eGov mobile. Enter any ИИН with a valid checksum, such as `850515300125`, `900312400239` or `781122500347`, and any full name. One ИИН belongs to one account; keep using the same ИИН for the same person.

## Tests and checks

```bash
corepack pnpm --filter @ortaq/api test    # unit and integration tests against the ortaq_test database
corepack pnpm typecheck                   # all packages
```

API tests run on a real PostgreSQL with RLS, so `docker compose up` must be running.

## Tech stack

| Layer | Technology |
|---|---|
| API | NestJS 11, TypeScript, Prisma 6, PostgreSQL 16 with row-level security |
| Web | React 19, Vite, Tailwind CSS 4, TanStack Query, React Router |
| Mobile | Expo SDK 58, React Native, Expo Router |
| Shared | zod 4 schemas used on both client and server |
| Monorepo | pnpm workspaces, Turborepo |
| Tests | Vitest, Supertest |
| Local services | Docker Compose: PostgreSQL, Mailpit, SeaweedFS |

## Documentation

| Document | About |
|---|---|
| [00-overview](docs/00-overview.md) | Vision, roles, glossary, MVP scope |
| [01-architecture](docs/01-architecture.md) | Stack, modules, infrastructure |
| [02-data-model](docs/02-data-model.md) | Data model |
| [03-api-contract](docs/03-api-contract.md) | REST endpoints, roles, step-up, audit |
| [04–08](docs/) | Admin, resident, chairman, worker and system flows |
| [09-voting-legal](docs/09-voting-legal.md) | Voting, quorum by area, ЭЦП, protocols |
| [10-finance-payments](docs/10-finance-payments.md) | Chart of accounts, charges, payments, reports |
| [11-ai-layer](docs/11-ai-layer.md) | Planned AI features |
| [12-design-system](docs/12-design-system.md) | Design tokens and components |
| [13-security](docs/13-security.md) | Threat model and controls |
| [14-compliance-privacy](docs/14-compliance-privacy.md) | Personal data and Kazakhstan law |
| [15-roadmap](docs/15-roadmap.md) | Delivery phases |
