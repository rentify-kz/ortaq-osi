-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SIGNED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "report_templates" (
    "id" UUID NOT NULL,
    "form_code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "legal_source" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "schema" JSONB NOT NULL,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "type" "ReportType" NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "data" JSONB NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "work_summary" JSONB NOT NULL DEFAULT '[]',
    "data_hash" BYTEA NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "generated_at" TIMESTAMPTZ NOT NULL,
    "generated_by" UUID,
    "chairman_signature_id" UUID,
    "accountant_signature_id" UUID,
    "pending_signing" JSONB NOT NULL DEFAULT '{}',
    "signed_at" TIMESTAMPTZ,
    "published_at" TIMESTAMPTZ,
    "published_by" UUID,
    "due_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_templates_form_code_version_key" ON "report_templates"("form_code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "reports_house_id_type_period_key" ON "reports"("house_id", "type", "period");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "report_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────── отчёты: инварианты и изоляция ─────────
ALTER TABLE reports ADD CONSTRAINT reports_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY house_isolation ON reports USING (app_bypass_rls() OR house_id = app_current_house()) WITH CHECK (app_bypass_rls() OR house_id = app_current_house());
-- Форму задаёт приказ: приложение её только читает, новая редакция — новая миграция
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON report_templates FROM ortaq_app;

-- Форма ежемесячного отчёта: Приложение 3 к приказу №163 от 30.03.2020 в ред. приказа №380 от 22.09.2025.
-- Формулировки строк — в budget_categories (те же коды), здесь — откуда берётся сумма каждой строки.
INSERT INTO report_templates (id, form_code, version, legal_source, effective_from, schema) VALUES (
  '01a1f000-0000-7000-8000-000000000163', 'MONTHLY_CONDOMINIUM', 'order-163-ed-380-2025',
  'Приказ №163 от 30.03.2020, Приложение 3, в редакции приказа Министра промышленности и строительства РК №380 от 22.09.2025',
  '2025-09-22', '{"title": "Ежемесячный отчет по управлению объектом кондоминиума", "rows": [{"code": "1", "source": {"kind": "balance", "account": "CURRENT"}}, {"code": "2", "source": {"kind": "balance", "account": "SAVINGS"}}, {"code": "3", "source": {"kind": "debt", "charge_types": ["MAINTENANCE"]}}, {"code": "4", "source": {"kind": "debt", "charge_types": ["PARKING"]}}, {"code": "5", "source": {"kind": "debt", "charge_types": ["CAPITAL_REPAIR"]}}, {"code": "6", "source": {"kind": "sum", "of": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7"]}}, {"code": "6.1", "source": {"kind": "codes", "prefix": "6.1"}}, {"code": "6.2", "source": {"kind": "codes", "prefix": "6.2"}}, {"code": "6.3", "source": {"kind": "codes", "prefix": "6.3"}}, {"code": "6.4", "source": {"kind": "codes", "prefix": "6.4"}}, {"code": "6.5", "source": {"kind": "codes", "prefix": "6.5"}}, {"code": "6.6", "source": {"kind": "codes", "prefix": "6.6"}}, {"code": "6.7", "source": {"kind": "codes", "prefix": "6.7"}}, {"code": "7", "source": {"kind": "sum", "of": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"]}}, {"code": "7.1", "source": {"kind": "sum", "of": ["7.1.1", "7.1.2", "7.1.3", "7.1.4", "7.1.5", "7.1.6"]}}, {"code": "7.1.1", "source": {"kind": "codes", "prefix": "7.1.1"}}, {"code": "7.1.2", "source": {"kind": "codes", "prefix": "7.1.2"}}, {"code": "7.1.3", "source": {"kind": "codes", "prefix": "7.1.3"}}, {"code": "7.1.4", "source": {"kind": "codes", "prefix": "7.1.4"}}, {"code": "7.1.5", "source": {"kind": "codes", "prefix": "7.1.5"}}, {"code": "7.1.6", "source": {"kind": "codes", "prefix": "7.1.6"}}, {"code": "7.2", "source": {"kind": "sum", "of": ["7.2.1"]}}, {"code": "7.2.1", "source": {"kind": "codes", "prefix": "7.2.1", "detail": "payees"}}, {"code": "7.3", "source": {"kind": "codes", "prefix": "7.3"}}, {"code": "7.4", "source": {"kind": "codes", "prefix": "7.4"}}, {"code": "7.5", "source": {"kind": "codes", "prefix": "7.5"}}, {"code": "7.6", "source": {"kind": "codes", "prefix": "7.6"}}]}'::jsonb
);
