-- Откат миграции phase0_init. Используется скриптом проверки обратимости и при аварийном откате.
DROP TABLE IF EXISTS "audit_log", "idempotency_key", "file", "house_counter", "action_token", "otp_code",
  "session", "join_request", "invite", "house_membership", "user", "unit", "house", "organization" CASCADE;
DROP FUNCTION IF EXISTS audit_verify_chain(), audit_log_chain(), audit_log_immutable(),
  unit_after_change(), house_recompute_areas(uuid), app_user_house_ids(), app_current_house(), app_current_user();
DROP FUNCTION IF EXISTS audit_row_hash(bytea, audit_log);
DROP SEQUENCE IF EXISTS audit_log_seq;
DROP TYPE IF EXISTS "ManagementForm", "OrganizationStatus", "PaymentMode", "UnitType", "UserStatus", "Locale",
  "HouseRole", "MembershipStatus", "JoinedVia", "InviteType", "InviteRole", "OwnershipRelation",
  "JoinRequestStatus", "SessionClient", "ActionTokenPurpose", "OtpPurpose", "ScanStatus", "CounterKind";
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_rw, app_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM app_rw, app_admin;
