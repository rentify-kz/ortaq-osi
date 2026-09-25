-- Роли и базы. Выполняется суперпользователем один раз на кластер.
-- Параметры psql: -v db=ortaq -v migrator_pw=... -v app_rw_pw=... -v app_admin_pw=...
-- docs/spec/13-security.md §1 «Роли БД».

SELECT 'CREATE ROLE migrator LOGIN PASSWORD ' || quote_literal(:'migrator_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') \gexec
SELECT 'CREATE ROLE app_rw LOGIN NOBYPASSRLS PASSWORD ' || quote_literal(:'app_rw_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') \gexec
SELECT 'CREATE ROLE app_admin LOGIN BYPASSRLS PASSWORD ' || quote_literal(:'app_admin_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') \gexec

-- Prisma migrate dev требует права на создание теневой базы.
ALTER ROLE migrator CREATEDB;

SELECT format('CREATE DATABASE %I OWNER migrator', :'db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec

\connect :db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app_rw, app_admin;
