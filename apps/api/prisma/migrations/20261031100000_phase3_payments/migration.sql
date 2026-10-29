-- CreateEnum
CREATE TYPE "ReceiptPurpose" AS ENUM ('EXPENSE', 'RESIDENT_PAYMENT');

-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('DONE', 'FAILED', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('KASPI_LINK', 'RECEIPT_UPLOAD', 'KASPI_API', 'CASH', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED', 'FLAGGED');

-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'PAYMENT_RECEIPT';

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "purpose" "ReceiptPurpose" NOT NULL,
    "ocr_status" "OcrStatus" NOT NULL,
    "ocr_text" TEXT,
    "ocr_parsed" JSONB,
    "ocr_confidence" DECIMAL(3,2),
    "content_hash" BYTEA NOT NULL,
    "perceptual_hash" BYTEA,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "paid_by" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_at" TIMESTAMPTZ,
    "method" "PaymentMethod" NOT NULL,
    "receipt_id" UUID,
    "external_ref" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "flags" JSONB NOT NULL DEFAULT '[]',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ,
    "confirmed_amount" DECIMAL(12,2),
    "rejection_reason" TEXT,
    "transaction_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_file_id_key" ON "receipts"("file_id");

-- CreateIndex
CREATE INDEX "receipts_house_id_content_hash_idx" ON "receipts"("house_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_id_key" ON "payments"("transaction_id");

-- CreateIndex
CREATE INDEX "payments_house_id_status_idx" ON "payments"("house_id", "status");

-- CreateIndex
CREATE INDEX "payments_charge_id_idx" ON "payments"("charge_id");

-- CreateIndex
CREATE INDEX "payments_external_ref_idx" ON "payments"("external_ref");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ───────── инварианты оплат ─────────
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0 AND (confirmed_amount IS NULL OR confirmed_amount > 0));
ALTER TABLE payments ADD CONSTRAINT payments_rejection_reason CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL);
-- Один номер операции банка подтверждается один раз — во всей системе, а не только в доме:
-- чек одного дома не оплатит начисление в другом
CREATE UNIQUE INDEX payments_external_ref_confirmed ON payments (external_ref) WHERE status = 'CONFIRMED' AND external_ref IS NOT NULL;


-- ───────── изоляция домов (RLS) ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['receipts', 'payments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY house_isolation ON %I USING (app_bypass_rls() OR house_id = app_current_house()) WITH CHECK (app_bypass_rls() OR house_id = app_current_house())', t);
  END LOOP;
END $$;
