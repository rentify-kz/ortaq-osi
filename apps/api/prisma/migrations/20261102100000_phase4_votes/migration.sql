-- CreateEnum
CREATE TYPE "VoteLegalBasis" AS ENUM ('ART_42_MEETING', 'ART_43_WRITTEN_SURVEY', 'ART_44_ELECTRONIC');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('ROUTINE', 'CURRENT_REPAIR', 'TARIFF_CHANGE', 'TARGETED_CONTRIBUTION', 'CHAIRMAN_ELECTION', 'MAJOR_EXPENSE', 'CAPITAL_REPAIR', 'MANAGEMENT_CHANGE', 'LIQUIDATION', 'COMMON_PROPERTY_DISPOSAL');

-- CreateEnum
CREATE TYPE "VoteThreshold" AS ENUM ('SIMPLE_MAJORITY', 'TWO_THIRDS');

-- CreateEnum
CREATE TYPE "QuorumBasis" AS ENUM ('BY_AREA', 'BY_UNIT');

-- CreateEnum
CREATE TYPE "VoteStatus" AS ENUM ('DRAFT', 'NOTICE_SENT', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('YES_NO', 'SINGLE_CHOICE', 'MULTI_CHOICE');

-- CreateEnum
CREATE TYPE "OptionKind" AS ENUM ('FOR', 'AGAINST', 'ABSTAIN', 'CHOICE');

-- CreateEnum
CREATE TYPE "BallotChannel" AS ENUM ('ELECTRONIC', 'PAPER');

-- CreateEnum
CREATE TYPE "ProtocolStatus" AS ENUM ('AWAITING_SIGNATURES', 'SIGNED', 'PUBLISHED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FilePurpose" ADD VALUE 'VOTE_MATERIAL';
ALTER TYPE "FilePurpose" ADD VALUE 'BALLOT_SCAN';

-- AlterTable
ALTER TABLE "houses" ADD COLUMN     "protocol_seq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "votes" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "legal_basis" "VoteLegalBasis" NOT NULL,
    "decision_type" "DecisionType" NOT NULL,
    "threshold" "VoteThreshold" NOT NULL,
    "quorum_basis" "QuorumBasis" NOT NULL DEFAULT 'BY_AREA',
    "results_visible_during" BOOLEAN NOT NULL DEFAULT false,
    "status" "VoteStatus" NOT NULL DEFAULT 'DRAFT',
    "secretary_user_id" UUID,
    "notice_sent_at" TIMESTAMPTZ,
    "starts_at" TIMESTAMPTZ,
    "ends_at" TIMESTAMPTZ,
    "activated_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "reminded_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_questions" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "vote_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,

    CONSTRAINT "vote_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_options" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "kind" "OptionKind" NOT NULL,

    CONSTRAINT "vote_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_registry_snapshots" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "vote_id" UUID NOT NULL,
    "total_area" DECIMAL(12,2) NOT NULL,
    "total_units" INTEGER NOT NULL,
    "entries" JSONB NOT NULL,
    "entries_hash" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_registry_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_notices" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "vote_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "unit_numbers" TEXT[],
    "notified_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vote_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ballot_signings" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "vote_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "document_hash" BYTEA NOT NULL,
    "answers" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "ballot_signings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ballots" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "vote_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "user_id" UUID,
    "voter_name" TEXT NOT NULL,
    "channel" "BallotChannel" NOT NULL,
    "area" DECIMAL(8,2) NOT NULL,
    "weight" DECIMAL(10,6) NOT NULL,
    "document" JSONB NOT NULL,
    "document_hash" BYTEA NOT NULL,
    "signature_id" UUID,
    "scan_file_id" UUID,
    "entered_by" UUID,
    "cast_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ballot_answers" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "ballot_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,

    CONSTRAINT "ballot_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocols" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "vote_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "content_hash" BYTEA NOT NULL,
    "status" "ProtocolStatus" NOT NULL DEFAULT 'AWAITING_SIGNATURES',
    "quorum_reached" BOOLEAN NOT NULL,
    "quorum_percent" DECIMAL(5,2) NOT NULL,
    "results" JSONB NOT NULL,
    "chairman_signature_id" UUID,
    "secretary_signature_id" UUID,
    "pending_signing" JSONB NOT NULL DEFAULT '{}',
    "signed_at" TIMESTAMPTZ,
    "published_at" TIMESTAMPTZ,
    "published_by" UUID,
    "retention_until" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "protocols_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "votes_house_id_status_idx" ON "votes"("house_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vote_questions_vote_id_order_key" ON "vote_questions"("vote_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "vote_options_question_id_order_key" ON "vote_options"("question_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "vote_registry_snapshots_vote_id_key" ON "vote_registry_snapshots"("vote_id");

-- CreateIndex
CREATE UNIQUE INDEX "vote_notices_vote_id_user_id_key" ON "vote_notices"("vote_id", "user_id");

-- CreateIndex
CREATE INDEX "ballot_signings_vote_id_user_id_idx" ON "ballot_signings"("vote_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ballots_vote_id_unit_id_key" ON "ballots"("vote_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "ballot_answers_ballot_id_option_id_key" ON "ballot_answers"("ballot_id", "option_id");

-- CreateIndex
CREATE UNIQUE INDEX "protocols_vote_id_key" ON "protocols"("vote_id");

-- CreateIndex
CREATE UNIQUE INDEX "protocols_house_id_number_key" ON "protocols"("house_id", "number");

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_questions" ADD CONSTRAINT "vote_questions_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_options" ADD CONSTRAINT "vote_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "vote_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_registry_snapshots" ADD CONSTRAINT "vote_registry_snapshots_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_notices" ADD CONSTRAINT "vote_notices_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballot_signings" ADD CONSTRAINT "ballot_signings_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballot_answers" ADD CONSTRAINT "ballot_answers_ballot_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "ballots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────── голосования: инварианты (docs/09 §4, §8) ─────────
-- Уведомление не позднее чем за 5 календарных дней; окончание позже начала
ALTER TABLE votes ADD CONSTRAINT votes_notice_period CHECK (
  status = 'DRAFT' OR (status = 'CANCELLED' AND notice_sent_at IS NULL)
  OR (notice_sent_at IS NOT NULL AND starts_at IS NOT NULL AND ends_at IS NOT NULL
      AND starts_at >= notice_sent_at + interval '5 days' AND ends_at > starts_at)
);
ALTER TABLE votes ADD CONSTRAINT votes_cancel_reason CHECK (status <> 'CANCELLED' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL));

-- После уведомления повестка, сроки и правила подсчёта неизменны; статусы идут только вперёд.
-- ends_at неизменяем: продлить голосование до нужного итога нельзя
CREATE FUNCTION votes_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (NEW.status = OLD.status
     OR (OLD.status = 'DRAFT' AND NEW.status IN ('NOTICE_SENT', 'CANCELLED'))
     OR (OLD.status = 'NOTICE_SENT' AND NEW.status IN ('ACTIVE', 'CANCELLED'))
     OR (OLD.status = 'ACTIVE' AND NEW.status IN ('CLOSED', 'CANCELLED'))) THEN
    RAISE EXCEPTION 'vote % cannot go from % to %', OLD.id, OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'DRAFT'
     AND (NEW.house_id, NEW.title, NEW.description, NEW.legal_basis, NEW.decision_type, NEW.threshold, NEW.quorum_basis,
          NEW.results_visible_during, NEW.notice_sent_at, NEW.starts_at, NEW.ends_at, NEW.created_by, NEW.created_at)
         IS DISTINCT FROM
         (OLD.house_id, OLD.title, OLD.description, OLD.legal_basis, OLD.decision_type, OLD.threshold, OLD.quorum_basis,
          OLD.results_visible_during, OLD.notice_sent_at, OLD.starts_at, OLD.ends_at, OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'vote % is % and its agenda and dates cannot be changed', OLD.id, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER votes_frozen BEFORE UPDATE ON votes FOR EACH ROW EXECUTE FUNCTION votes_frozen();

-- Вопросы и варианты меняются только в черновике
CREATE FUNCTION vote_agenda_draft_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v uuid; s "VoteStatus";
BEGIN
  IF TG_TABLE_NAME = 'vote_questions' THEN
    v := COALESCE(NEW.vote_id, OLD.vote_id);
  ELSE
    SELECT q.vote_id INTO v FROM vote_questions q WHERE q.id = COALESCE(NEW.question_id, OLD.question_id);
  END IF;
  SELECT status INTO s FROM votes WHERE id = v;
  IF s IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'agenda of vote % is frozen (%)', v, s USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER vote_questions_draft_only BEFORE INSERT OR UPDATE OR DELETE ON vote_questions FOR EACH ROW EXECUTE FUNCTION vote_agenda_draft_only();
CREATE TRIGGER vote_options_draft_only BEFORE INSERT OR UPDATE OR DELETE ON vote_options FOR EACH ROW EXECUTE FUNCTION vote_agenda_draft_only();

-- Бюллетень принимается только в активном голосовании и до окончания срока; электронный — с подписью, бумажный — со сканом
ALTER TABLE ballots ADD CONSTRAINT ballots_evidence CHECK (
  (channel = 'ELECTRONIC' AND signature_id IS NOT NULL AND user_id IS NOT NULL AND scan_file_id IS NULL AND entered_by IS NULL)
  OR (channel = 'PAPER' AND scan_file_id IS NOT NULL AND entered_by IS NOT NULL AND signature_id IS NULL)
);
ALTER TABLE ballots ADD CONSTRAINT ballots_weight_range CHECK (weight > 0 AND weight <= 1 AND area > 0);
CREATE FUNCTION ballots_open_vote() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v votes%ROWTYPE;
BEGIN
  SELECT * INTO v FROM votes WHERE id = NEW.vote_id;
  IF v.status IS DISTINCT FROM 'ACTIVE' OR NEW.cast_at >= v.ends_at OR NEW.cast_at < v.starts_at THEN
    RAISE EXCEPTION 'vote % does not accept ballots', NEW.vote_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.channel = 'PAPER' AND v.legal_basis <> 'ART_43_WRITTEN_SURVEY' THEN
    RAISE EXCEPTION 'paper ballots are accepted only in a written survey' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ballots_open_vote BEFORE INSERT ON ballots FOR EACH ROW EXECUTE FUNCTION ballots_open_vote();

-- Протокол формируется один раз: дальше меняются только подписи, статус и публикация
CREATE FUNCTION protocols_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.house_id, NEW.vote_id, NEW.number, NEW.content, NEW.content_hash, NEW.quorum_reached, NEW.quorum_percent,
      NEW.results, NEW.retention_until, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.house_id, OLD.vote_id, OLD.number, OLD.content, OLD.content_hash, OLD.quorum_reached, OLD.quorum_percent,
      OLD.results, OLD.retention_until, OLD.created_at)
  THEN
    RAISE EXCEPTION 'protocol % content cannot be changed', OLD.number USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.chairman_signature_id IS NOT NULL AND NEW.chairman_signature_id IS DISTINCT FROM OLD.chairman_signature_id)
     OR (OLD.secretary_signature_id IS NOT NULL AND NEW.secretary_signature_id IS DISTINCT FROM OLD.secretary_signature_id)
     OR NOT (NEW.status = OLD.status OR (OLD.status = 'AWAITING_SIGNATURES' AND NEW.status = 'SIGNED') OR (OLD.status = 'SIGNED' AND NEW.status = 'PUBLISHED'))
  THEN
    RAISE EXCEPTION 'protocol % signatures and status only move forward', OLD.number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protocols_immutable BEFORE UPDATE ON protocols FOR EACH ROW EXECUTE FUNCTION protocols_immutable();

-- Append-only: бюллетени, ответы, снимок реестра и список уведомлённых не правятся и не удаляются.
-- Голосование и протокол не удаляются: отмена — статусом, хранение протокола — не менее 5 лет
REVOKE UPDATE, DELETE, TRUNCATE ON ballots, ballot_answers, vote_registry_snapshots, vote_notices FROM ortaq_app;
REVOKE DELETE, TRUNCATE ON votes, protocols FROM ortaq_app;

-- ───────── изоляция домов (RLS) ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['votes', 'vote_questions', 'vote_options', 'vote_registry_snapshots', 'vote_notices', 'ballot_signings', 'ballots', 'ballot_answers', 'protocols'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY house_isolation ON %I USING (app_bypass_rls() OR house_id = app_current_house()) WITH CHECK (app_bypass_rls() OR house_id = app_current_house())', t);
  END LOOP;
END $$;
