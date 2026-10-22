-- Голова хеш-цепочки аудита. SECURITY DEFINER: действие жильца или председателя
-- может писать в общую цепочку (house_id IS NULL), читать которую RLS ему не даёт.
-- Функция отдаёт только хеш последней записи, ничего больше.
CREATE FUNCTION audit_chain_head(h uuid) RETURNS bytea
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF h IS NULL THEN
    RETURN (SELECT hash FROM audit_log WHERE house_id IS NULL ORDER BY seq DESC LIMIT 1);
  END IF;
  RETURN (SELECT hash FROM audit_log WHERE house_id = h ORDER BY seq DESC LIMIT 1);
END $$;

REVOKE ALL ON FUNCTION audit_chain_head(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_chain_head(uuid) TO ortaq_app;
