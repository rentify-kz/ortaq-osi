-- Расширения (trusted: создаются владельцем базы без суперпользователя).
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

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
CREATE TYPE "InviteType" AS ENUM ('PUBLIC_LINK', 'PERSONAL');

-- CreateEnum
CREATE TYPE "InviteRole" AS ENUM ('RESIDENT', 'WORKER');

-- CreateEnum
CREATE TYPE "OwnershipRelation" AS ENUM ('OWNER', 'TENANT', 'FAMILY');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SessionClient" AS ENUM ('WEB', 'MOBILE');

-- CreateEnum
CREATE TYPE "ActionTokenPurpose" AS ENUM ('PASSWORD_SET', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'STEP_UP');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED');

-- CreateEnum
CREATE TYPE "CounterKind" AS ENUM ('REQUEST', 'PROTOCOL', 'CONTRACT');

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bin" VARCHAR(12) NOT NULL,
    "management_form" "ManagementForm" NOT NULL,
    "legal_address" TEXT NOT NULL,
    "bank_details" JSONB,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "entrance_count" INTEGER NOT NULL,
    "unit_count" INTEGER NOT NULL,
    "floor_count" INTEGER,
    "built_year" INTEGER,
    "total_area" DECIMAL(12,2),
    "is_voting_ready" BOOLEAN NOT NULL DEFAULT false,
    "registry_uploaded_at" TIMESTAMPTZ(6),
    "payment_mode" "PaymentMode" NOT NULL DEFAULT 'RECEIPT',
    "kaspi_config" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty',
    "cadastral_number" TEXT,
    "address_rka" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "house_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "UnitType" NOT NULL DEFAULT 'APARTMENT',
    "area" DECIMAL(8,2),
    "entrance" INTEGER,
    "floor" INTEGER,
    "rooms" INTEGER,
    "is_excluded_from_voting" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(16),
    "email" CITEXT,
    "password_hash" TEXT,
    "password_changed_at" TIMESTAMPTZ(6),
    "full_name" TEXT NOT NULL,
    "iin_encrypted" BYTEA,
    "iin_hash" BYTEA,
    "identity_verified_at" TIMESTAMPTZ(6),
    "avatar_file_id" UUID,
    "locale" "Locale" NOT NULL DEFAULT 'ru',
    "totp_secret_encrypted" BYTEA,
    "totp_enabled_at" TIMESTAMPTZ(6),
    "totp_last_step" INTEGER,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_membership" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "role" "HouseRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_via" "JoinedVia" NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "house_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "type" "InviteType" NOT NULL,
    "target_role" "InviteRole" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "join_request" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "claimed_unit_number" TEXT NOT NULL,
    "claimed_relation" "OwnershipRelation" NOT NULL,
    "comment" TEXT,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "join_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "client" "SessionClient" NOT NULL,
    "device_info" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_code" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "code_hash" BYTEA NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "ActionTokenPurpose" NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_counter" (
    "house_id" UUID NOT NULL,
    "kind" "CounterKind" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "house_counter_pkey" PRIMARY KEY ("house_id","kind")
);

-- CreateTable
CREATE TABLE "file" (
    "id" UUID NOT NULL,
    "house_id" UUID,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "content_hash" BYTEA NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "exif_stripped" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "seq" BIGINT NOT NULL DEFAULT 0,
    "house_id" UUID,
    "actor_id" UUID,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "prev_hash" BYTEA,
    "hash" BYTEA NOT NULL DEFAULT '\x'::bytea,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "key" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_hash" BYTEA NOT NULL,
    "response" JSONB NOT NULL,
    "status_code" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_bin_key" ON "organization"("bin");

-- CreateIndex
CREATE INDEX "house_organization_id_idx" ON "house"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_house_id_number_key" ON "unit"("house_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_iin_hash_key" ON "user"("iin_hash");

-- CreateIndex
CREATE INDEX "house_membership_house_id_role_status_idx" ON "house_membership"("house_id", "role", "status");

-- CreateIndex
CREATE INDEX "house_membership_user_id_status_idx" ON "house_membership"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invite_token_hash_key" ON "invite"("token_hash");

-- CreateIndex
CREATE INDEX "invite_house_id_idx" ON "invite"("house_id");

-- CreateIndex
CREATE INDEX "join_request_house_id_status_idx" ON "join_request"("house_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_family_id_idx" ON "session"("family_id");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "otp_code_phone_purpose_created_at_idx" ON "otp_code"("phone", "purpose", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "action_token_token_hash_key" ON "action_token"("token_hash");

-- CreateIndex
CREATE INDEX "action_token_user_id_purpose_idx" ON "action_token"("user_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "file_storage_key_key" ON "file"("storage_key");

-- CreateIndex
CREATE INDEX "file_house_id_idx" ON "file"("house_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_seq_key" ON "audit_log"("seq");

-- CreateIndex
CREATE INDEX "audit_log_house_id_created_at_idx" ON "audit_log"("house_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "house" ADD CONSTRAINT "house_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "house"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_membership" ADD CONSTRAINT "house_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_membership" ADD CONSTRAINT "house_membership_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "house"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "house"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "house"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_token" ADD CONSTRAINT "action_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_counter" ADD CONSTRAINT "house_counter_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "house"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- Ниже — то, что Prisma не описывает: ограничения, привилегии, RLS, триггеры.
-- docs/spec/13-security.md §1, §5; docs/spec/02-data-model.md.
-- =====================================================================

-- Одна активная роль пользователя в доме.
CREATE UNIQUE INDEX "house_membership_active_user_house_key"
  ON "house_membership" ("user_id", "house_id") WHERE "status" = 'ACTIVE';
-- Один активный председатель в доме.
CREATE UNIQUE INDEX "house_membership_active_chairman_key"
  ON "house_membership" ("house_id") WHERE "status" = 'ACTIVE' AND "role" = 'CHAIRMAN';

ALTER TABLE "unit" ADD CONSTRAINT "unit_area_positive" CHECK ("area" IS NULL OR "area" > 0);
ALTER TABLE "house" ADD CONSTRAINT "house_counts_positive" CHECK ("entrance_count" > 0 AND "unit_count" > 0);

-- ---------- Контекст запроса ----------
-- Приложение выставляет значения через set_config(..., true) в начале каждой транзакции.
-- Пустое значение не совпадает ни с чем: запрос без скоупа видит ноль строк.
CREATE FUNCTION app_current_house() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.current_house_id', true), '')::uuid $$;
CREATE FUNCTION app_current_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$;

-- Дома, где у текущего пользователя активное членство. SECURITY DEFINER — чтобы политика
-- house не зависела рекурсивно от политики house_membership.
CREATE FUNCTION app_user_house_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS
$$ SELECT house_id FROM house_membership WHERE user_id = app_current_user() AND status = 'ACTIVE' $$;

-- ---------- Привилегии ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw, app_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw, app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw, app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_rw, app_admin;
REVOKE ALL ON "_prisma_migrations" FROM app_rw, app_admin;

-- Организации меняет только админ платформы.
REVOKE INSERT, UPDATE, DELETE ON "organization" FROM app_rw;
-- Дома создаёт и удаляет только админ платформы.
REVOKE INSERT, DELETE ON "house" FROM app_rw;

-- Журнал аудита: приложение только пишет. Чтение — роль app_admin. Изменение и удаление — никому.
REVOKE ALL ON "audit_log" FROM app_rw, app_admin;
GRANT INSERT ON "audit_log" TO app_rw;
GRANT SELECT, INSERT ON "audit_log" TO app_admin;

-- ---------- Row Level Security ----------
-- Политики действуют для app_rw. app_admin имеет BYPASSRLS; владелец (migrator) не используется приложением.

ALTER TABLE "house" ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_read ON "house" FOR SELECT TO app_rw
  USING (id = app_current_house() OR id IN (SELECT app_user_house_ids()));
CREATE POLICY house_write ON "house" FOR UPDATE TO app_rw
  USING (id = app_current_house()) WITH CHECK (id = app_current_house());

ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_read ON "organization" FOR SELECT TO app_rw
  USING (id IN (SELECT organization_id FROM house));

ALTER TABLE "house_membership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_read ON "house_membership" FOR SELECT TO app_rw
  USING (house_id = app_current_house() OR user_id = app_current_user());
CREATE POLICY membership_write ON "house_membership" FOR ALL TO app_rw
  USING (house_id = app_current_house()) WITH CHECK (house_id = app_current_house());

-- Таблицы строго в скоупе текущего дома.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['unit', 'invite', 'join_request', 'house_counter', 'file'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY house_scope ON %I FOR ALL TO app_rw USING (house_id = app_current_house()) WITH CHECK (house_id = app_current_house())',
      t);
  END LOOP;
END $$;

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
-- Действия вне дома (вход, смена пароля) пишутся с house_id = NULL.
CREATE POLICY audit_insert ON "audit_log" FOR INSERT TO app_rw
  WITH CHECK (house_id IS NULL OR house_id = app_current_house());

-- ---------- Журнал аудита: хеш-цепочка ----------
-- Цепочка ведётся отдельно для каждого дома (и одна для записей без дома), чтобы дома не
-- блокировали друг друга. Порядок внутри цепочки — seq, выдаётся под advisory-блокировкой цепочки.
CREATE SEQUENCE audit_log_seq AS bigint;
GRANT USAGE ON SEQUENCE audit_log_seq TO app_rw, app_admin;

CREATE FUNCTION audit_row_hash(prev bytea, r audit_log) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT sha256(coalesce(prev, ''::bytea) || convert_to(concat_ws('|',
    r.id::text, r.seq::text, coalesce(r.house_id::text, ''), coalesce(r.actor_id::text, ''),
    coalesce(r.actor_role, ''), r.action, r.entity_type, coalesce(r.entity_id::text, ''),
    coalesce(r.before::text, ''), coalesce(r.after::text, ''), coalesce(r.ip, ''), coalesce(r.user_agent, ''),
    to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')), 'UTF8'))
$$;

CREATE FUNCTION audit_log_chain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_log'), hashtext(coalesce(NEW.house_id::text, '-')));
  NEW.seq := nextval('audit_log_seq');
  NEW.created_at := clock_timestamp();
  SELECT hash INTO NEW.prev_hash FROM audit_log
    WHERE house_id IS NOT DISTINCT FROM NEW.house_id ORDER BY seq DESC LIMIT 1;
  NEW.hash := audit_row_hash(NEW.prev_hash, NEW);
  RETURN NEW;
END $$;

CREATE TRIGGER audit_log_chain BEFORE INSERT ON "audit_log" FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- Проверка цепочки: возвращает первую испорченную запись каждой цепочки.
CREATE FUNCTION audit_verify_chain() RETURNS TABLE (house_id uuid, bad_seq bigint) LANGUAGE plpgsql STABLE AS $$
DECLARE r audit_log; prev bytea; cur_house uuid; first boolean := true; broken boolean := false;
BEGIN
  FOR r IN SELECT * FROM audit_log a ORDER BY a.house_id NULLS FIRST, a.seq LOOP
    IF first OR r.house_id IS DISTINCT FROM cur_house THEN
      cur_house := r.house_id; prev := NULL; broken := false; first := false;
    END IF;
    IF NOT broken AND (r.prev_hash IS DISTINCT FROM prev OR r.hash <> audit_row_hash(prev, r)) THEN
      house_id := r.house_id; bad_seq := r.seq; broken := true;
      RETURN NEXT;
    END IF;
    prev := r.hash;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION audit_verify_chain() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_verify_chain() TO app_admin;

-- ---------- Площади и готовность к голосованию ----------
CREATE FUNCTION house_recompute_areas(h uuid) RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  UPDATE house SET
    total_area = (SELECT sum(area) FROM unit WHERE house_id = h),
    is_voting_ready = EXISTS (SELECT 1 FROM unit WHERE house_id = h AND NOT is_excluded_from_voting)
      AND NOT EXISTS (SELECT 1 FROM unit WHERE house_id = h AND NOT is_excluded_from_voting AND area IS NULL)
  WHERE id = h
$$;

CREATE FUNCTION unit_after_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE h uuid;
BEGIN
  FOR h IN SELECT DISTINCT house_id FROM changed_units LOOP
    PERFORM house_recompute_areas(h);
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER unit_after_insert AFTER INSERT ON "unit" REFERENCING NEW TABLE AS changed_units
  FOR EACH STATEMENT EXECUTE FUNCTION unit_after_change();
CREATE TRIGGER unit_after_update AFTER UPDATE ON "unit" REFERENCING NEW TABLE AS changed_units
  FOR EACH STATEMENT EXECUTE FUNCTION unit_after_change();
CREATE TRIGGER unit_after_delete AFTER DELETE ON "unit" REFERENCING OLD TABLE AS changed_units
  FOR EACH STATEMENT EXECUTE FUNCTION unit_after_change();
