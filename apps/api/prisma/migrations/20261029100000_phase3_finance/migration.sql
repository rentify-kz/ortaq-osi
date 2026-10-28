-- CreateEnum
CREATE TYPE "BudgetSection" AS ENUM ('BALANCE', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CURRENT', 'SAVINGS');

-- CreateEnum
CREATE TYPE "TxDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'VOIDED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('RECEIPT', 'PAYMENT_ORDER', 'WORK_ACT', 'DEFECT_ACT', 'CONTRACT', 'PROTOCOL', 'OTHER');

-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'FINANCE_DOCUMENT';

-- AlterTable
ALTER TABLE "houses" ADD COLUMN     "transaction_seq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "budget_categories" (
    "code" VARCHAR(10) NOT NULL,
    "parent_code" VARCHAR(10),
    "section" "BudgetSection" NOT NULL,
    "order" INTEGER NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_kk" TEXT,
    "short_name" TEXT NOT NULL,
    "is_leaf" BOOLEAN NOT NULL,
    "in_form" BOOLEAN NOT NULL,
    "allowed_accounts" "AccountType"[],
    "requires_contractor" BOOLEAN NOT NULL DEFAULT false,
    "requires_assembly_decision" BOOLEAN NOT NULL DEFAULT false,
    "required_documents" "DocumentKind"[],
    "form_version" TEXT NOT NULL,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "finance_accounts" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "type" "AccountType" NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number_masked" TEXT,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "opened_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "finance_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "account_id" UUID NOT NULL,
    "category_code" VARCHAR(10) NOT NULL,
    "direction" "TxDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurred_on" DATE NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "description" TEXT NOT NULL,
    "contractor_id" UUID,
    "counterparty" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotency_key" TEXT NOT NULL,
    "request_hash" BYTEA NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ,
    "voided_by" UUID,
    "voided_at" TIMESTAMPTZ,
    "void_reason" TEXT,
    "corrects_id" UUID,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_documents" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "added_by" UUID NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_by" UUID,
    "removed_at" TIMESTAMPTZ,

    CONSTRAINT "transaction_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_accounts_house_id_type_key" ON "finance_accounts"("house_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_corrects_id_key" ON "transactions"("corrects_id");

-- CreateIndex
CREATE INDEX "transactions_house_id_period_idx" ON "transactions"("house_id", "period");

-- CreateIndex
CREATE INDEX "transactions_account_id_status_idx" ON "transactions"("account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_house_id_idempotency_key_key" ON "transactions"("house_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_house_id_number_key" ON "transactions"("house_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_documents_file_id_key" ON "transaction_documents"("file_id");

-- CreateIndex
CREATE INDEX "transaction_documents_transaction_id_idx" ON "transaction_documents"("transaction_id");

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_parent_code_fkey" FOREIGN KEY ("parent_code") REFERENCES "budget_categories"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_code_fkey" FOREIGN KEY ("category_code") REFERENCES "budget_categories"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_corrects_id_fkey" FOREIGN KEY ("corrects_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────── инварианты денег ─────────
ALTER TABLE transactions ADD CONSTRAINT transactions_amount_positive CHECK (amount > 0);
ALTER TABLE transactions ADD CONSTRAINT transactions_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE transactions ADD CONSTRAINT transactions_void_reason CHECK (status <> 'VOIDED' OR (void_reason IS NOT NULL AND voided_at IS NOT NULL));
ALTER TABLE finance_accounts ADD CONSTRAINT finance_accounts_opening_nonnegative CHECK (opening_balance >= 0);

-- Проведённая операция неизменяема (docs/10 §3). Сервис это соблюдает, но гарантию даёт база:
-- из CONFIRMED можно только в VOIDED, и при этом не меняется ни одно поле, кроме полей аннулирования.
CREATE FUNCTION transactions_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'CONFIRMED' AND NEW.status = 'VOIDED'
     AND (NEW.id, NEW.house_id, NEW.number, NEW.account_id, NEW.category_code, NEW.direction, NEW.amount, NEW.occurred_on,
          NEW.period, NEW.description, NEW.contractor_id, NEW.counterparty, NEW.idempotency_key, NEW.request_hash,
          NEW.created_by, NEW.created_at, NEW.confirmed_by, NEW.confirmed_at, NEW.corrects_id)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.house_id, OLD.number, OLD.account_id, OLD.category_code, OLD.direction, OLD.amount, OLD.occurred_on,
          OLD.period, OLD.description, OLD.contractor_id, OLD.counterparty, OLD.idempotency_key, OLD.request_hash,
          OLD.created_by, OLD.created_at, OLD.confirmed_by, OLD.confirmed_at, OLD.corrects_id)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'transaction % is % and cannot be changed', OLD.number, OLD.status USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER transactions_immutable BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION transactions_immutable();

-- Документ можно только приложить или отметить изъятым; подменить файл или вид задним числом нельзя
CREATE FUNCTION transaction_documents_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL
     AND (NEW.id, NEW.house_id, NEW.transaction_id, NEW.file_id, NEW.kind, NEW.added_by, NEW.added_at)
         IS NOT DISTINCT FROM (OLD.id, OLD.house_id, OLD.transaction_id, OLD.file_id, OLD.kind, OLD.added_by, OLD.added_at)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'transaction document % cannot be changed', OLD.id USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER transaction_documents_append_only BEFORE UPDATE ON transaction_documents FOR EACH ROW EXECUTE FUNCTION transaction_documents_append_only();

REVOKE DELETE, TRUNCATE ON transactions, transaction_documents FROM ortaq_app;
-- Справочник задан приказом: приложение его только читает, новая редакция формы — новая миграция
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON budget_categories FROM ortaq_app;


-- ───────── изоляция домов (RLS) ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance_accounts', 'transactions', 'transaction_documents'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY house_isolation ON %I USING (app_bypass_rls() OR house_id = app_current_house()) WITH CHECK (app_bypass_rls() OR house_id = app_current_house())', t);
  END LOOP;
END $$;


-- ───────── план счетов ─────────
-- Форма ежемесячного отчёта по управлению объектом кондоминиума: Приложение 3 к приказу №163
-- от 30.03.2020 в редакции приказа Министра промышленности и строительства РК №380 от 22.09.2025.
-- Подстроки 7.3.x и 7.6.x взяты из формы годового отчёта той же редакции; 7.2.1.x — наша нумерация
-- строк, которые форма перечисляет без номера («за услуги по …»), in_form = false.
INSERT INTO budget_categories (code, parent_code, section, "order", name_ru, short_name, is_leaf, in_form, allowed_accounts, requires_contractor, requires_assembly_decision, required_documents, form_version) VALUES
('1', NULL, 'BALANCE', 1, 'Остаток на текущем счете в банке второго уровня, на который перечисляются взносы (платежи) собственников квартир, нежилых помещений, парковочных мест, кладовок', 'Остаток на текущем счёте', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('2', NULL, 'BALANCE', 2, 'Остаток на сберегательном счете в банке второго уровня, на который перечисляются взносы (платежи) собственников квартир, нежилых помещений', 'Остаток на сберегательном счёте', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('3', NULL, 'BALANCE', 3, 'Задолженность по обязательным ежемесячным текущим взносам собственников квартир, нежилых помещений на управление объекта кондоминиума', 'Долг по взносам на управление', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('4', NULL, 'BALANCE', 4, 'Задолженность по обязательным ежемесячным взносам собственников парковочных мест, кладовок за содержание парковочного места, кладовки', 'Долг за парковки и кладовки', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('5', NULL, 'BALANCE', 5, 'Задолженность по обязательным ежемесячным накопительным взносам собственников квартир, нежилых помещений для накопительных взносов на капитальный ремонт', 'Долг по взносам на капремонт', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),

('6', NULL, 'INCOME', 6, 'Всего поступлений', 'Поступления', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('6.1', '6', 'INCOME', 1, 'Ежемесячные текущие взносы собственников квартир, нежилых помещений на управление объекта кондоминиума', 'Взносы на управление', true, true, '{CURRENT}', false, false, '{}', 'order-163-ed-380-2025'),
('6.2', '6', 'INCOME', 2, 'Ежемесячные текущие взносы собственников парковочных мест, кладовок за содержание парковочного места, кладовки', 'Взносы за парковки и кладовки', true, true, '{CURRENT}', false, false, '{}', 'order-163-ed-380-2025'),
('6.3', '6', 'INCOME', 3, 'Ежемесячные накопительные взносы собственников квартир, нежилых помещений, парковочных мест, кладовок для накопления сумм на капитальный ремонт общего имущества объекта кондоминиума или отдельных его частей (сберегательный счет)', 'Взносы на капремонт', true, true, '{SAVINGS}', false, false, '{}', 'order-163-ed-380-2025'),
('6.4', '6', 'INCOME', 4, 'Плата за сданное в имущественный найм (аренду) общее имущество', 'Аренда общего имущества', true, true, '{CURRENT}', false, false, '{}', 'order-163-ed-380-2025'),
('6.5', '6', 'INCOME', 5, 'Целевые взносы, вносимые собственниками квартир, нежилых помещений, не предусмотренные в годовой смете расходов на управление объекта кондоминиума', 'Целевые взносы', true, true, '{CURRENT,SAVINGS}', false, false, '{}', 'order-163-ed-380-2025'),
('6.6', '6', 'INCOME', 6, 'Целевые взносы, вносимые собственниками парковочных мест, кладовок, не предусмотренные в годовой смете расходов за содержание парковочного места, кладовки', 'Целевые взносы за парковки и кладовки', true, true, '{CURRENT}', false, false, '{}', 'order-163-ed-380-2025'),
('6.7', '6', 'INCOME', 7, 'Иные поступления (добровольные, частные инвестиции)', 'Иные поступления', true, true, '{CURRENT,SAVINGS}', false, false, '{}', 'order-163-ed-380-2025'),

('7', NULL, 'EXPENSE', 7, 'Всего расходов', 'Расходы', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('7.1', '7', 'EXPENSE', 1, 'Расходы по управлению объектом кондоминиума', 'Управление домом', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('7.1.1', '7.1', 'EXPENSE', 1, 'Оплата труда за ведение бухгалтерского учета, статистической и налоговой отчетности', 'Бухгалтерия', true, true, '{CURRENT}', false, false, '{}', 'order-163-ed-380-2025'),
('7.1.2', '7.1', 'EXPENSE', 2, 'Оплата труда за управление объектом кондоминиума', 'Оплата управления', true, true, '{CURRENT}', false, false, '{}', 'order-163-ed-380-2025'),
('7.1.3', '7.1', 'EXPENSE', 3, 'Обязательные платежи в бюджет (налоги, отчисления и другое)', 'Налоги и отчисления', true, true, '{CURRENT}', false, false, '{}', 'order-163-ed-380-2025'),
('7.1.4', '7.1', 'EXPENSE', 4, 'Банковские услуги', 'Банковские услуги', true, true, '{CURRENT,SAVINGS}', false, false, '{}', 'order-163-ed-380-2025'),
('7.1.5', '7.1', 'EXPENSE', 5, 'Оплата за расчетно-кассовое обслуживание', 'Расчётно-кассовое обслуживание', true, true, '{CURRENT,SAVINGS}', false, false, '{}', 'order-163-ed-380-2025'),
('7.1.6', '7.1', 'EXPENSE', 6, 'Расходы на содержание офиса (аренда, связь, канцелярские товары, оргтехника и ее содержание)', 'Содержание офиса', true, true, '{CURRENT}', false, false, '{}', 'order-163-ed-380-2025'),
('7.2', '7', 'EXPENSE', 2, 'Расходы по содержанию общего имущества объекта кондоминиума', 'Содержание общего имущества', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('7.2.1', '7.2', 'EXPENSE', 1, 'Оплата услуг по договорам субъектам сервисной деятельности и (или) оплата по трудовому договору (с предоставлением подтверждающих копий актов выполненных работ)', 'Услуги по договорам', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('7.2.1.1', '7.2.1', 'EXPENSE', 1, 'За услуги по дератизации, дезинсекции, дезинфекции подвальных помещений, паркингов и других мест общего пользования', 'Дератизация и дезинсекция', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.2', '7.2.1', 'EXPENSE', 2, 'За услуги по техническому обслуживанию, локализации аварийных случаев общедомовых инженерных систем отопления, горячего и холодного водоснабжения, водоотведения и оборудований', 'Отопление и водоснабжение', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.3', '7.2.1', 'EXPENSE', 3, 'За услуги по техническому обслуживанию, локализации аварийных случаев общедомовых инженерных систем электроснабжения и оборудований', 'Электроснабжение', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.4', '7.2.1', 'EXPENSE', 4, 'За услуги по техническому обслуживанию, локализации аварийных случаев общедомовых инженерных систем газоснабжения и оборудований', 'Газоснабжение', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.5', '7.2.1', 'EXPENSE', 5, 'За услуги по подготовке общедомовых инженерных систем и оборудований к осенне-зимнему периоду', 'Подготовка к зиме', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.6', '7.2.1', 'EXPENSE', 6, 'За услуги по обеспечению санитарного состояния мест общего пользования объекта кондоминиума', 'Уборка подъездов', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.7', '7.2.1', 'EXPENSE', 7, 'За услуги по обеспечению санитарного состояния земельного участка придомовой территории многоквартирного жилого дома (озеленение, санитарная очистка мусоропровода, очистка выгребных ям, уборка листьев, снега и наледи, в том числе с крыши)', 'Придомовая территория', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.8', '7.2.1', 'EXPENSE', 8, 'За услуги по вывозу снега', 'Вывоз снега', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.9', '7.2.1', 'EXPENSE', 9, 'За услуги по приобретению, установке, сервисному обслуживанию и поверке общедомовых приборов учета', 'Приборы учёта', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.10', '7.2.1', 'EXPENSE', 10, 'За услуги по безопасной эксплуатации опасных технических устройств, текущему ремонту и локализации аварийных случаев (обслуживание лифтов)', 'Обслуживание лифтов', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.11', '7.2.1', 'EXPENSE', 11, 'За услуги по противопожарным мероприятиям', 'Противопожарные мероприятия', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.2.1.12', '7.2.1', 'EXPENSE', 12, 'Иные расходы', 'Иные услуги', true, false, '{CURRENT}', true, false, '{WORK_ACT}', 'order-163-ed-380-2025'),
('7.3', '7', 'EXPENSE', 3, 'Текущий ремонт общего имущества объекта кондоминиума (на основании дефектного акта)', 'Текущий ремонт', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('7.3.1', '7.3', 'EXPENSE', 1, 'Ремонт кровельных покрытий, замена элементов внутреннего и наружного водостока', 'Кровля и водосток', true, true, '{CURRENT}', false, false, '{DEFECT_ACT,WORK_ACT}', 'order-163-ed-380-2025'),
('7.3.2', '7.3', 'EXPENSE', 2, 'Устранение местных деформаций, ремонт и восстановление поврежденных участков фасада, отмостки, подвала', 'Фасад, отмостка, подвал', true, true, '{CURRENT}', false, false, '{DEFECT_ACT,WORK_ACT}', 'order-163-ed-380-2025'),
('7.3.3', '7.3', 'EXPENSE', 3, 'Ремонт и восстановление разрушенных отдельных элементов общедомовых инженерных систем и оборудования', 'Инженерные системы', true, true, '{CURRENT}', false, false, '{DEFECT_ACT,WORK_ACT}', 'order-163-ed-380-2025'),
('7.3.4', '7.3', 'EXPENSE', 4, 'Иные расходы на текущий ремонт', 'Прочий текущий ремонт', true, true, '{CURRENT}', false, false, '{DEFECT_ACT,WORK_ACT}', 'order-163-ed-380-2025'),
('7.4', '7', 'EXPENSE', 4, 'Коммунальные услуги на содержание общего имущества объекта кондоминиума', 'Коммунальные услуги', true, true, '{CURRENT}', false, false, '{}', 'order-163-ed-380-2025'),
('7.5', '7', 'EXPENSE', 5, 'Хозяйственные расходы (приобретение инвентаря, оборудования и другое)', 'Хозяйственные расходы', true, true, '{CURRENT}', false, false, '{}', 'order-163-ed-380-2025'),
('7.6', '7', 'EXPENSE', 6, 'Капитальный ремонт', 'Капитальный ремонт', false, true, '{}', false, false, '{}', 'order-163-ed-380-2025'),
('7.6.1', '7.6', 'EXPENSE', 1, 'Ремонт крыши', 'Ремонт крыши', true, true, '{SAVINGS,CURRENT}', false, true, '{PROTOCOL,WORK_ACT}', 'order-163-ed-380-2025'),
('7.6.2', '7.6', 'EXPENSE', 2, 'Ремонт подвала', 'Ремонт подвала', true, true, '{SAVINGS,CURRENT}', false, true, '{PROTOCOL,WORK_ACT}', 'order-163-ed-380-2025'),
('7.6.3', '7.6', 'EXPENSE', 3, 'Ремонт фасада', 'Ремонт фасада', true, true, '{SAVINGS,CURRENT}', false, true, '{PROTOCOL,WORK_ACT}', 'order-163-ed-380-2025'),
('7.6.4', '7.6', 'EXPENSE', 4, 'Иные расходы на капитальный ремонт', 'Прочий капремонт', true, true, '{SAVINGS,CURRENT}', false, true, '{PROTOCOL,WORK_ACT}', 'order-163-ed-380-2025');
