-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('TERMS', 'NOTIFICATIONS', 'PERSONAL_DATA');

-- CreateEnum
CREATE TYPE "SignaturePurpose" AS ENUM ('IDENTITY_VERIFICATION', 'BALLOT', 'PROTOCOL', 'REPORT');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('PENDING', 'SIGNED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RegistryImportStatus" AS ENUM ('PREVIEW', 'APPLIED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'STAFF', 'SPECIFIC_USERS', 'ENTRANCE');

-- CreateEnum
CREATE TYPE "Specialization" AS ENUM ('PLUMBER', 'ELECTRICIAN', 'CLEANER', 'YARD_KEEPER', 'HANDYMAN', 'SECURITY', 'ELEVATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('VOTES', 'REQUESTS', 'ANNOUNCEMENTS', 'PAYMENTS', 'REPORTS', 'MEMBERSHIP', 'SUMMARY');

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "code_hash" BYTEA NOT NULL,
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'LOGIN',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "version" TEXT NOT NULL,
    "signature_id" UUID,
    "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "purpose" "SignaturePurpose" NOT NULL,
    "document_hash" BYTEA NOT NULL,
    "signature_data" BYTEA NOT NULL,
    "signer_iin_hash" BYTEA NOT NULL,
    "signer_full_name" TEXT NOT NULL,
    "cert_serial" TEXT NOT NULL,
    "cert_valid_from" TIMESTAMPTZ NOT NULL,
    "cert_valid_to" TIMESTAMPTZ NOT NULL,
    "verified_at" TIMESTAMPTZ NOT NULL,
    "verification_result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "house_id" UUID,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "document_hash" BYTEA NOT NULL,
    "state" "VerificationState" NOT NULL DEFAULT 'PENDING',
    "signature_id" UUID,
    "result" JSONB,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_registry_entries" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "unit_number" TEXT NOT NULL,
    "iin_hash" BYTEA NOT NULL,
    "full_name" TEXT NOT NULL,
    "area" DECIMAL(8,2),
    "import_id" UUID NOT NULL,
    "imported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_registry_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry_imports" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "RegistryImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "rows" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ,

    CONSTRAINT "registry_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_targets" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "user_id" UUID,
    "entrance" INTEGER,

    CONSTRAINT "announcement_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_reads" (
    "house_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("announcement_id","user_id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "specializations" "Specialization"[],
    "phone_public" VARCHAR(16),
    "work_schedule" TEXT,
    "visible_to_residents" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractors" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bin" VARCHAR(12),
    "specializations" "Specialization"[],
    "contact_person" TEXT,
    "phone" VARCHAR(16),
    "email" TEXT,
    "contract_from" DATE,
    "contract_to" DATE,
    "visible_to_residents" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "house_id" UUID,
    "category" "NotificationCategory" NOT NULL,
    "priority" "NotificationPriority" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "scheduled_for" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,
    "channels" TEXT[],
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "push" BOOLEAN NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","category")
);

-- CreateIndex
CREATE INDEX "otp_codes_phone_created_at_idx" ON "otp_codes"("phone", "created_at");

-- CreateIndex
CREATE INDEX "otp_codes_ip_created_at_idx" ON "otp_codes"("ip", "created_at");

-- CreateIndex
CREATE INDEX "consents_user_id_kind_idx" ON "consents"("user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_provider_external_id_key" ON "signatures"("provider", "external_id");

-- CreateIndex
CREATE INDEX "verifications_user_id_idx" ON "verifications"("user_id");

-- CreateIndex
CREATE INDEX "owner_registry_entries_house_id_iin_hash_idx" ON "owner_registry_entries"("house_id", "iin_hash");

-- CreateIndex
CREATE INDEX "owner_registry_entries_house_id_unit_number_idx" ON "owner_registry_entries"("house_id", "unit_number");

-- CreateIndex
CREATE INDEX "registry_imports_house_id_idx" ON "registry_imports"("house_id");

-- CreateIndex
CREATE INDEX "announcements_house_id_published_at_idx" ON "announcements"("house_id", "published_at");

-- CreateIndex
CREATE INDEX "announcement_targets_announcement_id_idx" ON "announcement_targets"("announcement_id");

-- CreateIndex
CREATE INDEX "staff_members_house_id_idx" ON "staff_members"("house_id");

-- CreateIndex
CREATE INDEX "contractors_house_id_idx" ON "contractors"("house_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_sent_at_scheduled_for_idx" ON "notifications"("sent_at", "scheduled_for");

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_registry_entries" ADD CONSTRAINT "owner_registry_entries_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry_imports" ADD CONSTRAINT "registry_imports_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════ RLS фазы 1: та же схема, что в init ═══════════════

-- Данные дома: видны только в контексте этого дома
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['owner_registry_entries', 'registry_imports', 'announcements', 'announcement_targets', 'staff_members', 'contractors'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY house_isolation ON %I USING (app_bypass_rls() OR house_id = app_current_house()) WITH CHECK (app_bypass_rls() OR house_id = app_current_house())', t);
  END LOOP;
END $$;

-- Прочтения: председатель видит прочтения дома, жилец пишет и видит свои
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_isolation ON announcement_reads
  USING (app_bypass_rls() OR house_id = app_current_house() OR user_id = app_current_user())
  WITH CHECK (app_bypass_rls() OR (house_id = app_current_house() AND user_id = app_current_user()));

-- Личное: согласия, верификации, устройства, уведомления — только владельцу
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['consents', 'verifications', 'device_tokens', 'notifications', 'notification_preferences'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY owner_only ON %I USING (app_bypass_rls() OR user_id = app_current_user()) WITH CHECK (app_bypass_rls() OR user_id = app_current_user())', t);
  END LOOP;
END $$;

-- Подписи — юридически значимые записи: только дописываются
REVOKE UPDATE, DELETE, TRUNCATE ON signatures FROM ortaq_app;
