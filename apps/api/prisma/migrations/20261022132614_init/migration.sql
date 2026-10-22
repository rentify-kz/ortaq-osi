-- Расширения: citext для регистронезависимой почты
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateEnum
CREATE TYPE "ManagementForm" AS ENUM ('OSI', 'PT');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('RECEIPT', 'KASPI_API');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('APARTMENT', 'COMMERCIAL', 'PARKING', 'STORAGE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ru', 'kk');

-- CreateEnum
CREATE TYPE "HouseRole" AS ENUM ('CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "JoinedVia" AS ENUM ('ADMIN_PROVISION', 'INVITE_LINK', 'JOIN_REQUEST', 'CHAIRMAN_ADD');

-- CreateEnum
CREATE TYPE "OwnershipRelation" AS ENUM ('OWNER', 'TENANT', 'FAMILY');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('EDS_REGISTRY_MATCH', 'MANUAL_CHAIRMAN');

-- CreateEnum
CREATE TYPE "InviteType" AS ENUM ('PUBLIC_LINK', 'PERSONAL');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('SET_PASSWORD', 'RESET_PASSWORD');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bin" VARCHAR(12) NOT NULL,
    "management_form" "ManagementForm" NOT NULL,
    "legal_address" TEXT NOT NULL,
    "bank_details" JSONB,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "houses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "entrance_count" INTEGER NOT NULL,
    "unit_count" INTEGER NOT NULL,
    "floor_count" INTEGER,
    "built_year" INTEGER,
    "total_area" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_voting_ready" BOOLEAN NOT NULL DEFAULT false,
    "registry_uploaded_at" TIMESTAMPTZ,
    "payment_mode" "PaymentMode" NOT NULL DEFAULT 'RECEIPT',
    "kaspi_config" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "houses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "UnitType" NOT NULL DEFAULT 'APARTMENT',
    "area" DECIMAL(8,2),
    "entrance" INTEGER,
    "floor" INTEGER,
    "rooms" INTEGER,
    "is_excluded_from_voting" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(16),
    "email" CITEXT,
    "password_hash" TEXT,
    "full_name" TEXT NOT NULL,
    "iin_encrypted" BYTEA,
    "iin_hash" BYTEA,
    "identity_verified_at" TIMESTAMPTZ,
    "locale" "Locale" NOT NULL DEFAULT 'ru',
    "totp_secret_encrypted" BYTEA,
    "totp_enabled_at" TIMESTAMPTZ,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "role" "HouseRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_via" "JoinedVia" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "house_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_ownerships" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "relation" "OwnershipRelation" NOT NULL,
    "share" DECIMAL(5,4) NOT NULL DEFAULT 1,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verification_method" "VerificationMethod",
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "is_voting_representative" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "type" "InviteType" NOT NULL,
    "target_role" "HouseRole" NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "join_requests" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "claimed_unit_number" TEXT NOT NULL,
    "claimed_relation" "OwnershipRelation" NOT NULL,
    "comment" TEXT,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "family_id" UUID NOT NULL,
    "device_info" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "rotated_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "house_id" UUID,
    "actor_id" UUID,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" BIGSERIAL NOT NULL,
    "prev_hash" BYTEA,
    "hash" BYTEA NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_bin_key" ON "organizations"("bin");

-- CreateIndex
CREATE INDEX "houses_organization_id_idx" ON "houses"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_house_id_number_key" ON "units"("house_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "house_memberships_house_id_role_idx" ON "house_memberships"("house_id", "role");

-- CreateIndex
CREATE INDEX "house_memberships_user_id_idx" ON "house_memberships"("user_id");

-- CreateIndex
CREATE INDEX "unit_ownerships_house_id_idx" ON "unit_ownerships"("house_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_ownerships_unit_id_user_id_key" ON "unit_ownerships"("unit_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites"("token_hash");

-- CreateIndex
CREATE INDEX "invites_house_id_idx" ON "invites"("house_id");

-- CreateIndex
CREATE INDEX "join_requests_house_id_status_idx" ON "join_requests"("house_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "audit_log_house_id_seq_idx" ON "audit_log"("house_id", "seq");

-- AddForeignKey
ALTER TABLE "houses" ADD CONSTRAINT "houses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_memberships" ADD CONSTRAINT "house_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_memberships" ADD CONSTRAINT "house_memberships_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_ownerships" ADD CONSTRAINT "unit_ownerships_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_ownerships" ADD CONSTRAINT "unit_ownerships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Ниже то, что Prisma не генерирует: ограничения, триггеры, RLS, права.
-- Обоснование — docs/13-security.md §1 и §5, docs/04 §2.4.
-- ═══════════════════════════════════════════════════════════════════

-- Одно действующее членство человека в доме и один действующий председатель
CREATE UNIQUE INDEX "house_memberships_active_uniq"
  ON "house_memberships" ("user_id", "house_id") WHERE "status" <> 'REVOKED';
CREATE UNIQUE INDEX "house_memberships_one_chairman"
  ON "house_memberships" ("house_id") WHERE "role" = 'CHAIRMAN' AND "status" <> 'REVOKED';
-- Не более одного голосующего представителя на помещение
CREATE UNIQUE INDEX "unit_ownerships_one_representative"
  ON "unit_ownerships" ("unit_id") WHERE "is_voting_representative";

-- ── Готовность дома к голосованиям ──────────────────────────────────
-- Площадь и is_voting_ready считает база: сервис не может «забыть» пересчитать.
-- SECURITY DEFINER: функция принадлежит владельцу схемы и обновляет houses мимо RLS.
CREATE FUNCTION recompute_house_area(h uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE houses SET
    total_area = COALESCE((SELECT sum(area) FROM units WHERE house_id = h), 0),
    is_voting_ready =
      EXISTS (SELECT 1 FROM units WHERE house_id = h AND NOT is_excluded_from_voting)
      AND NOT EXISTS (SELECT 1 FROM units WHERE house_id = h AND area IS NULL AND NOT is_excluded_from_voting),
    updated_at = now()
  WHERE id = h;
$$;

CREATE FUNCTION units_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h uuid;
BEGIN
  FOR h IN SELECT DISTINCT house_id FROM new_rows LOOP PERFORM recompute_house_area(h); END LOOP;
  RETURN NULL;
END $$;

CREATE FUNCTION units_after_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h uuid;
BEGIN
  FOR h IN SELECT house_id FROM new_rows UNION SELECT house_id FROM old_rows LOOP PERFORM recompute_house_area(h); END LOOP;
  RETURN NULL;
END $$;

CREATE FUNCTION units_after_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h uuid;
BEGIN
  FOR h IN SELECT DISTINCT house_id FROM old_rows LOOP PERFORM recompute_house_area(h); END LOOP;
  RETURN NULL;
END $$;

-- Триггеры уровня оператора: генерация 2000 помещений — один пересчёт, а не 2000
CREATE TRIGGER units_area_insert AFTER INSERT ON units
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION units_after_insert();
CREATE TRIGGER units_area_update AFTER UPDATE ON units
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION units_after_update();
CREATE TRIGGER units_area_delete AFTER DELETE ON units
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION units_after_delete();

-- ── Row Level Security ──────────────────────────────────────────────
-- Третий слой изоляции домов. Приложение в каждой транзакции выставляет:
--   app.current_house_id — дом из пути запроса, после проверки членства
--   app.current_user_id  — вызывающий пользователь (для списков «мои дома»)
--   app.bypass_rls       — 'on' только для админ-панели и системных задач
-- Владелец таблиц (ortaq) под политики не попадает: под ним идут миграции и сид.
CREATE FUNCTION app_bypass_rls() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'on'
$$;
CREATE FUNCTION app_current_house() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_house_id', true), '')::uuid
$$;
CREATE FUNCTION app_current_user() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_isolation ON houses USING (
  app_bypass_rls()
  OR id = app_current_house()
  OR id IN (SELECT house_id FROM house_memberships
            WHERE user_id = app_current_user() AND status = 'ACTIVE')
);

ALTER TABLE house_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_isolation ON house_memberships
  USING (app_bypass_rls() OR house_id = app_current_house() OR user_id = app_current_user())
  WITH CHECK (app_bypass_rls() OR house_id = app_current_house());

ALTER TABLE units ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_isolation ON units
  USING (app_bypass_rls() OR house_id = app_current_house())
  WITH CHECK (app_bypass_rls() OR house_id = app_current_house());

ALTER TABLE unit_ownerships ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_isolation ON unit_ownerships
  USING (app_bypass_rls() OR house_id = app_current_house() OR user_id = app_current_user())
  WITH CHECK (app_bypass_rls() OR house_id = app_current_house());

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_isolation ON invites
  USING (app_bypass_rls() OR house_id = app_current_house())
  WITH CHECK (app_bypass_rls() OR house_id = app_current_house());

ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_isolation ON join_requests
  USING (app_bypass_rls() OR house_id = app_current_house() OR user_id = app_current_user())
  WITH CHECK (app_bypass_rls() OR house_id = app_current_house() OR user_id = app_current_user());

-- Журнал: читать можно свой дом, писать — в свой дом или в общую цепочку
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit_log FOR SELECT
  USING (app_bypass_rls() OR house_id = app_current_house());
CREATE POLICY audit_append ON audit_log FOR INSERT
  WITH CHECK (app_bypass_rls() OR house_id IS NULL OR house_id = app_current_house());

-- ── Журнал аудита только дописывается ───────────────────────────────
-- Права по умолчанию дают ortaq_app SELECT/INSERT/UPDATE/DELETE; у журнала забираем правку и удаление.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ortaq_app;
