-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('REQUEST_PHOTO', 'TASK_PHOTO');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED');

-- CreateEnum
CREATE TYPE "RequestCategory" AS ENUM ('PLUMBING', 'ELECTRICITY', 'HEATING', 'ELEVATOR', 'CLEANING', 'YARD', 'FACADE', 'ROOF', 'BASEMENT', 'TRASH', 'SECURITY', 'OTHER');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('YARD', 'ENTRANCE', 'APARTMENT', 'FACADE', 'ROOF', 'BASEMENT', 'PARKING', 'COMMON_AREA');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "PrioritySetBy" AS ENUM ('AI_SUGGESTED', 'CHAIRMAN');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'TRIAGE', 'REJECTED', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('MANUAL', 'FROM_REQUEST', 'FROM_VOICE', 'RECURRING');

-- CreateEnum
CREATE TYPE "AiJobType" AS ENUM ('REQUEST_TRIAGE', 'REQUEST_SUGGEST');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "HumanDecision" AS ENUM ('ACCEPTED', 'MODIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "houses" ADD COLUMN     "request_seq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "content_hash" BYTEA,
    "width" INTEGER,
    "height" INTEGER,
    "purpose" "FilePurpose" NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "exif_stripped" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by" UUID NOT NULL,
    "parent_type" TEXT,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "RequestCategory" NOT NULL,
    "location_type" "LocationType" NOT NULL,
    "location_entrance" INTEGER,
    "location_floor" INTEGER,
    "location_detail" TEXT,
    "unit_id" UUID,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "priority_set_by" "PrioritySetBy",
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "ai_triage" JSONB,
    "triage_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duplicate_of_id" UUID,
    "rejection_reason" TEXT,
    "photo_file_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "rating" INTEGER,
    "rating_comment" TEXT,
    "accepted_at" TIMESTAMPTZ,
    "done_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_stages" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMPTZ,
    "completed_by" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_events" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_followers" (
    "house_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_followers_pkey" PRIMARY KEY ("request_id","user_id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "assignee_id" UUID,
    "contractor_id" UUID,
    "request_id" UUID,
    "stage_id" UUID,
    "recurring_template_id" UUID,
    "occurrence_at" TIMESTAMPTZ,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "specialization" "Specialization",
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "due_at" TIMESTAMPTZ,
    "requires_photo" BOOLEAN NOT NULL DEFAULT false,
    "status" "TaskStatus" NOT NULL DEFAULT 'ASSIGNED',
    "source" "TaskSource" NOT NULL,
    "created_by" UUID,
    "started_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_completions" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "client_key" TEXT,
    "completed_by" UUID NOT NULL,
    "note" TEXT,
    "photo_file_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "completed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "visible_to_residents" BOOLEAN NOT NULL DEFAULT false,
    "include_in_report" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "task_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_task_templates" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "specialization" "Specialization",
    "default_assignee_id" UUID,
    "rrule" TEXT NOT NULL,
    "lead_time_hours" INTEGER NOT NULL DEFAULT 12,
    "requires_photo" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recurring_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" UUID NOT NULL,
    "house_id" UUID,
    "type" "AiJobType" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_ref" JSONB NOT NULL,
    "output" JSONB,
    "status" "AiJobStatus" NOT NULL,
    "latency_ms" INTEGER,
    "error" TEXT,
    "human_decision" "HumanDecision",
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_house_id_parent_type_parent_id_idx" ON "files"("house_id", "parent_type", "parent_id");

-- CreateIndex
CREATE INDEX "requests_house_id_status_priority_idx" ON "requests"("house_id", "status", "priority");

-- CreateIndex
CREATE INDEX "requests_house_id_location_type_category_idx" ON "requests"("house_id", "location_type", "category");

-- CreateIndex
CREATE UNIQUE INDEX "requests_house_id_number_key" ON "requests"("house_id", "number");

-- CreateIndex
CREATE INDEX "request_stages_request_id_order_idx" ON "request_stages"("request_id", "order");

-- CreateIndex
CREATE INDEX "request_events_request_id_created_at_idx" ON "request_events"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "tasks_house_id_status_idx" ON "tasks"("house_id", "status");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_status_idx" ON "tasks"("assignee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_recurring_template_id_occurrence_at_key" ON "tasks"("recurring_template_id", "occurrence_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_completions_client_key_key" ON "task_completions"("client_key");

-- CreateIndex
CREATE INDEX "task_completions_task_id_idx" ON "task_completions"("task_id");

-- CreateIndex
CREATE INDEX "recurring_task_templates_house_id_is_active_idx" ON "recurring_task_templates"("house_id", "is_active");

-- CreateIndex
CREATE INDEX "ai_jobs_house_id_type_created_at_idx" ON "ai_jobs"("house_id", "type", "created_at");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_stages" ADD CONSTRAINT "request_stages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_followers" ADD CONSTRAINT "request_followers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "request_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurring_template_id_fkey" FOREIGN KEY ("recurring_template_id") REFERENCES "recurring_task_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_task_templates" ADD CONSTRAINT "recurring_task_templates_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────── изоляция домов (RLS) ─────────
-- Те же функции, что в фазах 0–1: дом из контекста запроса, системный обход только у сервиса.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['files', 'requests', 'request_stages', 'request_events', 'request_followers', 'tasks', 'task_completions', 'recurring_task_templates'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY house_isolation ON %I USING (app_bypass_rls() OR house_id = app_current_house()) WITH CHECK (app_bypass_rls() OR house_id = app_current_house())', t);
  END LOOP;
END $$;

-- Вызовы ИИ пишет только система; читать их приложению под ролью пользователя незачем
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_only ON ai_jobs USING (app_bypass_rls()) WITH CHECK (app_bypass_rls());

-- История заявки и отчёты о работе — доказательная база: правка задним числом запрещена
REVOKE UPDATE, DELETE, TRUNCATE ON request_events FROM ortaq_app;
