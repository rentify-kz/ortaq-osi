-- Один ИИН — одна учётная запись
CREATE UNIQUE INDEX "users_iin_hash_key" ON "users"("iin_hash");

-- Причина, по которой собственность ждёт решения председателя
ALTER TABLE "unit_ownerships" ADD COLUMN "verification_note" TEXT;
