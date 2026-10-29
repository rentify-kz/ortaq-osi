-- Защита голосований по итогам ревью безопасности (docs/09 §8)

-- Одна подпись — один бюллетень; одна процедура провайдера — одно подписание
CREATE UNIQUE INDEX "ballots_signature_id_key" ON "ballots"("signature_id");
CREATE UNIQUE INDEX "ballot_signings_provider_external_id_key" ON "ballot_signings"("provider", "external_id");

-- Ответ бюллетеня: только пока голосование идёт, вариант — из вопроса этого голосования
CREATE FUNCTION ballot_answers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b ballots%ROWTYPE; v votes%ROWTYPE; ok boolean;
BEGIN
  SELECT * INTO b FROM ballots WHERE id = NEW.ballot_id;
  SELECT * INTO v FROM votes WHERE id = b.vote_id;
  IF v.status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'vote % does not accept answers', b.vote_id USING ERRCODE = 'check_violation';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM vote_options o JOIN vote_questions q ON q.id = o.question_id
    WHERE o.id = NEW.option_id AND q.id = NEW.question_id AND q.vote_id = b.vote_id
  ) INTO ok;
  IF NOT ok OR NEW.house_id IS DISTINCT FROM b.house_id THEN
    RAISE EXCEPTION 'answer option % does not belong to vote %', NEW.option_id, b.vote_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ballot_answers_guard BEFORE INSERT ON ballot_answers FOR EACH ROW EXECUTE FUNCTION ballot_answers_guard();

-- Подписанный протокол — с обеими подписями; после публикации не меняется ничего
ALTER TABLE protocols ADD CONSTRAINT protocols_signed_by_both CHECK (status = 'AWAITING_SIGNATURES' OR (chairman_signature_id IS NOT NULL AND secretary_signature_id IS NOT NULL AND signed_at IS NOT NULL));
ALTER TABLE protocols ADD CONSTRAINT protocols_published_fields CHECK (status <> 'PUBLISHED' OR (published_at IS NOT NULL AND published_by IS NOT NULL));

CREATE OR REPLACE FUNCTION protocols_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
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
     OR (OLD.signed_at IS NOT NULL AND NEW.signed_at IS DISTINCT FROM OLD.signed_at)
     OR NOT (NEW.status = OLD.status OR (OLD.status = 'AWAITING_SIGNATURES' AND NEW.status = 'SIGNED') OR (OLD.status = 'SIGNED' AND NEW.status = 'PUBLISHED'))
  THEN
    RAISE EXCEPTION 'protocol % signatures and status only move forward', OLD.number USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'PUBLISHED' AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    RAISE EXCEPTION 'protocol % is published and cannot be changed', OLD.number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Отметки старта, закрытия и отмены ставятся один раз; закрыть раньше срока нельзя и в обход сервиса
CREATE OR REPLACE FUNCTION votes_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF (OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at)
     OR (OLD.closed_at IS NOT NULL AND NEW.closed_at IS DISTINCT FROM OLD.closed_at)
     OR (OLD.cancelled_at IS NOT NULL AND (NEW.cancelled_at, NEW.cancelled_by, NEW.cancel_reason) IS DISTINCT FROM (OLD.cancelled_at, OLD.cancelled_by, OLD.cancel_reason))
  THEN
    RAISE EXCEPTION 'vote % lifecycle marks cannot be rewritten', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status = 'CLOSED' AND (NEW.closed_at IS NULL OR NEW.closed_at < OLD.ends_at) THEN
    RAISE EXCEPTION 'vote % cannot close before its end', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'ACTIVE' AND NEW.status = 'CANCELLED' AND now() >= OLD.ends_at THEN
    RAISE EXCEPTION 'vote % has ended and cannot be cancelled', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
