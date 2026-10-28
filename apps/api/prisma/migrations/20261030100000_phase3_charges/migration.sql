-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('MAINTENANCE', 'CAPITAL_REPAIR', 'PARKING', 'TARGETED', 'OTHER');

-- CreateEnum
CREATE TYPE "TariffBasis" AS ENUM ('PER_SQM', 'FIXED');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "tariffs" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "type" "ChargeType" NOT NULL,
    "basis" "TariffBasis" NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "unit_types" "UnitType"[],
    "effective_from" VARCHAR(7) NOT NULL,
    "effective_to" VARCHAR(7),
    "decision_note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_collections" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "type" "ChargeType" NOT NULL,
    "title" TEXT NOT NULL,
    "basis" "TariffBasis" NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "unit_types" "UnitType"[],
    "period" VARCHAR(7) NOT NULL,
    "due_date" DATE NOT NULL,
    "decision_note" TEXT NOT NULL,
    "protocol_file_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "type" "ChargeType" NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "calculation_basis" JSONB NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tariff_id" UUID,
    "collection_id" UUID,
    "collection_key" VARCHAR(36) NOT NULL DEFAULT '',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "cancel_reason" TEXT,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_runs" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "units_charged" INTEGER NOT NULL,
    "units_skipped" INTEGER NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "charge_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tariffs_house_id_type_idx" ON "tariffs"("house_id", "type");

-- CreateIndex
CREATE INDEX "charge_collections_house_id_period_idx" ON "charge_collections"("house_id", "period");

-- CreateIndex
CREATE INDEX "charges_house_id_period_idx" ON "charges"("house_id", "period");

-- CreateIndex
CREATE INDEX "charges_house_id_status_idx" ON "charges"("house_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "charges_unit_id_period_type_collection_key_key" ON "charges"("unit_id", "period", "type", "collection_key");

-- CreateIndex
CREATE UNIQUE INDEX "charge_runs_house_id_period_key" ON "charge_runs"("house_id", "period");

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_collections" ADD CONSTRAINT "charge_collections_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_tariff_id_fkey" FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "charge_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_runs" ADD CONSTRAINT "charge_runs_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────── инварианты начислений ─────────
ALTER TABLE tariffs ADD CONSTRAINT tariffs_rate_positive CHECK (rate > 0);
ALTER TABLE tariffs ADD CONSTRAINT tariffs_period_format CHECK (effective_from ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND (effective_to IS NULL OR effective_to > effective_from));
ALTER TABLE charge_collections ADD CONSTRAINT charge_collections_rate_positive CHECK (rate > 0);
ALTER TABLE charges ADD CONSTRAINT charges_amounts CHECK (amount > 0 AND paid_amount >= 0 AND paid_amount <= amount);
ALTER TABLE charges ADD CONSTRAINT charges_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE charges ADD CONSTRAINT charges_cancel_reason CHECK (status <> 'CANCELLED' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL));


-- ───────── изоляция домов (RLS) ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tariffs', 'charge_collections', 'charges', 'charge_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY house_isolation ON %I USING (app_bypass_rls() OR house_id = app_current_house()) WITH CHECK (app_bypass_rls() OR house_id = app_current_house())', t);
  END LOOP;
END $$;
